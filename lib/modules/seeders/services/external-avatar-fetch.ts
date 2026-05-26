// lib/modules/seeders/services/external-avatar-fetch.ts
//
// Fetcher di avatar realistici da servizi esterni. Mix con fallback:
//
//   1. thispersondoesnotexist.com   (StyleGAN, gratis, no key)
//   2. Unsplash API (random portrait, gratis con API key)
//
// Strategia: prova TPDNE prima; se rate-limited / 5xx / timeout, falla
// silenziosamente e il caller pickera' un fallback DiceBear. Se Unsplash
// API key e' configurata, il caller puo' chiamare direttamente
// fetchUnsplashPortrait() (mix) o lasciare il fetchAiFace() interno
// che fa TPDNE primario.
//
// Sicurezza:
//   - Timeout 10s per fetch (no hang nel seed run)
//   - MIME whitelist (image/png|jpeg|webp)
//   - Size cap 4MB (TPDNE ritorna ~1-2MB PNG)
//   - User-Agent custom (TPDNE banna i default UA Node.js)
import "server-only";

import { getAppSettings } from "@/lib/db/settings-queries";

const TPDNE_URL = "https://thispersondoesnotexist.com/";
const UNSPLASH_PORTRAIT_QUERY =
  "https://api.unsplash.com/photos/random?query=portrait&orientation=squarish&content_filter=high";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Browser-like UA per superare il filtro anti-bot di TPDNE. Senza UA
 * custom risponde 403 ai default `node/undici`. Il referer e' opzionale.
 */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface ExternalAvatarResult {
  /** URL pubblica della foto sorgente. Il caller la passa a
   *  uploadAvatarFromUrlToR2 (che fa fetch + upload R2). */
  sourceUrl: string;
  /** Nome del servizio che ha risposto, per logging/metrics. */
  source: "tpdne" | "unsplash";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch da thispersondoesnotexist.com. Il sito serve direttamente
 * l'immagine sull'URL root, non c'e' API JSON. Per riusare uploadAvatarFromUrlToR2
 * (che vuole un URL pubblica) ritorniamo direttamente la URL — il
 * caller la passera' al ri-fetch interno di uploadAvatarFromUrlToR2.
 *
 * Caveat: TPDNE non fornisce permalink. La stessa URL ritorna una
 * foto diversa ad ogni request. Dobbiamo quindi essere "lazy": il
 * caller fa 1 request totale (uploadAvatarFromUrlToR2 fa internal
 * fetch); non ritorniamo image bytes qui.
 *
 * Doppio fetch per ridurre rischio: 1 HEAD per validare il server e'
 * up e UA accettato, poi torniamo la URL al caller.
 */
async function probeTpdne(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      TPDNE_URL,
      {
        method: "HEAD",
        headers: { "User-Agent": BROWSER_UA },
        redirect: "follow",
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return false;
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_MIMES.has(mime)) return false;
    const len = Number.parseInt(res.headers.get("content-length") ?? "0", 10);
    if (Number.isFinite(len) && len > MAX_BYTES) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch random portrait da Unsplash. Richiede API key in app_settings
 * (`storage.unsplash.access_key` — settable da admin). Se assente,
 * ritorna null senza errore: il caller cadra' su DiceBear.
 *
 * Endpoint: /photos/random?query=portrait. Ritorna 1 foto a request,
 * include `urls.regular` (≈1080px JPG) che usiamo direttamente.
 */
async function fetchUnsplashPortrait(): Promise<ExternalAvatarResult | null> {
  const s = await getAppSettings();
  const accessKey = (s["storage.unsplash.access_key"] ?? "").trim();
  if (!accessKey) return null;

  try {
    const res = await fetchWithTimeout(
      UNSPLASH_PORTRAIT_QUERY,
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
          "Accept-Version": "v1",
        },
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) {
      console.warn("[seeders/external-avatar] unsplash status", res.status);
      return null;
    }
    const data = (await res.json()) as { urls?: { regular?: string } };
    const url = data?.urls?.regular;
    if (!url || typeof url !== "string") return null;
    return { sourceUrl: url, source: "unsplash" };
  } catch (err) {
    console.warn("[seeders/external-avatar] unsplash fetch failed:", err);
    return null;
  }
}

/**
 * Entry point: tenta TPDNE come primario, Unsplash come fallback.
 * Ritorna null se entrambi falliscono — il caller usera' DiceBear.
 */
export async function fetchExternalAvatar(): Promise<ExternalAvatarResult | null> {
  // 1) TPDNE primario (no API key necessaria)
  if (await probeTpdne()) {
    return { sourceUrl: TPDNE_URL, source: "tpdne" };
  }

  // 2) Unsplash fallback (solo se API key configurata)
  const unsplash = await fetchUnsplashPortrait();
  if (unsplash) return unsplash;

  return null;
}
