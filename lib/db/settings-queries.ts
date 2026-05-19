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
  | 'modules.onboarding.enabled'  // 'true'|'false' — wizard /onboarding post-signup obbligatorio o saltato (modulo onboarding)
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
  // Moderation strike received (1° o 2° strike, l'autore di un contenuto
  // segnalato e accettato riceve avviso; ban automatico al 3°).
  | 'email_modstrike_subject'
  | 'email_modstrike_bcc'
  | 'email_modstrike_body'
  | 'email_modstrike_footer'
  // Moderation banned (3° strike → soft ban automatico via trigger DB).
  | 'email_modbanned_subject'
  | 'email_modbanned_bcc'
  | 'email_modbanned_body'
  | 'email_modbanned_footer'
  // Moderation strike revoked (un mod ha tolto uno strike — possibile
  // anche il rientro dal ban se count torna sotto 3).
  | 'email_modstrikerevoked_subject'
  | 'email_modstrikerevoked_bcc'
  | 'email_modstrikerevoked_body'
  | 'email_modstrikerevoked_footer'
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
  // Supabase Management API (per /admin/services/supabase + check PITR
  // nella sezione GDPR backup)
  | 'supabase_pat'        // Personal Access Token (PAT) supabase.com/dashboard/account/tokens
  | 'supabase_project_ref' // ref del progetto (es. "abcdefghij" da app.supabase.com URL)
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
  | 'gdpr.consent_log.retention_after_deletion_days' // max age (days) per consent_records; oltre vengono purgati dal cron consent-records-cleanup
  | 'gdpr.backup.tier'                               // 'none' | 'supabase_pitr' | 'external'
  | 'gdpr.backup.notes'                              // free-text per documentare il setup di backup
  // Verifica live del piano Supabase per PITR (popolato dall'azione
  // verifyPitrAction quando l'admin clicca "Verify PITR now").
  | 'gdpr.backup.pitr.last_verified_at'              // ISO timestamp ultima verifica
  | 'gdpr.backup.pitr.last_verified_tier'            // 'free' | 'pro' | 'team' | 'enterprise' | 'unknown'
  // External backup — campi strutturati per audit GDPR Art. 32.
  | 'gdpr.backup.external.provider'                  // free-text (es. "AWS S3", "Backblaze B2")
  | 'gdpr.backup.external.frequency'                 // 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'
  | 'gdpr.backup.external.retention_days'            // intero >= 0
  | 'gdpr.backup.external.last_verified_at'          // ISO date dell'ultima recovery test
  | 'gdpr.backup.external.last_verified_by'          // nome admin che ha confermato
  | 'gdpr.backup.external.recovery_test_notes'       // free-text (frequenza, esiti, RPO/RTO)
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
  | 'modules.prices.breaker_max_err'   // errori consecutivi prima di aprire il circuit breaker
  | 'modules.prices.breaker_window_s'  // finestra in secondi per il conteggio errori
  | 'modules.prices.breaker_open_s'    // durata apertura circuit breaker
  | 'modules.prices.snapshot_minutes'  // intervallo snapshot timeseries (sparkline)
  | 'modules.prices.retention_days'    // retention coin_prices in giorni
  | 'modules.prices.kv_ttl_seconds'    // TTL Upstash cache prezzi (default 30s)
  | 'modules.prices.coingecko_pro_enabled' // 'true'|'false' — usa endpoint Pro
  | 'modules.prices.coingecko_pro_api_key' // API key Pro (header x-cg-pro-api-key)
  | 'modules.prices.cryptocompare_api_key' // API key CryptoCompare (free, opzionale)
  // R2 storage per coin images. NB: account_id NON è qui — è tenant-global
  // in `storage.r2.account_id` (vedi project_modular_architecture
  // §"Per-modulo vs globale"). Token + bucket + URL restano per-modulo.
  | 'modules.prices.r2.access_key_id'
  | 'modules.prices.r2.secret_access_key'
  | 'modules.prices.r2.bucket'
  | 'modules.prices.r2.public_base_url'
  // Posts module — social feed (vedi project_module_posts_architecture)
  | 'modules.posts.max_body_length'              // lunghezza max body post (1..5000)
  | 'modules.posts.max_images_per_post'          // max immagini per post (1..10)
  | 'modules.posts.edit_window_minutes'          // finestra edit testo dopo create (0..1440, 0=disabilitato)
  | 'modules.posts.rate_limit_post_per_hour'     // sliding window KV — post creation
  | 'modules.posts.rate_limit_reaction_per_min'  // sliding window KV — reactions toggle
  | 'modules.posts.rate_limit_comment_per_min'   // sliding window KV — comment creation
  | 'modules.posts.rate_limit_repost_per_hour'   // sliding window KV — quote repost
  | 'modules.posts.rate_limit_report_per_hour'   // sliding window KV — abuse reports
  | 'modules.posts.rate_limit_media_per_hour'    // sliding window KV — media upload ticket
  | 'modules.posts.link_preview_cache_days'      // re-fetch OG > N giorni
  | 'modules.posts.outbox_retention_days'        // cleanup posts_outbox processed_at < now()-N
  | 'modules.posts.orphan_media_grace_hours'     // cleanup R2 posts_media confirmed_at IS NULL > N ore
  | 'modules.posts.deleted_grace_days'           // grace prima dell'hard-delete dei post soft-deleted (default 7)
  // Comments — thread 2-livelli (vedi project_module_posts_architecture §Comments)
  | 'modules.posts.comments.live_mode_post_page' // 'subscribe'|'poll'|'off' su /post/[id]
  | 'modules.posts.comments.live_mode_feed'      // 'subscribe'|'poll'|'off' su inline expand del feed
  | 'modules.posts.comments.poll_interval_seconds' // intervallo polling (5..120) quando mode=poll
  | 'modules.posts.comments.cache_ttl_seconds'   // unstable_cache TTL per i thread (0..300, 0=off)
  | 'modules.posts.comments.max_body_length'     // CHECK constraint allinea schema (100..2000)
  | 'modules.posts.comments.replies_initial_count' // numero di reply prefetched per root (0..10)
  // Modulo notifications (end-user social notifications)
  | 'modules.notifications.dedup_window_minutes'   // finestra anti-spam per fanout trigger (default 60)
  | 'modules.notifications.list_page_size'         // pagination /notifiche (default 30)
  | 'modules.notifications.retention_days'         // cron cleanup futuro (default 180)
  // Modulo news (curated content pipeline)
  | 'modules.news.rewrite_batch_size'              // cron rewrite N items/run
  | 'modules.news.publisher_batch_size'            // cron publisher N items/run
  | 'modules.news.max_published_per_day'           // guardrail UI: max articoli/giorno scheduling
  | 'modules.news.rewrite_max_attempts'            // tentativi LLM prima di status=failed
  | 'modules.news.ai_model'                        // 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001'
  | 'modules.news.fetch_max_items_per_source'      // limit per fetch RSS (anti-overload)
  | 'modules.news.proposed_retention_days'         // auto-reject proposed > N gg (default 7)
  | 'modules.news.anthropic_api_key'               // segret API key Anthropic — NON ENV, app_settings
  // R2 storage dedicato modulo posts (bucket `social-media`).
  // account_id letto da `storage.r2.account_id` globale.
  | 'modules.posts.r2.access_key_id'
  | 'modules.posts.r2.secret_access_key'
  | 'modules.posts.r2.bucket'
  | 'modules.posts.r2.public_base_url'
  // MFA policy (vedi /<adminSlug>/security/mfa)
  | 'mfa.enabled'             // 'true'|'false' — master switch della feature MFA
  | 'mfa.mode'                // 'optional'|'required-for-staff'|'required-for-all'
  | 'mfa.grace_period_days'   // giorni di tolleranza per account esistenti quando mode è required-*
  | 'mfa.issuer_label'        // label mostrata nelle authenticator app; vuoto = fallback ad app_name
  | 'mfa.required_since'      // ISO timestamp di quando mode è passato a required-*; null se optional
  // Admin URL slug — primo segmento dell'URL del pannello admin.
  // Validato in lib/admin-paths.ts (regex + reserved + collision check pages).
  // Cambiarlo da UI invalida ADMIN_URL_SLUG_TAG e aggiorna le righe pages
  // delle system page admin_home / admin_sign_in.
  | 'admin.url_slug'
  // IP lockdown admin — se 'true', il proxy ammette al pannello admin solo
  // gli IP che matchano una `ip_rules` con scope='admin'/'all' action='allow'.
  // Default 'false' (zero overhead). Vedi /admin/security/ip-rules.
  | 'admin.ip_lockdown_enabled'
  // CMS custom CSS — override editabile da /admin/content/styles.
  // Valore = stringa CSS arbitraria oppure null/empty = usa il default seed
  // (lib/cms/default-styles.ts). Servito da /api/cms/styles.css con cache
  // invalidata su save via revalidateTag('cms-styles').
  | 'cms.custom_css'
  // Sentry — error tracking + performance + session replay.
  // Tutte governate da /admin/services/sentry. Se `sentry.dsn` è null
  // o vuoto, l'init è no-op (Sentry non parte). I sample rates 0..1
  // sono persistiti come stringhe (es. '0.1'). Cambi al DSN/rate si
  // applicano al prossimo cold start della funzione serverless, non in
  // live (Sentry.init() viene chiamato una sola volta al boot).
  // Nota: org/project/auth_token NON vivono qui. Servono al build plugin
  // di @sentry/nextjs (next.config.ts) e vanno settati come env vars
  // SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN sul progetto Vercel —
  // il build gira prima che la funzione serverless esista, quindi non
  // può leggere il DB. La UI di /admin/services/sentry mostra un info box
  // che spiega questo punto.
  | 'sentry.dsn'                          // DSN pubblico (https://<key>@<org>.ingest.sentry.io/<id>)
  | 'sentry.environment'                  // 'production' | 'staging' | 'development' | custom string
  | 'sentry.traces_sample_rate'           // '0'..'1' — performance monitoring (default '0' = off)
  | 'sentry.replays_on_error_sample_rate' // '0'..'1' — session replay sull'errore (default '0' = off)
  | 'sentry.send_default_pii'             // 'true'|'false' — invia IP/email/headers utente (default 'false' per GDPR)
  // R2 storage per avatar utente — core feature (non-modulo). Bucket dedicato
  // `avatars` (separato dal bucket modulo prices/coins per isolamento token).
  // Se anche solo una chiave è vuota, l'upload avatar fallisce con errore
  // esplicito (no fallback Supabase: il refactor 2026-05-12 ha rimosso il
  // dual-backend per semplicità). Vedi /admin/services/storage-avatar.
  // R2 storage core — account Cloudflare globale + bucket dedicati per
  // servizio (token separati per isolamento di security). Vedi
  // /admin/services/cloudflare card "R2 Storage". Moduli (es. prices)
  // gestiscono il proprio R2 isolatamente sotto `modules.<slug>.r2.*`.
  | 'storage.r2.account_id'
  // Avatars bucket (user profile images)
  | 'storage.avatar.r2.access_key_id'
  | 'storage.avatar.r2.secret_access_key'
  | 'storage.avatar.r2.bucket'
  | 'storage.avatar.r2.public_base_url'
  // Config snapshot bucket — JSON di configurazione globale.
  // Vedi lib/config/snapshot-storage/. Niente public_base_url: S3 API privata.
  | 'storage.config.r2.access_key_id'
  | 'storage.config.r2.secret_access_key'
  | 'storage.config.r2.bucket'
  // Media library bucket (CMS uploads — /admin/content/media, page editor).
  | 'storage.media.r2.access_key_id'
  | 'storage.media.r2.secret_access_key'
  | 'storage.media.r2.bucket'
  | 'storage.media.r2.public_base_url'

export type AppSettings = {
  app_name: string
  app_description: string
  app_domain: string
  app_logo_url: string | null
  app_logo_variant_url: string | null
  app_favicon_url: string | null
  maintenance_mode: string
  registrations_enabled: string
  'modules.onboarding.enabled': string
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
  email_modstrike_subject: string | null
  email_modstrike_bcc: string | null
  email_modstrike_body: string | null
  email_modstrike_footer: string | null
  email_modbanned_subject: string | null
  email_modbanned_bcc: string | null
  email_modbanned_body: string | null
  email_modbanned_footer: string | null
  email_modstrikerevoked_subject: string | null
  email_modstrikerevoked_bcc: string | null
  email_modstrikerevoked_body: string | null
  email_modstrikerevoked_footer: string | null
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
  // Supabase Management API
  supabase_pat: string | null
  supabase_project_ref: string | null
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
  'gdpr.backup.pitr.last_verified_at': string | null
  'gdpr.backup.pitr.last_verified_tier': string | null
  'gdpr.backup.external.provider': string | null
  'gdpr.backup.external.frequency': string | null
  'gdpr.backup.external.retention_days': string | null
  'gdpr.backup.external.last_verified_at': string | null
  'gdpr.backup.external.last_verified_by': string | null
  'gdpr.backup.external.recovery_test_notes': string | null
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
  'modules.prices.breaker_max_err': string
  'modules.prices.breaker_window_s': string
  'modules.prices.breaker_open_s': string
  'modules.prices.snapshot_minutes': string
  'modules.prices.retention_days': string
  'modules.prices.kv_ttl_seconds': string
  'modules.prices.coingecko_pro_enabled': string
  'modules.prices.coingecko_pro_api_key': string | null
  'modules.prices.cryptocompare_api_key': string | null
  'modules.prices.r2.access_key_id': string | null
  'modules.prices.r2.secret_access_key': string | null
  'modules.prices.r2.bucket': string | null
  'modules.prices.r2.public_base_url': string | null
  // Modules — Posts (social feed)
  'modules.posts.max_body_length': string
  'modules.posts.max_images_per_post': string
  'modules.posts.edit_window_minutes': string
  'modules.posts.rate_limit_post_per_hour': string
  'modules.posts.rate_limit_reaction_per_min': string
  'modules.posts.rate_limit_comment_per_min': string
  'modules.posts.rate_limit_repost_per_hour': string
  'modules.posts.rate_limit_report_per_hour': string
  'modules.posts.rate_limit_media_per_hour': string
  'modules.posts.link_preview_cache_days': string
  'modules.posts.outbox_retention_days': string
  'modules.posts.orphan_media_grace_hours': string
  'modules.posts.deleted_grace_days': string
  'modules.posts.comments.live_mode_post_page': string
  'modules.posts.comments.live_mode_feed': string
  'modules.posts.comments.poll_interval_seconds': string
  'modules.posts.comments.cache_ttl_seconds': string
  'modules.posts.comments.max_body_length': string
  'modules.posts.comments.replies_initial_count': string
  'modules.notifications.dedup_window_minutes': string
  'modules.notifications.list_page_size': string
  'modules.notifications.retention_days': string
  'modules.posts.r2.access_key_id': string | null
  'modules.posts.r2.secret_access_key': string | null
  'modules.posts.r2.bucket': string | null
  'modules.posts.r2.public_base_url': string | null
  // Suspicious sessions / admin alerts
  'notifications.alerts_config': string | null
  'notifications.alerts_last_digest_at': string | null
  // MFA policy
  'mfa.enabled': string
  'mfa.mode': string
  'mfa.grace_period_days': string
  'mfa.issuer_label': string | null
  'mfa.required_since': string | null
  // Admin URL slug
  'admin.url_slug': string
  // IP lockdown admin: 'true' | 'false'
  'admin.ip_lockdown_enabled': string
  // CMS custom CSS
  'cms.custom_css': string | null
  // Sentry — error tracking + performance + replay
  'sentry.dsn': string | null
  'sentry.environment': string | null
  'sentry.traces_sample_rate': string
  'sentry.replays_on_error_sample_rate': string
  'sentry.send_default_pii': string
  // R2 storage per avatar utente (core feature)
  // Modulo news
  'modules.news.rewrite_batch_size': string
  'modules.news.publisher_batch_size': string
  'modules.news.max_published_per_day': string
  'modules.news.rewrite_max_attempts': string
  'modules.news.ai_model': string
  'modules.news.fetch_max_items_per_source': string
  'modules.news.proposed_retention_days': string
  'modules.news.anthropic_api_key': string | null
  'storage.r2.account_id': string | null
  'storage.avatar.r2.access_key_id': string | null
  'storage.avatar.r2.secret_access_key': string | null
  'storage.avatar.r2.bucket': string | null
  'storage.avatar.r2.public_base_url': string | null
  'storage.config.r2.access_key_id': string | null
  'storage.config.r2.secret_access_key': string | null
  'storage.config.r2.bucket': string | null
  'storage.media.r2.access_key_id': string | null
  'storage.media.r2.secret_access_key': string | null
  'storage.media.r2.bucket': string | null
  'storage.media.r2.public_base_url': string | null
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
  'modules.onboarding.enabled': 'true',
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
  email_modstrike_subject: null,
  email_modstrike_bcc: null,
  email_modstrike_body: null,
  email_modstrike_footer: null,
  email_modbanned_subject: null,
  email_modbanned_bcc: null,
  email_modbanned_body: null,
  email_modbanned_footer: null,
  email_modstrikerevoked_subject: null,
  email_modstrikerevoked_bcc: null,
  email_modstrikerevoked_body: null,
  email_modstrikerevoked_footer: null,
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
  supabase_pat: null,
  supabase_project_ref: null,
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
  'gdpr.backup.pitr.last_verified_at': null,
  'gdpr.backup.pitr.last_verified_tier': null,
  'gdpr.backup.external.provider': null,
  'gdpr.backup.external.frequency': null,
  'gdpr.backup.external.retention_days': null,
  'gdpr.backup.external.last_verified_at': null,
  'gdpr.backup.external.last_verified_by': null,
  'gdpr.backup.external.recovery_test_notes': null,
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
  'modules.prices.breaker_max_err': '3',
  'modules.prices.breaker_window_s': '300',
  'modules.prices.breaker_open_s': '600',
  'modules.prices.snapshot_minutes': '5',
  'modules.prices.retention_days': '30',
  'modules.prices.kv_ttl_seconds': '30',
  'modules.prices.coingecko_pro_enabled': 'false',
  'modules.prices.coingecko_pro_api_key': null,
  'modules.prices.cryptocompare_api_key': null,
  'modules.prices.r2.access_key_id': null,
  'modules.prices.r2.secret_access_key': null,
  'modules.prices.r2.bucket': null,
  'modules.prices.r2.public_base_url': null,
  // Modules — Posts (social feed). Duplicano i defaults della migration M_posts_001.
  'modules.posts.max_body_length': '2000',
  'modules.posts.max_images_per_post': '4',
  'modules.posts.edit_window_minutes': '10',
  'modules.posts.rate_limit_post_per_hour': '10',
  'modules.posts.rate_limit_reaction_per_min': '60',
  'modules.posts.rate_limit_comment_per_min': '30',
  'modules.posts.rate_limit_repost_per_hour': '5',
  'modules.posts.rate_limit_report_per_hour': '5',
  'modules.posts.rate_limit_media_per_hour': '20',
  'modules.posts.link_preview_cache_days': '30',
  'modules.posts.outbox_retention_days': '30',
  'modules.posts.orphan_media_grace_hours': '24',
  'modules.posts.deleted_grace_days': '7',
  // Comments — thread 2-livelli (PR-comments, vedi project_module_posts_architecture).
  'modules.posts.comments.live_mode_post_page': 'subscribe',
  'modules.posts.comments.live_mode_feed': 'subscribe',
  'modules.posts.comments.poll_interval_seconds': '20',
  'modules.posts.comments.cache_ttl_seconds': '30',
  'modules.posts.comments.max_body_length': '2000',
  'modules.posts.comments.replies_initial_count': '3',
  'modules.notifications.dedup_window_minutes': '60',
  'modules.notifications.list_page_size': '30',
  'modules.notifications.retention_days': '180',
  // Modulo news — defaults preset "alpha" del CapacityProfile (vedi
  // lib/modules/news/manifest.ts). L'admin può sovrascrivere via UI.
  'modules.news.rewrite_batch_size': '3',
  'modules.news.publisher_batch_size': '5',
  'modules.news.max_published_per_day': '2',
  'modules.news.rewrite_max_attempts': '3',
  'modules.news.ai_model': 'claude-sonnet-4-6',
  'modules.news.fetch_max_items_per_source': '10',
  'modules.news.proposed_retention_days': '7',
  'modules.news.anthropic_api_key': null,
  'modules.posts.r2.access_key_id': null,
  'modules.posts.r2.secret_access_key': null,
  'modules.posts.r2.bucket': 'social-media',
  'modules.posts.r2.public_base_url': null,
  // Suspicious sessions: la chiave è null finché l'admin non salva una
  // configurazione dalla UI; il loader applica i defaults Zod-side.
  'notifications.alerts_config': null,
  'notifications.alerts_last_digest_at': null,
  // MFA defaults: feature on, modalità opzionale (utente decide), grace 7 gg.
  // issuer_label vuoto = il prompt nell'authenticator usa app_name.
  'mfa.enabled': 'true',
  'mfa.mode': 'optional',
  'mfa.grace_period_days': '7',
  'mfa.issuer_label': null,
  // Settato automaticamente quando mode passa da optional a required-*.
  // Da qui parte il countdown del grace period per gli utenti esistenti.
  'mfa.required_since': null,
  // Admin URL slug — default 'admin'. Cambiabile da UI; vedi lib/admin-paths.ts.
  'admin.url_slug': 'admin',
  // IP lockdown admin — default 'false' = zero overhead nel proxy.
  'admin.ip_lockdown_enabled': 'false',
  // CMS custom CSS — null = nessun override, l'API serve il default seed
  // da lib/cms/default-styles.ts. L'admin lo edita da /admin/content/styles.
  'cms.custom_css': null,
  // Sentry — defaults conservativi: spento finché l'admin non incolla un
  // DSN. Sample rates a 0 = solo errori (zero overhead). PII off per
  // GDPR (l'admin può attivarlo se policy lo permette).
  'sentry.dsn': null,
  'sentry.environment': null,
  'sentry.traces_sample_rate': '0',
  'sentry.replays_on_error_sample_rate': '0',
  'sentry.send_default_pii': 'false',
  // R2 storage per avatar — null finché l'admin non configura via
  // /admin/services/storage-avatar. Tutte e 5 le chiavi richieste per
  // upload funzionante (no fallback Supabase).
  'storage.r2.account_id': null,
  'storage.avatar.r2.access_key_id': null,
  'storage.avatar.r2.secret_access_key': null,
  'storage.avatar.r2.bucket': null,
  'storage.avatar.r2.public_base_url': null,
  // Config snapshot R2 — bucket dedicato per i file JSON di configurazione
  // (app_settings, system page slugs, ...). Vedi lib/config/.
  // Nessun `public_base_url` perché l'accesso è S3 API privata, mai pubblico.
  'storage.config.r2.access_key_id': null,
  'storage.config.r2.secret_access_key': null,
  'storage.config.r2.bucket': null,
  // Media library R2 — bucket dedicato per gli upload del CMS
  // (/admin/content/media + editor pagine). Egress R2 = $0, fondamentale
  // per asset serviti su pagine pubbliche/SEO. Tutte e 5 le chiavi richieste
  // per upload funzionante (no fallback Supabase).
  'storage.media.r2.access_key_id': null,
  'storage.media.r2.secret_access_key': null,
  'storage.media.r2.bucket': null,
  'storage.media.r2.public_base_url': null,
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

/**
 * Lettura RAW da DB senza passare per il sistema snapshot. Esiste solo per
 * spezzare il chicken-egg del snapshot system: per LEGGERE lo snapshot R2
 * servono le credenziali R2, e quelle credenziali stanno nei settings →
 * loop. Le funzioni del layer `lib/config/snapshot-storage/` chiamano QUESTA
 * (mai `getAppSettings`) per caricare la propria config R2.
 *
 * NON usare nei caller applicativi normali: paga 1 query DB ogni volta,
 * non è cached. Tutto il resto del codice usa `getAppSettings`.
 */
export const fetchAppSettingsRaw = fetchAppSettings;

/**
 * Hot path "global" — cached via React `cache()` per request E (quando R2
 * snapshot è configurato) servito da file JSON in R2 invece che da DB. Vedi
 * lib/config/snapshots/app-settings.ts per la strategia di cache cross-
 * request, ETag check e bootstrap.
 *
 * Fallback chain:
 *   1. R2 configurato + snapshot OK → letti da R2 (~1-2ms, no DB)
 *   2. R2 non configurato → fallback DB (comportamento legacy, backward compat)
 *   3. R2 configurato ma errore → log + fallback DB
 */
async function getAppSettingsImpl(): Promise<AppSettings> {
  // Lazy import per evitare circular dependency: snapshot-storage importa
  // fetchAppSettingsRaw da QUESTO modulo.
  const { readAppSettingsSnapshot, SnapshotUnavailableError } = await import(
    "@/lib/config/snapshots"
  );
  try {
    return await readAppSettingsSnapshot();
  } catch (err) {
    if (err instanceof SnapshotUnavailableError) {
      // R2 non configurato: comportamento legacy, lettura diretta DB.
      // Nessun log: è il caso supportato per chi non ha ancora configurato R2.
      return fetchAppSettings();
    }
    // R2 configurato ma read fallita: log + fallback DB. NON throwa così
    // l'app continua a funzionare anche con R2 down.
    // eslint-disable-next-line no-console
    console.error(
      "[settings] snapshot read failed, falling back to DB",
      err,
    );
    return fetchAppSettings();
  }
}

export const getAppSettings = cache(getAppSettingsImpl);

/**
 * "Non bloccante" variant of getAppSettings for public-facing call
 * sites where a transient DB error should NOT translate into a 500:
 * the CMS catch-all router (app/(cms)/_render/cms-page.tsx) is
 * the main consumer — losing the appName for one render is not great
 * but is much better than 500 in front of unauthenticated visitors.
 *
 * Falls back to DEFAULTS on failure, logs a warning, never throws.
 *
 * Do NOT use in authenticated layouts. As the note on
 * getCachedAppSettings (lib/seo.ts) explains, those paths want the
 * error boundary, not a silent partial — a fallback admin slug or
 * MFA toggle could route real admins into an inconsistent state.
 */
export async function getAppSettingsSafe(): Promise<AppSettings> {
  try {
    return await getAppSettings()
  } catch (err) {
    console.warn(
      '[getAppSettingsSafe] fetchAppSettings failed, returning DEFAULTS',
      err,
    )
    return { ...DEFAULTS }
  }
}

/**
 * Postgres advisory lock ID per serializzare le scritture su app_settings.
 * Numero arbitrario unico nel progetto (~1000 = "app_settings"). Se serve
 * un secondo lock altrove, usa un numero diverso.
 *
 * Perché serializzare:
 *   A → UPDATE("app_name") commit, SYNC R2 in volo
 *   B → UPDATE("logo") commit, SYNC R2 (legge A+B, scrive)
 *   A → SYNC R2 termina (scrive snapshot CON SOLO A) ← perdita di B!
 * Con il lock, A finisce TUTTO (UPDATE + SYNC R2) prima che B inizi.
 */
const APP_SETTINGS_LOCK_ID = 1001;

/**
 * Sync dello snapshot dentro la transaction corrente. Riceve la transazione
 * (`tx`) per leggere lo stato fresco senza uscire dal lock.
 *
 * Speciale per credenziali R2 stesse: se l'admin modifica
 * `storage.config.r2.*`, invalidiamo anche lo storage cache prima del sync,
 * così le nuove credenziali sono usate immediatamente.
 */
// Drizzle's transaction callback passes a PgTransaction, which exposes
// the same query builder API as `db` but with a different TypeScript type.
// We accept it via a structural type with the methods we need.
type SettingsTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function syncSnapshotAfterMutationInTx(
  tx: SettingsTx,
  changedKeys: SettingKey[],
): Promise<void> {
  try {
    const r2KeysChanged = changedKeys.some((k) =>
      k.startsWith("storage.config.r2.") || k === "storage.r2.account_id",
    );
    if (r2KeysChanged) {
      const { invalidateSnapshotStorageCache } = await import(
        "@/lib/config/snapshot-storage"
      );
      invalidateSnapshotStorageCache();
    }
    // Leggi il fresh state direttamente dalla transaction (vede le UPDATE
    // appena committed/staged della stessa transaction, evita 2ª query DB
    // e soprattutto evita race con altre lambda).
    const rows = await tx.select().from(appSettings);
    const data = { ...DEFAULTS } as AppSettings;
    for (const row of rows) {
      if (row.key in data && row.value !== null) {
        ;(data as Record<string, string | null>)[row.key] = row.value;
      }
    }
    const { syncAppSettingsSnapshotWithData } = await import(
      "@/lib/config/snapshots"
    );
    await syncAppSettingsSnapshotWithData(data, null);
  } catch (err) {
    // R2 down o config mancante: log e continua. Il DB resta sorgente di
    // verità, quindi i caller che fallback DB vedono comunque il dato fresco.
    // eslint-disable-next-line no-console
    console.error("[settings] snapshot sync failed after mutation", err);
  }
}

/**
 * Wrapper per esecuzione di mutation con advisory lock. Garantisce che 2+
 * save admin concorrenti si serializzino: la seconda aspetta che la prima
 * abbia completato UPDATE + sync R2 (entrambi dentro la stessa transaction).
 */
async function withSettingsLock<T>(
  fn: (tx: SettingsTx) => Promise<T>,
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${APP_SETTINGS_LOCK_ID})`);
    return await fn(tx);
  });
}

/**
 * Batch update: 2 query totali invece di 2×N. Aggiorna updatedAt solo sulle
 * righe che cambiano davvero, preservando il comportamento di updateAppSetting.
 *
 * Atomicità: tutto dentro `withSettingsLock` → la sync R2 vede i dati
 * DELLA STESSA transaction (post-UPDATE) e nessuna altra save admin può
 * intercalarsi finché qui non termina.
 */
export async function batchUpdateAppSettings(
  updates: Partial<Record<SettingKey, string | null>>,
): Promise<void> {
  const entries = Object.entries(updates) as [SettingKey, string | null][];
  if (entries.length === 0) return;

  await withSettingsLock(async (tx) => {
    const keys = entries.map(([k]) => k) as string[];
    const existing = await tx
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings)
      .where(inArray(appSettings.key, keys));

    const existingMap = new Map(existing.map((r) => [r.key, r.value]));
    const changed = entries.filter(([key, value]) => existingMap.get(key) !== value);
    if (changed.length === 0) return;

    const now = new Date();
    await tx
      .insert(appSettings)
      .values(changed.map(([key, value]) => ({ key, value, updatedAt: now })))
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
      });

    await syncSnapshotAfterMutationInTx(tx, changed.map(([k]) => k));
  });
}

export async function updateAppSetting(key: SettingKey, value: string | null) {
  await withSettingsLock(async (tx) => {
    // Bumpa updated_at SOLO se il valore cambia davvero. Senza questo check,
    // un Save "a vuoto" del form admin azzera il timer di rotazione delle
    // chiavi (il sistema notifiche usa updated_at come "last rotated at").
    const existing = await tx
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);

    if (existing.length === 0) {
      await tx.insert(appSettings).values({ key, value, updatedAt: new Date() });
      await syncSnapshotAfterMutationInTx(tx, [key]);
      return;
    }

    if (existing[0].value === value) return; // no-op: niente bump di updated_at

    await tx
      .update(appSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(appSettings.key, key));

    await syncSnapshotAfterMutationInTx(tx, [key]);
  });
}
