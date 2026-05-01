// lib/db/settings-queries.ts
import { db } from '@/lib/db/drizzle'
import { appSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
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
  // Prices Engine (modulo prezzi crypto). Tutti i valori sono stringhe e
  // vengono parsati lato app. Vedi migration 0026 per i range.
  | 'prices_cron_minutes'      // intervallo cron sync prezzi (1..60)
  | 'prices_universe_hours'    // finestra "active universe" (6..168)
  | 'prices_delta_threshold'   // soglia upsert come float, es. 0.0005 = 0.05%
  | 'prices_kv_ttl_seconds'    // TTL cache KV per prezzi correnti
  | 'prices_breaker_max_err'   // errori consecutivi prima di aprire il circuit breaker
  | 'prices_breaker_window_s'  // finestra in secondi per il conteggio errori
  | 'prices_breaker_open_s'    // durata apertura circuit breaker
  | 'prices_snapshot_minutes'  // intervallo snapshot timeseries (sparkline)
  | 'prices_retention_days'    // retention coin_prices in giorni

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
  // Prices Engine
  prices_cron_minutes: string
  prices_universe_hours: string
  prices_delta_threshold: string
  prices_kv_ttl_seconds: string
  prices_breaker_max_err: string
  prices_breaker_window_s: string
  prices_breaker_open_s: string
  prices_snapshot_minutes: string
  prices_retention_days: string
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
  // Prices Engine — duplicano i defaults della migration 0026 (sicurezza:
  // la migration potrebbe non essere stata eseguita in dev locale).
  prices_cron_minutes: '5',
  prices_universe_hours: '24',
  prices_delta_threshold: '0.0005',
  prices_kv_ttl_seconds: '30',
  prices_breaker_max_err: '3',
  prices_breaker_window_s: '300',
  prices_breaker_open_s: '600',
  prices_snapshot_minutes: '5',
  prices_retention_days: '30',
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
