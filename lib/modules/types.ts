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

/**
 * GDPR data export hook esposto dal modulo. Il core export
 * (`lib/account/gdpr-export.ts`) raccoglie i dati base dell'utente +
 * itera questo registry per chiedere ad ogni modulo "dammi i dati di
 * questo userId che sono di tua competenza".
 *
 * Il default export del modulo dinamico è una function async
 * `(userId) => Promise<unknown>` che ritorna l'oggetto serializzabile.
 * Il payload risultante finisce sotto `modules.<key>` del JSON
 * dell'export (vedi GDPR_EXPORT_SCHEMA_VERSION).
 *
 * Convenzioni operative:
 *   - INCLUDE solo dati DELL'UTENTE (suoi post, suoi commenti, sue
 *     reactions). Mai body di contenuti di terzi (es. body di un post
 *     altrui che l'utente ha bookmarkato → solo postId + timestamp).
 *   - Truncation cap consigliato (10k entries) con flag `truncated`.
 *   - Niente segreti (token, hash). Niente dati di altri utenti che
 *     potrebbero violare la loro privacy.
 */
export interface ModuleGdprExport {
  /** Slug dello modulo nel payload finale, es. "posts" → modules.posts. */
  key: string;
  /** Lazy import di `() => default(userId)`. Server-only. */
  loadCollector: () => Promise<{
    default: (userId: string) => Promise<unknown>;
  }>;
}

/**
 * Sitemap pubblica esposta dal modulo. Solo metadata declarativo: il file
 * fisico app/<...>/sitemap.ts continua a vivere nel modulo, il manifest
 * lo "annuncia" al core CMS (per la dashboard admin /admin/seo/sitemap
 * e per le righe `Sitemap:` del robots.txt).
 */
export interface ModuleSitemap {
  /** Path pubblico, root-relative, della sitemap. Es. "/coins/sitemap.xml". */
  url: string;
  /** Label visibile nella dashboard admin. Es. "Coin pages". */
  label: string;
  /** Lazy import di una function async che ritorna { count, lastModified }
   *  per la card admin. Eseguita SOLO quando l'admin apre la pagina
   *  sitemap (mai al boot del registry). Safe-to-fail: se errore o
   *  assente, la card mostra solo URL + bottone "Apri".
   *
   *  Convenzione: il default export del modulo dinamico (es.
   *  `./sitemap-stats.ts`) è la function stessa, così l'import è
   *  un tree-shakable side-effect-free chunk. */
  loadStats?: () => Promise<{
    default: () => Promise<{ count: number; lastModified: Date | null }>;
  }>;
}

/**
 * Scaling trigger dichiarato dal modulo. Il widget admin
 * `<ScalingTriggersWidget>` (e l'aggregator `collectAllScalingTriggers`)
 * raccoglie tutti gli scalingTriggers dei moduli installati + i core
 * triggers cross-cutting e renderizza una tile per ognuno con valore
 * corrente vs threshold (semaforo verde/giallo/rosso) + link al design
 * memo "cosa fare quando si attiva".
 *
 * Filosofia: il source-of-truth dei trigger di scaling vive accanto al
 * codice del modulo (manifest), non in documentazione separata. Quando
 * un modulo viene rimosso/uninstallato, i suoi trigger spariscono dal
 * widget automaticamente.
 */
export interface ScalingTrigger {
  /** Id stabile, namespaced col modulo (es. "posts.post-cache-hit-rate"). */
  id: string;
  /** Etichetta human-readable nel widget. */
  label: string;
  /** Breve descrizione del "cosa misura e perché". Mostrata in tooltip. */
  description: string;
  /**
   * Lazy import server-only di una probe live che misura il valore corrente.
   * Safe-to-fail: ritorna `{ error }` se la probe non può misurare
   * (credenziali mancanti, API down). Il renderer mostra "n/d" + warning.
   *
   * `value` è null per i trigger marcati `manualCheck` (probe non possibile).
   * `unit` è una stringa libera ("%", "DAU", "MB", "connections").
   * `formatted` opzionale override del rendering (es. "3.5K").
   *
   * Convenzione: il default export del file dinamico = function async.
   */
  loadMeasure?: () => Promise<{
    default: () => Promise<{
      value: number | null;
      unit: string;
      formatted?: string;
      error?: string;
    }>;
  }>;
  /** Soglia oltre la quale (o sotto la quale, vedi `direction`) il trigger
   *  diventa "critical" e va azione. */
  threshold: number;
  /** Soglia "warn" — heads-up prima del critical. Default 0.75 * threshold
   *  per `higher-is-worse`, 1.5 * threshold per `lower-is-worse`. */
  warnThreshold?: number;
  /**
   * - `higher-is-worse`: il valore supera la soglia → bad (es. DAU vs cap).
   * - `lower-is-worse`: il valore scende sotto la soglia → bad (es. hit rate).
   */
  direction: "higher-is-worse" | "lower-is-worse";
  /** Unità mostrata nel widget (override del unit della probe quando serve). */
  displayUnit?: string;
  /** Escape hatch immediato manuale, mostrato accanto al trigger quando
   *  status >= warn. Es. "passa live_mode_post_page da subscribe a poll
   *  in /admin/modules/posts/settings". */
  softMitigation?: string;
  /** Link al design memo / architecture page che spiega cosa fare quando
   *  il trigger si attiva. */
  action: { docsHref: string; summary: string };
  /** Se true: nessuna probe automatica disponibile. Il widget mostra
   *  "manual check needed" + link al dashboard esterno. Utile per
   *  metriche che richiedono accesso a UI provider (Supabase Realtime). */
  manualCheck?: boolean;
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

  /**
   * Hook post-write chiamati dal modulo posts dopo eventi di contenuto.
   * Permettono ai moduli (es. rewards) di reagire a createPost/createComment
   * SENZA che posts/actions.ts importi direttamente dal modulo.
   * Isolamento: rimuovere il modulo = rimuoverlo da INSTALLED_MODULES,
   * senza toccare posts/actions.ts.
   *
   * Tutte le funzioni sono fire-and-forget: errori devono essere swallowati
   * internamente. Non devono mai bloccare o lanciare verso il chiamante.
   */
  postHooks?: {
    afterPostCreated?:    (userId: string, postId: string)    => Promise<void>;
    afterCommentCreated?: (userId: string, commentId: string) => Promise<void>;
  };

  // layoutShell è deliberatamente ASSENTE dal manifest:
  // path di componenti UI nel manifest vengono tracciati staticamente dal
  // bundler e finiscono nel client bundle (postgres/fs error). Il layout
  // usa isModuleInstalled(slug) + import() hardcoded per ogni modulo.
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
  /** Costo mensile dichiarato del piano corrente (USD). Aggiornato a mano
   *  quando si fa upgrade reale del piano. Sommato dalla dashboard
   *  capacity per il totale "stai spendendo $X/mo in capacity". 0 = free.
   *  Note: NON include overage runtime (es. comandi Upstash sopra il free
   *  tier). Per costi accurati, fare cross-check col dashboard del provider. */
  monthlyCost?: number;
  /** Lazy import server-only di una probe live che legge l'usage corrente
   *  dall'API del provider. Eseguita solo quando l'admin apre la pagina
   *  capacity (mai al boot). Safe-to-fail: ritornare `{ error }` se token
   *  mancante o API down — la card mostra solo i dati dichiarati.
   *
   *  Return può essere:
   *    - singolo `CapacityUsageProbe` (1 metrica, es. Sentry "errori mese")
   *    - array di `CapacityUsageProbe` (più metriche per la stessa
   *      risorsa, es. Upstash "commands mese" + "commands oggi")
   *    - `{ error }` se la chiamata fallisce — il renderer mostra
   *      messaggio "non disponibile" + codice nel tooltip.
   *
   *  Convenzione: `default` export = function async. */
  loadUsage?: () => Promise<{
    default: () => Promise<
      CapacityUsageProbe | CapacityUsageProbe[] | { error: string }
    >;
  }>;
}

/**
 * Snapshot di uso live di una risorsa esterna, restituito dai probe
 * (`CapacityResource.loadUsage`). Mostra "siamo a 1.2 GB / 8 GB" o
 * "45k / 100k commands oggi".
 */
export interface CapacityUsageProbe {
  /** Valore corrente misurato. */
  current: number;
  /** Limite del tier (es. 500_000 per Upstash Free commands/mese).
   *  Null quando la metrica non ha un cap dichiarato (es. "commands
   *  oggi" — Upstash non fissa una quota giornaliera nel free 2026,
   *  ma vogliamo comunque vedere il numero). Renderer skip la barra
   *  + percentuale quando null. */
  max: number | null;
  /** Unità i18n-friendly: "commands", "GB", "invocations", ecc. */
  unit: string;
  /** 0..1 — percentuale di utilizzo. Renderer la ignora se `max` è null. */
  percent: number;
  /** Periodo di misura ("daily" | "monthly" | "concurrent"). i18n key. */
  period: string;
  /** Quando il dato è stato letto dalla provider API. */
  measuredAt: Date;
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
  /** Tunables/presets opzionali. I profili core dei servizi di sistema
   *  (vedi `lib/admin/capacity/core-profiles.ts`) non hanno preset per-
   *  scope perché i parametri di sistema (es. pool DB, statement timeout)
   *  non sono "preset di feature" — sono settings globali. Il dashboard
   *  widget gestisce graceful l'assenza. I moduli applicativi (posts,
   *  news, ecc.) DEVONO continuare a dichiararli per il form preset. */
  tunables?: CapacityTunable[];
  presets?: CapacityPreset[];
}
