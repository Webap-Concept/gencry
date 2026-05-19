// lib/modules/news/config.ts
// Lettura tipizzata della config del modulo News da app_settings. Stesso
// pattern di lib/modules/prices/config.ts: settings persistite come stringa,
// parsing centralizzato qui. Cached per richiesta via React `cache` in
// getAppSettings.
import "server-only";
import { getAppSettings } from "@/lib/db/settings-queries";

export type NewsAiModel =
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export interface NewsConfig {
  /** Quanti items il cron rewriter prende per run. */
  rewriteBatchSize: number;
  /** Quanti items il cron publisher pubblica per run. */
  publisherBatchSize: number;
  /** Guardrail UI: max articoli pubblicabili in 24h (l'admin non può
   *  schedularne di più). NON applicato lato cron (il cron pubblica gli
   *  scheduled qualunque numero siano — il rate-limit è on-the-write). */
  maxPublishedPerDay: number;
  /** Quante volte il rewriter può ritentare prima di marcare l'item failed. */
  rewriteMaxAttempts: number;
  /** Modello Claude da usare per il rewrite. */
  aiModel: NewsAiModel;
  /** Max items processati per source per fetch RSS (anti-overload). */
  fetchMaxItemsPerSource: number;
  /** Auto-reject dei proposed più vecchi di N giorni. Cron `cleanup-proposed`
   *  daily li sposta a status='rejected'. */
  proposedRetentionDays: number;
  /** API key Anthropic. Null = pipeline rewriter disabilitata (gli items
   *  restano in pending_rewrite ma il cron non ha cosa chiamare). UI admin
   *  mostra warning. */
  anthropicApiKey: string | null;
}

const DEFAULTS: NewsConfig = {
  rewriteBatchSize: 3,
  publisherBatchSize: 5,
  maxPublishedPerDay: 2,
  rewriteMaxAttempts: 3,
  aiModel: "claude-sonnet-4-6",
  fetchMaxItemsPerSource: 10,
  proposedRetentionDays: 7,
  anthropicApiKey: null,
};

function toInt(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseAiModel(value: string | null | undefined): NewsAiModel {
  if (value === "claude-haiku-4-5-20251001") return value;
  return "claude-sonnet-4-6";
}

export async function getNewsConfig(): Promise<NewsConfig> {
  const s = await getAppSettings();
  return {
    rewriteBatchSize:       toInt(s["modules.news.rewrite_batch_size"], DEFAULTS.rewriteBatchSize),
    publisherBatchSize:     toInt(s["modules.news.publisher_batch_size"], DEFAULTS.publisherBatchSize),
    maxPublishedPerDay:     toInt(s["modules.news.max_published_per_day"], DEFAULTS.maxPublishedPerDay),
    rewriteMaxAttempts:     toInt(s["modules.news.rewrite_max_attempts"], DEFAULTS.rewriteMaxAttempts),
    aiModel:                parseAiModel(s["modules.news.ai_model"]),
    fetchMaxItemsPerSource: toInt(s["modules.news.fetch_max_items_per_source"], DEFAULTS.fetchMaxItemsPerSource),
    proposedRetentionDays:  toInt(s["modules.news.proposed_retention_days"], DEFAULTS.proposedRetentionDays),
    anthropicApiKey:        (s["modules.news.anthropic_api_key"] ?? "").trim() || null,
  };
}

/** True se l'API key Anthropic è configurata (cron rewriter può girare). */
export async function isRewriterConfigured(): Promise<boolean> {
  const cfg = await getNewsConfig();
  return cfg.anthropicApiKey !== null;
}
