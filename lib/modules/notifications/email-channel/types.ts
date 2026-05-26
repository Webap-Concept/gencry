import "server-only";
// lib/modules/notifications/email-channel/types.ts
//
// Tipi per il dispatcher email del modulo notifications. Specchio del
// pattern core (lib/notifications/email-channel/) ma con input
// `Notification` (tabella end-user) invece di `AdminNotification`.
//
// 1 renderer ↔ 1 NotificationType. Dispatcher trova il renderer per
// type, lo invoca con la singola notification (NO digest in V1 — ogni
// achievement è un evento isolato per design product 2026-05-26).

import type { Notification, NotificationType } from "@/lib/db/schema";
import type { UserMinimal } from "./recipient";

export type RenderInput = {
  /** La notification da renderizzare. */
  notification: Notification;
  /** Recipient hydrato (id, email, firstName, locale). */
  recipient: UserMinimal;
  /** Actor hydrato se applicabile. Per gli achievement viral_* è sempre
   *  null (eventi di sistema, aggregati). */
  actor: UserMinimal | null;
  /** URL canonica del post (es. `${siteUrl}/post/${id}`) — pre-calcolata
   *  dal dispatcher così il renderer non deve ricomporla. */
  postUrl: string | null;
};

export type RenderResult = {
  subject: string;
  html: string;
  /** Plain-text fallback per mail client che non renderizzano HTML. */
  text?: string;
};

export interface AchievementEmailRenderer {
  /** NotificationType che questo renderer accetta (1:1). */
  matchType: NotificationType;
  /** Compone subject + body. */
  render(input: RenderInput): Promise<RenderResult>;
}
