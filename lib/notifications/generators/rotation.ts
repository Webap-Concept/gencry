// Generatore: alert di rotazione delle chiavi sensibili.
// Legge `app_settings.updated_at` per le chiavi monitorate e produce
// un candidato se l'eta' supera la soglia configurata.

import { db } from "@/lib/db/drizzle";
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
  link: string;
};

const ROTATION_TARGETS: RotationTarget[] = [
  {
    key: "google_client_secret",
    label: "Google Client Secret",
    maxAgeDays: 1,
    link: "/admin/settings/google-oauth",
  },
  {
    key: "resend_api_key",
    label: "Resend API Key",
    maxAgeDays: 2,
    link: "/admin/settings/resend",
  },
  {
    key: "upstash_redis_rest_token",
    label: "Upstash Redis Token",
    maxAgeDays: 180,
    link: "/admin/settings/redis",
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
 */
export function computeRotationCandidates(
  rows: SettingRow[],
  now = Date.now(),
  targets: RotationTarget[] = ROTATION_TARGETS,
): NotificationCandidate[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: NotificationCandidate[] = [];

  for (const target of targets) {
    const row = byKey.get(target.key);
    // Chiave non configurata: nessun alert (non c'e' niente da ruotare).
    if (!row || row.value === null || row.value === "") continue;
    if (!row.updatedAt) continue;

    const ageDays = Math.floor((now - row.updatedAt.getTime()) / DAY_MS);
    if (ageDays <= target.maxAgeDays) continue;

    out.push({
      type: "secret_rotation_due",
      severity: severityFor(ageDays, target.maxAgeDays),
      title: `Ruota ${target.label}`,
      body: `Non viene aggiornata da ${ageDays} giorni (soglia: ${target.maxAgeDays}gg).`,
      link: target.link,
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
    const rows = await db
      .select({
        key: appSettings.key,
        value: appSettings.value,
        updatedAt: appSettings.updatedAt,
      })
      .from(appSettings)
      .where(inArray(appSettings.key, keys));
    return computeRotationCandidates(rows);
  },
};
