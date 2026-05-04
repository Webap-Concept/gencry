// proxy.ts
import { verifyToken } from "@/lib/auth/session";
import { getValidSession } from "@/lib/auth/sessions";
import { getNavigablePages } from "@/lib/db/pages-queries";
import { getRedirectByFromPath } from "@/lib/db/redirects-queries";
import type { RouteVisibility } from "@/lib/db/schema";
import {
  ADMIN_SIGNIN_ROUTE,
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

  // --- [1] KERNEL: SYSTEM_ALWAYS_PUBLIC ---
  // /verify-email, /forgot-password, /reset-password
  // Bypass totale DB — queste route devono funzionare sempre.
  if (matchesPrefix(pathname, SYSTEM_ALWAYS_PUBLIC)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // --- [2] KERNEL: ADMIN SIGN-IN ---
  // Sempre accessibile, nessun redirect automatico post-login qui
  // per evitare loop con requireAdminPage().
  if (pathname === ADMIN_SIGNIN_ROUTE) {
    return NextResponse.next({ request: { headers: requestHeaders } });
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
        return NextResponse.redirect(new URL("/", request.url));
      }

      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      response.cookies.delete("session");
      return response;
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // --- [4] REDIRECT DA DB (301/302/307/308) ---
  // Prima di qualsiasi check auth, così i redirect funzionano per tutti.
  const isStaticOrApi =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/admin/");

  if (!isStaticOrApi) {
    try {
      const redirect = await getRedirectByFromPath(pathname);
      if (redirect && redirect.isActive) {
        const destination = new URL(redirect.toPath, request.url);
        return NextResponse.redirect(destination, {
          status: redirect.statusCode,
        });
      }
    } catch {
      // DB non risponde — degrada silenziosamente
    }
  }

  // --- [5] ROUTE DAL DB REGISTRY ---
  const { publicRoutes, privateRoutes } = await resolveRoutes();

  const isPublicRoute = matchesPrefix(pathname, publicRoutes);
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPrivateRoute = matchesPrefix(pathname, privateRoutes);

  const isLoggedIn = !!sessionCookie;

  // Route pubbliche — lascia passare senza check sessione
  if (isPublicRoute) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // --- [6] ROUTE ADMIN ---
  // Proxy verifica solo che il cookie esista e che il JWT sia firmato e
  // non scaduto (jwtVerify controlla automaticamente l'`exp` claim).
  // La validazione vera (revoca, idle timeout, ban) è server-side via
  // getSession() dei Server Component — lì serve il DB, qui no.
  if (isAdminRoute) {
    if (!isLoggedIn) {
      const url = new URL(ADMIN_SIGNIN_ROUTE, request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
    try {
      await verifyToken(sessionCookie!.value);
    } catch {
      return NextResponse.redirect(new URL(ADMIN_SIGNIN_ROUTE, request.url));
    }
  }

  // --- [7] ROUTE PRIVATE ---
  if (isPrivateRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // Sliding-session refresh rimosso: il cookie ha la stessa durata di
  // sessions.expires_at (15 giorni). Senza sliding la sessione muore in
  // ogni caso a 15gg dal login; volutamente predicibile per l'utente.
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
