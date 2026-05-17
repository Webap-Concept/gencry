// lib/modules/types.ts
// Tipi condivisi per il sistema "moduli". Ogni modulo del social espone un
// ModuleManifest che il core legge per costruire nav, route, cron, e tab
// utenti senza modificare il core stesso.
import type { NavChild } from "@/lib/admin-nav";

export interface ModuleCronJob {
  /** pg_cron jobname (cron.job.jobname). Identifica univocamente il job e
   *  fa da chiave per la UI admin di gestione cron. */
  jobname: string;
  /** Path della route Next chiamata dal job, es. "/api/cron/modules/prices/sync" */
  path: string;
  /** Cron schedule espressivo, formato pg_cron (5 campi). Solo display:
   *  la fonte di verità è cron.job.schedule. */
  schedule: string;
  /** Etichetta human-readable nella UI admin */
  label: string;
  /** Descrizione breve di cosa fa il job */
  description: string;
  /** Per cosa serve / perché esiste (motivazione di business) */
  purpose: string;
}

export interface ModuleUserTab {
  /** Identificativo del tab nella query string ?tab=... */
  key: string;
  /** Etichetta visibile in UI */
  label: string;
  /** Permission RBAC necessaria per vedere il tab; default = quella del modulo */
  permission?: string;
  /** Lazy import del componente che renderizza il tab.
   *  Riceve { userId, ... } via props del wrapper nel core. */
  loadComponent: () => Promise<{
    default: React.ComponentType<{ userId: string }>;
  }>;
}

export interface ModulePermission {
  /** Chiave RBAC, es. "modules:prices" o "modules:prices.write" */
  key: string;
  /** Label visibile nel pannello permessi admin */
  label: string;
  /** Descrizione opzionale (tooltip / help text) */
  description?: string;
}

export interface ModuleManifest {
  /** Identificativo univoco del modulo (slug url-safe) */
  slug: string;
  /** Etichetta principale */
  label: string;
  description: string;
  version: string;
  /** Nome icona lucide-react usata nella nav */
  icon: string;
  /** Permesso RBAC base del modulo, es. "modules:prices".
   *  Usato dalla nav e dai guard route. Deve esistere in `permissions`. */
  permission: string;
  /** Label leggibile per il permesso `permission`. Usato dal seed RBAC. */
  permissionLabel: string;
  /** Permessi addizionali oltre `permission` (es. fine-grained read/write).
   *  Quando presenti, vengono seedati anch'essi e diventano selezionabili
   *  nel pannello /admin/access/permissions. */
  extraPermissions?: ModulePermission[];
  /** Voci di nav esposte sotto la sezione "Modules" */
  navChildren: NavChild[];
  /** Cron jobs da registrare in vercel.json (oggi manuale) */
  cronJobs: ModuleCronJob[];
  /** Eventuale tab opzionale dentro la pagina utente del core admin */
  userTab?: ModuleUserTab;
  /** Capacity profiles: dichiarazione macchina-leggibile delle feature
   *  configurabili a scala del modulo. Array di profili, uno per ogni
   *  "scope autonomo" (es. comments, rate-limits, retention, media).
   *  Ogni profilo ha i suoi resources/tunables/presets indipendenti.
   *  Letto dalla UI admin (form tunables filtra per scope) + dashboard
   *  /admin/capacity (aggrega tutti i scope di tutti i moduli).
   *  Convenzione obbligatoria per moduli con tunables a scala. */
  capacityProfiles?: CapacityProfile[];
}

/**
 * Tier di scala dichiarato dal modulo. Usato come default selection nei
 * preset + status badge nel dashboard /admin/capacity.
 */
export type CapacityTier = "alpha" | "beta" | "growth" | "scale";

export interface CapacityResource {
  /** Nome leggibile del provider (es. "Supabase Realtime"). */
  name: string;
  /** Tier corrente del piano (es. "Free", "Pro", "Pay-as-you-go"). */
  plan: string;
  /** Limits applicabili al tier corrente (es. ["200 conn concorrenti",
   *  "2M msg/mese"]). Stringhe libere mostrate come bullet list. */
  limits: string[];
  /** Stima del trigger di upgrade (es. "Pro a 1k MAU concorrenti"). */
  upgradeAt: string;
  /** Cosa fare quando si raggiunge `upgradeAt` (es. "Upgrade a Supabase
   *  Pro ($25/mo) oppure swap a Ably/Pusher via service hookable"). */
  upgradePath: string;
  /** Link doc del provider per quick reference. */
  docsUrl?: string;
}

export interface CapacityTunable {
  /** Setting key in app_settings (es. "modules.posts.comments.poll_interval_seconds"). */
  key: string;
  label: string;
}

export interface CapacityPreset {
  id: CapacityTier;
  label: string;
  /** 1 riga: cosa cambia + per che scala è ottimale. */
  description: string;
  /** Mappa setting key → valore stringa (verrà scritto in app_settings
   *  via Server Action quando l'admin clicca "Apply preset"). */
  values: Record<string, string>;
}

export interface CapacityProfile {
  /** Scope identifier univoco nel modulo (es. "comments", "rate-limits",
   *  "retention", "media"). Letto dai form admin per filtrare quale
   *  profilo mostrare. Regola: 1 scope per "feature autonoma" del
   *  modulo, non 1 per ogni setting. */
  scope: string;
  /** Label leggibile mostrata come header del form/card. */
  label: string;
  /** Tier corrente in cui il modulo opera. Mostrato come badge. */
  currentTier: CapacityTier;
  resources: CapacityResource[];
  tunables: CapacityTunable[];
  presets: CapacityPreset[];
}
