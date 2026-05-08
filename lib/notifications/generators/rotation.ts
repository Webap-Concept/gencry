// Generatore: alert di rotazione delle chiavi sensibili.
// Legge `app_settings.updated_at` per le chiavi monitorate e produce
// un candidato se l'eta' supera la soglia configurata.

import { db } from "@/lib/db/drizzle";
import { buildAdminPath } from "@/lib/admin-paths";
import { appSettings } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import type {
  NotificationCandidate,
  NotificationGenerator,
  NotificationSeverity,
} from "../types";

type RotationTarget = {
  key: string;
  label: string;
  maxAgeDays: number;
  /** Path admin del setting da ruotare. Può essere relativo al base admin
   *  (es. "/services/google-oauth") o assoluto (es. "/foo/bar") — vedi
   *  `computeRotationCandidates(rows, now, targets, adminBase)`: se è
   *  passato `adminBase`, viene prefisso al subPath per ottenere l'URL
   *  finale runtime (slug-aware). I test che non passano `adminBase`
   *  ottengono `link === subPath` per backward-compat. */
  subPath: string;
};

const ROTATION_TARGETS: RotationTarget[] = [
  // I subPath sono RELATIVI al base admin: il caller `run` qui sotto
  // li prefigge con `await buildAdminPath("")` = `/<adminSlug>` per ottenere
  // l'URL completo runtime (es. `/admin/services/google-oauth`).
  {
    key: "google_client_secret",
    label: "Google Client Secret",
    maxAgeDays: 180,
    subPath: "/services/google-oauth",
  },
  {
    key: "resend_api_key",
    label: "Resend API Key",
    maxAgeDays: 180,
    subPath: "/services/resend",
  },
  {
    key: "upstash_redis_rest_token",
    label: "Upstash Redis Token",
    maxAgeDays: 180,
    subPath: "/services/redis",
  },
  {
    key: "cf_turnstile_secret_key",
    label: "Cloudflare Turnstile Secret Key",
    maxAgeDays: 180,
    subPath: "/services/cloudflare",
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function severityFor(ageDays: number, maxDays: number): NotificationSeverity {
  if (ageDays > maxDays + 90) return "critical";
  if (ageDays > maxDays + 30) return "warning";
  return "info";
}

type SettingRow = {
  key: string;
  value: string | null;
  updatedAt: Date | null;
};

/**
 * Logica pura: dato lo stato delle chiavi monitorate, ritorna i candidati.
 * Esposta per essere testata senza DB.
 *
 * `adminBase` (default "") viene prefisso al `subPath` di ogni target per
 * costruire il `link` finale. In produzione il caller risolve adminBase
 * via `buildAdminPath("")`, così il link contiene lo slug runtime.
 */
export function computeRotationCandidates(
  rows: SettingRow[],
  now = Date.now(),
  targets: RotationTarget[] = ROTATION_TARGETS,
  adminBase = "",
): NotificationCandidate[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: NotificationCandidate[] = [];

  for (const target of targets) {
    const row = byKey.get(target.key);
    // Chiave non configurata: nessun alert (non c'e' niente da ruotare).
    if (!row || row.value === null || row.value === "") continue;
    if (!row.updatedAt) continue;

    const ageMs = now - row.updatedAt.getTime();
    if (ageMs <= target.maxAgeDays * DAY_MS) continue;
    const ageDays = Math.floor(ageMs / DAY_MS);

    out.push({
      type: "secret_rotation_due",
      severity: severityFor(ageDays, target.maxAgeDays),
      title: `Rotate ${target.label}`,
      body: `Not updated for ${ageDays} days (threshold: ${target.maxAgeDays}d).`,
      link: `${adminBase}${target.subPath}`,
      dedupKey: `rotation:${target.key}`,
      metadata: {
        settingKey: target.key,
        ageDays,
        maxAgeDays: target.maxAgeDays,
      },
    });
  }

  return out;
}

export const rotationGenerator: NotificationGenerator = {
  type: "secret_rotation_due",
  requiredPermission: "admin:settings",
  run: async () => {
    const keys = ROTATION_TARGETS.map((t) => t.key);
    const [rows, adminBase] = await Promise.all([
      db
        .select({
          key: appSettings.key,
          value: appSettings.value,
          updatedAt: appSettings.updatedAt,
        })
        .from(appSettings)
        .where(inArray(appSettings.key, keys)),
      buildAdminPath(""),
    ]);
    return computeRotationCandidates(rows, Date.now(), ROTATION_TARGETS, adminBase);
  },
};
