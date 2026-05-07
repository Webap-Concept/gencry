"use server";

import { requireAdminPage } from "@/lib/rbac/guards";
import { resetNavOrder, setNavOrder } from "@/lib/db/admin-nav-order-queries";

/**
 * Salva l'ordinamento custom dei top-level della sidebar admin.
 * Globale per tutti gli admin (per Gencry abbiamo pochi staff e
 * preferiamo coerenza). Permission: `admin:settings` — chi può accedere
 * al pannello admin in genere ha già questo livello.
 */
export async function saveNavOrderAction(
  updates: { itemKey: string; sortOrder: number }[],
): Promise<{ error?: string; success?: boolean }> {
  const user = await requireAdminPage();
  // requireAdminPage redirige se non auth; qui siamo sicuri di avere user
  if (!user) return { error: "Unauthorized" };

  if (!Array.isArray(updates)) {
    return { error: "Invalid payload" };
  }
  // Sanitizziamo: scartiamo entry malformate per non corrompere la tabella
  const safe = updates
    .filter(
      (u): u is { itemKey: string; sortOrder: number } =>
        typeof u?.itemKey === "string" &&
        u.itemKey.length > 0 &&
        u.itemKey.length <= 64 &&
        typeof u?.sortOrder === "number" &&
        Number.isInteger(u.sortOrder),
    )
    .map((u) => ({ itemKey: u.itemKey, sortOrder: u.sortOrder }));

  try {
    await setNavOrder(safe);
  } catch (err) {
    console.error("[saveNavOrderAction] error:", err);
    return { error: "Failed to save order" };
  }
  return { success: true };
}

/** Cancella tutti gli override → torna ai default del codice. */
export async function resetNavOrderAction(): Promise<{
  error?: string;
  success?: boolean;
}> {
  const user = await requireAdminPage();
  if (!user) return { error: "Unauthorized" };
  try {
    await resetNavOrder();
  } catch (err) {
    console.error("[resetNavOrderAction] error:", err);
    return { error: "Failed to reset order" };
  }
  return { success: true };
}
