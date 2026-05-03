/**
 * lib/rbac/system-permissions.ts
 *
 * Fonte di verità delle chiavi di permesso usate nel codice.
 * Deve essere SEMPRE in sync con lib/db/permissions-seed.ts.
 *
 * Usato per:
 *  - datalist / autocomplete nel form "Nuovo permesso" del pannello admin
 *  - pannello legenda visiva (cosa fa ogni chiave)
 *  - validazione lato server prima di inserire un permesso custom
 *
 * REGOLA: ogni chiave che appare nel seed DEVE apparire anche qui.
 * Dopo ogni modifica al seed rieseguire:
 *   pnpm run db:seed-permissions
 */

export type SystemPermission = {
  /** Chiave usata nel codice: risorsa:azione */
  key: string;
  /** Etichetta human-readable (IT) */
  label: string;
  /** Gruppo per raggruppamento visivo */
  group: string;
  /** Spiegazione estesa dell'effetto */
  description: string;
  /** true = permesso di sistema, non eliminabile dall'UI */
  isSystem: boolean;
};

export const SYSTEM_PERMISSIONS: SystemPermission[] = [

  // ── Admin — accesso base ────────────────────────────────────────────
  {
    key: "admin:access",
    group: "Admin",
    label: "Accesso pannello admin",
    description: "Permette l'ingresso al pannello /admin. Richiesto da tutti i ruoli che devono accedere all'area di gestione.",
    isSystem: true,
  },
  {
    key: "admin:settings",
    group: "Admin",
    label: "Modifica impostazioni app",
    description: "Accesso alla sezione Impostazioni del pannello admin.",
    isSystem: true,
  },
  {
    key: "admin:analytics",
    group: "Admin",
    label: "Visualizza analytics",
    description: "Accesso alla sezione Analytics del pannello admin.",
    isSystem: true,
  },

  // ── Admin — sezioni (usate dai layout guard e dal Nav Registry) ──────
  {
    key: "admin:content",
    group: "Admin",
    label: "Accesso sezione Contenuti",
    description: "Permette di vedere e accedere alla sezione Contenuti nel pannello admin.",
    isSystem: true,
  },
  {
    key: "admin:seo",
    group: "Admin",
    label: "Accesso sezione SEO",
    description: "Permette di vedere e accedere alla sezione SEO nel pannello admin.",
    isSystem: true,
  },
  {
    key: "admin:users",
    group: "Admin",
    label: "Accesso sezione Utenti",
    description: "Permette di vedere e accedere alla sezione Gestione Utenti nel pannello admin.",
    isSystem: true,
  },
  {
    key: "admin:staff",
    group: "Admin",
    label: "Accesso sezione Staff",
    description: "Permette di vedere e accedere alla sezione Gestione Staff nel pannello admin.",
    isSystem: true,
  },
  {
    key: "admin:roles",
    group: "Admin",
    label: "Accesso sezione Ruoli & Permessi",
    description: "Permette di vedere e gestire ruoli e matrice permessi nel pannello admin.",
    isSystem: true,
  },
  {
    key: "admin:logs",
    group: "Admin",
    label: "Accesso Log attività",
    description: "Permette di vedere il log delle attività nel pannello admin.",
    isSystem: true,
  },
  {
    key: "admin:moderation",
    group: "Admin",
    label: "Accesso sezione Moderazione",
    description: "Permette di vedere e gestire segnalazioni nella sezione Moderazione.",
    isSystem: true,
  },
  {
    key: "admin:billing",
    group: "Admin",
    label: "Accesso sezione Billing & Pagamenti",
    description: "[Futuro] Permette di vedere e gestire piani, transazioni e gateway di pagamento.",
    isSystem: true,
  },
  {
    key: "admin:tests",
    group: "Admin",
    label: "Accesso sezione Test Suite",
    description: "Permette di vedere il report Vitest e lo stato del sistema nella sezione Test Suite.",
    isSystem: true,
  },
  {
    key: "admin:sessions",
    group: "Admin",
    label: "Accesso sezione Sessions",
    description: "Permette di monitorare le sessioni utente attive e revocarle dal pannello admin.",
    isSystem: true,
  },
  {
    key: "admin:gdpr",
    group: "Admin",
    label: "Accesso sezione Compliance & GDPR",
    description: "Permette di vedere lo stato dei consensi, configurare le impostazioni privacy/GDPR e accedere agli strumenti di audit.",
    isSystem: true,
  },

  // ── Users ────────────────────────────────────────────────────────
  {
    key: "users:read",
    group: "Users",
    label: "Visualizza elenco utenti",
    description: "Lettura della lista utenti nel pannello admin.",
    isSystem: true,
  },
  {
    key: "users:edit",
    group: "Users",
    label: "Modifica profilo utente",
    description: "Aggiornamento dei dati profilo di qualsiasi utente.",
    isSystem: true,
  },
  {
    key: "users:delete",
    group: "Users",
    label: "Elimina utente",
    description: "Cancellazione (soft-delete) di un account utente.",
    isSystem: true,
  },
  {
    key: "users:ban",
    group: "Users",
    label: "Sospendi / riattiva utente",
    description: "Imposta o rimuove bannedAt su un utente.",
    isSystem: true,
  },
  {
    key: "users:role_assign",
    group: "Users",
    label: "Assegna ruoli",
    description: "Assegna o rimuove un ruolo a un utente.",
    isSystem: true,
  },
  {
    key: "users:permission_assign",
    group: "Users",
    label: "Assegna permessi individuali",
    description: "Assegna permessi direttamente a un utente (override rispetto al ruolo).",
    isSystem: true,
  },

  // ── Moderation ──────────────────────────────────────────────────
  {
    key: "moderation:read",
    group: "Moderation",
    label: "Visualizza segnalazioni",
    description: "Lettura delle segnalazioni e dei contenuti in revisione.",
    isSystem: true,
  },
  {
    key: "moderation:act",
    group: "Moderation",
    label: "Gestisci segnalazioni",
    description: "Approvazione, rifiuto e archiviazione delle segnalazioni.",
    isSystem: true,
  },

  // ── Content ───────────────────────────────────────────────────────
  {
    key: "content:read",
    group: "Content",
    label: "Leggi contenuti",
    description: "Lettura dei contenuti, inclusi quelli non ancora pubblicati.",
    isSystem: false,
  },
  {
    key: "content:create",
    group: "Content",
    label: "Crea contenuti",
    description: "Creazione di nuovi contenuti in bozza.",
    isSystem: false,
  },
  {
    key: "content:edit_own",
    group: "Content",
    label: "Modifica contenuti propri",
    description: "Aggiornamento dei contenuti creati dall'utente stesso.",
    isSystem: false,
  },
  {
    key: "content:edit_any",
    group: "Content",
    label: "Modifica qualsiasi contenuto",
    description: "Aggiornamento di contenuti di qualsiasi autore.",
    isSystem: false,
  },
  {
    key: "content:delete_own",
    group: "Content",
    label: "Elimina contenuti propri",
    description: "Cancellazione dei contenuti creati dall'utente stesso.",
    isSystem: false,
  },
  {
    key: "content:delete_any",
    group: "Content",
    label: "Elimina qualsiasi contenuto",
    description: "Cancellazione di contenuti di qualsiasi autore.",
    isSystem: false,
  },
  {
    key: "content:publish",
    group: "Content",
    label: "Pubblica senza approvazione",
    description: "Pubblica contenuti direttamente senza flusso editoriale.",
    isSystem: false,
  },

  // ── Profile ───────────────────────────────────────────────────────
  {
    key: "profile:read",
    group: "Profile",
    label: "Visualizza profilo personale",
    description: "Lettura dei propri dati profilo.",
    isSystem: false,
  },
  {
    key: "profile:edit",
    group: "Profile",
    label: "Modifica profilo personale",
    description: "Aggiornamento dei propri dati profilo.",
    isSystem: false,
  },
  {
    key: "profile:export",
    group: "Profile",
    label: "Esporta dati personali",
    description: "Esportazione dei propri dati (GDPR).",
    isSystem: false,
  },

  // ── Billing & Payments ────────────────────────────────────────────
  {
    key: "billing:read",
    group: "Billing",
    label: "Visualizza fatture e pagamenti",
    description: "[Futuro] Lettura di fatture, pagamenti e storico transazioni.",
    isSystem: true,
  },
  {
    key: "billing:manage_plans",
    group: "Billing",
    label: "Gestisci piani",
    description: "[Futuro] Creazione e modifica dei piani di abbonamento.",
    isSystem: true,
  },
  {
    key: "billing:manage_gateways",
    group: "Billing",
    label: "Configura gateway (Stripe…)",
    description: "[Futuro] Configurazione delle integrazioni con gateway di pagamento.",
    isSystem: true,
  },
  {
    key: "billing:issue_refund",
    group: "Billing",
    label: "Emetti rimborsi",
    description: "[Futuro] Autorizzazione e invio di rimborsi verso il gateway.",
    isSystem: true,
  },
  {
    key: "billing:view_transactions",
    group: "Billing",
    label: "Visualizza transazioni",
    description: "[Futuro] Lettura di tutte le transazioni processate.",
    isSystem: true,
  },
  {
    key: "billing:export",
    group: "Billing",
    label: "Esporta dati billing",
    description: "[Futuro] Export CSV/PDF di fatture e report finanziari.",
    isSystem: true,
  },

  // ── Subscriptions ─────────────────────────────────────────────────
  {
    key: "subscriptions:read",
    group: "Subscriptions",
    label: "Visualizza abbonamenti",
    description: "[Futuro] Lettura degli abbonamenti attivi (anche lato utente frontend).",
    isSystem: true,
  },
  {
    key: "subscriptions:manage",
    group: "Subscriptions",
    label: "Gestisci abbonamenti utenti",
    description: "[Futuro] Upgrade, downgrade e modifica del piano di un utente.",
    isSystem: true,
  },
  {
    key: "subscriptions:cancel",
    group: "Subscriptions",
    label: "Cancella abbonamenti",
    description: "[Futuro] Cancellazione forzata di un abbonamento attivo.",
    isSystem: true,
  },
  {
    key: "subscriptions:grant_trial",
    group: "Subscriptions",
    label: "Concedi accesso trial",
    description: "[Futuro] Attivazione manuale di un periodo di prova per un utente.",
    isSystem: true,
  },
];

/** Raggruppa SYSTEM_PERMISSIONS per group */
export function groupedSystemPermissions(): Map<string, SystemPermission[]> {
  const map = new Map<string, SystemPermission[]>();
  for (const p of SYSTEM_PERMISSIONS) {
    if (!map.has(p.group)) map.set(p.group, []);
    map.get(p.group)!.push(p);
  }
  return map;
}

/** Set di tutte le chiavi di sistema — utile per validazione rapida */
export const SYSTEM_PERMISSION_KEYS = new Set(
  SYSTEM_PERMISSIONS.map((p) => p.key)
);
