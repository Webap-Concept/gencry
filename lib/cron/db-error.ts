// lib/cron/db-error.ts
//
// Estrae un messaggio diagnostico dal throw di una query DB.
//
// Drizzle (postgres-js) wrappa l'errore in un DrizzleQueryError il cui
// `message` è "Failed query: <sql>\nparams: ..." — utile per sapere QUALE
// query, inutile per sapere COSA è andato storto. L'errore Postgres reale
// (PostgresError, con `code`/`detail`/`constraint`) vive in `err.cause`.
// Questo helper preferisce la cause così i log/alert cron mostrano la causa
// vera (es. "consent_records is append-only: DELETE not allowed · code=23001")
// invece del solo "Failed query".

export function describeDbError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  // Drizzle mette il PostgresError originale in `.cause`. Se non c'è,
  // l'errore stesso è già quello "vero".
  const cause = (err as { cause?: unknown }).cause;
  const pg = cause instanceof Error ? cause : err;
  const field = (k: string): string | null => {
    const v = (pg as unknown as Record<string, unknown>)[k];
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  const parts: string[] = [pg.message];
  const code = field("code");
  const detail = field("detail");
  const constraint = field("constraint_name") ?? field("constraint");
  const hint = field("hint");
  if (code) parts.push(`code=${code}`);
  if (constraint) parts.push(`constraint=${constraint}`);
  if (detail) parts.push(`detail=${detail}`);
  if (hint) parts.push(`hint=${hint}`);
  return parts.join(" · ");
}
