import { recordNotFoundHit } from "@/lib/db/not-found-queries";

// Pattern semplice: cattura i bot più comuni guardando lo user-agent.
// Non è una whitelist esaustiva ma riduce drasticamente il rumore senza
// dipendere da una libreria esterna.
const BOT_UA_REGEX =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|monitor|pingdom|uptimerobot|headlesschrome|lighthouse/i;

// Estensioni di file statici / di sistema: non sono mai pagine, e quindi
// nemmeno candidate a 404 SEO. Skip a monte.
const SKIP_PATH_REGEX =
  /\.(?:php|asp|aspx|jsp|cgi|env|map|ico|png|jpg|jpeg|gif|webp|svg|css|js|woff2?|ttf|eot)(?:\?|$)/i;

const SKIP_PATH_PREFIXES = [
  "/_next/",
  "/api/",
  "/.well-known/",
];

// Path esatti da ignorare:
//   "/" → root: spesso loggata da prefetch RSC o chunk sentinella di
//         Next, raramente è un vero 404 utente. Se la homepage manca
//         davvero, salta fuori dai log applicativi.
const SKIP_PATH_EXACT = new Set(["/"]);

function shouldSkipByPath(pathname: string): boolean {
  if (!pathname || pathname.length > 500) return true;
  if (SKIP_PATH_EXACT.has(pathname)) return true;
  if (SKIP_PATH_REGEX.test(pathname)) return true;
  if (SKIP_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

function shouldSkipByUserAgent(userAgent: string | null): boolean {
  return !!userAgent && BOT_UA_REGEX.test(userAgent);
}

/**
 * Logga un hit 404 SOLO se è una navigazione utente reale: GET, non
 * prefetch RSC, non bot. Pensata per `not-found.tsx` con `after()` di
 * Next 16.
 *
 * Razionale: la rendering di `not-found.tsx` non è un segnale affidabile
 * di "URL inesistente". Next la innesca anche per:
 *   - RSC prefetch (`<Link>` in viewport, hover, ecc.)
 *   - RSC navigation se un layer del segment-tree decide di calcolarsi
 *     come not-found pur con la pagina effettiva che renderà ok
 *   - chain di redirect cross-locale dove il fetcher prefetcha la
 *     destinazione che si sposta ancora
 *
 * Filtrare per TIPO di request (prefetch vs full navigation) elimina la
 * maggior parte dei falsi positivi senza maintainare liste hardcoded di
 * path "buoni". Heuristics:
 *   - `Next-Router-Prefetch: 1` → Next ha prefetchato, NON è user click
 *   - `purpose: prefetch` o `Sec-Purpose: prefetch` → prefetch HTTP
 *   - `Sec-Fetch-Mode: navigate` → mancanza di questo header su request
 *     sincrone è sospetto (RSC fetch interno)
 */
export async function logNotFoundHit(input: {
  pathname: string | null | undefined;
  referrer: string | null | undefined;
  userAgent: string | null | undefined;
  /** Headers raw della request: `(await headers()).entries()` o equivalente.
   *  Usato per detect prefetch / RSC / non-user navigation. */
  reqHeaders: Headers;
}): Promise<void> {
  const pathname = input.pathname?.trim();
  if (!pathname) return;

  const userAgent = input.userAgent ?? null;
  if (shouldSkipByPath(pathname)) return;
  if (shouldSkipByUserAgent(userAgent)) return;

  // --- Filtro per TIPO di request ---
  const h = input.reqHeaders;

  // 1. Prefetch esplicito: Next o standard HTTP
  if (h.get("next-router-prefetch") === "1") return;
  if (h.get("purpose")?.toLowerCase() === "prefetch") return;
  if (h.get("sec-purpose")?.toLowerCase().includes("prefetch")) return;

  // 2. RSC fetch (Next stream payload): `RSC: 1` indica una richiesta di
  //    payload RSC, sia per prefetch che per navigation lato client. Per
  //    una full navigation `Sec-Fetch-Mode: navigate` accompagna la RSC.
  //    Se RSC=1 ma NON è una navigate, è un fetch interno (prefetch o
  //    similar) — skip.
  const isRscRequest = h.get("rsc") === "1";
  const fetchMode = h.get("sec-fetch-mode")?.toLowerCase() ?? null;
  if (isRscRequest && fetchMode !== "navigate") return;

  // 3. `Sec-Fetch-Dest: document` → la richiesta è per un documento HTML
  //    completo (full navigation). Tutto ciò che NON è document e NON è
  //    navigate è risorsa o fetch ausiliaria → skip.
  const fetchDest = h.get("sec-fetch-dest")?.toLowerCase() ?? null;
  if (fetchDest && fetchDest !== "document" && fetchMode !== "navigate") {
    return;
  }

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
