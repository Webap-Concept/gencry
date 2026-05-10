/**
 * lib/cron/expected-command.ts
 *
 * Helpers per ricostruire il comando `cron.schedule(...)` atteso a partire
 * dai metadati del cron job (jobname, schedule, path API) e dal dominio
 * configurato in settings.app_domain. Usato da:
 *
 *  - la sezione "Missing jobs" delle pagine admin/cron, per fornire un
 *    blocco SQL pronto da incollare nel SQL Editor di Supabase con il
 *    dominio sempre allineato al brand corrente
 *  - l'expanded view del singolo cron in CronJobsTable, per mostrare il
 *    comando atteso accanto a quello effettivamente registrato in pg_cron
 *    e segnalare drift (es. dopo un cambio dominio o un rebrand)
 */

export interface ExpectedCommandInput {
  jobname: string;
  schedule: string;
  /** API path, es. "/api/cron/account/gdpr-export" — DEVE iniziare con "/" */
  path: string;
  /** Dominio normalizzato senza slash finale (vedi getSiteUrl()) */
  baseUrl: string;
  /** Placeholder per il bearer (default "<CRON_SECRET>") perché il vero
   *  segreto non viene mai mostrato in admin */
  secretPlaceholder?: string;
}

/** Costruisce il blocco `SELECT cron.schedule(...)` da copiare in SQL Editor. */
export function buildScheduleStatement(input: ExpectedCommandInput): string {
  const url = `${input.baseUrl}${input.path}`;
  const secret = input.secretPlaceholder ?? "<CRON_SECRET>";
  return `SELECT cron.schedule(
  '${input.jobname}',
  '${input.schedule}',
  $$ SELECT net.http_get(
       url := '${url}',
       headers := jsonb_build_object('Authorization', 'Bearer ' || '${secret}')
     ); $$
);`;
}

/** Costruisce solo il body del comando (quello che pg_cron salva in
 *  `cron.job.command`), senza il wrapping di `cron.schedule`. È questo
 *  valore che viene confrontato con `job.command` per il drift check. */
export function buildExpectedCommandBody(input: Omit<ExpectedCommandInput, "jobname" | "schedule">): string {
  const url = `${input.baseUrl}${input.path}`;
  const secret = input.secretPlaceholder ?? "<CRON_SECRET>";
  return `SELECT net.http_get(
       url := '${url}',
       headers := jsonb_build_object('Authorization', 'Bearer ' || '${secret}')
     );`;
}

/**
 * Confronta il comando reale con quello atteso ignorando il bearer secret
 * (perché il vero segreto è sostituito da `<CRON_SECRET>` nell'expected) e
 * normalizzando whitespace. Restituisce true se i due "matchano".
 *
 * Strategia:
 *  - estrae l'URL da entrambi i comandi: se diversi → drift
 *  - se uno dei due non contiene URL, fallback al confronto normalizzato
 */
export function commandsMatch(actual: string, expected: string): boolean {
  const actualUrl = extractUrl(actual);
  const expectedUrl = extractUrl(expected);
  if (actualUrl && expectedUrl) {
    return actualUrl === expectedUrl;
  }
  return normalize(actual) === normalize(expected);
}

/** Estrae l'URL passato a `net.http_get(url := '...')` se presente. */
export function extractUrl(command: string): string | null {
  const m = command.match(/url\s*:=\s*'([^']+)'/i);
  return m ? m[1] : null;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
