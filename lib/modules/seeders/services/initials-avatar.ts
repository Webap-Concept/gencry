// lib/modules/seeders/services/initials-avatar.ts
//
// Genera un avatar "initials" come SVG inline: cerchio gradient + 1-2
// iniziali al centro. Riproduce il pattern di Gmail/Slack/Linear
// "utente che non ha caricato la foto profilo". Su un social reale e'
// il 30-40% degli utenti, quindi e' una variazione fondamentale del mix.
//
// Output SVG -> Buffer -> upload R2 con MIME `image/svg+xml`.
// R2 e CDN servono SVG nativamente. Niente sharp / rasterizzazione
// server-side: il browser-render finale e' pixel-perfect a qualsiasi
// scala (avatar 32px / 256px / 512px tutti dallo stesso file).
//
// Pattern colore: hash deterministico dell'userId (o username) → indice
// nella palette → stessa persona ha sempre lo stesso colore di sfondo.
// Coerente con il behavior di Slack/Gmail.
import "server-only";

import { createHash } from "node:crypto";

/**
 * Palette pastello/saturata che lavora bene con testo bianco sopra.
 * 12 colori = abbastanza varieta' visiva senza saturazione cromatica.
 * Scelti per restare leggibili sia su sfondo chiaro che scuro del feed.
 */
const PALETTE: Array<{ from: string; to: string }> = [
  { from: "#f97316", to: "#ea580c" }, // orange
  { from: "#f59e0b", to: "#d97706" }, // amber
  { from: "#84cc16", to: "#65a30d" }, // lime
  { from: "#10b981", to: "#059669" }, // emerald
  { from: "#06b6d4", to: "#0891b2" }, // cyan
  { from: "#3b82f6", to: "#2563eb" }, // blue
  { from: "#6366f1", to: "#4f46e5" }, // indigo
  { from: "#8b5cf6", to: "#7c3aed" }, // violet
  { from: "#d946ef", to: "#c026d3" }, // fuchsia
  { from: "#ec4899", to: "#db2777" }, // pink
  { from: "#ef4444", to: "#dc2626" }, // red
  { from: "#14b8a6", to: "#0d9488" }, // teal
];

function colorForSeed(seed: string): { from: string; to: string } {
  const hash = createHash("sha256").update(seed).digest();
  const idx = hash[0] % PALETTE.length;
  return PALETTE[idx];
}

/**
 * Estrae 1-2 iniziali dal nome. Logica:
 *   - "Marco Rossi"     → "MR"
 *   - "Marco"           → "M"
 *   - "" + username "luca_42" → "L"
 *
 * Niente normalizzazione accenti (la cosa funziona anche per "À"),
 * niente lowercase: usiamo SVG `text-transform: uppercase` non
 * disponibile cross-browser, quindi facciamo `.toUpperCase()` qui.
 */
export function deriveInitials(
  firstName: string,
  lastName: string,
  fallbackUsername: string,
): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first[0].toUpperCase();
  if (last) return last[0].toUpperCase();
  const fallback = fallbackUsername.trim().replace(/[^a-zA-Z]/g, "");
  return fallback ? fallback[0].toUpperCase() : "?";
}

/**
 * Genera un avatar SVG 512x512 con gradient circolare + iniziali.
 * Dimensione 512 = stessa del crop dialog utente reale, mantiene
 * coerenza visuale.
 *
 * Il testo e' centrato via `text-anchor=middle` + `dominant-baseline=
 * central`. Font-family generico (sans-serif system stack) per non
 * dipendere da webfont nel browser.
 */
export function generateInitialsSvg(
  initials: string,
  seed: string,
): string {
  const { from, to } = colorForSeed(seed);
  // Font-size: 1 carattere = 240, 2 caratteri = 200 (piu' largo, devono
  // entrare entrambi). Empirico, testato visualmente.
  const fontSize = initials.length >= 2 ? 200 : 240;
  // ID unico per il gradient per evitare collision se piu' SVG sono
  // inline nella stessa pagina (qui non capita ma defensive).
  const gradId = `g${createHash("sha256").update(seed).digest("hex").slice(0, 8)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}" />
      <stop offset="100%" stop-color="${to}" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#${gradId})" />
  <text x="256" y="256"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    font-size="${fontSize}"
    font-weight="600"
    fill="#ffffff"
    text-anchor="middle"
    dominant-baseline="central">${initials}</text>
</svg>`;
}
