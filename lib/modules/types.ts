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
}
