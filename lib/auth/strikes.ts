// lib/auth/strikes.ts
//
// Service per il sistema di strike YouTube-like. Cross-modulo: la
// moderation di posts/comments lo invoca via reviewReport(...)Action,
// ma può essere riusato da qualsiasi futuro modulo social.
//
// Contratti:
//   - issueStrike: INSERT in users_strikes + il trigger DB
//     `users_strikes_sync_count_trg` si occupa di:
//       a) ricalcolare users.active_strikes_count
//       b) settare users.banned_at se count >= 3 (soft ban automatico)
//   - revokeStrike: UPDATE revoked_at/revoked_by + lo stesso trigger
//     ricalcola counter e SOLLEVA il ban se count scende sotto 3.
//   - getActiveStrikes / getStrikeHistory: read helpers per UI admin.
//
// Notifiche utente (in-app via posts_outbox-style INSERT diretto in
// notifications) sono gestite dal CALLER della service — qui niente
// I/O extra fuori dal DB, per restare pure.
import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  users,
  usersStrikes,
  type StrikeSourceType,
  type UserStrike,
} from "@/lib/db/schema";

export type IssueStrikeInput = {
  userId: string;
  issuedBy: string;
  sourceType: StrikeSourceType;
  sourceId: string;
  sourcePreview?: string | null;
  reason: string;
  note?: string | null;
};

export type IssueStrikeResult = {
  strike: UserStrike;
  /** Counter dopo l'INSERT (1, 2 o 3). Letto dopo la riga inserita
   *  per riflettere il trigger sync — utile al caller per decidere se
   *  emettere notifica `moderation.banned` invece di `moderation.strike_received`. */
  activeStrikesCount: number;
  /** true se l'INSERT ha appena triggerato il ban automatico (count → 3). */
  bannedNow: boolean;
};

export async function issueStrike(
  input: IssueStrikeInput,
): Promise<IssueStrikeResult> {
  return db.transaction(async (tx) => {
    // Stato pre-insert: serve a determinare bannedNow comparando con
    // il post-insert. Più affidabile che leggere banned_at solo dopo
    // (un altro INSERT concorrente potrebbe averlo già settato).
    const [pre] = await tx
      .select({ bannedAt: users.bannedAt })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    const [strike] = await tx
      .insert(usersStrikes)
      .values({
        userId: input.userId,
        issuedBy: input.issuedBy,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourcePreview: input.sourcePreview ?? null,
        reason: input.reason,
        note: input.note ?? null,
      })
      .returning();

    // Il trigger ha già aggiornato users.active_strikes_count e
    // banned_at: rileggi per restituire al caller.
    const [post] = await tx
      .select({
        activeStrikesCount: users.activeStrikesCount,
        bannedAt: users.bannedAt,
      })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    return {
      strike,
      activeStrikesCount: post?.activeStrikesCount ?? 0,
      bannedNow: !pre?.bannedAt && !!post?.bannedAt,
    };
  });
}

export type RevokeStrikeInput = {
  strikeId: string;
  revokedBy: string;
  note?: string | null;
};

export type RevokeStrikeResult = {
  /** true se lo strike era già revocato (idempotente — no-op). */
  alreadyRevoked: boolean;
  activeStrikesCount: number;
  /** true se la revoca ha appena tolto il ban (count >= 3 → < 3). */
  unbannedNow: boolean;
};

export async function revokeStrike(
  input: RevokeStrikeInput,
): Promise<RevokeStrikeResult | { error: "not_found" }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        userId: usersStrikes.userId,
        revokedAt: usersStrikes.revokedAt,
      })
      .from(usersStrikes)
      .where(eq(usersStrikes.id, input.strikeId))
      .limit(1);

    if (!existing) return { error: "not_found" as const };

    if (existing.revokedAt) {
      const [u] = await tx
        .select({ activeStrikesCount: users.activeStrikesCount })
        .from(users)
        .where(eq(users.id, existing.userId))
        .limit(1);
      return {
        alreadyRevoked: true,
        activeStrikesCount: u?.activeStrikesCount ?? 0,
        unbannedNow: false,
      };
    }

    const [pre] = await tx
      .select({ bannedAt: users.bannedAt })
      .from(users)
      .where(eq(users.id, existing.userId))
      .limit(1);

    await tx
      .update(usersStrikes)
      .set({
        revokedAt: new Date(),
        revokedBy: input.revokedBy,
        revokeNote: input.note ?? null,
      })
      .where(eq(usersStrikes.id, input.strikeId));

    const [post] = await tx
      .select({
        activeStrikesCount: users.activeStrikesCount,
        bannedAt: users.bannedAt,
      })
      .from(users)
      .where(eq(users.id, existing.userId))
      .limit(1);

    return {
      alreadyRevoked: false,
      activeStrikesCount: post?.activeStrikesCount ?? 0,
      unbannedNow: !!pre?.bannedAt && !post?.bannedAt,
    };
  });
}

/** Lista cronologica DESC di tutti gli strike (attivi + revocati) per
 *  un utente. Usata dalla UI admin nel detail page del user. */
export async function getStrikeHistory(userId: string): Promise<UserStrike[]> {
  return db
    .select()
    .from(usersStrikes)
    .where(eq(usersStrikes.userId, userId))
    .orderBy(desc(usersStrikes.issuedAt));
}

/** Solo i N strike attivi (revoked_at IS NULL). Usato per
 *  rendering counter dove non serve la history completa. */
export async function getActiveStrikesCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: usersStrikes.id })
    .from(usersStrikes)
    .where(
      and(eq(usersStrikes.userId, userId), isNull(usersStrikes.revokedAt)),
    );
  return rows.length;
}
