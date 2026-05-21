// lib/profile/queries.ts
//
// Read path della pagina profilo pubblica `/u/[username]`. CORE feature
// (non un modulo): chiunque ha un username deve avere una pagina
// profilo, indipendentemente da quali moduli social sono installati.
//
// Query separate per:
//   - getProfileByUsername(username) → header (avatar, nome, bio, ...)
//   - getProfileStats(userId) → counter (post pubblicati, …)
//
// Filtri obbligatori per ognuna: users.deleted_at IS NULL AND
// users.banned_at IS NULL. Soft-deleted/banned → 404 a chiunque.
//
// profileVisibility = 'protected' è no-op v1 (modulo follows non ancora
// attivo). Quando arriverà, il caller della page route filtrerà il
// feed in base alla relazione follow viewer↔owner.
import "server-only";

import { db } from "@/lib/db/drizzle";
import { posts, postsTickers, users, userProfiles } from "@/lib/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export interface PublicProfile {
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  createdAt: Date;
  /** Visibilità: 'public' = aperto a tutti; 'protected' = feed solo a
   *  follower (no-op v1 finché non c'è modulo follows). */
  profileVisibility: "public" | "protected";
}

export interface PublicProfileStats {
  /** Post NON soft-deleted, qualunque visibility — il calling code può
   *  filtrare ulteriormente per visibility se serve mostrare solo i
   *  public. Per ora il header mostra "totali" come Twitter. */
  postsTotal: number;
}

/**
 * Lookup profilo by username (case-insensitive). Ritorna null se:
 *   - username inesistente in user_profiles
 *   - user soft-deleted o bannato (404 a chiunque)
 *
 * Una sola query con INNER JOIN users + user_profiles.
 */
export async function getProfileByUsername(
  username: string,
): Promise<PublicProfile | null> {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return null;

  const [row] = await db
    .select({
      userId: users.id,
      username: userProfiles.username,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      avatarUrl: userProfiles.avatarUrl,
      headline: userProfiles.headline,
      bio: userProfiles.bio,
      createdAt: users.createdAt,
      profileVisibility: users.profileVisibility,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        sql`LOWER(${userProfiles.username}) = ${normalized}`,
        isNull(users.deletedAt),
        isNull(users.bannedAt),
      ),
    )
    .limit(1);

  if (!row || !row.username) return null;

  return {
    userId: row.userId,
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    avatarUrl: row.avatarUrl,
    headline: row.headline,
    bio: row.bio,
    createdAt: row.createdAt,
    profileVisibility: row.profileVisibility,
  };
}

/**
 * Counter denormalizzati del profilo: post totali pubblicati (escluso
 * soft-deleted). Single roundtrip, future-extensible quando arrivano
 * watchlist/following/follower stats (aggiungere COUNT FILTER multipli).
 */
export async function getProfileStats(
  userId: string,
): Promise<PublicProfileStats> {
  const [row] = await db
    .select({
      postsTotal: sql<string>`COUNT(*)::text`,
    })
    .from(posts)
    .where(
      and(
        eq(posts.authorId, userId),
        isNull(posts.deletedAt),
      ),
    );

  return {
    postsTotal: Number(row?.postsTotal ?? 0),
  };
}

/**
 * Top N coin più citate dall'utente nei propri post. Utile per la card
 * "Coin più citate" della sidebar del profilo. JOIN su posts_tickers
 * GROUP BY ticker. Esclude post soft-deleted.
 */
export async function getTopCitedCoins(
  userId: string,
  limit: number = 5,
): Promise<Array<{ ticker: string; count: number }>> {
  const rows = await db
    .select({
      ticker: postsTickers.ticker,
      count: sql<string>`COUNT(*)::text`,
    })
    .from(postsTickers)
    .innerJoin(posts, eq(posts.id, postsTickers.postId))
    .where(and(eq(posts.authorId, userId), isNull(posts.deletedAt)))
    .groupBy(postsTickers.ticker)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);

  return rows.map((r) => ({ ticker: r.ticker, count: Number(r.count) }));
}
