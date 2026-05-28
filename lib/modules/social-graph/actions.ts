"use server";
// lib/modules/social-graph/actions.ts
//
// Server Actions del modulo social-graph — write path.
//
// Contract:
//   - Ogni action chiama `getUser()` per gate AUTH. Se null → ritorna
//     { ok: false, error: 'unauthenticated' }. La UI deve aprire la
//     modale sign-in (pattern Tweet -> sign-in di /post/[id]).
//   - Self-follow gateato sia qui che dal CHECK constraint SQL (cintura+bretelle).
//   - Mutual block: gateato sia qui (isBlockedBetween) sia dal trigger DB
//     `user_follows_block_guard_trg` (post-fallback).
//   - Rate limit sliding window via `checkSocialGraphRateLimit`. Fail-open
//     se Upstash non configurato.
//   - Idempotenza: followUserAction su pair gia' esistente → no-op +
//     ritorna lo snapshot corrente.
//   - Cache invalidation: dopo ogni mutation invalida il Set following
//     del `viewerId`. (Il `targetId` non ha cache su following set proprio,
//     il suo "chi mi segue" e' counter denorm.)
//
// Le mutation toccano user_follows; i counter user_social_counters si
// aggiornano via trigger DB (M_social_graph_001_init.sql). Per ridurre
// roundtrip leggiamo il counter aggiornato nello stesso transazione
// implicita (Drizzle no autocommit + DEFERRABLE = trigger gia' applicato).

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { userFollows, userSocialCounters, users } from "@/lib/db/schema";
import { isBlockedBetween } from "@/lib/modules/posts/services/blocks";
import { checkSocialGraphRateLimit } from "./services/rate-limit";
import { invalidateFollowingSet } from "./services/follows-cache";
import type { FollowResult } from "./types";

async function readCountersInline(
  viewerId: string,
  targetId: string,
): Promise<{ followingCount: number; followersCount: number }> {
  // I trigger DB hanno gia' applicato +/-1 sui due utenti coinvolti.
  // Una sola query con WHERE IN copre entrambi i record (upsertati lazy
  // dal trigger; se entrambi vuoti — caso edge dopo backfill — fallback 0).
  const rows = await db
    .select({
      userId: userSocialCounters.userId,
      followersCount: userSocialCounters.followersCount,
      followingCount: userSocialCounters.followingCount,
    })
    .from(userSocialCounters)
    .where(inArray(userSocialCounters.userId, [viewerId, targetId]));

  const viewerRow = rows.find((r) => r.userId === viewerId);
  const targetRow = rows.find((r) => r.userId === targetId);

  return {
    followingCount: viewerRow?.followingCount ?? 0,
    followersCount: targetRow?.followersCount ?? 0,
  };
}

export async function followUserAction(
  targetId: string,
): Promise<FollowResult> {
  const viewer = await getUser();
  if (!viewer) return { ok: false, error: "unauthenticated" };
  const viewerId = viewer.id;

  if (viewerId === targetId) {
    return { ok: false, error: "self_follow" };
  }

  // Rate limit prima del DB per ridurre carico in caso di mass-follow.
  const rl = await checkSocialGraphRateLimit(viewerId, "follow");
  if (!rl.ok) {
    return { ok: false, error: "rate_limited", retryAfter: rl.retryAfter };
  }

  // Target esiste?
  const targetExists = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (targetExists.length === 0) {
    return { ok: false, error: "target_not_found" };
  }

  // Block guard JS-side. Trigger DB e' il backstop, ma errore SQL e'
  // brutto da gestire — preferiamo il check tipizzato.
  const blocked = await isBlockedBetween(viewerId, targetId);
  if (blocked) {
    return { ok: false, error: "blocked" };
  }

  try {
    await db
      .insert(userFollows)
      .values({ followerId: viewerId, followedId: targetId })
      .onConflictDoNothing({
        target: [userFollows.followerId, userFollows.followedId],
      });
  } catch (err) {
    console.warn("[social-graph:follow] insert failed", {
      viewerId,
      targetId,
      err: String(err),
    });
    return { ok: false, error: "internal" };
  }

  await invalidateFollowingSet(viewerId);

  const counters = await readCountersInline(viewerId, targetId);
  return {
    ok: true,
    following: true,
    followersCount: counters.followersCount,
    followingCount: counters.followingCount,
  };
}

export async function unfollowUserAction(
  targetId: string,
): Promise<FollowResult> {
  const viewer = await getUser();
  if (!viewer) return { ok: false, error: "unauthenticated" };
  const viewerId = viewer.id;

  if (viewerId === targetId) {
    return { ok: false, error: "self_follow" };
  }

  // Niente rate-limit sull'unfollow: nessun beneficio anti-abuse
  // (un mass-unfollow non danneggia altri utenti). Lo lasciamo libero.

  try {
    await db
      .delete(userFollows)
      .where(
        and(
          eq(userFollows.followerId, viewerId),
          eq(userFollows.followedId, targetId),
        ),
      );
  } catch (err) {
    console.warn("[social-graph:unfollow] delete failed", {
      viewerId,
      targetId,
      err: String(err),
    });
    return { ok: false, error: "internal" };
  }

  await invalidateFollowingSet(viewerId);

  const counters = await readCountersInline(viewerId, targetId);
  return {
    ok: true,
    following: false,
    followersCount: counters.followersCount,
    followingCount: counters.followingCount,
  };
}
