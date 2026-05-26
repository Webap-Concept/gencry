import "server-only";
// lib/modules/notifications/email-channel/registry.ts
//
// Registry locale dei renderer email del modulo. Pattern allineato a
// `lib/notifications/email-channel/registry.ts` (core) — il modulo ha
// il suo registry perché lavora su tabella `notifications` (end-user),
// distinta da `admin_notifications` (sistema).

import type { NotificationType } from "@/lib/db/schema";
import { achievementFirstLikeRenderer } from "./renderers/achievement-first-like";
import { achievementViralLikesRenderer } from "./renderers/achievement-viral-likes";
import { achievementViralCommentsRenderer } from "./renderers/achievement-viral-comments";
import { achievementViralRepostsRenderer } from "./renderers/achievement-viral-reposts";
import type { AchievementEmailRenderer } from "./types";

export const ACHIEVEMENT_EMAIL_RENDERERS: readonly AchievementEmailRenderer[] = [
  achievementFirstLikeRenderer,
  achievementViralLikesRenderer,
  achievementViralCommentsRenderer,
  achievementViralRepostsRenderer,
] as const;

/** NotificationType matchati = quelli che il dispatcher invia via email. */
export const ACHIEVEMENT_EMAILABLE_TYPES: readonly NotificationType[] =
  ACHIEVEMENT_EMAIL_RENDERERS.map((r) => r.matchType);

export function findAchievementRenderer(
  type: string,
): AchievementEmailRenderer | null {
  for (const r of ACHIEVEMENT_EMAIL_RENDERERS) {
    if (r.matchType === type) return r;
  }
  return null;
}
