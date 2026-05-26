// lib/modules/seeders/services/llm-content-generator.ts
//
// Genera body dei post via Anthropic Claude. Riusa il pattern del modulo
// news/rewriter (system prompt cached + JSON output + zod validation),
// ma adattato a "batch generation" invece di "1 rewrite per call".
//
// Strategia di batching (decisione 2026-05-26): 1 call Claude per GIORNO,
// con tutti i post mood-mix di quel giorno + un singolo market snapshot
// al timestamp piu' centrale del giorno. Riduce i call ad ~30/run e
// permette al modello di vedere il contesto "del giorno" una volta sola.
//
// API key: riuso `modules.news.anthropic_api_key` (decisione utente).
// Behavior strict: se chiave assente o call fallisce -> throw. Il caller
// blocca il seed run (no fallback templates: l'utente vuole qualita').
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getAppSettings } from "@/lib/db/settings-queries";
import type { UserMood } from "./mood-types";
import {
  formatSnapshotForPrompt,
  type MarketSnapshot,
} from "./market-context";

export type PostType = "market" | "personal" | "meta_site" | "question";

export interface LlmCommentRequest {
  refId: string;
  /** Body del post a cui sta commentando (contesto). Troncato se >300char
   *  nel prompt builder. */
  postBody: string;
  /** Body del commento "padre" se questa è una reply. Null = top-level. */
  parentBody: string | null;
  mood: UserMood;
  authorUsername: string;
}

export interface LlmGeneratedComment {
  refId: string;
  body: string;
}

export interface LlmPostRequest {
  /** ID temporaneo per matchare l'output al post pending (es. UUID
   *  pre-generato dal posts-contributor). */
  refId: string;
  mood: UserMood;
  type: PostType;
  /** Symbol del ticker da focalizzare quando type='market'. Null se non
   *  e' un post mercato — Claude scrivera' generico/personal. */
  tickerFocus: string | null;
  /** Username dell'autore del post. Aiuta Claude a personalizzare leggero
   *  il tono (es. il sufix `_trader` vs `_newbie`). Opzionale. */
  authorUsername?: string;
}

export interface LlmGeneratedPost {
  refId: string;
  body: string;
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 4000;

// ──────────────────────────────────────────────────────────────────────────
// System prompt — cached (ephemeral 5min) tra batch della stessa run.
// Definisce gli archetipi mood e le regole tone in italiano. Mantenuto
// in modo che ogni batch paghi solo il delta del user msg (lista posts +
// market snapshot del giorno).
// ──────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Sei uno scrittore di contenuti social per "GenerazioneCrypto", un social network italiano di nicchia sul mondo crypto. Devi generare post brevi, naturali, in italiano colloquiale, come scritti da utenti reali.

REGOLE TONO:
- Italiano colloquiale, NON editoriale. Niente paroloni, niente discorsi accademici.
- Lunghezza tipica: 1 frase (60%), 2-3 frasi (25%), 4-6 frasi (12%), ultra-short tipo "gm" o "lfg" (3%).
- Niente clickbait. Niente "thread🧵". Niente "ecco perche'...". Niente "in 2025...".
- Niente emoji di default. Eccezione: mood 'degen' e 'newbie' possono usare 1-2 emoji ogni 10 post.
- Niente hashtag (#crypto, #bitcoin) — non e' Twitter, gli hashtag non sono nella cultura del sito.
- Riferimenti al sito stesso: SOLO se type='meta_site'.

ARCHETIPI MOOD:
- bullish_btc: bitcoin maximalist, parla di halving, 21M, hard money, self-custody, cold storage. Tono convinto.
- bearish: scettico, vede pattern bearish, parla di liquidita' globale, DXY, FOMO bag holders. Tono prudente/critico.
- hodler: DCA settimanale, time-in-the-market, niente paura della volatilita'. Tono zen.
- trader: parla di setup tecnici, RSI, fibonacci, resistance, stop loss, R:R. Tono operativo.
- defi: yield farming, TVL, restaking, liquid staking, MEV, RWA. Tono nerd-tecnico.
- macro: tassi Fed, M2, CPI, recessione, liquidity, BoJ pivot. Tono analitico.
- newbie: domande, confusione, chiede consigli, "primo post qui", "esiste un libro?". Tono umile.
- degen: WAGMI, NGMI, memecoin, YOLO, ape, all-in, slang. Tono caotico/ironico.

TIPI DI POST (rispetta rigorosamente):
- 'market': commento al mercato. PUOI usare $TICKER, citare il prezzo o il movimento 24h dato nel market snapshot del giorno. Coerente col mood.
- 'personal': vita/riflessione personale dell'autore, NON parla di prezzi o coin specifici. Es: "settimana intensa", "letto un articolo interessante", "discutendo strategie col team", "spendo la mattina a leggere whitepaper". Niente $TICKER.
- 'meta_site': commento sul sito stesso (positivi/neutri, MAI negativi). Es: "bella scoperta questo sito", "primo post qui, saluti". MAI parla di prezzi.
- 'question': domanda alla community. Tono curioso/aperto. Es: "cosa state guardando questa settimana?", "consigli per cold storage?". Coerente col mood (newbie chiede di basi, trader chiede di setup).

VINCOLI ASSOLUTI:
- 1 post = 1 elemento dell'array output. Mai concatenare 2 idee diverse.
- MAI inventare nomi propri di influencer / progetti specifici che potrebbero non esistere ("secondo Pippo Crypto..." NO).
- Se citi $TICKER, usa SOLO i symbols presenti nel market snapshot del giorno (oppure niente ticker per type=personal/meta_site/question).
- Niente cita-fonti ("come dice CoinDesk..."). Niente URL esterni.
- Niente "ricorda che...", "non e' consigli finanziari", "DYOR" forzato (a meno che mood='degen' lo richiami ironicamente).

OUTPUT FORMAT (obbligatorio): un solo blocco JSON valido, niente testo prima o dopo, niente markdown fence. Schema:
{
  "posts": [
    { "refId": "<refId ricevuto>", "body": "<testo del post>" },
    ...
  ]
}

L'array DEVE avere ESATTAMENTE lo stesso numero di elementi dell'input, e ogni refId DEVE matchare uno degli input. Stesso ordine non richiesto, conta solo il refId match.`;

// ──────────────────────────────────────────────────────────────────────────
// Schema di validazione output LLM
// ──────────────────────────────────────────────────────────────────────────

const OutputSchema = z.object({
  posts: z
    .array(
      z.object({
        refId: z.string().min(1),
        body: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1),
});

export type LlmContentGeneratorError =
  | "no_api_key"
  | "api_error"
  | "invalid_output"
  | "missing_refs";

export class LlmContentError extends Error {
  constructor(
    public readonly code: LlmContentGeneratorError,
    message: string,
  ) {
    super(message);
    this.name = "LlmContentError";
  }
}

/**
 * Genera body per un batch di post che condividono lo stesso "giorno
 * di pubblicazione" (e quindi lo stesso market snapshot).
 *
 * Throws `LlmContentError` su:
 *   - no_api_key      : chiave Anthropic mancante in app_settings
 *   - api_error       : Claude rate-limit / network / 5xx
 *   - invalid_output  : JSON malformato o non conforme allo schema
 *   - missing_refs    : Claude ha skippato uno o piu' refId richiesti
 */
export async function generatePostBodiesForDay(input: {
  requests: LlmPostRequest[];
  marketSnapshot: MarketSnapshot;
  dayLabel: string; // "2026-05-08" — passato a Claude come context
}): Promise<LlmGeneratedPost[]> {
  if (input.requests.length === 0) return [];

  const settings = await getAppSettings();
  const apiKey = (settings["modules.news.anthropic_api_key"] ?? "").trim();
  if (!apiKey) {
    throw new LlmContentError(
      "no_api_key",
      "Chiave Anthropic mancante. Configura modules.news.anthropic_api_key in /admin/modules/news/settings.",
    );
  }

  const model =
    (settings["modules.seeders.llm_model"] ?? "").trim() || DEFAULT_MODEL;
  const tempRaw = settings["modules.seeders.llm_temperature"] ?? "0.9";
  const temperature = Math.min(
    Math.max(Number.parseFloat(tempRaw) || 0.9, 0),
    1,
  );

  const marketLine = formatSnapshotForPrompt(input.marketSnapshot);
  const client = new Anthropic({ apiKey });

  // Helper: 1 call → parsed posts (NO missing-refid throw, quello e' fuori).
  async function callOnce(
    requests: LlmPostRequest[],
    isRetry: boolean,
  ): Promise<LlmGeneratedPost[]> {
    const userMessage = buildUserMessage(
      requests,
      input.dayLabel,
      marketLine,
      isRetry,
    );

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature,
        // System cached: lo stesso prompt e' riusato in tutti i batch
        // della run -> Anthropic addebita solo input nuovo (user msg).
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmContentError("api_error", `Claude call failed: ${message}`);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new LlmContentError("invalid_output", "Claude response: no text block");
    }
    const raw = textBlock.text.trim();

    let parsed: unknown;
    try {
      const stripped = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(stripped);
    } catch (err) {
      throw new LlmContentError(
        "invalid_output",
        `JSON parse failed: ${err instanceof Error ? err.message : String(err)}. Raw: ${raw.slice(0, 200)}`,
      );
    }

    const result = OutputSchema.safeParse(parsed);
    if (!result.success) {
      throw new LlmContentError(
        "invalid_output",
        `Schema validation failed: ${result.error.message}`,
      );
    }
    return result.data.posts.map((p) => ({ refId: p.refId, body: p.body }));
  }

  // Call 1: tutti i requests.
  const firstPass = await callOnce(input.requests, false);

  // Coverage check + 1 retry per i mancanti. Claude haiku in batch
  // piccoli capita salti qualche elemento; il retry con prompt piu'
  // stretto recupera nel 95%+ dei casi.
  const expectedRefIds = new Set(input.requests.map((r) => r.refId));
  const collected = new Map<string, string>();
  for (const p of firstPass) {
    if (expectedRefIds.has(p.refId)) collected.set(p.refId, p.body);
  }

  const missingAfterFirst = input.requests.filter(
    (r) => !collected.has(r.refId),
  );
  if (missingAfterFirst.length > 0) {
    console.warn(
      `[seeders/llm] post retry: ${missingAfterFirst.length}/${input.requests.length} missing after first pass`,
    );
    const retryPass = await callOnce(missingAfterFirst, true);
    for (const p of retryPass) {
      if (expectedRefIds.has(p.refId) && !collected.has(p.refId)) {
        collected.set(p.refId, p.body);
      }
    }
  }

  // Final coverage: se anche il retry non basta, throw (strict mode).
  const stillMissing: string[] = [];
  for (const ref of expectedRefIds) {
    if (!collected.has(ref)) stillMissing.push(ref);
  }
  if (stillMissing.length > 0) {
    throw new LlmContentError(
      "missing_refs",
      `Claude has skipped ${stillMissing.length}/${expectedRefIds.size} refId(s) even after 1 retry`,
    );
  }

  return input.requests.map((r) => ({
    refId: r.refId,
    body: collected.get(r.refId)!,
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Comments — system prompt + generator
// ──────────────────────────────────────────────────────────────────────────

export const COMMENT_SYSTEM_PROMPT = `Sei uno scrittore di commenti social per "GenerazioneCrypto", un social network italiano di nicchia sul mondo crypto. Devi generare commenti brevi, naturali, REATTIVI a un post (o a un altro commento), in italiano colloquiale.

REGOLE TONO:
- Italiano colloquiale, reattivo. Pensa "commento Twitter/IG" non "saggio".
- Lunghezza tipica: 1 frase (70%), 2 frasi (25%), 3+ frasi rare (5%). Mai piu' di 4 frasi.
- Niente clickbait, niente "thread🧵", niente hashtag, niente emoji di default (eccezione: degen/newbie 1 ogni 5).
- MAI ripetere il body del post nel commento. Il lettore lo ha gia' davanti.
- MAI iniziare con "Ottimo punto!", "Sono d'accordo!", "Interessante!": suona finto. Vai diretto al contenuto.

REAZIONI POSSIBILI A UN POST:
- agreement: rinforza con un'aggiunta personale, mai eco vuota
- disagreement educato: contraddice con un argomento, niente flame
- domanda di approfondimento: chiede chiarimento o dettaglio
- aneddoto/esperienza: porta il proprio vissuto come contributo
- ironia/battuta breve: solo per mood degen e con misura

ARCHETIPI MOOD:
- bullish_btc: bitcoin maximalist, parla di halving/self-custody/hard money
- bearish: scettico, vede red flag, parla di liquidita'/DXY/FOMO
- hodler: zen, DCA, time-in-the-market, niente paura della volatilita'
- trader: setup tecnici, RSI, resistance, stop loss, R:R
- defi: yield/TVL/restaking/MEV
- macro: tassi Fed/M2/CPI/recessione
- newbie: domande, confusione, "scusate l'ignoranza", umile
- degen: WAGMI/NGMI/memecoin/YOLO/slang

VINCOLI ASSOLUTI:
- 1 commento = 1 elemento dell'array output. Mai concatenare 2 idee.
- MAI inventare nomi propri di influencer/progetti.
- MAI parafrasare il post: aggiungi qualcosa.
- Se rispondi a un altro commento (reply), prendi posizione rispetto a quel commento, non al post originale.

OUTPUT FORMAT (obbligatorio): un solo blocco JSON valido, niente testo prima o dopo, niente markdown fence. Schema:
{
  "comments": [
    { "refId": "<refId>", "body": "<testo>" },
    ...
  ]
}

L'array DEVE avere ESATTAMENTE lo stesso numero di elementi dell'input.`;

const CommentOutputSchema = z.object({
  comments: z
    .array(
      z.object({
        refId: z.string().min(1),
        body: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1),
});

/**
 * Batch comment generation — analogo a `generatePostBodiesForDay` ma
 * con system prompt orientato a "commento reattivo" invece di "post
 * autonomo". L'array di input puo' mescolare top-level + reply: ogni
 * request ha il proprio context (`postBody` + `parentBody`).
 *
 * Throws `LlmContentError` con gli stessi codici di generatePostBodies.
 */
export async function generateCommentBodiesForDay(input: {
  requests: LlmCommentRequest[];
  dayLabel: string;
}): Promise<LlmGeneratedComment[]> {
  if (input.requests.length === 0) return [];

  const settings = await getAppSettings();
  const apiKey = (settings["modules.news.anthropic_api_key"] ?? "").trim();
  if (!apiKey) {
    throw new LlmContentError(
      "no_api_key",
      "Chiave Anthropic mancante. Configura modules.news.anthropic_api_key in /admin/modules/news/settings.",
    );
  }

  const model =
    (settings["modules.seeders.llm_model"] ?? "").trim() || DEFAULT_MODEL;
  const tempRaw = settings["modules.seeders.llm_temperature"] ?? "0.9";
  const temperature = Math.min(
    Math.max(Number.parseFloat(tempRaw) || 0.9, 0),
    1,
  );

  const client = new Anthropic({ apiKey });

  async function callOnce(
    requests: LlmCommentRequest[],
    isRetry: boolean,
  ): Promise<LlmGeneratedComment[]> {
    const userMessage = buildCommentUserMessage(requests, input.dayLabel, isRetry);

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature,
        system: [
          {
            type: "text",
            text: COMMENT_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmContentError("api_error", `Claude call failed: ${message}`);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new LlmContentError("invalid_output", "Claude response: no text block");
    }
    const raw = textBlock.text.trim();

    let parsed: unknown;
    try {
      const stripped = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(stripped);
    } catch (err) {
      throw new LlmContentError(
        "invalid_output",
        `JSON parse failed: ${err instanceof Error ? err.message : String(err)}. Raw: ${raw.slice(0, 200)}`,
      );
    }

    const result = CommentOutputSchema.safeParse(parsed);
    if (!result.success) {
      throw new LlmContentError(
        "invalid_output",
        `Schema validation failed: ${result.error.message}`,
      );
    }
    return result.data.comments.map((c) => ({ refId: c.refId, body: c.body }));
  }

  // Call 1 + 1 retry singolo per refId mancanti (stesso pattern dei posts).
  const firstPass = await callOnce(input.requests, false);
  const expectedRefIds = new Set(input.requests.map((r) => r.refId));
  const collected = new Map<string, string>();
  for (const c of firstPass) {
    if (expectedRefIds.has(c.refId)) collected.set(c.refId, c.body);
  }
  const missingAfterFirst = input.requests.filter(
    (r) => !collected.has(r.refId),
  );
  if (missingAfterFirst.length > 0) {
    console.warn(
      `[seeders/llm] comment retry: ${missingAfterFirst.length}/${input.requests.length} missing after first pass`,
    );
    const retryPass = await callOnce(missingAfterFirst, true);
    for (const c of retryPass) {
      if (expectedRefIds.has(c.refId) && !collected.has(c.refId)) {
        collected.set(c.refId, c.body);
      }
    }
  }
  const stillMissing: string[] = [];
  for (const ref of expectedRefIds) {
    if (!collected.has(ref)) stillMissing.push(ref);
  }
  if (stillMissing.length > 0) {
    throw new LlmContentError(
      "missing_refs",
      `Claude has skipped ${stillMissing.length}/${expectedRefIds.size} comment refId(s) even after 1 retry`,
    );
  }
  return input.requests.map((r) => ({
    refId: r.refId,
    body: collected.get(r.refId)!,
  }));
}

function truncateForContext(text: string, max = 300): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function buildCommentUserMessage(
  requests: LlmCommentRequest[],
  dayLabel: string,
  isRetry: boolean,
): string {
  const lines: string[] = [];
  if (isRetry) {
    lines.push(
      `# RETRY — nel pass precedente hai SALTATO ${requests.length} elemento/i. Questa volta DEVI restituire ESATTAMENTE ${requests.length} oggetto/i nell'array "comments", uno per ogni refId qui sotto. Niente accorpamenti, niente skip. Niente eccezioni.`,
    );
    lines.push("");
  }
  lines.push(`# Data del giorno: ${dayLabel}`);
  lines.push("");
  lines.push(`# Commenti da generare (${requests.length}):`);
  for (const req of requests) {
    const post = truncateForContext(req.postBody.replace(/\s+/g, " "));
    lines.push(`---`);
    lines.push(`refId=${req.refId} mood=${req.mood} author=@${req.authorUsername}`);
    lines.push(`post: """${post}"""`);
    if (req.parentBody) {
      const parent = truncateForContext(req.parentBody.replace(/\s+/g, " "));
      lines.push(`reply_to: """${parent}"""`);
    }
  }
  lines.push("");
  lines.push(
    `Restituisci JSON { "comments": [{ "refId": "...", "body": "..." }, ...] } con ESATTAMENTE ${requests.length} elementi (uno per refId, nessuna eccezione).`,
  );
  return lines.join("\n");
}

/**
 * Compone il user message: 1 riga di intestazione (data, market snapshot)
 * + 1 riga per ogni post da generare con refId/mood/type/tickerFocus.
 *
 * Pattern compatto JSON-ish (non strict JSON: piu' leggibile per Claude
 * di un blob JSON wrapped).
 */
function buildUserMessage(
  requests: LlmPostRequest[],
  dayLabel: string,
  marketLine: string,
  isRetry: boolean,
): string {
  const lines: string[] = [];
  if (isRetry) {
    lines.push(
      `# RETRY — nel pass precedente hai SALTATO ${requests.length} elemento/i. Questa volta DEVI restituire ESATTAMENTE ${requests.length} oggetto/i nell'array "posts", uno per ogni refId qui sotto. Niente accorpamenti, niente skip. Niente eccezioni.`,
    );
    lines.push("");
  }
  lines.push(`# Data del giorno: ${dayLabel}`);
  if (marketLine) {
    lines.push(`# Market snapshot a questo giorno: ${marketLine}`);
  } else {
    lines.push(`# Market snapshot non disponibile per questo giorno.`);
  }
  lines.push("");
  lines.push(`# Post da generare (${requests.length}):`);
  for (const req of requests) {
    const tickerPart = req.tickerFocus ? ` ticker_focus=$${req.tickerFocus}` : "";
    const authorPart = req.authorUsername ? ` author=@${req.authorUsername}` : "";
    lines.push(
      `- refId=${req.refId} mood=${req.mood} type=${req.type}${tickerPart}${authorPart}`,
    );
  }
  lines.push("");
  lines.push(
    `Restituisci JSON { "posts": [{ "refId": "...", "body": "..." }, ...] } con ESATTAMENTE ${requests.length} elementi (uno per refId, nessuna eccezione).`,
  );
  return lines.join("\n");
}
