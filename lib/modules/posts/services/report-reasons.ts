import "server-only";
// lib/modules/posts/services/report-reasons.ts
//
// Lista admin-editable dei motivi di segnalazione post. Salvata come
// JSON in `app_settings` sotto la key `modules.posts.report_reasons`.
//
// Why settings JSON e non R2/tabella:
//   - <50 entries previste, ~1KB serialized: zero benefit da R2/edge-cache
//   - Cambia raramente (admin tunes monthly), ma settings cache è già 5min
//   - Niente nuova tabella, niente migration extra
//   - Frontend gets it "free" via getAppSettings()
//
// I 6+1 motivi seed riflettono il dominio social crypto: scam e
// market_manipulation sono di prima classe perché un attaccante li usa
// per pump&dump o rug pull. "Misinformation" è volutamente assente:
// troppo soggettivo, rischio abuso del report-system per silenziare
// opinioni contrarie.

import { z } from "zod";
import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const REPORT_REASONS_SETTING_KEY = "modules.posts.report_reasons";

export const ReportReasonSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "lowercase, digits and underscore only"),
  labelByLocale: z.record(z.string(), z.string().min(1).max(80)),
  descriptionByLocale: z.record(z.string(), z.string().max(200)).optional(),
  icon: z.string().max(40).optional(),
  enabled: z.boolean(),
  requiresDetails: z.boolean(),
  position: z.number().int().min(0),
});

export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const ReportReasonsArraySchema = z
  .array(ReportReasonSchema)
  .max(50)
  .superRefine((arr, ctx) => {
    const seen = new Set<string>();
    for (const r of arr) {
      if (seen.has(r.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate key: ${r.key}`,
        });
      }
      seen.add(r.key);
    }
  });

// ─────────────────────────────────────────────────────────────────────────
// Seed (dominio social crypto — vedi memoria project_module_posts §report)
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_REPORT_REASONS: ReportReason[] = [
  {
    key: "spam",
    labelByLocale: { it: "Spam", en: "Spam" },
    descriptionByLocale: {
      it: "Contenuto ripetitivo, bot, link spam",
      en: "Repetitive content, bots, link spam",
    },
    icon: "🚫",
    enabled: true,
    requiresDetails: false,
    position: 0,
  },
  {
    key: "scam",
    labelByLocale: { it: "Truffa / Scam", en: "Scam / Phishing" },
    descriptionByLocale: {
      it: "Phishing, rug pull, fake airdrop, link malevoli",
      en: "Phishing, rug pulls, fake airdrops, malicious links",
    },
    icon: "⚠️",
    enabled: true,
    requiresDetails: false,
    position: 1,
  },
  {
    key: "market_manipulation",
    labelByLocale: {
      it: "Manipolazione di mercato",
      en: "Market manipulation",
    },
    descriptionByLocale: {
      it: "Pump & dump coordinato, shilling pagato non dichiarato",
      en: "Coordinated pump & dump, undisclosed paid shilling",
    },
    icon: "📈",
    enabled: true,
    requiresDetails: false,
    position: 2,
  },
  {
    key: "harassment",
    labelByLocale: { it: "Molestie / Hate", en: "Harassment / Hate" },
    descriptionByLocale: {
      it: "Attacchi personali, hate speech, doxxing",
      en: "Personal attacks, hate speech, doxxing",
    },
    icon: "🗯️",
    enabled: true,
    requiresDetails: false,
    position: 3,
  },
  {
    key: "impersonation",
    labelByLocale: { it: "Impersonation", en: "Impersonation" },
    descriptionByLocale: {
      it: "Si finge un altro utente reale o un progetto noto",
      en: "Pretends to be another real user or known project",
    },
    icon: "🎭",
    enabled: true,
    requiresDetails: false,
    position: 4,
  },
  {
    key: "inappropriate_content",
    labelByLocale: {
      it: "Contenuto inappropriato",
      en: "Inappropriate content",
    },
    descriptionByLocale: {
      it: "NSFW, violenza esplicita, contenuti illeciti",
      en: "NSFW, explicit violence, illicit content",
    },
    icon: "🔞",
    enabled: true,
    requiresDetails: false,
    position: 5,
  },
  {
    key: "other",
    labelByLocale: { it: "Altro", en: "Other" },
    descriptionByLocale: {
      it: "Specifica il motivo nei dettagli",
      en: "Specify the reason in the details",
    },
    icon: "❓",
    enabled: true,
    requiresDetails: true,
    position: 99,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────

/** Lettura raw dal DB. Se settings vuoto o JSON invalido → defaults. */
async function loadReasonsFromDb(): Promise<ReportReason[]> {
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, REPORT_REASONS_SETTING_KEY))
    .limit(1);

  const raw = rows[0]?.value;
  if (!raw) return DEFAULT_REPORT_REASONS;

  try {
    const parsed = JSON.parse(raw);
    const result = ReportReasonsArraySchema.safeParse(parsed);
    if (!result.success) return DEFAULT_REPORT_REASONS;
    return result.data;
  } catch {
    return DEFAULT_REPORT_REASONS;
  }
}

/** Lista completa (incluse disabled) — usata dall'admin CRUD. */
export async function getAllReportReasons(): Promise<ReportReason[]> {
  const all = await loadReasonsFromDb();
  return [...all].sort((a, b) => a.position - b.position);
}

/** Solo enabled, ordinati per position — usato dal frontend modal e dalla
 *  validazione del Server Action `reportPost`. */
export async function getActiveReportReasons(): Promise<ReportReason[]> {
  const all = await loadReasonsFromDb();
  return all
    .filter((r) => r.enabled)
    .sort((a, b) => a.position - b.position);
}

/** Lookup singolo (per validazione Server Action). */
export async function findActiveReportReason(
  key: string,
): Promise<ReportReason | null> {
  const all = await getActiveReportReasons();
  return all.find((r) => r.key === key) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Write (admin only — RBAC gating sul caller)
// ─────────────────────────────────────────────────────────────────────────

export async function saveReportReasons(
  reasons: ReportReason[],
): Promise<void> {
  const parsed = ReportReasonsArraySchema.parse(reasons);
  const value = JSON.stringify(parsed);
  await db
    .insert(appSettings)
    .values({ key: REPORT_REASONS_SETTING_KEY, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value },
    });
}
