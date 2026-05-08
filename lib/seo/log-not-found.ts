import { getAdminUrlSlug } from "@/lib/admin-paths";
import { recordNotFoundHit } from "@/lib/db/not-found-queries";

// Pattern semplice: cattura i bot più comuni guardando lo user-agent.
// Non è una whitelist esaustiva ma riduce drasticamente il rumore senza
// dipendere da una libreria esterna.
const BOT_UA_REGEX =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|monitor|pingdom|uptimerobot|headlesschrome|lighthouse/i;

// Path che non hanno valore SEO/utente: estensioni statiche, well-known,
// scan di vulnerabilità comuni. Saltarli evita di gonfiare la tabella.
const SKIP_PATH_REGEX =
  /\.(?:php|asp|aspx|jsp|cgi|env|map|ico|png|jpg|jpeg|gif|webp|svg|css|js|woff2?|ttf|eot)(?:\?|$)/i;

const SKIP_PATH_PREFIXES = [
  "/_next/",
  "/api/",
  "/.well-known/",
  "/wp-",
  "/wordpress/",
];

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
