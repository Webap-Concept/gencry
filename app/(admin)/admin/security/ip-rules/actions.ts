"use server";

import { getAdminPath } from "@/lib/admin-paths";
import {
  evaluateIpForAdmin,
  invalidateIpRulesCache,
  isValidIpOrCidr,
} from "@/lib/auth/ip-rules";
import {
  deleteIpRuleById,
  insertIpRule,
  listIpRules,
  updateIpRuleExpiry,
  type IpRuleScopeFilter,
  type IpRuleStateFilter,
} from "@/lib/db/ip-rules-queries";
import { getAppSettings, updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdminPage } from "@/lib/rbac/guards";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Estrae l'IP del client dagli header proxy. Allinea a `lib/auth/session.ts`. */
async function getCurrentClientIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}

const DURATION_PRESETS = {
  never: null,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
} as const;

type DurationPreset = keyof typeof DURATION_PRESETS;

function presetToExpiresAt(preset: DurationPreset): Date | null {
  const ms = DURATION_PRESETS[preset];
  return ms === null ? null : new Date(Date.now() + ms);
}

// ─── Read ───────────────────────────────────────────────────────────────────

export type IpRulesPageData = Awaited<ReturnType<typeof getIpRulesData>>;

export async function getIpRulesData(opts?: {
  scope?: IpRuleScopeFilter;
  state?: IpRuleStateFilter;
}) {
  await requireAdminPage();
  const [rules, settings, currentIp] = await Promise.all([
    listIpRules({ scope: opts?.scope, state: opts?.state }),
    getAppSettings(),
    getCurrentClientIp(),
  ]);
  const lockdownEnabled = settings["admin.ip_lockdown_enabled"] === "true";
  // Valuta lo stato dell'IP corrente sulla scope admin (per il banner UI).
  const currentIpAdminEval = await evaluateIpForAdmin(currentIp);
  return {
    rules,
    lockdownEnabled,
    currentIp,
    currentIpAdminDecision: currentIpAdminEval.decision,
    currentIpAdminRuleId: currentIpAdminEval.ruleId,
  };
}

// ─── Actions ────────────────────────────────────────────────────────────────

const AddRuleSchema = z.object({
  ip: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .refine(isValidIpOrCidr, "errorInvalidIp"),
  action: z.enum(["allow", "deny"]),
  scope: z.enum(["auth", "admin", "all"]),
  reason: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  duration: z.enum(["never", "1h", "24h", "7d", "30d"]),
});

export async function actionAddIpRule(formData: FormData) {
  const user = await requireAdminPage();
  const parsed = AddRuleSchema.safeParse({
    ip: formData.get("ip"),
    action: formData.get("action"),
    scope: formData.get("scope"),
    reason: formData.get("reason"),
    duration: formData.get("duration"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "errorInvalid" };
  }

  try {
    await insertIpRule({
      ip: parsed.data.ip,
      action: parsed.data.action,
      scope: parsed.data.scope,
      reason: parsed.data.reason,
      expiresAt: presetToExpiresAt(parsed.data.duration),
      createdBy: user.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("uq_ip_rules_ip_scope")) {
      return { ok: false as const, error: "errorDuplicate" };
    }
    console.error("[ip-rules] insert failed:", err);
    return { ok: false as const, error: "errorGeneric" };
  }

  invalidateIpRulesCache();
  revalidatePath(await getAdminPath("security-ip-rules"));
  return { ok: true as const };
}

const RemoveSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function actionRemoveIpRule(formData: FormData) {
  await requireAdminPage();
  const parsed = RemoveSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false as const, error: "errorInvalid" };
  }

  // Safety: se l'admin sta per rimuovere una regola allow scope='admin'/'all'
  // che la sua IP corrente sta usando per passare il lockdown, blocchiamo —
  // si autolockerebbe fuori dal pannello.
  const settings = await getAppSettings();
  if (settings["admin.ip_lockdown_enabled"] === "true") {
    const currentIp = await getCurrentClientIp();
    const ruling = await evaluateIpForAdmin(currentIp);
    if (
      ruling.decision === "allow" &&
      ruling.ruleId === parsed.data.id
    ) {
      return { ok: false as const, error: "errorWouldLockoutSelf" };
    }
  }

  await deleteIpRuleById(parsed.data.id);
  invalidateIpRulesCache();
  revalidatePath(await getAdminPath("security-ip-rules"));
  return { ok: true as const };
}

const ExtendSchema = z.object({
  id: z.coerce.number().int().positive(),
  duration: z.enum(["never", "1h", "24h", "7d", "30d"]),
});

export async function actionExtendIpRule(formData: FormData) {
  await requireAdminPage();
  const parsed = ExtendSchema.safeParse({
    id: formData.get("id"),
    duration: formData.get("duration"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: "errorInvalid" };
  }
  await updateIpRuleExpiry(parsed.data.id, presetToExpiresAt(parsed.data.duration));
  invalidateIpRulesCache();
  revalidatePath(await getAdminPath("security-ip-rules"));
  return { ok: true as const };
}

const ToggleLockdownSchema = z.object({
  enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function actionToggleAdminLockdown(formData: FormData) {
  await requireAdminPage();
  const parsed = ToggleLockdownSchema.safeParse({
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: "errorInvalid" };
  }

  // Hard-stop: se sta tentando di ATTIVARE lockdown ma il proprio IP non è
  // matchato da nessuna regola allow scope='admin'/'all', rifiuta. Senza
  // questo check, l'admin si auto-blocca al primo refresh e l'unico modo
  // per uscire è rollback DB diretto.
  if (parsed.data.enabled) {
    const currentIp = await getCurrentClientIp();
    const ruling = await evaluateIpForAdmin(currentIp);
    if (ruling.decision !== "allow") {
      return { ok: false as const, error: "errorLockdownNoSelfAllow" };
    }
  }

  await updateAppSetting(
    "admin.ip_lockdown_enabled",
    parsed.data.enabled ? "true" : "false",
  );
  // Invalidiamo anche la cache delle regole: il toggle cambia il
  // comportamento del proxy, e il settings cache reagisce sull'altro tag.
  invalidateIpRulesCache();
  revalidatePath(await getAdminPath("security-ip-rules"));
  return { ok: true as const };
}
