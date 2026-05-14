// lib/storage/r2-account.ts
//
// Helper SHARED per leggere l'Account ID Cloudflare (tenant-globale).
//
// Regola architetturale (vedi project_modular_architecture):
//   - Account ID Cloudflare = 1 per tenant = vive in `storage.r2.account_id`
//     GLOBALE
//   - Token API + bucket + public_base_url = per modulo (scope ristretto
//     al bucket del modulo) → vivono in `modules.<slug>.r2.*`
//
// I moduli che usano R2 (prices, posts, ...) leggono da qui per
// l'accountId, dalle loro settings modulari per il resto.
import "server-only";
import { getAppSettings } from "@/lib/db/settings-queries";

/**
 * Ritorna l'Account ID Cloudflare globale, o `null` se non configurato.
 * Caller modulare deve usarlo come precondizione: se null → la propria
 * config R2 è "incompleta" indipendentemente da quanto pieni siano i
 * suoi access_key/secret/bucket.
 */
export async function loadGlobalR2AccountId(): Promise<string | null> {
  const s = await getAppSettings();
  const v = (s["storage.r2.account_id"] ?? "").trim();
  return v || null;
}

/**
 * Path dell'admin page dove l'account_id è gestito globalmente. Usato
 * dai componenti UI delle settings modulari per linkare l'admin alla
 * fonte unica di verità invece di duplicare il campo.
 *
 * NOTA: il path admin reale dipende dall'admin URL slug runtime
 * (vedi getAdminUrlSlug). Il helper costruisce il path relativo;
 * il caller server side prepone lo slug.
 */
export const R2_ACCOUNT_ADMIN_PATH = "/services/cloudflare";
