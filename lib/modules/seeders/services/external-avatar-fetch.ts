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

import { createHash } from "node:crypto";
import { getAppSettings } from "@/lib/db/settings-queries";

const TPDNE_URL = "https://thispersondoesnotexist.com/";
const UNSPLASH_PORTRAIT_QUERY =
  "https://api.unsplash.com/photos/random?query=portrait&orientation=squarish&content_filter=high";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

const DEDUP_MAX_ATTEMPTS = 3;
const JITTER_MIN_MS = 200;
const JITTER_MAX_MS = 800;

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

/**
 * Risultato di un fetch di bytes effettivi (con hash per dedup).
 * Usato dal caller per evitare di assegnare la stessa foto a 2 utenti
 * diversi (TPDNE rigenera ogni ~1s, fetch in parallelo entro quel
 * window restituiscono gli stessi bytes).
 */
export interface ExternalAvatarBytes {
  buffer: Buffer;
  mime: "image/png" | "image/jpeg" | "image/webp";
  /** SHA-256 dei bytes per dedup tra fetch della stessa run. */
  hash: string;
  source: "tpdne" | "unsplash";
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function randomJitterMs(): number {
  return JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS));
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

// ──────────────────────────────────────────────────────────────────────────
// Versione DEDUP — usata da avatar-resolver per garantire 1 user = 1 foto
// unica. Calcola SHA-256 dei bytes, controlla contro `usedHashes`, ritrieva
// fino a DEDUP_MAX_ATTEMPTS volte se duplicato.
// ──────────────────────────────────────────────────────────────────────────

async function fetchTpdneBytes(): Promise<ExternalAvatarBytes | null> {
  try {
    // Jitter PRIMA della request: 5 worker concorrenti se partono
    // sincroni colpiscono TPDNE entro ~10ms e ricevono gli stessi
    // bytes. Con jitter 200-800ms distribuiamo le call e ognuna ha
    // alta probabilita' di toccare una rigenerazione diversa.
    await sleep(randomJitterMs());

    const res = await fetchWithTimeout(
      TPDNE_URL,
      {
        headers: { "User-Agent": BROWSER_UA },
        redirect: "follow",
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return null;

    const rawMime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_MIMES.has(rawMime)) return null;

    const len = Number.parseInt(res.headers.get("content-length") ?? "0", 10);
    if (Number.isFinite(len) && len > MAX_BYTES) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES || buffer.byteLength === 0) return null;

    const hash = createHash("sha256").update(buffer).digest("hex");
    return {
      buffer,
      mime: rawMime as "image/png" | "image/jpeg" | "image/webp",
      hash,
      source: "tpdne",
    };
  } catch {
    return null;
  }
}

async function fetchUnsplashBytes(): Promise<ExternalAvatarBytes | null> {
  const result = await fetchUnsplashPortrait();
  if (!result) return null;
  try {
    const res = await fetchWithTimeout(
      result.sourceUrl,
      { headers: { "User-Agent": BROWSER_UA }, redirect: "follow" },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const rawMime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_MIMES.has(rawMime)) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES || buffer.byteLength === 0) return null;
    const hash = createHash("sha256").update(buffer).digest("hex");
    return {
      buffer,
      mime: rawMime as "image/png" | "image/jpeg" | "image/webp",
      hash,
      source: "unsplash",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch unico AI face per il caller (1 user). Garantisce dedup contro
 * `usedHashes` (mutato in-place al successo). Strategia:
 *   1. Fino a 3 tentativi: fetch TPDNE → hash check → se nuovo, return.
 *   2. Se tutti i 3 tentativi TPDNE producono duplicati o falliscono:
 *      fallback Unsplash (1 tentativo, anch'esso hash-checked).
 *   3. Se anche Unsplash duplica o manca: return null.
 *
 * In null path, il caller cade su DiceBear (sempre univoco per username).
 */
export async function fetchUniqueExternalAvatar(
  usedHashes: Set<string>,
): Promise<ExternalAvatarBytes | null> {
  for (let attempt = 0; attempt < DEDUP_MAX_ATTEMPTS; attempt++) {
    const candidate = await fetchTpdneBytes();
    if (!candidate) continue;
    if (!usedHashes.has(candidate.hash)) {
      usedHashes.add(candidate.hash);
      return candidate;
    }
    // Duplicato: ri-tenta (con nuovo jitter, TPDNE potrebbe gia' aver
    // rigenerato nel frattempo).
  }

  const unsplash = await fetchUnsplashBytes();
  if (unsplash && !usedHashes.has(unsplash.hash)) {
    usedHashes.add(unsplash.hash);
    return unsplash;
  }

  return null;
}
