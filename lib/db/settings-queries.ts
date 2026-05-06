// lib/db/settings-queries.ts
import { db } from '@/lib/db/drizzle'
import { appSettings } from '@/lib/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { cache } from 'react'

export type SettingKey =
  | 'app_name'
  | 'app_description'
  | 'app_domain'
  | 'app_logo_url'
  | 'app_logo_variant_url'
  | 'app_favicon_url'
  | 'maintenance_mode'
  | 'registrations_enabled'
  | 'default_role'
  | 'resend_api_key'
  | 'email_from_name'
  | 'email_from_address'
  | 'email_logo_choice'        // "logo" | "logo-variant" | "none"
  // Welcome email
  | 'email_welcome_subject'
  | 'email_welcome_bcc'
  | 'email_welcome_body'
  | 'email_welcome_footer'
  // Signup verification
  | 'email_signup_subject'
  | 'email_signup_bcc'
  | 'email_signup_body'
  | 'email_signup_footer'
  // Password reset
  | 'email_reset_subject'
  | 'email_reset_bcc'
  | 'email_reset_body'
  | 'email_reset_footer'
  // User deleted
  | 'email_deleted_subject'
  | 'email_deleted_bcc'
  | 'email_deleted_body'
  | 'email_deleted_footer'
  // Waiting list (landing page coming-soon)
  | 'email_waitinglist_subject'
  | 'email_waitinglist_bcc'
  | 'email_waitinglist_body'
  | 'email_waitinglist_footer'
  // Email change verification (cambio email da /settings/account)
  | 'email_emailchange_subject'
  | 'email_emailchange_bcc'
  | 'email_emailchange_body'
  | 'email_emailchange_footer'
  // Device verification (login da nuovo dispositivo)
  | 'email_device_subject'
  | 'email_device_bcc'
  | 'email_device_body'
  | 'email_device_footer'
  // Staff invitation (invito a far parte dello staff)
  | 'email_staffinvite_subject'
  | 'email_staffinvite_bcc'
  | 'email_staffinvite_body'
  | 'email_staffinvite_footer'
  // GDPR export ready (export dati pronto per il download da /settings/privacy)
  | 'email_gdprexport_subject'
  | 'email_gdprexport_bcc'
  | 'email_gdprexport_body'
  | 'email_gdprexport_footer'
  // Account deletion requested (conferma post-richiesta soft-delete da /settings/privacy)
  | 'email_accountdeletion_subject'
  | 'email_accountdeletion_bcc'
  | 'email_accountdeletion_body'
  | 'email_accountdeletion_footer'
  // Account deletion OTP (codice 6-cifre per utenti OAuth-only senza password)
  | 'email_accountdeletionotp_subject'
  | 'email_accountdeletionotp_bcc'
  | 'email_accountdeletionotp_body'
  | 'email_accountdeletionotp_footer'
  // MFA enabled (notifica security-touchpoint dopo attivazione TOTP)
  | 'email_mfaenabled_subject'
  | 'email_mfaenabled_bcc'
  | 'email_mfaenabled_body'
  | 'email_mfaenabled_footer'
  // MFA disabled (notifica security-touchpoint dopo disattivazione TOTP)
  | 'email_mfadisabled_subject'
  | 'email_mfadisabled_bcc'
  | 'email_mfadisabled_body'
  | 'email_mfadisabled_footer'
  // MFA reset by admin (utente ha contattato il supporto, admin ha resettato)
  | 'email_mfaadminreset_subject'
  | 'email_mfaadminreset_bcc'
  | 'email_mfaadminreset_body'
  | 'email_mfaadminreset_footer'
  // SEO
  | 'robots_txt'
  | 'humans_txt'
  // Bruteforce — contesti separati
  | 'bf_signin_max'       // max tentativi login per IP+email (finestra bf_window_minutes)
  | 'bf_signup_max'       // max tentativi registrazione per IP (finestra bf_window_minutes)
  | 'bf_check_max'        // max check email/username per IP (finestra bf_check_window)
  | 'bf_check_window'     // finestra in minuti per i check disponibilità
  | 'bf_window_minutes'
  | 'bf_lockout_minutes'
  | 'bf_alert_threshold'
  // Redis / Upstash
  | 'upstash_redis_rest_url'
  | 'upstash_redis_rest_token'
  // Google OAuth
  | 'google_client_id'
  | 'google_client_secret'
  | 'google_redirect_uri'
  // GitHub CI (per la dashboard /admin/tests che legge il vitest report
  // dal branch ci-results del repo via GitHub Contents API)
  | 'github_repo'         // formato "owner/repo"
  | 'github_pat'          // fine-grained PAT con Contents:Read
  | 'github_ci_branch'    // default "ci-results"
  // Cloudflare Turnstile
  | 'cf_turnstile_site_key'
  | 'cf_turnstile_secret_key'
  // Notifiche admin — timestamp dell'ultimo run del dispatcher (throttle 1h).
  // Valore: ISO 8601 string oppure null.
  | 'notifications_dispatcher_last_run'
  // ── Suspicious sessions / admin alerts ────────────────────────────────
  // JSON serializzato (Zod-validated) con destinatari email, schedule
  // digest, dry_run flag e thresholds per-heuristic. Vedi
  // lib/sessions/suspicious/config.ts per lo schema.
  | 'notifications.alerts_config'
  // ISO timestamp dell'ultimo digest spedito — usato per throttle
  // hourly/daily senza dover joinare la tabella session_alerts.
  | 'notifications.alerts_last_digest_at'
  // ── Modules ─────────────────────────────────────────────────────────
  // Convenzione: `modules.<slug>.<key>`. I moduli social plugabili
  // espongono qui sotto le proprie chiavi (vedi lib/modules/registry.ts).
  // ── GDPR / Compliance ───────────────────────────────────────────────
  // Tutte le chiavi sono governate dalla sezione admin /admin/compliance/gdpr.
  // Convenzione: 'gdpr.<area>.<key>'. I valori bool sono persistiti come 'true'/'false'.
  | 'gdpr.consent_log.enabled'                       // master switch: scrivere su consent_records
  | 'gdpr.consent_log.capture_ip'                    // salva IP all'accept
  | 'gdpr.consent_log.ip_strategy'                   // 'full' | 'mask_last_octet' | 'hash_only'
  | 'gdpr.consent_log.capture_user_agent'            // salva UA browser all'accept
  | 'gdpr.consent_log.hash_policy_text'              // SHA-256 del testo policy all'accept
  | 'gdpr.consent_log.retention_after_deletion_days' // mantieni consent_records dopo purge utente
  | 'gdpr.backup.tier'                               // 'none' | 'supabase_pitr' | 'external'
  | 'gdpr.backup.notes'                              // free-text per documentare il setup di backup
  | 'gdpr.deletion.grace_days'                       // grace period soft-delete prima del purge fisico
  | 'gdpr.export.rate_limit_days'                    // intervallo minimo fra due export per utente
  | 'gdpr.policy.force_reconsent_on_change'          // forza modal riconsenso al login dopo bump versione
  | 'gdpr.policy.reconsent_grace_days'               // giorni di grace prima che il banner diventi bloccante
  | 'gdpr.policy.notifications_cron_minutes'         // intervallo cron policy-change-notifications
  | 'gdpr.cookie_banner.enabled'                     // master switch banner cookie pubblico (4 categorie + gating analytics)
  // Email policy-update (notifica all'utente che una policy è cambiata)
  | 'email_policyupdate_subject'
  | 'email_policyupdate_bcc'
  | 'email_policyupdate_body'
  | 'email_policyupdate_footer'
  // Prices Engine
  | 'modules.prices.cron_minutes'      // intervallo cron sync prezzi (1..60)
  | 'modules.prices.universe_hours'    // finestra "active universe" (1..168)
  | 'modules.prices.delta_threshold'   // soglia upsert (0..1), es. 0.0005 = 0.05%
  | 'modules.prices.kv_ttl_seconds'    // TTL cache KV per prezzi correnti
  | 'modules.prices.breaker_max_err'   // errori consecutivi prima di aprire il circuit breaker
  | 'modules.prices.breaker_window_s'  // finestra in secondi per il conteggio errori
  | 'modules.prices.breaker_open_s'    // durata apertura circuit breaker
  | 'modules.prices.snapshot_minutes'  // intervallo snapshot timeseries (sparkline)
  | 'modules.prices.retention_days'    // retention coin_prices in giorni
  | 'modules.prices.coingecko_pro_enabled' // 'true'|'false' — usa endpoint Pro
  | 'modules.prices.coingecko_pro_api_key' // API key Pro (header x-cg-pro-api-key)

export type AppSettings = {
  app_name: string
  app_description: string
  app_domain: string
  app_logo_url: string | null
  app_logo_variant_url: string | null
  app_favicon_url: string | null
  maintenance_mode: string
  registrations_enabled: string
  default_role: string
  resend_api_key: string | null
  email_from_name: string | null
  email_from_address: string | null
  email_logo_choice: string
  email_welcome_subject: string | null
  email_welcome_bcc: string | null
  email_welcome_body: string | null
  email_welcome_footer: string | null
  email_signup_subject: string | null
  email_signup_bcc: string | null
  email_signup_body: string | null
  email_signup_footer: string | null
  email_reset_subject: string | null
  email_reset_bcc: string | null
  email_reset_body: string | null
  email_reset_footer: string | null
  email_deleted_subject: string | null
  email_deleted_bcc: string | null
  email_deleted_body: string | null
  email_deleted_footer: string | null
  email_waitinglist_subject: string | null
  email_waitinglist_bcc: string | null
  email_waitinglist_body: string | null
  email_waitinglist_footer: string | null
  email_emailchange_subject: string | null
  email_emailchange_bcc: string | null
  email_emailchange_body: string | null
  email_emailchange_footer: string | null
  email_device_subject: string | null
  email_device_bcc: string | null
  email_device_body: string | null
  email_device_footer: string | null
  email_staffinvite_subject: string | null
  email_staffinvite_bcc: string | null
  email_staffinvite_body: string | null
  email_staffinvite_footer: string | null
  email_gdprexport_subject: string | null
  email_gdprexport_bcc: string | null
  email_gdprexport_body: string | null
  email_gdprexport_footer: string | null
  email_accountdeletion_subject: string | null
  email_accountdeletion_bcc: string | null
  email_accountdeletion_body: string | null
  email_accountdeletion_footer: string | null
  email_accountdeletionotp_subject: string | null
  email_accountdeletionotp_bcc: string | null
  email_accountdeletionotp_body: string | null
  email_accountdeletionotp_footer: string | null
  email_mfaenabled_subject: string | null
  email_mfaenabled_bcc: string | null
  email_mfaenabled_body: string | null
  email_mfaenabled_footer: string | null
  email_mfadisabled_subject: string | null
  email_mfadisabled_bcc: string | null
  email_mfadisabled_body: string | null
  email_mfadisabled_footer: string | null
  email_mfaadminreset_subject: string | null
  email_mfaadminreset_bcc: string | null
  email_mfaadminreset_body: string | null
  email_mfaadminreset_footer: string | null
  robots_txt: string | null
  humans_txt: string | null
  // Bruteforce — contesti separati
  bf_signin_max: string
  bf_signup_max: string
  bf_check_max: string
  bf_check_window: string
  bf_window_minutes: string
  bf_lockout_minutes: string
  bf_alert_threshold: string
  // Redis / Upstash
  upstash_redis_rest_url: string | null
  upstash_redis_rest_token: string | null
  // Google OAuth
  google_client_id: string | null
  google_client_secret: string | null
  google_redirect_uri: string | null
  // GitHub CI
  github_repo: string | null
  github_pat: string | null
  github_ci_branch: string | null
  // Cloudflare Turnstile
  cf_turnstile_site_key: string | null
  cf_turnstile_secret_key: string | null
  // GDPR / Compliance
  'gdpr.consent_log.enabled': string
  'gdpr.consent_log.capture_ip': string
  'gdpr.consent_log.ip_strategy': string
  'gdpr.consent_log.capture_user_agent': string
  'gdpr.consent_log.hash_policy_text': string
  'gdpr.consent_log.retention_after_deletion_days': string
  'gdpr.backup.tier': string
  'gdpr.backup.notes': string | null
  'gdpr.deletion.grace_days': string
  'gdpr.export.rate_limit_days': string
  'gdpr.policy.force_reconsent_on_change': string
  'gdpr.policy.reconsent_grace_days': string
  'gdpr.policy.notifications_cron_minutes': string
  'gdpr.cookie_banner.enabled': string
  email_policyupdate_subject: string | null
  email_policyupdate_bcc: string | null
  email_policyupdate_body: string | null
  email_policyupdate_footer: string | null
  // Modules — Prices Engine
  'modules.prices.cron_minutes': string
  'modules.prices.universe_hours': string
  'modules.prices.delta_threshold': string
  'modules.prices.kv_ttl_seconds': string
  'modules.prices.breaker_max_err': string
  'modules.prices.breaker_window_s': string
  'modules.prices.breaker_open_s': string
  'modules.prices.snapshot_minutes': string
  'modules.prices.retention_days': string
  'modules.prices.coingecko_pro_enabled': string
  'modules.prices.coingecko_pro_api_key': string | null
  // Suspicious sessions / admin alerts
  'notifications.alerts_config': string | null
  'notifications.alerts_last_digest_at': string | null
}

const DEFAULTS: AppSettings = {
  app_name: "Nome dell'app",
  app_description: "Descrizione dell'app",
  app_domain: '',
  app_logo_url: null,
  app_logo_variant_url: null,
  app_favicon_url: null,
  maintenance_mode: 'false',
  registrations_enabled: 'true',
  default_role: 'member',
  resend_api_key: null,
  email_from_name: null,
  email_from_address: null,
  email_logo_choice: 'logo',
  email_welcome_subject: null,
  email_welcome_bcc: null,
  email_welcome_body: null,
  email_welcome_footer: null,
  email_signup_subject: null,
  email_signup_bcc: null,
  email_signup_body: null,
  email_signup_footer: null,
  email_reset_subject: null,
  email_reset_bcc: null,
  email_reset_body: null,
  email_reset_footer: null,
  email_deleted_subject: null,
  email_deleted_bcc: null,
  email_deleted_body: null,
  email_deleted_footer: null,
  email_waitinglist_subject: null,
  email_waitinglist_bcc: null,
  email_waitinglist_body: null,
  email_waitinglist_footer: null,
  email_emailchange_subject: null,
  email_emailchange_bcc: null,
  email_emailchange_body: null,
  email_emailchange_footer: null,
  email_device_subject: null,
  email_device_bcc: null,
  email_device_body: null,
  email_device_footer: null,
  email_staffinvite_subject: null,
  email_staffinvite_bcc: null,
  email_staffinvite_body: null,
  email_staffinvite_footer: null,
  email_gdprexport_subject: null,
  email_gdprexport_bcc: null,
  email_gdprexport_body: null,
  email_gdprexport_footer: null,
  email_accountdeletion_subject: null,
  email_accountdeletion_bcc: null,
  email_accountdeletion_body: null,
  email_accountdeletion_footer: null,
  email_accountdeletionotp_subject: null,
  email_accountdeletionotp_bcc: null,
  email_accountdeletionotp_body: null,
  email_accountdeletionotp_footer: null,
  email_mfaenabled_subject: null,
  email_mfaenabled_bcc: null,
  email_mfaenabled_body: null,
  email_mfaenabled_footer: null,
  email_mfadisabled_subject: null,
  email_mfadisabled_bcc: null,
  email_mfadisabled_body: null,
  email_mfadisabled_footer: null,
  email_mfaadminreset_subject: null,
  email_mfaadminreset_bcc: null,
  email_mfaadminreset_body: null,
  email_mfaadminreset_footer: null,
  robots_txt: null,
  humans_txt: null,
  // Bruteforce defaults
  bf_signin_max: '5',       // 5 tentativi login falliti → blocco
  bf_signup_max: '10',      // 10 tentativi registrazione per IP → blocco
  bf_check_max: '30',       // 30 check email/username in 5 min → blocco
  bf_check_window: '5',     // finestra check: 5 minuti
  bf_window_minutes: '15',
  bf_lockout_minutes: '30',
  bf_alert_threshold: '20',
  upstash_redis_rest_url: null,
  upstash_redis_rest_token: null,
  google_client_id: null,
  google_client_secret: null,
  google_redirect_uri: null,
  github_repo: null,
  github_pat: null,
  github_ci_branch: 'ci-results',
  cf_turnstile_site_key: null,
  cf_turnstile_secret_key: null,
  // GDPR / Compliance — defaults conservativi.
  // L'effettivo logging su consent_records resta off finché l'admin non
  // attiva esplicitamente `gdpr.consent_log.enabled` (richiede prima la
  // creazione della tabella, fatta in PR successiva).
  'gdpr.consent_log.enabled': 'false',
  'gdpr.consent_log.capture_ip': 'true',
  'gdpr.consent_log.ip_strategy': 'full',
  'gdpr.consent_log.capture_user_agent': 'true',
  'gdpr.consent_log.hash_policy_text': 'true',
  'gdpr.consent_log.retention_after_deletion_days': '1825', // 5 anni
  'gdpr.backup.tier': 'none',
  'gdpr.backup.notes': null,
  'gdpr.deletion.grace_days': '30',
  'gdpr.export.rate_limit_days': '7',
  'gdpr.policy.force_reconsent_on_change': 'false',
  'gdpr.policy.reconsent_grace_days': '14',
  'gdpr.policy.notifications_cron_minutes': '60',
  'gdpr.cookie_banner.enabled': 'false',
  email_policyupdate_subject: null,
  email_policyupdate_bcc: null,
  email_policyupdate_body: null,
  email_policyupdate_footer: null,
  // Modules — Prices Engine. Duplicano i defaults della migration M_prices_001
  // (sicurezza: la migration potrebbe non essere stata eseguita in dev locale).
  'modules.prices.cron_minutes': '5',
  'modules.prices.universe_hours': '24',
  'modules.prices.delta_threshold': '0.0005',
  'modules.prices.kv_ttl_seconds': '30',
  'modules.prices.breaker_max_err': '3',
  'modules.prices.breaker_window_s': '300',
  'modules.prices.breaker_open_s': '600',
  'modules.prices.snapshot_minutes': '5',
  'modules.prices.retention_days': '30',
  'modules.prices.coingecko_pro_enabled': 'false',
  'modules.prices.coingecko_pro_api_key': null,
  // Suspicious sessions: la chiave è null finché l'admin non salva una
  // configurazione dalla UI; il loader applica i defaults Zod-side.
  'notifications.alerts_config': null,
  'notifications.alerts_last_digest_at': null,
}

async function fetchAppSettings(): Promise<AppSettings> {
  const rows = await db.select().from(appSettings)
  const result: AppSettings = { ...DEFAULTS }
  for (const row of rows) {
    if (row.key in result && row.value !== null) {
      ;(result as Record<string, string | null>)[row.key] = row.value
    }
  }
  return result
}

export const getAppSettings = cache(fetchAppSettings)

/**
 * Batch update: 2 query totali invece di 2×N. Aggiorna updatedAt solo sulle
 * righe che cambiano davvero, preservando il comportamento di updateAppSetting.
 */
export async function batchUpdateAppSettings(
  updates: Partial<Record<SettingKey, string | null>>,
): Promise<void> {
  const entries = Object.entries(updates) as [SettingKey, string | null][];
  if (entries.length === 0) return;

  const keys = entries.map(([k]) => k) as string[];
  const existing = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, keys));

  const existingMap = new Map(existing.map((r) => [r.key, r.value]));
  const changed = entries.filter(([key, value]) => existingMap.get(key) !== value);
  if (changed.length === 0) return;

  const now = new Date();
  await db
    .insert(appSettings)
    .values(changed.map(([key, value]) => ({ key, value, updatedAt: now })))
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
    });
}

export async function updateAppSetting(key: SettingKey, value: string | null) {
  // Bumpa updated_at SOLO se il valore cambia davvero. Senza questo check,
  // un Save "a vuoto" del form admin azzera il timer di rotazione delle
  // chiavi (il sistema notifiche usa updated_at come "last rotated at").
  const existing = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1)

  if (existing.length === 0) {
    await db.insert(appSettings).values({ key, value, updatedAt: new Date() })
    return
  }

  if (existing[0].value === value) return // no-op: niente bump di updated_at

  await db
    .update(appSettings)
    .set({ value, updatedAt: new Date() })
    .where(eq(appSettings.key, key))
}
