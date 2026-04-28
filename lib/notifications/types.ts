// Tipi del framework notifiche admin.
// Ogni "generatore" e' una funzione pura che ritorna lo stato atteso del
// mondo: un array di candidate. Il dispatcher fa il diff con quanto e'
// attualmente attivo nel DB e riconcilia (insert/update/auto-resolve).

export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationCandidate = {
  type: string;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  link?: string;
  /**
   * Chiave deterministica per l'idempotenza. Lo stesso problema deve
   * sempre produrre la stessa dedupKey (es. `rotation:google_client_secret`).
   * UNIQUE nella tabella: se esiste, il dispatcher aggiorna invece di duplicare.
   */
  dedupKey: string;
  metadata?: Record<string, unknown>;
};

export type NotificationGenerator = {
  /** Identifica il tipo nel DB. Tutti i candidati emessi devono avere questo `type`. */
  type: string;
  /** Permesso RBAC necessario per vedere queste notifiche (es. "admin:settings"). */
  requiredPermission: string;
  /** Restituisce lo stato atteso ora: array delle notifiche che devono essere attive. */
  run: () => Promise<NotificationCandidate[]>;
};
