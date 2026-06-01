// lib/modules/module-hooks.ts
//
// Utility per chiamare gli hook cross-modulo definiti nei manifest.
// Il core (posts/actions.ts, ecc.) importa DA QUI — mai direttamente
// dai singoli moduli. Questo file è il confine di isolamento:
//   - Se un modulo viene rimosso da INSTALLED_MODULES, i suoi hook
//     non vengono più chiamati senza toccare nessun altro file.
//   - Se i file del modulo vengono cancellati, basta rimuovere il
//     manifest da registry.ts — questo file non cambia.
import { INSTALLED_MODULES } from "./registry";

/**
 * Chiama tutti i moduli installati che reagiscono alla creazione di un post.
 * Fire-and-forget: errori interni ai moduli sono loro responsabilità.
 */
export async function runAfterPostCreated(
  userId: string,
  postId: string,
): Promise<void> {
  await Promise.allSettled(
    INSTALLED_MODULES
      .filter((m) => m.postHooks?.afterPostCreated)
      .map((m) => m.postHooks!.afterPostCreated!(userId, postId)),
  );
}

/**
 * Chiama tutti i moduli installati che reagiscono alla creazione di un commento.
 */
export async function runAfterCommentCreated(
  userId: string,
  commentId: string,
): Promise<void> {
  await Promise.allSettled(
    INSTALLED_MODULES
      .filter((m) => m.postHooks?.afterCommentCreated)
      .map((m) => m.postHooks!.afterCommentCreated!(userId, commentId)),
  );
}

/**
 * Chiama tutti i moduli installati che reagiscono al riscatto di un perk dal
 * catalogo rewards (es. watchlist applica 'watchlist_slot'). Fire-and-forget:
 * il modulo rewards NON conosce i moduli che reagiscono al perk.
 */
export async function runAfterPerkRedeemed(
  userId: string,
  slug: string,
  perkData: Record<string, unknown> | null,
): Promise<void> {
  await Promise.allSettled(
    INSTALLED_MODULES
      .filter((m) => m.perkHooks?.afterPerkRedeemed)
      .map((m) => m.perkHooks!.afterPerkRedeemed!(userId, slug, perkData)),
  );
}
