// proxy.ts
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { verifyToken } from "@/lib/auth/session";
import { getValidSession } from "@/lib/auth/sessions";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import {
  LOCALE_COOKIE_NAME,
  LOCALE_COOKIE_OPTIONS,
} from "@/lib/i18n/locale-cookie";
import {
  extractLocaleFromPathname,
  guessLocaleFromRequest,
  isNonPrefixablePath,
} from "@/lib/i18n/resolve-locale";
import { getNavigablePages } from "@/lib/db/pages-queries";
import { getRedirectByFromPath } from "@/lib/db/redirects-queries";
import type { RouteVisibility } from "@/lib/db/schema";
import {
  SYSTEM_ALWAYS_PUBLIC,
  SYSTEM_AUTH_ROUTES,
} from "@/lib/routes";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesPrefix(pathname: string, routes: readonly string[]): boolean {
  return routes.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

/**
 * Carica le route dalla tabella `pages` e le suddivide per visibility.
 * Sostituisce il vecchio lookup su `route_registry`: dopo la migration
 * 0034, sia le user CMS pages sia le ex-editorial routes vivono in
 * `pages` con un campo `visibility` proprio. Le system pages "meta-only"
 * (auth, /404, ecc.) sono gestite dal kernel hardcoded sopra — la loro
 * presenza in questa lista è innocua perché il flusso 1-3 le intercetta
 * prima di arrivare qui.
 *
 * NON ha più un fallback a liste statiche: le route di sistema sono
 * gestite dal kernel hardcoded sopra, il resto viene dal DB. Se il DB
 * non risponde, le route non-system degradano silenziosamente (utente
 * non autenticato non accede a route private).
 */
async function resolveRoutes(): Promise<{
  publicRoutes: string[];
  privateRoutes: string[];
}> {
  const empty = {
    publicRoutes: [],
    privateRoutes: [],
  };

  try {
    const rows = await getNavigablePages();
    if (!rows || rows.length === 0) return empty;

    const byVisibility = (v: RouteVisibility) =>
      rows.filter((r) => r.visibility === v).map((r) => r.pathname);

    return {
      publicRoutes: byVisibility("public"),
      privateRoutes: byVisibility("private"),
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Proxy principale
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get("session");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Slug admin runtime (es. "admin", "admincontrol", ecc.). Cachato in
  // unstable_cache (60s + tag) — costo trascurabile su request warm.
  //
  // Architettura URL admin:
  //   - File system: cartella fissa `app/(admin)/admin/` (impossibile usare
  //     `[adminSlug]` come segmento dinamico top-level perché collide con
  //     `app/[locale]/...` di next-intl — Next non sa distinguerli).
  //   - URL pubblico: `/<adminSlug>/...` con `<adminSlug>` runtime.
  //   - Traduzione: rewrite invisibile qui sotto. L'utente vede sempre
  //     l'URL configurato, internamente Next risolve `/admin/...`.
  const adminSlug = await getAdminUrlSlug();
  const adminBasePath = `/${adminSlug}`;
  const adminSignInRoute = `/${adminSlug}/sign-in`;
  // Header pubblico per i Client Component che vogliono lo slug (alternativa
  // a un Context Provider in layout).
  requestHeaders.set("x-admin-slug", adminSlug);
  const isAdminPath = (p: string) =>
    p === adminBasePath || p.startsWith(`${adminBasePath}/`);

  // --- REWRITE: URL utente "/<adminSlug>/..." → path interno "/admin/..." ---
  // Si fa PRIMA dell'i18n e degli auth check perché tutta la logica admin
  // sotto opera sul path PUBBLICO (quello che l'utente vede). Il rewrite è
  // invisibile: il browser continua a vedere `/<adminSlug>/...`, ma Next
  // serve il file da `app/(admin)/admin/...`.
  // Caso speciale: se adminSlug === "admin", nessun rewrite necessario.
  if (adminSlug !== "admin" && isAdminPath(pathname)) {
    const internalPath =
      pathname === adminBasePath
        ? "/admin"
        : `/admin${pathname.slice(adminBasePath.length)}`;
    const url = request.nextUrl.clone();
    url.pathname = internalPath;
    // I controlli auth/MFA del proxy operano comunque sul `pathname`
    // pubblico (variabile `pathname` definita sopra), quindi mantengono
    // la coerenza con l'URL utente.
    return NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
  }
  // Inverso: se adminSlug è cambiato e qualcuno arriva ancora su "/admin/..."
  // (es. bookmark vecchio quando lo slug era "admin"), 404. In dev questo
  // pulisce il routing; in prod si potrebbe valutare un redirect 308.
  if (adminSlug !== "admin" && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    return new NextResponse(null, { status: 404 });
  }

  // --- [0] I18N: LOCALE PREFIX HANDLING ---
  // Modello E del piano i18n: prefix locale valido solo per home guest e
  // CMS pubblico catch-all. Tre casi gestiti qui:
  //
  //   1. /<default>/<rest>      → 308 redirect canonico a /<rest>
  //                                (es. con default=it, /it/about → /about)
  //   2. /<locale>/<system>     → 307 redirect a /<system> + cookie locale
  //                                (es. /en/sign-in → /sign-in, cookie en)
  //   3. /<locale>/<rest>       → propaga, header x-locale + cookie locale
  //                                (es. /en/about → app/[locale]/[...slug])
  //
  // Per path senza prefix, settiamo solo `x-locale` da guess (cookie /
  // Accept-Language / default). I layout dei Server Component possono
  // sovrascrivere chiamando setRequestLocale(users.locale) per i loggati.
  let localeCookieToSet: Locale | null = null;

  const fromPath = extractLocaleFromPathname(pathname);
  if (fromPath) {
    if (fromPath.locale === DEFAULT_LOCALE) {
      // Caso 1: prefix è già il default → redirect canonico (clean URL)
      // + cookie aggiornato. Per simmetria col caso 3: visitare un URL con
      // prefix locale è "scelta esplicita di lingua", e qui lo trattiamo
      // come reset al default (utile quando un visitatore con cookie=en
      // vuole tornare alla lingua di default visitando /it/qualcosa).
      const cleanUrl = new URL(fromPath.rest || "/", request.url);
      cleanUrl.search = request.nextUrl.search;
      const res = NextResponse.redirect(cleanUrl, { status: 308 });
      res.cookies.set(
        LOCALE_COOKIE_NAME,
        fromPath.locale,
        LOCALE_COOKIE_OPTIONS,
      );
      return res;
    }

    if (isNonPrefixablePath(fromPath.rest, [adminBasePath])) {
      // Caso 2: prefix locale + path system → redirect a clean + cookie
      const cleanUrl = new URL(fromPath.rest, request.url);
      cleanUrl.search = request.nextUrl.search;
      const res = NextResponse.redirect(cleanUrl, { status: 307 });
      res.cookies.set(
        LOCALE_COOKIE_NAME,
        fromPath.locale,
        LOCALE_COOKIE_OPTIONS,
      );
      return res;
    }

    // Caso 3: prefix locale valido per home/CMS → propaga
    requestHeaders.set("x-locale", fromPath.locale);
    localeCookieToSet = fromPath.locale;
  } else {
    // Path senza prefix: locale guess da cookie / Accept-Language / default
    requestHeaders.set("x-locale", guessLocaleFromRequest(request));
  }

  /**
   * Wrapper applicato a OGNI response del proxy quando il prefix locale è
   * stato visto in URL: assicura che il cookie NEXT_LOCALE rifletta la
   * lingua scelta esplicitamente dal visitatore. Per le response senza
   * prefix nell'URL, il cookie esistente non viene toccato (preservato).
   */
  function finalize(response: NextResponse): NextResponse {
    if (localeCookieToSet) {
      response.cookies.set(
        LOCALE_COOKIE_NAME,
        localeCookieToSet,
        LOCALE_COOKIE_OPTIONS,
      );
    }
    return response;
  }

  // --- [1] KERNEL: SYSTEM_ALWAYS_PUBLIC ---
  // /verify-email, /forgot-password, /reset-password
  // Bypass totale DB — queste route devono funzionare sempre.
  if (matchesPrefix(pathname, SYSTEM_ALWAYS_PUBLIC)) {
    return finalize(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // --- [2] KERNEL: ADMIN SIGN-IN ---
  // Sempre accessibile, nessun redirect automatico post-login qui
  // per evitare loop con requireAdminPage().
  if (pathname === adminSignInRoute) {
    return finalize(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // --- [3] KERNEL: SYSTEM_AUTH_ROUTES (/sign-in, /sign-up) ---
  // Accessibili solo a utenti realmente loggati. La presenza del cookie
  // non basta: il JWT può essere scaduto o la riga sessions revocata
  // (es. admin block, logout in altra tab). In quei casi il cookie è
  // stantio — lo cancelliamo e lasciamo passare, altrimenti l'utente
  // resta intrappolato fuori dal flusso di login.
  if (matchesPrefix(pathname, SYSTEM_AUTH_ROUTES)) {
    if (sessionCookie) {
      let isValidSession = false;
      try {
        const { sid } = await verifyToken(sessionCookie.value);
        if (sid) {
          // getValidSession usa cache Redis (TTL 60s) → costo trascurabile.
          const session = await getValidSession(sid);
          isValidSession = !!session;
        }
      } catch {
        // JWT firmato male / scaduto → cookie stantio.
      }

      if (isValidSession) {
        return finalize(NextResponse.redirect(new URL("/", request.url)));
      }

      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      response.cookies.delete("session");
      return finalize(response);
    }
    return finalize(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // --- [4] REDIRECT DA DB (301/302/307/308) ---
  // Prima di qualsiasi check auth, così i redirect funzionano per tutti.
  const isStaticOrApi =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    isAdminPath(pathname);

  if (!isStaticOrApi) {
    try {
      const redirect = await getRedirectByFromPath(pathname);
      if (redirect && redirect.isActive) {
        const destination = new URL(redirect.toPath, request.url);
        return finalize(
          NextResponse.redirect(destination, {
            status: redirect.statusCode,
          }),
        );
      }
    } catch {
      // DB non risponde — degrada silenziosamente
    }
  }

  // --- [5] ROUTE DAL DB REGISTRY ---
  const { publicRoutes, privateRoutes } = await resolveRoutes();

  const isPublicRoute = matchesPrefix(pathname, publicRoutes);
  const isAdminRoute = isAdminPath(pathname);
  const isPrivateRoute = matchesPrefix(pathname, privateRoutes);

  const isLoggedIn = !!sessionCookie;

  // Route pubbliche — lascia passare senza check sessione
  if (isPublicRoute) {
    return finalize(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // --- [6] ROUTE ADMIN ---
  // Proxy verifica solo che il cookie esista e che il JWT sia firmato e
  // non scaduto (jwtVerify controlla automaticamente l'`exp` claim).
  // La validazione vera (revoca, idle timeout, ban) è server-side via
  // getSession() dei Server Component — lì serve il DB, qui no.
  if (isAdminRoute) {
    if (!isLoggedIn) {
      const url = new URL(adminSignInRoute, request.url);
      url.searchParams.set("from", pathname);
      return finalize(NextResponse.redirect(url));
    }
    try {
      await verifyToken(sessionCookie!.value);
    } catch {
      return finalize(
        NextResponse.redirect(new URL(adminSignInRoute, request.url)),
      );
    }
  }

  // --- [7] ROUTE PRIVATE ---
  if (isPrivateRoute && !isLoggedIn) {
    return finalize(NextResponse.redirect(new URL("/sign-in", request.url)));
  }

  // Sliding-session refresh rimosso: il cookie ha la stessa durata di
  // sessions.expires_at (15 giorni). Senza sliding la sessione muore in
  // ogni caso a 15gg dal login; volutamente predicibile per l'utente.
  return finalize(
    NextResponse.next({ request: { headers: requestHeaders } }),
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
