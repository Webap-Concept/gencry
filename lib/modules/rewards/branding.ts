// lib/modules/rewards/branding.ts
//
// Branding del modulo rewards (icona GCC, ecc.).
// File volutamente leggero: legge solo app_settings, niente aws-sdk —
// così i consumer RSC (es. /mycoins) non si tirano dentro lo S3 client.
import "server-only";
import { getAppSettings } from "@/lib/db/settings-queries";

/** URL pubblico dell'icona GCC, o null se non ancora caricata dall'admin. */
export async function getGccCoinIconUrl(): Promise<string | null> {
  const s = await getAppSettings();
  return s["modules.rewards.coin_icon_url"] || null;
}
