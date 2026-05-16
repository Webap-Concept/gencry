// lib/modules/seeders/services/post-composer.ts
//
// Compone il body finale del post applicando 3 layer di realismo
// sopra il template di base scelto da posts-contributor:
//
//   1. Densità variabile (1 frase / 2-3 / 4-6 / 1-liner cortissimo)
//      con distribuzione 60/25/12/3 + bias mood (degen→corto,
//      macro→lungo, newbie→medio).
//   2. Imperfezioni naturali sui mood casuali/degen/newbie:
//      - 10% emoji a fine post (solo degen/newbie)
//      - 10% slang/abbrev (degen/trader)
//      - 5% typo (degen/newbie)
//   3. Lascia inalterati i placeholder {ticker}, {mention}, ecc.:
//      la sostituzione la fa resolveTemplate() in posts-contributor.ts
//      DOPO la composizione. Così le imperfezioni non rompono i
//      placeholder.
//
// I generatori sono puri (Math.random) e non hanno side effects:
// testabili in vitest se mai vorremo coverage.
import type { UserMood } from "./mood-types";

// ─────────────────────────────────────────────────────────────────────
// Layer 1 — Densità
// ─────────────────────────────────────────────────────────────────────

type DensityBucket = "ultra_short" | "single" | "medium" | "long";

const BASE_DENSITY: Record<DensityBucket, number> = {
  ultra_short: 3,
  single: 60,
  medium: 25,
  long: 12,
};

/**
 * Bias mood sui pesi base. degen scrive corto-bro, macro scrive
 * argomentazioni lunghe, newbie sta in mezzo, gli altri stanno sul
 * default.
 */
function biasDensityByMood(
  mood: UserMood,
): Record<DensityBucket, number> {
  switch (mood) {
    case "degen":
      // Più 1-liner e ultra-short ("WAGMI 🚀").
      return { ultra_short: 10, single: 70, medium: 18, long: 2 };
    case "macro":
      // Argomentazioni più lunghe, niente "gm".
      return { ultra_short: 0, single: 35, medium: 40, long: 25 };
    case "newbie":
      // Domande spesso medie ("…domanda stupida, qualcuno sa…?").
      return { ultra_short: 2, single: 50, medium: 38, long: 10 };
    default:
      return BASE_DENSITY;
  }
}

function pickDensity(mood: UserMood): DensityBucket {
  const weights = biasDensityByMood(mood);
  const total =
    weights.ultra_short + weights.single + weights.medium + weights.long;
  const r = Math.random() * total;
  if (r < weights.ultra_short) return "ultra_short";
  if (r < weights.ultra_short + weights.single) return "single";
  if (r < weights.ultra_short + weights.single + weights.medium) return "medium";
  return "long";
}

/**
 * Pool di "filler" ultra-corti per la fascia 3%. Sono indipendenti
 * dal template scelto: se beccato il bucket ultra_short, sostituiamo
 * il template intero con uno di questi. Sembra molto più organico di
 * "tagliare" un template medio.
 */
const ULTRA_SHORT_FILLERS = [
  "gm",
  "GM ☀️",
  "lfg",
  "lol",
  "wagmi",
  "ngmi",
  "ok",
  "🤝",
  ".",
  "...",
  "hodl",
  "good vibes",
];

/**
 * Combina N template senza placeholder duplicati. Riceve il template
 * principale + il pool da cui pescare gli "additional" (di solito
 * GENERIC, per evitare di concatenare 3 frasi tutte BTC-maximalist).
 *
 * Anti-redundancy: skippiamo i template che CONTENGONO `{ticker_trend_*}`
 * se il main già ne ha uno, sennò avremmo 2 "in crescita" nella stessa
 * frase, suona robotico.
 */
function combineSentences(
  main: string,
  pool: readonly string[],
  count: number,
): string {
  const parts: string[] = [main];
  const used = new Set<string>([main]);
  const mainHasTrend = /\{ticker_trend_/.test(main);

  let attempts = 0;
  while (parts.length < count && attempts < count * 4) {
    attempts += 1;
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    if (used.has(candidate)) continue;
    if (mainHasTrend && /\{ticker_trend_/.test(candidate)) continue;
    parts.push(candidate);
    used.add(candidate);
  }

  // Separatore tra frasi: spazio singolo. Se la frase finisce già con
  // punteggiatura, non aggiungiamo niente. Se no, mettiamo un ". ".
  return parts
    .map((p, i) => {
      if (i === parts.length - 1) return p;
      const trimmed = p.trimEnd();
      if (/[.!?…]$/.test(trimmed)) return `${trimmed} `;
      return `${trimmed}. `;
    })
    .join("");
}

// ─────────────────────────────────────────────────────────────────────
// Layer 2 — Imperfezioni
// ─────────────────────────────────────────────────────────────────────

const EMOJI_POOL = ["🚀", "🌕", "💎", "🔥", "🤝", "👀", "📈", "📉", "🤔", "🫡", "💪"];

const SLANG_MAP: Array<[RegExp, string]> = [
  [/\bperò\b/gi, "ma"],
  [/\bdavvero\b/gi, "davv"],
  [/\bperché\b/gi, "xké"],
  [/\bperche\b/gi, "xke"],
  [/\bcomunque\b/gi, "cmq"],
  [/\banche\b/gi, "anke"],
  [/\bpiù\b/gi, "+"],
  [/\bmeno\b/gi, "-"],
  [/\btroppo\b/gi, "tropp"],
];

/**
 * Inverte due lettere consecutive a una posizione random, o omette un
 * singolo carattere. Skippiamo i token che contengono `$`, `{`, `@`
 * per non rompere placeholder e ticker.
 */
function applyTypo(body: string): string {
  const tokens = body.split(/(\s+)/); // mantiene gli spazi
  const eligible: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.length < 4) continue;
    if (/[\s${}@#]/.test(t)) continue;
    if (/[$@]/.test(t)) continue;
    eligible.push(i);
  }
  if (eligible.length === 0) return body;
  const idx = eligible[Math.floor(Math.random() * eligible.length)];
  const word = tokens[idx];
  const charIdx = 1 + Math.floor(Math.random() * (word.length - 2));
  if (Math.random() < 0.5) {
    // Swap.
    tokens[idx] =
      word.slice(0, charIdx) +
      word[charIdx + 1] +
      word[charIdx] +
      word.slice(charIdx + 2);
  } else {
    // Omit.
    tokens[idx] = word.slice(0, charIdx) + word.slice(charIdx + 1);
  }
  return tokens.join("");
}

function applySlang(body: string): string {
  let out = body;
  for (const [rx, replacement] of SLANG_MAP) {
    if (rx.test(out) && Math.random() < 0.5) {
      out = out.replace(rx, replacement);
    }
  }
  return out;
}

function appendEmoji(body: string): string {
  const n = 1 + Math.floor(Math.random() * 2); // 1-2 emoji
  const picks: string[] = [];
  for (let i = 0; i < n; i++) {
    picks.push(EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]);
  }
  return `${body} ${picks.join("")}`.trim();
}

// ─────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────

export type ComposeOptions = {
  mood: UserMood;
  /** Il template "principale" scelto da posts-contributor. */
  mainTemplate: string;
  /** Pool da cui pescare frasi aggiuntive per i bucket medium/long. */
  fillerPool: readonly string[];
  /** Pool degli ultra-short ("gm" / "lfg" / ".") — esposto per test. */
  ultraShortPool?: readonly string[];
};

/**
 * Output: il body finale CON placeholder ancora presenti. La
 * sostituzione `{ticker}` etc. la fa il caller.
 */
export function composeBody(opts: ComposeOptions): string {
  const density = pickDensity(opts.mood);

  let body: string;
  switch (density) {
    case "ultra_short": {
      const pool = opts.ultraShortPool ?? ULTRA_SHORT_FILLERS;
      body = pool[Math.floor(Math.random() * pool.length)];
      break;
    }
    case "single":
      body = opts.mainTemplate;
      break;
    case "medium": {
      const n = 2 + Math.floor(Math.random() * 2); // 2-3
      body = combineSentences(opts.mainTemplate, opts.fillerPool, n);
      break;
    }
    case "long": {
      const n = 4 + Math.floor(Math.random() * 3); // 4-6
      body = combineSentences(opts.mainTemplate, opts.fillerPool, n);
      break;
    }
  }

  // Imperfezioni — applicate solo a certi mood. La regola "mai emoji
  // nel social UI" del progetto vale per UI hand-coded; questi sono
  // user-generated content seed, plausibili per degen/newbie.
  const moodAllowsEmoji = opts.mood === "degen" || opts.mood === "newbie";
  const moodAllowsSlang = opts.mood === "degen" || opts.mood === "trader";
  const moodAllowsTypo = opts.mood === "degen" || opts.mood === "newbie";

  if (moodAllowsSlang && Math.random() < 0.1) {
    body = applySlang(body);
  }
  if (moodAllowsTypo && Math.random() < 0.05) {
    body = applyTypo(body);
  }
  if (moodAllowsEmoji && Math.random() < 0.1) {
    body = appendEmoji(body);
  }

  return body;
}
