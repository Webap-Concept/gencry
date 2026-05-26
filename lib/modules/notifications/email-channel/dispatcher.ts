import "server-only";
// lib/modules/notifications/email-channel/dispatcher.ts
//
// Dispatcher email per le notifiche achievement del modulo notifications.
// Pattern allineato a `lib/notifications/email-channel/dispatcher.ts`
// (CORE) ma lavora sulla tabella `notifications` (end-user) invece di
// `admin_notifications`.
//
// Schedulazione: cron ogni 20min (vedi manifest cronJobs). Ad ogni run:
//   1. Carica config (email_send_enabled, email_grace_seconds)
//   2. Scan `notifications` con email_sent_at IS NULL,
//      type IN ACHIEVEMENT_EMAILABLE_TYPES,
//      created_at > NOW() - 24h (cap finestra),
//      created_at < NOW() - grace_seconds (dedup race)
//   3. Hydrate recipient (+ actor + post-url) in batch
//   4. Per ogni notification: renderer.render() → sendEmail() → mark sent
//   5. Skip silent se recipient banned o senza email
//
// Errori per-notification non bloccano le altre. Result aggregato
// loggato dal cron handler.

import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { notifications, posts, type Notification } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/resend";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getSiteUrl } from "@/lib/seo";
import { hydrateUsersById, type UserMinimal } from "./recipient";
import {
  ACHIEVEMENT_EMAILABLE_TYPES,
  findAchievementRenderer,
} from "./registry";

const DEFAULT_GRACE_SECONDS = 30;
const SCAN_WINDOW_HOURS = 24;
const BATCH_MAX = 200;

export type DispatchResult = {
  ok: boolean;
  scanned: number;
  sent: number;
  skipped: number;
  errors: { id: string; error: string }[];
};

function parseIntOr(raw: string | undefined | null, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Esegue 1 ciclo di dispatch. Idempotente: solo le notifications con
 * email_sent_at IS NULL vengono prese; dopo l'INSERT del marker non
 * possono essere prese di nuovo.
 */
export async function dispatchAchievementEmails(): Promise<DispatchResult> {
  const result: DispatchResult = {
    ok: true,
    scanned: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  // ── Config ───────────────────────────────────────────────────────────
  const settings = await getAppSettings();
  const enabled =
    (settings["modules.notifications.email_send_enabled"] ?? "true") !== "false";
  if (!enabled) {
    return result;
  }

  const grace = parseIntOr(
    settings["modules.notifications.email_grace_seconds"],
    DEFAULT_GRACE_SECONDS,
  );

  const now = new Date();
  const graceCutoff = new Date(now.getTime() - grace * 1000);
  const windowFloor = new Date(
    now.getTime() - SCAN_WINDOW_HOURS * 60 * 60 * 1000,
  );

  // ── 1) Scan candidati ────────────────────────────────────────────────
  const candidates: Notification[] = await db
    .select()
    .from(notifications)
    .where(
      and(
        isNull(notifications.emailSentAt),
        inArray(notifications.type, ACHIEVEMENT_EMAILABLE_TYPES as string[]),
        gt(notifications.createdAt, windowFloor),
        lt(notifications.createdAt, graceCutoff),
      ),
    )
    .orderBy(notifications.createdAt)
    .limit(BATCH_MAX);

  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  // ── 2) Hydrate users (recipient + actor) ─────────────────────────────
  const userIds = new Set<string>();
  for (const n of candidates) {
    userIds.add(n.userId);
    if (n.actorId) userIds.add(n.actorId);
  }
  const userMap = await hydrateUsersById(Array.from(userIds));

  // ── 3) Hydrate post previews (per il body email) ─────────────────────
  // Singola query per i postId distinti — payload di solito non ha il
  // body intero, prendiamolo dalla tabella posts.
  const postIds = Array.from(
    new Set(candidates.map((n) => n.postId).filter((v): v is string => v !== null)),
  );
  const postBodies = new Map<string, string>();
  if (postIds.length > 0) {
    const rows = await db
      .select({ id: posts.id, body: posts.body })
      .from(posts)
      .where(inArray(posts.id, postIds));
    for (const r of rows) postBodies.set(r.id, r.body);
  }

  const siteUrl = await getSiteUrl();

  // ── 4) Per ogni notification: render + send + mark ───────────────────
  const sentIds: string[] = [];
  for (const n of candidates) {
    try {
      const recipient = userMap.get(n.userId);
      if (!recipient) {
        // User banned / senza email → skip silenzioso (ma marca sent
        // per evitare re-scan eterno).
        result.skipped++;
        sentIds.push(n.id);
        continue;
      }

      const renderer = findAchievementRenderer(n.type);
      if (!renderer) {
        // Type non gestito (forward compat) → marca sent per chiudere.
        result.skipped++;
        sentIds.push(n.id);
        continue;
      }

      const actor: UserMinimal | null = n.actorId
        ? userMap.get(n.actorId) ?? null
        : null;

      const postUrl =
        n.postId && siteUrl ? `${siteUrl}/post/${n.postId}` : null;

      // Inject post body preview nel payload prima del render (i renderer
      // leggono `payload.post_preview` per il box di anteprima).
      const enrichedPayload: Record<string, unknown> = {
        ...(n.payload ?? {}),
      };
      if (n.postId && postBodies.has(n.postId)) {
        const body = postBodies.get(n.postId)!;
        enrichedPayload.post_preview = body.length > 240 ? body.slice(0, 239) + "…" : body;
      }
      const enriched: Notification = { ...n, payload: enrichedPayload };

      // sendEmail() core supporta solo html (Resend wrapper); il
      // plain-text alt sarà aggiunto al wrapper quando avremo bisogno
      // di mail client legacy / accessibility audit.
      const { subject, html } = await renderer.render({
        notification: enriched,
        recipient,
        actor,
        postUrl,
      });

      const sendRes = await sendEmail({
        to: recipient.email,
        subject,
        html,
      });
      if (sendRes.error) {
        const msg =
          typeof sendRes.error === "object" &&
          sendRes.error !== null &&
          "message" in sendRes.error
            ? String((sendRes.error as { message?: unknown }).message ?? sendRes.error)
            : String(sendRes.error);
        result.errors.push({ id: n.id, error: msg });
        continue;
      }
      result.sent++;
      sentIds.push(n.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ id: n.id, error: msg });
    }
  }

  // ── 5) Bulk mark sent (anche skipped per non re-scan) ────────────────
  if (sentIds.length > 0) {
    await db
      .update(notifications)
      .set({ emailSentAt: sql`NOW()` })
      .where(inArray(notifications.id, sentIds));
  }

  result.ok = result.errors.length === 0;
  return result;
}
