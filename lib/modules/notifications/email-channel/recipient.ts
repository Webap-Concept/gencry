import "server-only";
// lib/modules/notifications/email-channel/recipient.ts
//
// Helper di hydration per recipient + actor del dispatcher email.
// Usato dal dispatcher per arricchire la riga `notifications` (solo
// user_id) con email/firstName/locale necessari ai renderer.

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { users, userProfiles } from "@/lib/db/schema";

export type UserMinimal = {
  id: string;
  email: string;
  firstName: string | null;
  username: string | null;
  avatarUrl: string | null;
  locale: string;
};

/**
 * Bulk hydration: data una lista di userIds, ritorna una Map id→UserMinimal.
 * Filtra utenti banned (la fanout dovrebbe già escluderli, ma defense in
 * depth — non vogliamo spedire email a chi è stato bannato).
 */
export async function hydrateUsersById(
  ids: readonly string[],
): Promise<Map<string, UserMinimal>> {
  const out = new Map<string, UserMinimal>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      bannedAt: users.bannedAt,
      locale: users.locale,
      firstName: userProfiles.firstName,
      username: userProfiles.username,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(inArray(users.id, ids as string[]));
  for (const r of rows) {
    if (r.bannedAt) continue;
    if (!r.email) continue;
    out.set(r.id, {
      id: r.id,
      email: r.email,
      firstName: r.firstName ?? null,
      username: r.username ?? null,
      avatarUrl: r.avatarUrl ?? null,
      locale: r.locale ?? "it",
    });
  }
  return out;
}
