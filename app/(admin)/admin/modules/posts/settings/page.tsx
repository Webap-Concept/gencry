import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import {
  loadGlobalR2AccountId,
  R2_ACCOUNT_ADMIN_PATH,
} from "@/lib/storage/r2-account";
import { getAllReportReasons } from "@/lib/modules/posts/services/report-reasons";
import { POSTS_MODULE } from "@/lib/modules/posts/manifest";
import { resolveCapacityCurrentTier } from "@/lib/capacity/resolve";
import { PostsR2SettingsForm } from "../_components/posts-r2-settings-form";
import { PostsRateLimitsForm } from "../_components/posts-rate-limits-form";
import { PostsRetentionForm } from "../_components/posts-retention-form";
import { PostsMediaForm } from "../_components/posts-media-form";
import { ReportReasonsManager } from "./_components/report-reasons-manager";

export const metadata: Metadata = { title: "Posts / Settings" };
export const dynamic = "force-dynamic";

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export default async function PostsAdminSettingsPage() {
  const [settings, globalAccountId, adminSlug, reportReasons] = await Promise.all([
    getAppSettings(),
    loadGlobalR2AccountId(),
    getAdminUrlSlug(),
    getAllReportReasons(),
  ]);
  const r2SecretIsSet = Boolean(
    (settings["modules.posts.r2.secret_access_key"] ?? "").trim(),
  );

  const profiles = POSTS_MODULE.capacityProfiles ?? [];
  const rateLimitsProfile = profiles.find((p) => p.scope === "rate-limits");
  const retentionProfile = profiles.find((p) => p.scope === "retention");
  const mediaProfile = profiles.find((p) => p.scope === "media");
  const settingsRecord = settings as Record<string, string>;
  const rateLimitsTier = rateLimitsProfile
    ? resolveCapacityCurrentTier(rateLimitsProfile, settingsRecord)
    : undefined;
  const retentionTier = retentionProfile
    ? resolveCapacityCurrentTier(retentionProfile, settingsRecord)
    : undefined;
  const mediaTier = mediaProfile
    ? resolveCapacityCurrentTier(mediaProfile, settingsRecord)
    : undefined;

  return (
    <div className="space-y-5">
      <PostsMediaForm
        initial={{
          maxBodyLength:     clampInt(settings["modules.posts.max_body_length"],     2000, 280, 5000),
          maxImagesPerPost:  clampInt(settings["modules.posts.max_images_per_post"], 4,    1,   10),
          editWindowMinutes: clampInt(settings["modules.posts.edit_window_minutes"], 10,   0,   1440),
        }}
        capacityProfile={mediaProfile}
        currentTier={mediaTier}
      />

      <PostsRateLimitsForm
        initial={{
          postPerHour:     clampInt(settings["modules.posts.rate_limit_post_per_hour"],     10, 1, 1000),
          reactionPerMin:  clampInt(settings["modules.posts.rate_limit_reaction_per_min"],  60, 1, 1000),
          commentPerMin:   clampInt(settings["modules.posts.rate_limit_comment_per_min"],   30, 1, 1000),
          repostPerHour:   clampInt(settings["modules.posts.rate_limit_repost_per_hour"],   5,  1, 1000),
          reportPerHour:   clampInt(settings["modules.posts.rate_limit_report_per_hour"],   5,  1, 1000),
          mediaPerHour:    clampInt(settings["modules.posts.rate_limit_media_per_hour"],    20, 1, 1000),
        }}
        capacityProfile={rateLimitsProfile}
        currentTier={rateLimitsTier}
      />

      <PostsRetentionForm
        initial={{
          outboxRetentionDays:   clampInt(settings["modules.posts.outbox_retention_days"],   30, 1, 365),
          orphanMediaGraceHours: clampInt(settings["modules.posts.orphan_media_grace_hours"], 24, 1, 168),
          deletedGraceDays:      clampInt(settings["modules.posts.deleted_grace_days"],      7,  1, 90),
          linkPreviewCacheDays:  clampInt(settings["modules.posts.link_preview_cache_days"], 30, 1, 365),
        }}
        capacityProfile={retentionProfile}
        currentTier={retentionTier}
      />

      <PostsR2SettingsForm
        initial={{
          accessKeyId:   (settings["modules.posts.r2.access_key_id"]   ?? "").trim(),
          bucket:        (settings["modules.posts.r2.bucket"]          ?? "social-media").trim(),
          publicBaseUrl: (settings["modules.posts.r2.public_base_url"] ?? "").trim(),
          r2SecretIsSet,
        }}
        globalAccountId={globalAccountId}
        cloudflareSettingsHref={`/${adminSlug}${R2_ACCOUNT_ADMIN_PATH}`}
      />

      <ReportReasonsManager initial={reportReasons} />
    </div>
  );
}
