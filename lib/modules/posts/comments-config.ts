import "server-only";
// lib/modules/posts/comments-config.ts
//
// Lettura dei settings `modules.posts.comments.*` da app_settings con
// defaults sicuri. Tutti i caller (Server Components, Server Actions,
// admin form) passano da qui invece di parsare ogni volta i settings
// raw — riduce drift e centralizza i range.
import { getAppSettings } from "@/lib/db/settings-queries";
import type { CommentsLiveMode } from "./lib/use-comments-live-signal";

export type CommentsModuleConfig = {
  liveModePostPage: CommentsLiveMode;
  liveModeFeed: CommentsLiveMode;
  pollIntervalSeconds: number;
  cacheTtlSeconds: number;
  maxBodyLength: number;
  repliesInitialCount: number;
};

export const COMMENTS_CONFIG_DEFAULTS: CommentsModuleConfig = {
  liveModePostPage: "subscribe",
  liveModeFeed: "subscribe",
  pollIntervalSeconds: 20,
  cacheTtlSeconds: 30,
  // Allineato al CHECK constraint dello schema (1..2000).
  maxBodyLength: 2000,
  repliesInitialCount: 3,
};

const VALID_MODES: ReadonlyArray<CommentsLiveMode> = ["subscribe", "poll", "off"];

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseMode(raw: string | undefined, fallback: CommentsLiveMode): CommentsLiveMode {
  if (raw && (VALID_MODES as readonly string[]).includes(raw)) {
    return raw as CommentsLiveMode;
  }
  return fallback;
}

export async function loadCommentsConfig(): Promise<CommentsModuleConfig> {
  const s = await getAppSettings();
  return {
    liveModePostPage: parseMode(
      s["modules.posts.comments.live_mode_post_page"],
      COMMENTS_CONFIG_DEFAULTS.liveModePostPage,
    ),
    liveModeFeed: parseMode(
      s["modules.posts.comments.live_mode_feed"],
      COMMENTS_CONFIG_DEFAULTS.liveModeFeed,
    ),
    pollIntervalSeconds: clampInt(
      s["modules.posts.comments.poll_interval_seconds"],
      COMMENTS_CONFIG_DEFAULTS.pollIntervalSeconds,
      5,
      120,
    ),
    cacheTtlSeconds: clampInt(
      s["modules.posts.comments.cache_ttl_seconds"],
      COMMENTS_CONFIG_DEFAULTS.cacheTtlSeconds,
      0,
      300,
    ),
    maxBodyLength: clampInt(
      s["modules.posts.comments.max_body_length"],
      COMMENTS_CONFIG_DEFAULTS.maxBodyLength,
      100,
      2000,
    ),
    repliesInitialCount: clampInt(
      s["modules.posts.comments.replies_initial_count"],
      COMMENTS_CONFIG_DEFAULTS.repliesInitialCount,
      0,
      10,
    ),
  };
}
