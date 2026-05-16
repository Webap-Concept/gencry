// lib/modules/posts/lib/reactions-format.ts
//
// Helper puri (no React, no client) per il rendering del counter
// reaction nella PostCard. Tenuti separati così sono testabili in
// vitest e riusabili anche dal feed degli altri moduli social futuri
// (predictions, sentiment).
import {
  POST_REACTION_KINDS,
  type PostReactionKind,
} from "@/lib/db/schema";
import type { PostReactionCounts } from "@/lib/modules/posts/types";

/**
 * Top N reaction types per il post in ordine decrescente di count.
 * Filtra fuori i kind a 0. Default N=2 per il bottone "accavallato".
 */
export function topReactions(
  counts: PostReactionCounts,
  n: number = 2,
): PostReactionKind[] {
  const sorted = POST_REACTION_KINDS.map((kind) => ({
    kind,
    count: counts[kind],
  }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  return sorted.slice(0, n).map((x) => x.kind);
}

/**
 * Counter formattato per la UI:
 *   0       → ""        (caller decide se nascondere)
 *   1..999  → "42"
 *   >=1000  → "1k+", "2k+", "12k+"
 *
 * Scelta minimal "k+" (no decimali) per pulizia visiva. A volumi
 * grossi il numero esatto non interessa l'utente, conta l'ordine.
 */
export function formatReactionCount(n: number): string {
  if (n <= 0) return "";
  if (n < 1000) return String(n);
  return `${Math.floor(n / 1000)}k+`;
}
