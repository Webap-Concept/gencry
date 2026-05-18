"use server";
// app/(admin)/admin/modules/posts/actions.ts
//
// Admin Server Actions per il modulo Posts. Per ora coprono solo:
//   - savePostsR2Settings — salva le 5 chiavi R2 (con sentinel
//     per il secret così la UI non lo re-invia tutte le volte)
//   - testPostsR2Connection — HeadBucket per validare credenziali
//
// Gated da `modules:posts` permission.

import { requireAdmin } from "@/lib/rbac/guards";
import { updateAppSetting } from "@/lib/db/settings-queries";
import {
  checkPostsR2Connection,
  loadPostsR2Config,
  normalizePublicBaseUrl,
  type PostsR2ConnectionResult,
} from "@/lib/modules/posts/storage";

const SECRET_SENTINEL = "********";

type ActionResult = { ok: true } | { ok: false; error: string };

export type SavePostsR2SettingsInput = {
  // accountId NON è più nel payload: è gestito globalmente in
  // storage.r2.account_id via /admin/services/cloudflare.
  accessKeyId: string;
  secretAccessKey: string; // SECRET_SENTINEL = "non cambiare"
  bucket: string;
  publicBaseUrl: string;
};

export async function savePostsR2Settings(
  input: SavePostsR2SettingsInput,
): Promise<ActionResult> {
  await requireAdmin();

  const accessKeyId     = input.accessKeyId.trim();
  const bucket          = input.bucket.trim();
  // normalizePublicBaseUrl: prepend https:// se l'admin scrive solo
  // "media.example.com" senza schema. Senza questo l'<img src> nel
  // frontend risulta un relative path e il browser lo manda a
  // localhost/media.example.com/... finendo nel catch-all CMS.
  const publicBaseUrl   = normalizePublicBaseUrl(input.publicBaseUrl);

  await updateAppSetting("modules.posts.r2.access_key_id",   accessKeyId);
  await updateAppSetting("modules.posts.r2.bucket",          bucket || "social-media");
  await updateAppSetting("modules.posts.r2.public_base_url", publicBaseUrl);

  // Secret: aggiorna solo se diverso dal sentinel
  if (input.secretAccessKey !== SECRET_SENTINEL) {
    await updateAppSetting(
      "modules.posts.r2.secret_access_key",
      input.secretAccessKey.trim(),
    );
  }

  return { ok: true };
}

export async function testPostsR2Connection(): Promise<PostsR2ConnectionResult> {
  await requireAdmin();
  const cfg = await loadPostsR2Config();
  if (!cfg) return { ok: false, reason: "missing_config" };
  return checkPostsR2Connection(cfg);
}

export type SaveCommentsSettingsInput = {
  liveModePostPage: "subscribe" | "poll" | "off";
  liveModeFeed: "subscribe" | "poll" | "off";
  pollIntervalSeconds: number;
  cacheTtlSeconds: number;
  maxBodyLength: number;
  repliesInitialCount: number;
};

const VALID_MODES = ["subscribe", "poll", "off"] as const;

function clampIntInput(raw: number, min: number, max: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

export type SaveRateLimitsInput = {
  postPerHour: number;
  reactionPerMin: number;
  commentPerMin: number;
  repostPerHour: number;
  reportPerHour: number;
  mediaPerHour: number;
};

export async function saveRateLimitsSettings(
  input: SaveRateLimitsInput,
): Promise<ActionResult> {
  await requireAdmin();
  await updateAppSetting(
    "modules.posts.rate_limit_post_per_hour",
    String(clampIntInput(input.postPerHour, 1, 1000)),
  );
  await updateAppSetting(
    "modules.posts.rate_limit_reaction_per_min",
    String(clampIntInput(input.reactionPerMin, 1, 1000)),
  );
  await updateAppSetting(
    "modules.posts.rate_limit_comment_per_min",
    String(clampIntInput(input.commentPerMin, 1, 1000)),
  );
  await updateAppSetting(
    "modules.posts.rate_limit_repost_per_hour",
    String(clampIntInput(input.repostPerHour, 1, 1000)),
  );
  await updateAppSetting(
    "modules.posts.rate_limit_report_per_hour",
    String(clampIntInput(input.reportPerHour, 1, 1000)),
  );
  await updateAppSetting(
    "modules.posts.rate_limit_media_per_hour",
    String(clampIntInput(input.mediaPerHour, 1, 1000)),
  );
  return { ok: true };
}

export type SaveRetentionInput = {
  outboxRetentionDays: number;
  orphanMediaGraceHours: number;
  deletedGraceDays: number;
  linkPreviewCacheDays: number;
};

export async function saveRetentionSettings(
  input: SaveRetentionInput,
): Promise<ActionResult> {
  await requireAdmin();
  await updateAppSetting(
    "modules.posts.outbox_retention_days",
    String(clampIntInput(input.outboxRetentionDays, 1, 365)),
  );
  await updateAppSetting(
    "modules.posts.orphan_media_grace_hours",
    String(clampIntInput(input.orphanMediaGraceHours, 1, 168)),
  );
  await updateAppSetting(
    "modules.posts.deleted_grace_days",
    String(clampIntInput(input.deletedGraceDays, 1, 90)),
  );
  await updateAppSetting(
    "modules.posts.link_preview_cache_days",
    String(clampIntInput(input.linkPreviewCacheDays, 1, 365)),
  );
  return { ok: true };
}

export type SaveMediaSettingsInput = {
  maxBodyLength: number;
  maxImagesPerPost: number;
  editWindowMinutes: number;
};

export async function saveMediaSettings(
  input: SaveMediaSettingsInput,
): Promise<ActionResult> {
  await requireAdmin();
  await updateAppSetting(
    "modules.posts.max_body_length",
    String(clampIntInput(input.maxBodyLength, 280, 5000)),
  );
  await updateAppSetting(
    "modules.posts.max_images_per_post",
    String(clampIntInput(input.maxImagesPerPost, 1, 10)),
  );
  await updateAppSetting(
    "modules.posts.edit_window_minutes",
    String(clampIntInput(input.editWindowMinutes, 0, 1440)),
  );
  return { ok: true };
}

export async function saveCommentsSettings(
  input: SaveCommentsSettingsInput,
): Promise<ActionResult> {
  await requireAdmin();

  const modePostPage = (VALID_MODES as readonly string[]).includes(input.liveModePostPage)
    ? input.liveModePostPage
    : "subscribe";
  const modeFeed = (VALID_MODES as readonly string[]).includes(input.liveModeFeed)
    ? input.liveModeFeed
    : "subscribe";

  await updateAppSetting("modules.posts.comments.live_mode_post_page", modePostPage);
  await updateAppSetting("modules.posts.comments.live_mode_feed", modeFeed);
  await updateAppSetting(
    "modules.posts.comments.poll_interval_seconds",
    String(clampIntInput(input.pollIntervalSeconds, 5, 120)),
  );
  await updateAppSetting(
    "modules.posts.comments.cache_ttl_seconds",
    String(clampIntInput(input.cacheTtlSeconds, 0, 300)),
  );
  await updateAppSetting(
    "modules.posts.comments.max_body_length",
    String(clampIntInput(input.maxBodyLength, 100, 2000)),
  );
  await updateAppSetting(
    "modules.posts.comments.replies_initial_count",
    String(clampIntInput(input.repliesInitialCount, 0, 10)),
  );

  return { ok: true };
}
