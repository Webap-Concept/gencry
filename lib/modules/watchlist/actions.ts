"use server";
// lib/modules/watchlist/actions.ts
//
// Server Actions del modulo watchlist. Tutte le mutation richiedono
// AUTH e fanno ownership check applicativo PRIMA della mutation.
//
// Pattern:
//   - getUser() → null = `unauthenticated`.
//   - ownership: SELECT WHERE id=X AND user_id=session.user.id → null = forbidden/not_found.
//   - mutation con try/catch su mapDbErrorToCode (trigger DB e' backstop
//     definitivo per cap_reached / coins_cap_reached / slug_taken /
//     coin_already_added).
//   - revalidatePath('/watchlist') sulle write per refresh server side.
//
// Niente rate-limit V1 (le mutation watchlist sono low-frequency: max 5
// watchlist, max 50 coin). Lo wireremo se vedremo abuse pattern reali.

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { watchlistCoins, watchlists } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getCoinForCard } from "@/lib/modules/prices/queries";
import { generateUniqueSlug } from "./slug";
import {
  type AddCoinResult,
  type CopyWatchlistResult,
  type CreateWatchlistResult,
  type DeleteWatchlistResult,
  type RemoveCoinResult,
  type ToggleVisibilityResult,
  type UpdateWatchlistResult,
  coinSymbolSchema,
  createWatchlistInputSchema,
  mapDbErrorToCode,
  updateWatchlistInputSchema,
  watchlistSlugSchema,
  type WatchlistVisibility,
} from "./types";

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Carica una watchlist e verifica ownership. Ritorna null se non esiste
 * o non appartiene al viewer (404 indistinguibile da forbidden — niente
 * info leak).
 */
async function loadOwnWatchlist(viewerId: string, watchlistId: string) {
  const rows = await db
    .select({
      id: watchlists.id,
      userId: watchlists.userId,
      visibility: watchlists.visibility,
      coinsCount: watchlists.coinsCount,
      archivedAt: watchlists.archivedAt,
    })
    .from(watchlists)
    .where(
      and(
        eq(watchlists.id, watchlistId),
        eq(watchlists.userId, viewerId),
        isNull(watchlists.archivedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function readCurrentCap(): Promise<number> {
  // Single source of truth: function PL/pgSQL get_user_watchlist_cap.
  // L'utente puo' essere su tier diverso quando avremo subscriptions;
  // la function lo astrae per noi. Qui basta il viewer corrente.
  // Per messaggio errore "hai raggiunto N watchlist" leggiamo il cap
  // effettivo dell'utente.
  // Fallback 5 se la function non esiste (test/local senza migration).
  try {
    const viewer = await getUser();
    if (!viewer) return 5;
    const res = await db.execute(
      sql`SELECT get_user_watchlist_cap(${viewer.id}::uuid) AS cap`,
    );
    // postgres-js: il result e' direttamente array-like delle righe.
    const rows = res as unknown as Array<{ cap: number | string }>;
    const raw = rows?.[0]?.cap;
    const cap = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return typeof cap === "number" && Number.isFinite(cap) && cap > 0 ? cap : 5;
  } catch {
    return 5;
  }
}

// ─── createWatchlist ───────────────────────────────────────────────────

export async function createWatchlistAction(
  input: unknown,
): Promise<CreateWatchlistResult> {
  const viewer = await getUser();
  if (!viewer) return { ok: false, error: "unauthenticated" };

  const parsed = createWatchlistInputSchema.safeParse(input);
  if (!parsed.success) {
    // Distingue name vuoto/troppo lungo per UX migliore.
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "name") {
      if (issue.code === "too_small") return { ok: false, error: "name_required" };
      if (issue.code === "too_big") return { ok: false, error: "name_too_long" };
    }
    return { ok: false, error: "validation" };
  }
  const { name, description, visibility } = parsed.data;

  // Slug unique app-side (path felice); il vincolo SQL e' backstop.
  const slug = await generateUniqueSlug(viewer.id, name);

  try {
    const inserted = await db
      .insert(watchlists)
      .values({
        userId: viewer.id,
        name,
        slug,
        description: description ?? null,
        visibility: visibility ?? "private",
      })
      .returning({ id: watchlists.id, slug: watchlists.slug });
    revalidatePath("/watchlist");
    return { ok: true, id: inserted[0].id, slug: inserted[0].slug };
  } catch (err) {
    const code = mapDbErrorToCode(err);
    if (code === "cap_reached") {
      const cap = await readCurrentCap();
      return { ok: false, error: "cap_reached", cap };
    }
    if (code) return { ok: false, error: code };
    console.warn("[watchlist:create] insert failed", {
      viewerId: viewer.id,
      err: String(err),
    });
    return { ok: false, error: "internal" };
  }
}

// ─── updateWatchlist ──────────────────────────────────────────────────

export async function updateWatchlistAction(
  input: unknown,
): Promise<UpdateWatchlistResult> {
  const viewer = await getUser();
  if (!viewer) return { ok: false, error: "unauthenticated" };

  const parsed = updateWatchlistInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "name") {
      if (issue.code === "too_small") return { ok: false, error: "name_required" };
      if (issue.code === "too_big") return { ok: false, error: "name_too_long" };
    }
    return { ok: false, error: "validation" };
  }
  const { id, name, description, slug } = parsed.data;

  const existing = await loadOwnWatchlist(viewer.id, id);
  if (!existing) return { ok: false, error: "not_found" };

  // Patch oggetto solo coi field presenti — evita di azzerare description
  // se il caller passa solo `name`.
  const patch: Partial<typeof watchlists.$inferInsert> = { updatedAt: new Date() };
  if (typeof name === "string") patch.name = name;
  if (typeof description === "string") patch.description = description;
  if (typeof slug === "string") patch.slug = slug;

  try {
    await db.update(watchlists).set(patch).where(eq(watchlists.id, id));
    revalidatePath("/watchlist");
    revalidatePath(`/watchlist/${id}`);
    return { ok: true };
  } catch (err) {
    const code = mapDbErrorToCode(err);
    if (code) return { ok: false, error: code };
    console.warn("[watchlist:update] failed", {
      viewerId: viewer.id,
      id,
      err: String(err),
    });
    return { ok: false, error: "internal" };
  }
}

// ─── toggleWatchlistVisibility ─────────────────────────────────────────

export async function toggleWatchlistVisibilityAction(
  watchlistId: string,
): Promise<ToggleVisibilityResult> {
  const viewer = await getUser();
  if (!viewer) return { ok: false, error: "unauthenticated" };

  const existing = await loadOwnWatchlist(viewer.id, watchlistId);
  if (!existing) return { ok: false, error: "not_found" };

  const next: WatchlistVisibility =
    existing.visibility === "public" ? "private" : "public";
  try {
    await db
      .update(watchlists)
      .set({ visibility: next, updatedAt: new Date() })
      .where(eq(watchlists.id, watchlistId));
    revalidatePath("/watchlist");
    revalidatePath(`/watchlist/${watchlistId}`);
    return { ok: true, visibility: next };
  } catch (err) {
    console.warn("[watchlist:visibility] failed", {
      viewerId: viewer.id,
      watchlistId,
      err: String(err),
    });
    return { ok: false, error: "internal" };
  }
}

// ─── deleteWatchlist (hard-delete) ─────────────────────────────────────
//
// Hard DELETE: niente recovery lato utente. Le coin in watchlist_coins
// vengono pulite dalla FK CASCADE. La colonna archived_at resta nello
// schema ma in V1 non e' wirata — disponibile se in futuro vorremo un
// "archivio personale utente" come feature distinta dal delete.

export async function deleteWatchlistAction(
  watchlistId: string,
): Promise<DeleteWatchlistResult> {
  const viewer = await getUser();
  if (!viewer) return { ok: false, error: "unauthenticated" };

  const existing = await loadOwnWatchlist(viewer.id, watchlistId);
  if (!existing) return { ok: false, error: "not_found" };

  try {
    await db
      .delete(watchlists)
      .where(
        and(eq(watchlists.id, watchlistId), eq(watchlists.userId, viewer.id)),
      );
    revalidatePath("/watchlist");
    return { ok: true };
  } catch (err) {
    console.warn("[watchlist:delete] failed", {
      viewerId: viewer.id,
      watchlistId,
      err: String(err),
    });
    return { ok: false, error: "internal" };
  }
}

// ─── addCoinToWatchlist ───────────────────────────────────────────────

export async function addCoinAction(
  watchlistId: string,
  symbolInput: string,
): Promise<AddCoinResult> {
  const viewer = await getUser();
  if (!viewer) return { ok: false, error: "unauthenticated" };

  const parsed = coinSymbolSchema.safeParse(symbolInput);
  if (!parsed.success) return { ok: false, error: "coin_not_supported" };
  const symbol = parsed.data;

  const existing = await loadOwnWatchlist(viewer.id, watchlistId);
  if (!existing) return { ok: false, error: "not_found" };

  // App-side coin validation: la coin deve essere tracciata in prices_coins.
  // Niente FK al modulo prices per loose coupling (la riga in
  // watchlist_coins resta anche se la coin viene disattivata domani —
  // semantica "ho aggiunto X, fammi sapere se cambia stato").
  const coin = await getCoinForCard(symbol);
  if (!coin) return { ok: false, error: "coin_not_supported" };

  // Position: append-end. Letto count corrente (best-effort: race con
  // un'altra add concorrente sullo stesso wl produce position duplicata
  // ma UI ordina anche per added_at fallback).
  const position = existing.coinsCount;

  try {
    await db
      .insert(watchlistCoins)
      .values({
        watchlistId,
        symbol,
        position,
      });
    revalidatePath("/watchlist");
    revalidatePath(`/watchlist/${watchlistId}`);
    // coinsCount denormalizzato gia' aggiornato dal trigger DB.
    return { ok: true, symbol, coinsCount: existing.coinsCount + 1 };
  } catch (err) {
    const code = mapDbErrorToCode(err);
    if (code === "coins_cap_reached") {
      // Leggiamo il cap effettivo per mostrare "max N coin" in UI.
      // Single read DB (low cost) — solo sul path errore.
      return { ok: false, error: "coins_cap_reached" };
    }
    if (code) return { ok: false, error: code };
    console.warn("[watchlist:add-coin] failed", {
      viewerId: viewer.id,
      watchlistId,
      symbol,
      err: String(err),
    });
    return { ok: false, error: "internal" };
  }
}

// ─── removeCoinFromWatchlist ──────────────────────────────────────────

export async function removeCoinAction(
  watchlistId: string,
  symbolInput: string,
): Promise<RemoveCoinResult> {
  const viewer = await getUser();
  if (!viewer) return { ok: false, error: "unauthenticated" };

  const parsed = coinSymbolSchema.safeParse(symbolInput);
  if (!parsed.success) return { ok: false, error: "validation" };
  const symbol = parsed.data;

  const existing = await loadOwnWatchlist(viewer.id, watchlistId);
  if (!existing) return { ok: false, error: "not_found" };

  try {
    const res = await db
      .delete(watchlistCoins)
      .where(
        and(
          eq(watchlistCoins.watchlistId, watchlistId),
          eq(watchlistCoins.symbol, symbol),
        ),
      );
    // Drizzle delete non torna rowsAffected uniforme su tutti i driver:
    // calcoliamo il nuovo count via subtract dal denorm (gia' applicato
    // dal trigger). Best-effort.
    const newCount = Math.max(0, existing.coinsCount - 1);
    revalidatePath("/watchlist");
    revalidatePath(`/watchlist/${watchlistId}`);
    void res;
    return { ok: true, coinsCount: newCount };
  } catch (err) {
    console.warn("[watchlist:remove-coin] failed", {
      viewerId: viewer.id,
      watchlistId,
      symbol,
      err: String(err),
    });
    return { ok: false, error: "internal" };
  }
}

// ─── copyWatchlist (duplica una watchlist pubblica nelle proprie) ──────
//
// Use case: l'utente trova una watchlist pubblica su /w/<u>/<slug> e la
// vuole nelle sue per editarla. La copia e' uno SNAPSHOT: name + coin
// al momento del copy, niente link alla source (no sync futura).
//
// Regole:
//   - source deve essere visibility='public' AND non-archived. Niente
//     copia di private altrui (info leak). Copiare la PROPRIA wl pubblica
//     e' permesso (funge da "duplica").
//   - la copia nasce PRIVATE: non ri-pubblichiamo automaticamente
//     contenuti basati su quelli di un altro utente.
//   - name = source.name invariato (l'utente rinomina dopo se vuole),
//     slug nuovo unico per l'owner.
//   - coin troncate a max_coins_per_watchlist (di norma la source ne ha
//     gia' meno, ma e' un guard se il cap fosse stato abbassato).
//   - cap watchlist: il trigger DB e' backstop → cap_reached gestito.
//   - Transazione: watchlist + coin insieme. Se il cap watchlist scatta,
//     rollback totale (niente coin orfane).
export async function copyWatchlistAction(
  sourceId: string,
): Promise<CopyWatchlistResult> {
  const viewer = await getUser();
  if (!viewer) return { ok: false, error: "unauthenticated" };

  // 1. Carica la source: deve essere pubblica e attiva.
  const [source] = await db
    .select({
      id: watchlists.id,
      name: watchlists.name,
      description: watchlists.description,
      visibility: watchlists.visibility,
    })
    .from(watchlists)
    .where(
      and(
        eq(watchlists.id, sourceId),
        eq(watchlists.visibility, "public"),
        isNull(watchlists.archivedAt),
      ),
    )
    .limit(1);
  if (!source) return { ok: false, error: "not_found" };

  // 2. Coin della source, ordinate per position. Cap-truncate.
  const settings = await getAppSettings();
  const rawCap = settings["modules.watchlist.max_coins_per_watchlist"];
  const maxCoins = rawCap ? parseInt(rawCap, 10) : 50;
  const cap = Number.isFinite(maxCoins) && maxCoins > 0 ? maxCoins : 50;

  const sourceCoins = await db
    .select({ symbol: watchlistCoins.symbol, position: watchlistCoins.position })
    .from(watchlistCoins)
    .where(eq(watchlistCoins.watchlistId, sourceId))
    .orderBy(asc(watchlistCoins.position), asc(watchlistCoins.addedAt));
  const coinsToCopy = sourceCoins.slice(0, cap);

  // 3. Slug unico per il nuovo owner.
  const slug = await generateUniqueSlug(viewer.id, source.name);

  // 4. Transazione: crea wl + coin. Rollback totale su cap_reached.
  try {
    const newId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(watchlists)
        .values({
          userId: viewer.id,
          name: source.name,
          slug,
          description: source.description,
          visibility: "private",
        })
        .returning({ id: watchlists.id });

      if (coinsToCopy.length > 0) {
        await tx.insert(watchlistCoins).values(
          coinsToCopy.map((c, i) => ({
            watchlistId: created.id,
            symbol: c.symbol,
            position: i,
          })),
        );
      }
      return created.id;
    });

    revalidatePath("/watchlist");
    return {
      ok: true,
      id: newId,
      slug,
      coinsCopied: coinsToCopy.length,
    };
  } catch (err) {
    const code = mapDbErrorToCode(err);
    if (code === "cap_reached") {
      const capVal = await readCurrentCap();
      return { ok: false, error: "cap_reached", cap: capVal };
    }
    if (code) return { ok: false, error: code };
    console.warn("[watchlist:copy] failed", {
      viewerId: viewer.id,
      sourceId,
      err: String(err),
    });
    return { ok: false, error: "internal" };
  }
}
