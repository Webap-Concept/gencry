// Registry tipizzato per il rendering i18n delle admin_notifications.
//
// Pattern allineato a `lib/modules/notifications/notification-targets.ts`
// (modulo notifications end-user): le righe in DB sono salvate con
// `type` + `metadata` JSONB; per mostrarle a un admin in una specifica
// lingua mappiamo `type` → { titleKey, bodyKey?, valuesFrom(metadata) }
// e renderizziamo lato client tramite next-intl con la locale del
// viewer corrente.
//
// I campi `title`/`body` di `admin_notifications` restano come fallback
// inglese: se il `type` non è registrato qui, o la i18n key è missing,
// il renderer ricade sul testo grezzo (zero rotture su generator non
// ancora migrati / chiavi non ancora aggiunte ai locali).
//
// Aggiungere un nuovo type richiede 2 passi:
//   1. una entry qui sotto col `valuesFrom` che mappa il metadata
//      del generator a un dizionario flat di template values
//   2. le keys `admin.notifications.types.<type>.{title,body}` in
//      tutti i locali (messages/en/admin.json + messages/it/admin.json).
// Il generator continua a scrivere title/body inglesi come fallback
// (utile per audit/log SQL).

export type NotificationMetadata = Record<string, unknown>;

export type NotificationRegistryEntry = {
  titleKey: string;
  bodyKey?: string;
  /**
   * Estrae i template values da `metadata`. Deve essere total: niente
   * throw, usa fallback ragionevoli (stringa vuota / 0) se i campi
   * mancano. Le keys del dict ritornato devono matchare i placeholder
   * nelle messages files.
   */
  valuesFrom?: (m: NotificationMetadata) => Record<string, string | number>;
  /**
   * Campi del metadata necessari per il rendering corretto. Se uno manca
   * (null/undefined/string vuota), il renderer ricade sul title/body raw
   * inglese del DB. Utile per notifiche emesse PRIMA della migrazione
   * del generator: il metadata "vecchio" non aveva ancora `label` ecc,
   * meglio mostrare il fallback inglese che una stringa interpolata
   * a pezzi ("Rotate ", "Cron failed —  · 0 consecutive failures, …").
   */
  requiredFields?: readonly string[];
};

// ─── helpers di estrazione dal metadata ─────────────────────────────
function s(m: NotificationMetadata, key: string): string {
  const v = m[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function num(m: NotificationMetadata, key: string): number {
  const v = m[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
export const NOTIFICATION_REGISTRY: Record<string, NotificationRegistryEntry> = {
  secret_rotation_due: {
    titleKey: "admin.notifications.types.secret_rotation_due.title",
    bodyKey: "admin.notifications.types.secret_rotation_due.body",
    requiredFields: ["label"],
    valuesFrom: (m) => ({
      label: s(m, "label"),
      ageDays: num(m, "ageDays"),
      maxAgeDays: num(m, "maxAgeDays"),
    }),
  },
  cron_job_failure: {
    titleKey: "admin.notifications.types.cron_job_failure.title",
    bodyKey: "admin.notifications.types.cron_job_failure.body",
    requiredFields: ["label", "latestTime"],
    valuesFrom: (m) => ({
      label: s(m, "label"),
      consecutive: num(m, "consecutiveFailures"),
      lastTime: s(m, "latestTime"),
    }),
  },
  account_deletion_requested: {
    titleKey: "admin.notifications.types.account_deletion_requested.title",
    bodyKey: "admin.notifications.types.account_deletion_requested.body",
    requiredFields: ["email", "purgeDate"],
    valuesFrom: (m) => ({
      email: s(m, "email"),
      daysRemaining: num(m, "daysRemaining"),
      purgeDate: s(m, "purgeDate"),
    }),
  },
  suspicious_sessions: {
    titleKey: "admin.notifications.types.suspicious_sessions.title",
    bodyKey: "admin.notifications.types.suspicious_sessions.body",
    requiredFields: ["severity"],
    valuesFrom: (m) => ({
      count: num(m, "count"),
      severity: s(m, "severity") || "info",
    }),
  },
  posts_reports_pending: {
    titleKey: "admin.notifications.types.posts_reports_pending.title",
    bodyKey: "admin.notifications.types.posts_reports_pending.body",
    requiredFields: ["total"],
    valuesFrom: (m) => {
      const posts = num(m, "posts");
      const comments = num(m, "comments");
      return {
        total: num(m, "total"),
        posts,
        comments,
        hasBoth: posts > 0 && comments > 0 ? "true" : "false",
        onlyPosts: posts > 0 && comments === 0 ? "true" : "false",
      };
    },
  },
};
