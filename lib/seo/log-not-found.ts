import { getAdminUrlSlug } from "@/lib/admin-paths";
import { recordNotFoundHit } from "@/lib/db/not-found-queries";
import { NON_PREFIXABLE_PREFIXES } from "@/lib/i18n/resolve-locale";

// Pattern semplice: cattura i bot più comuni guardando lo user-agent.
// Non è una whitelist esaustiva ma riduce drasticamente il rumore senza
// dipendere da una libreria esterna.
const BOT_UA_REGEX =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|monitor|pingdom|uptimerobot|headlesschrome|lighthouse/i;

// Path che non hanno valore SEO/utente: estensioni statiche, well-known,
// scan di vulnerabilità comuni. Saltarli evita di gonfiare la tabella.
const SKIP_PATH_REGEX =
  /\.(?:php|asp|aspx|jsp|cgi|env|map|ico|png|jpg|jpeg|gif|webp|svg|css|js|woff2?|ttf|eot)(?:\?|$)/i;

// Probe noti di bot/scanner che cercano vulnerabilità WordPress/Joomla,
// CMS legacy, backup esposti, etc. Tutti senza valore SEO o diagnostico.
const BOT_PROBE_PREFIXES = [
  "/wp-",
  "/wordpress",
  "/wp/",
  "/wp",
  "/old/",
  "/old",
  "/new/",
  "/new",
  "/backup/",
  "/backup",
  "/admin.php",
  "/phpmyadmin",
  "/.git",
];

const SKIP_PATH_PREFIXES: string[] = [
  "/_next/",
  "/api/",
  "/.well-known/",
  ...BOT_PROBE_PREFIXES,
];

// Sistema file-based: queste route hanno SEMPRE un page handler concreto
// (`app/(login)/sign-in/page.tsx`, `app/(protected)/settings/...`, ecc.).
// Se per qualunque ragione finiscono dentro `not-found.tsx` (CDN cache
// stantia, RSC prefetch in race, redirect chain cross-locale, bot probe
// con header particolare), è SEMPRE rumore: i veri 404 di queste path
// non esistono. Logghiamo solo le path catch-all del CMS, dove il 404 è
// genuino e diagnostico.
//
// `NON_PREFIXABLE_PREFIXES` è la fonte di verità che già usiamo per
// l'i18n (lib/i18n/resolve-locale.ts) — auth, admin, onboarding, area
// loggati, API. Riusarla qui evita di tenere due liste in sincrono.
const SYSTEM_FILE_BASED_PREFIXES: readonly string[] = NON_PREFIXABLE_PREFIXES;

// Path esatti da ignorare:
//   "/" → root: spesso loggata da prefetch RSC o chunk sentinella di
//         Next, raramente è un vero 404 utente. Se la homepage manca
//         davvero, salta fuori dai log applicativi.
const SKIP_PATH_EXACT = new Set(["/"]);

async function shouldSkip(
  pathname: string,
  userAgent: string | null,
): Promise<boolean> {
  if (!pathname || pathname.length > 500) return true;
  if (SKIP_PATH_EXACT.has(pathname)) return true;
  if (SKIP_PATH_REGEX.test(pathname)) return true;
  if (SKIP_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Path file-based di sistema: skip totale (vedi commento sopra). Il match
  // accetta sia `/sign-in` esatto sia `/sign-in/<sub>`, così copre anche
  // sotto-path noti (es. `/sign-in/mfa`) e probe random sotto un prefix.
  if (
    SYSTEM_FILE_BASED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
  ) {
    return true;
  }
  // Skip area admin: ha la sua not-found dedicata. Slug runtime via DB.
  const adminSlug = await getAdminUrlSlug();
  const adminBase = `/${adminSlug}`;
  if (pathname === adminBase || pathname.startsWith(`${adminBase}/`)) return true;
  if (userAgent && BOT_UA_REGEX.test(userAgent)) return true;
  return false;
}

/**
 * Logga un hit 404. Pensata per essere chiamata da `not-found.tsx`
 * dentro `after()` di Next 16: la response è già stata inviata, eventuali
 * errori non possono propagarsi all'utente.
 */
export async function logNotFoundHit(input: {
  pathname: string | null | undefined;
  referrer: string | null | undefined;
  userAgent: string | null | undefined;
}): Promise<void> {
  const pathname = input.pathname?.trim();
  if (!pathname) return;

  const userAgent = input.userAgent ?? null;
  if (await shouldSkip(pathname, userAgent)) return;

  try {
    await recordNotFoundHit({
      path: pathname,
      referrer: input.referrer ?? null,
      userAgent,
    });
  } catch (err) {
    // Mai bloccare la response 404 sull'utente. Logghiamo e basta.
    console.error("[logNotFoundHit] failed", err);
  }
}
