"use server";

// app/(admin)/admin/modules/news/actions.ts
//
// Server actions del modulo News. RBAC server-side su ogni action:
//   - modules:news       → CRUD sources + settings
//   - modules:news.moderate → review queue (edit/publish/schedule/reject/regenerate)
//
// Niente revalidatePath qui di default: il pattern admin del progetto
// preferisce router.refresh() lato client (vedi nota in media/actions.ts).
// Eccezione: dopo publish facciamo update CMS cache via invalidatePageCachesAndSync.

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/drizzle";
import { newsItems } from "@/lib/db/schema";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdmin } from "@/lib/rbac/guards";
import { can } from "@/lib/rbac/can";
import {
  createSource,
  deleteSourceById,
  getItemById,
  getSourceById,
  updateItem,
  updateSource,
} from "@/lib/modules/news/queries";
import { publishNewsItem } from "@/lib/modules/news/publish";
import { ingestSource } from "@/lib/modules/news/ingestion";
import { getNewsConfig } from "@/lib/modules/news/config";

async function requireNewsPermission(perm: "modules:news" | "modules:news.moderate") {
  const user = await requireAdmin();
  if (!user.isAdmin && !(await can(user, perm))) {
    throw new Error("Non autorizzato");
  }
  return user;
}

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

// ──────────────────────────────────────────────────────────────────────────
// Sources CRUD
// ──────────────────────────────────────────────────────────────────────────

const sourceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  feedUrl: z.string().trim().url().max(1000),
  feedType: z.enum(["rss", "atom"]).default("rss"),
  active: z.boolean().default(true),
  weight: z.coerce.number().int().min(1).max(10).default(1),
});

export async function createSourceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireNewsPermission("modules:news");
  const parsed = sourceSchema.safeParse({
    name: formData.get("name"),
    feedUrl: formData.get("feedUrl"),
    feedType: formData.get("feedType") ?? "rss",
    active: formData.get("active") === "on" || formData.get("active") === "true",
    weight: formData.get("weight") ?? 1,
  });
  if (!parsed.success) {
    return { error: "Invalid source data: " + parsed.error.issues[0].message, timestamp: Date.now() };
  }
  try {
    await createSource(parsed.data);
    return { success: "Source created.", timestamp: Date.now() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("uq_news_sources_feed_url")) {
      return { error: "A source with this feed URL already exists.", timestamp: Date.now() };
    }
    return { error: msg, timestamp: Date.now() };
  }
}

export async function updateSourceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireNewsPermission("modules:news");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id", timestamp: Date.now() };

  const parsed = sourceSchema.safeParse({
    name: formData.get("name"),
    feedUrl: formData.get("feedUrl"),
    feedType: formData.get("feedType") ?? "rss",
    active: formData.get("active") === "on" || formData.get("active") === "true",
    weight: formData.get("weight") ?? 1,
  });
  if (!parsed.success) {
    return { error: "Invalid data: " + parsed.error.issues[0].message, timestamp: Date.now() };
  }
  await updateSource(id, parsed.data);
  return { success: "Source updated.", timestamp: Date.now() };
}

export async function deleteSourceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireNewsPermission("modules:news");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id", timestamp: Date.now() };
  await deleteSourceById(id);
  return { success: "Source deleted.", timestamp: Date.now() };
}

/**
 * Manual ingestion trigger per una source. Utile in dev per non aspettare
 * il cron 15min. Esegue ingestSource synchronously e ritorna il risultato.
 */
export async function runSourceIngestNowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireNewsPermission("modules:news");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id", timestamp: Date.now() };
  const source = await getSourceById(id);
  if (!source) return { error: "Source not found", timestamp: Date.now() };
  const cfg = await getNewsConfig();
  const r = await ingestSource(source, cfg.fetchMaxItemsPerSource);
  return {
    success: `Ingestion ok: fetched=${r.fetched}, seen=${r.itemsSeen}, inserted=${r.itemsInserted} in ${r.durationMs}ms`,
    timestamp: Date.now(),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  rewriteBatchSize: z.coerce.number().int().min(1).max(50),
  publisherBatchSize: z.coerce.number().int().min(1).max(50),
  maxPublishedPerDay: z.coerce.number().int().min(1).max(50),
  rewriteMaxAttempts: z.coerce.number().int().min(1).max(10),
  aiModel: z.enum(["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]),
  fetchMaxItemsPerSource: z.coerce.number().int().min(1).max(100),
  proposedRetentionDays: z.coerce.number().int().min(1).max(60),
  anthropicApiKey: z.string().trim().optional(),
});

export async function saveSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireNewsPermission("modules:news");
  const parsed = settingsSchema.safeParse({
    rewriteBatchSize: formData.get("rewriteBatchSize"),
    publisherBatchSize: formData.get("publisherBatchSize"),
    maxPublishedPerDay: formData.get("maxPublishedPerDay"),
    rewriteMaxAttempts: formData.get("rewriteMaxAttempts"),
    aiModel: formData.get("aiModel"),
    fetchMaxItemsPerSource: formData.get("fetchMaxItemsPerSource"),
    proposedRetentionDays: formData.get("proposedRetentionDays"),
    anthropicApiKey: formData.get("anthropicApiKey") ?? "",
  });
  if (!parsed.success) {
    return { error: "Invalid: " + parsed.error.issues[0].message, timestamp: Date.now() };
  }
  const data = parsed.data;

  await updateAppSetting("modules.news.rewrite_batch_size", String(data.rewriteBatchSize));
  await updateAppSetting("modules.news.publisher_batch_size", String(data.publisherBatchSize));
  await updateAppSetting("modules.news.max_published_per_day", String(data.maxPublishedPerDay));
  await updateAppSetting("modules.news.rewrite_max_attempts", String(data.rewriteMaxAttempts));
  await updateAppSetting("modules.news.ai_model", data.aiModel);
  await updateAppSetting("modules.news.fetch_max_items_per_source", String(data.fetchMaxItemsPerSource));
  await updateAppSetting("modules.news.proposed_retention_days", String(data.proposedRetentionDays));
  // Sentinel "********" lascia invariato (pattern già usato nelle Cloudflare cards).
  const key = (data.anthropicApiKey ?? "").trim();
  if (key && key !== "********") {
    await updateAppSetting("modules.news.anthropic_api_key", key);
  } else if (!key) {
    await updateAppSetting("modules.news.anthropic_api_key", null);
  }

  return { success: "News settings saved.", timestamp: Date.now() };
}

// ──────────────────────────────────────────────────────────────────────────
// Review item — edit, schedule, publish, reject, regenerate
// ──────────────────────────────────────────────────────────────────────────

const reviewEditSchema = z.object({
  itemId: z.string().uuid(),
  title: z.string().trim().min(10).max(200),
  bodyMd: z.string().trim().min(100),
  excerpt: z.string().trim().min(20).max(220),
  heroAssetId: z.string().trim().optional(),
  category: z.string().trim().max(40).optional(),
});

export async function saveReviewEditsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireNewsPermission("modules:news.moderate");
  const parsed = reviewEditSchema.safeParse({
    itemId: formData.get("itemId"),
    title: formData.get("title"),
    bodyMd: formData.get("bodyMd"),
    excerpt: formData.get("excerpt"),
    heroAssetId: formData.get("heroAssetId") ?? "",
    category: formData.get("category") ?? "",
  });
  if (!parsed.success) {
    return { error: "Invalid: " + parsed.error.issues[0].message, timestamp: Date.now() };
  }
  const heroId = parsed.data.heroAssetId ? Number(parsed.data.heroAssetId) : null;
  // Single UPDATE: campi edit + bump atomico di edits_count via sql template.
  await db
    .update(newsItems)
    .set({
      generatedTitleIt: parsed.data.title,
      generatedBodyItMd: parsed.data.bodyMd,
      generatedExcerptIt: parsed.data.excerpt,
      category: parsed.data.category || null,
      heroAssetId: heroId,
      reviewedBy: user.id,
      reviewedAt: new Date(),
      editsCount: sql`${newsItems.editsCount} + 1`,
    })
    .where(eq(newsItems.id, parsed.data.itemId));
  return { success: "Draft saved.", timestamp: Date.now() };
}

export async function publishNowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireNewsPermission("modules:news.moderate");
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: "Missing itemId", timestamp: Date.now() };

  const item = await getItemById(itemId);
  if (!item) return { error: "Item not found", timestamp: Date.now() };
  if (!item.heroAssetId) {
    return { error: "Hero image required before publish.", timestamp: Date.now() };
  }

  const r = await publishNewsItem({ itemId, heroAssetId: item.heroAssetId });
  if (!r.ok) {
    return { error: `Publish failed: ${r.error}`, timestamp: Date.now() };
  }
  await updateItem(itemId, { reviewedBy: user.id, reviewedAt: new Date() });
  return { success: `Published as /${r.slug}`, timestamp: Date.now() };
}

export async function scheduleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireNewsPermission("modules:news.moderate");
  const itemId = String(formData.get("itemId") ?? "");
  const whenStr = String(formData.get("scheduledPublishAt") ?? "");
  if (!itemId || !whenStr) {
    return { error: "Missing itemId or scheduledPublishAt", timestamp: Date.now() };
  }
  const when = new Date(whenStr);
  if (Number.isNaN(when.getTime())) {
    return { error: "Invalid date.", timestamp: Date.now() };
  }
  const item = await getItemById(itemId);
  if (!item) return { error: "Item not found", timestamp: Date.now() };
  if (!item.heroAssetId) {
    return { error: "Hero image required before scheduling.", timestamp: Date.now() };
  }
  await updateItem(itemId, {
    status: "scheduled",
    scheduledPublishAt: when,
    reviewedBy: user.id,
    reviewedAt: new Date(),
  });
  return { success: `Scheduled for ${when.toISOString()}`, timestamp: Date.now() };
}

/**
 * Approve a proposed item: muove lo status a 'pending_rewrite' così il
 * rewriter cron lo pickerà al prossimo run e farà fetch body + Claude.
 * Solo da 'proposed' (no-op se già in altri stati).
 */
export async function approveItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireNewsPermission("modules:news.moderate");
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: "Missing itemId", timestamp: Date.now() };
  const item = await getItemById(itemId);
  if (!item) return { error: "Item not found", timestamp: Date.now() };
  if (item.status !== "proposed") {
    return { error: `Cannot approve from status ${item.status}`, timestamp: Date.now() };
  }
  await updateItem(itemId, {
    status: "pending_rewrite",
    reviewedBy: user.id,
    reviewedAt: new Date(),
  });
  return { success: "Item approved — queued for LLM rewrite.", timestamp: Date.now() };
}

export async function rejectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireNewsPermission("modules:news.moderate");
  const itemId = String(formData.get("itemId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!itemId) return { error: "Missing itemId", timestamp: Date.now() };
  await updateItem(itemId, {
    status: "rejected",
    rejectedReason: reason || null,
    reviewedBy: user.id,
    reviewedAt: new Date(),
  });
  return { success: "Item rejected.", timestamp: Date.now() };
}

/**
 * Regenerate: rimette l'item in pending_rewrite + azzera il body generato +
 * resetta ai_attempt_count così il rewriter lo ri-processa al prossimo run.
 */
export async function regenerateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireNewsPermission("modules:news.moderate");
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: "Missing itemId", timestamp: Date.now() };
  await updateItem(itemId, {
    status: "pending_rewrite",
    generatedTitleIt: null,
    generatedBodyItMd: null,
    generatedExcerptIt: null,
    aiAttemptCount: 0,
    aiLastError: null,
  });
  return { success: "Item queued for re-rewrite.", timestamp: Date.now() };
}
