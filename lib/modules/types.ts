// lib/modules/types.ts
// Tipi condivisi per il sistema "moduli". Ogni modulo del social espone un
// ModuleManifest che il core legge per costruire nav, route, cron, e tab
// utenti senza modificare il core stesso.
import type { NavChild } from "@/lib/admin-nav";

export interface ModuleCronJob {
  /** Path della route Next, es. "/api/cron/modules/prices/sync" */
  path: string;
  /** Cron schedule espressivo, formato Vercel Cron (5 campi) */
  schedule: string;
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

export interface ModuleManifest {
  /** Identificativo univoco del modulo (slug url-safe) */
  slug: string;
  /** Etichetta principale */
  label: string;
  description: string;
  version: string;
  /** Nome icona lucide-react usata nella nav */
  icon: string;
  /** Permesso RBAC base del modulo, es. "modules:prices" */
  permission: string;
  /** Voci di nav esposte sotto la sezione "Modules" */
  navChildren: NavChild[];
  /** Cron jobs da registrare in vercel.json (oggi manuale) */
  cronJobs: ModuleCronJob[];
  /** Eventuale tab opzionale dentro la pagina utente del core admin */
  userTab?: ModuleUserTab;
}
