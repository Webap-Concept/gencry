import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Postgres ha `inet` nativo (singolo IP v4/v6) e `cidr` (range con prefix).
// Usiamo `inet` per entrambi: accetta sia "1.2.3.4" che "10.0.0.0/8" che IPv6.
// Il driver `postgres.js` restituisce/accetta stringhe direttamente, quindi
// niente parsing custom — il cast lo fa il DB.
const inet = customType<{ data: string; driverData: string }>({
  dataType() {
    return "inet";
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  // Nullable: gli utenti registrati via OAuth non hanno password
  passwordHash: text("password_hash"),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  isAdmin: boolean("is_admin").notNull().default(false),
  bannedAt: timestamp("banned_at"),
  bannedReason: varchar("banned_reason", { length: 255 }),
  // Counter denormalizzato 0..3 dei strike attivi (revoked_at IS NULL).
  // Aggiornato via trigger users_strikes_sync_count_trg su INSERT/
  // UPDATE/DELETE di users_strikes. Al raggiungimento di 3 il trigger
  // setta automaticamente banned_at. Vedi M_users_strikes_001.
  activeStrikesCount: integer("active_strikes_count").notNull().default(0),
  emailVerified: boolean("email_verified").notNull().default(false),
  acceptedTermsAt: timestamp("accepted_terms_at"),
  acceptedTermsVersion: text("accepted_terms_version"),
  acceptedPrivacyAt: timestamp("accepted_privacy_at"),
  acceptedPrivacyVersion: text("accepted_privacy_version"),
  acceptedMarketingAt: timestamp("accepted_marketing_at"),
  acceptedMarketingVersion: text("accepted_marketing_version"),
  // Null = onboarding non completato (deve compilarlo prima di usare l'app)
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  // Email change in 2 step: nuova email proposta in attesa di verifica.
  // pendingEmail: target del cambio (null = nessuna richiesta attiva)
  // pendingEmailRequestedAt: timestamp dell'ultima richiesta — usato sia per
  // tracciare la richiesta attiva sia per il rate-limit (1/giorno). Non viene
  // azzerato su cancel/confirm: il limite vale anche dopo annullamento.
  pendingEmail: varchar("pending_email", { length: 255 }),
  pendingEmailRequestedAt: timestamp("pending_email_requested_at"),
  // Preferenza locale dell'utente (es. "it", "en"). Null = segui detection
  // chain (cookie / Accept-Language / default app). Sovrascrive il cookie
  // per le zone non-prefix (admin, settings, profilo, ecc.).
  locale: varchar("locale", { length: 5 }),
  /** Visibilità del profilo pubblico (/u/<username>):
   *  - "public": chiunque (anche anon) vede header + feed
   *  - "protected": header visibile, ma il feed posts richiede follow
   *    approvato. No-op v1 (modulo follows non ancora attivo).
   *  Aggiunto 2026-05-21 via M_users_profile_001_visibility.sql. */
  profileVisibility: varchar("profile_visibility", { length: 20 })
    .notNull()
    .default("public")
    .$type<"public" | "protected">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  username: varchar("username", { length: 50 }).unique(),
  // Avatar: URL immagine profilo (caricata dall'utente o importata da OAuth)
  avatarUrl: text("avatar_url"),
  // Headline (frase breve, ~160 char): visibile sotto username nei
  // contesti compatti (sidebar, popover utente). Pattern LinkedIn.
  headline: varchar("headline", { length: 160 }),
  // Bio estesa: visibile nella pagina profilo per intero.
  bio: text("bio"),
  // Interessi crypto scelti durante l'onboarding (mock — implementazione vera in seguito)
  interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Strike history (sistema moderazione YouTube-like). Vedi
// M_users_strikes_001 per schema completo + trigger denorm. Append-only:
// gli strike non si cancellano, si revocano via revoked_at/revoked_by.
// source_id è soft-FK (no REFERENCES) per preservare la history se il
// contenuto target viene hard-cancellato in futuro.
export const usersStrikes = pgTable("users_strikes", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  issuedBy: uuid("issued_by").notNull(),
  sourceType: varchar("source_type", { length: 16 }).notNull(),
  sourceId: uuid("source_id").notNull(),
  sourcePreview: text("source_preview"),
  reason: varchar("reason", { length: 40 }).notNull(),
  note: text("note"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: uuid("revoked_by"),
  revokeNote: text("revoke_note"),
});

export type UserStrike = typeof usersStrikes.$inferSelect;
export type NewUserStrike = typeof usersStrikes.$inferInsert;
export type StrikeSourceType = "post" | "comment";

export const userSubscriptions = pgTable("user_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripeProductId: varchar("stripe_product_id", { length: 255 }),
  planName: varchar("plan_name", { length: 100 }),
  subscriptionStatus: varchar("subscription_status", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// OAuth accounts (Google, future: X, Web3...)
// ---------------------------------------------------------------------------
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id:                serial("id").primaryKey(),
    userId:            uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider:          varchar("provider", { length: 32 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    accessToken:       text("access_token"),
    refreshToken:      text("refresh_token"),
    expiresAt:         timestamp("expires_at"),
    scope:             varchar("scope", { length: 500 }),
    createdAt:         timestamp("created_at").notNull().defaultNow(),
    updatedAt:         timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_oauth_provider_account").on(t.provider, t.providerAccountId),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  subscription: one(userSubscriptions, {
    fields: [users.id],
    references: [userSubscriptions.userId],
  }),
  oauthAccounts: many(oauthAccounts),
  mfaTotp: one(userMfaTotp, {
    fields: [users.id],
    references: [userMfaTotp.userId],
  }),
  mfaRecoveryCodes: many(mfaRecoveryCodes),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

export const userSubscriptionsRelations = relations(
  userSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [userSubscriptions.userId],
      references: [users.id],
    }),
  }),
);

export const roles = pgTable("roles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  label: varchar("label", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#6b7280"),
  description: text("description"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSystem: boolean("is_system").notNull().default(false),
  level: integer("level").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  // Default dashboard preset for users with this role. NULL = registry defaults.
  dashboardWidgets: jsonb("dashboard_widgets").$type<
    | { enabled: string[] }
    | { items: Array<{ id: string; x: number; y: number; w: number; h: number }> }
    | null
  >(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  label: varchar("label", { length: 150 }).notNull(),
  description: text("description"),
  group: varchar("group", { length: 100 }).notNull().default("Generale"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    granted: boolean("granted").notNull().default(true),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_user_permissions_user_perm").on(t.userId, t.permissionId),
  ],
);

export const pageTemplates = pgTable("page_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  rules: text("rules").default("{}"),
  thumbnail: text("thumbnail"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const templateFields = pgTable("template_fields", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  templateId: integer("template_id")
    .notNull()
    .references(() => pageTemplates.id, { onDelete: "cascade" }),
  fieldKey: varchar("field_key", { length: 100 }).notNull(),
  fieldType: varchar("field_type", { length: 50 }).notNull().default("text"),
  label: varchar("label", { length: 150 }).notNull(),
  placeholder: varchar("placeholder", { length: 255 }),
  required: boolean("required").notNull().default(false),
  defaultValue: text("default_value"),
  options: text("options").default("{}"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const pageTemplatesRelations = relations(pageTemplates, ({ many }) => ({
  fields: many(templateFields),
}));

export const templateFieldsRelations = relations(templateFields, ({ one }) => ({
  template: one(pageTemplates, {
    fields: [templateFields.templateId],
    references: [pageTemplates.id],
  }),
}));

export const SYSTEM_PAGE_KEYS = [
  "terms",
  "privacy",
  "marketing",
  "cookie",
  "not_found",
  // Auth routes hardcoded — non hanno content modificabile, l'admin
  // gestisce solo titolo (per la lista) e i meta SEO. La rotta vera è
  // servita da app/(login)/<slug>/page.tsx; la system page in `pages`
  // è solo container amministrativo.
  "sign_in",
  "sign_up",
  "verify_email",
  "forgot_password",
  "reset_password",
  // Altre rotte di sistema "meta-only" che non hanno content CMS:
  // - "home" → "/" (slug vuoto), servita dal page handler della homepage
  // - "admin_home" → "/admin", landing del pannello admin
  // - "admin_sign_in" → "/admin/sign-in", login admin (vedi ADMIN_SIGNIN_ROUTE)
  // NB: la system_key "news" è stata droppata dalla migration
  // M_news_007_categories_as_pages — la pagina /news è ora una normal CMS
  // page legata al template `news-home`, non più una system meta-only page.
  "home",
  "admin_home",
  "admin_sign_in",
] as const;
export type SystemPageKey = (typeof SYSTEM_PAGE_KEYS)[number];

/**
 * System pages with an editable slug.
 *
 * Empty by policy: NO system page is slug-editable from the admin UI.
 * Previously terms/privacy/marketing/cookie were editable because their
 * routing is served by the CMS catch-all, but uniform "system slug =
 * canonical English" simplifies UX (locale tab no longer needs to swap
 * the slug) and ops (slug → page handler mapping is 1:1).
 *
 * If you ever need to rename one of these slugs, do it via SQL in the
 * Supabase editor — and update the page handlers / proxy alongside.
 */
export const SYSTEM_PAGE_KEYS_EDITABLE_SLUG: readonly SystemPageKey[] = [];

/**
 * Restituisce true se lo slug della pagina può essere modificato.
 * Le user pages (isSystem=false) hanno sempre slug editabile.
 * Le system pages lo hanno solo se la systemKey è nella whitelist.
 */
export function isSystemSlugEditable(page: {
  isSystem: boolean;
  systemKey: SystemPageKey | null;
}): boolean {
  if (!page.isSystem) return true;
  if (!page.systemKey) return true;
  return SYSTEM_PAGE_KEYS_EDITABLE_SLUG.includes(page.systemKey);
}

export const pages = pgTable("pages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  parentId: integer("parent_id"),
  templateId: integer("template_id").references(() => pageTemplates.id, {
    onDelete: "set null",
  }),
  customFields: text("custom_fields").default("{}"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  systemKey: varchar("system_key", {
    length: 50,
  }).$type<SystemPageKey | null>(),
  // Quando false, la system page è "meta-only": l'admin può editare solo
  // titolo + meta SEO, niente content/template/custom fields. Tipico per
  // le rotte servite da page handlers Next.js (auth, /404) dove la system
  // page è solo un container amministrativo. Default true per le pagine
  // utente normali e per le system pages content-driven (privacy, terms…).
  contentEditable: boolean("content_editable").notNull().default(true),
  // Visibility usata da proxy.ts per decidere se richiedere sessione.
  // "public" = accessibile senza login; "private" = redirect a /sign-in
  // se l'utente non è autenticato. Default "public" per le user CMS
  // pages, override sui system pages secondo necessità.
  visibility: varchar("visibility", { length: 20 })
    .notNull()
    .default("public")
    .$type<RouteVisibility>(),
  contentVersion: varchar("content_version", { length: 20 })
    .notNull()
    .default("1-2026-04"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Snapshot storico delle pagine di sistema (Termini/Privacy/Marketing).
 * Popolata automaticamente da `upsertPage` quando `contentVersion` cambia,
 * salvando la VECCHIA versione prima di sovrascriverla.
 * Permette di mostrare in /settings/privacy il testo esatto che l'utente
 * ha accettato, anche dopo che l'admin ha pubblicato versioni successive.
 */
export const pageVersions = pgTable(
  "page_versions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    contentVersion: varchar("content_version", { length: 20 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    snapshottedAt: timestamp("snapshotted_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("page_versions_page_version_uq").on(
      table.pageId,
      table.contentVersion,
    ),
  ],
);

/**
 * Sister table per CMS multilocale: la pagina canonica vive in `pages`
 * (slug + content nel default locale). Le altre lingue sono overlay
 * (page_id, locale). Lookup join in `getPageWithTemplate(slug, locale)`.
 *
 * Il content_version è opzionale qui — viene popolato quando la
 * traduzione viene editata, e serve a `page_versions` per snapshottare
 * la versione esatta accettata dall'utente (consensi GDPR multilocale).
 */
export const pageTranslations = pgTable(
  "page_translations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 5 }).notNull(),
    // Slug locale-specifico (senza il prefix /en/). NULL = usa lo slug della
    // pagina madre (default locale). Quando valorizzato, l'URL diventa
    // /<locale>/<slug> e il proxy/CMS lo risolve via JOIN su questa colonna.
    slug: varchar("slug", { length: 255 }),
    // title/content nullable: supporta traduzioni parziali (es. solo slug
    // diverso ma stesso contenuto default).
    title: varchar("title", { length: 255 }),
    content: text("content").default(""),
    contentVersion: varchar("content_version", { length: 20 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("page_translations_page_locale_uq").on(
      table.pageId,
      table.locale,
    ),
    // Unique per locale sullo slug: due pagine non possono avere lo stesso
    // slug tradotto nella stessa lingua. Partial index (WHERE slug IS NOT NULL).
    uniqueIndex("page_translations_locale_slug_uq").on(
      table.locale,
      table.slug,
    ),
    index("idx_page_translations_page").on(table.pageId),
  ],
);

export const pagesRelations = relations(pages, ({ one, many }) => ({
  parent: one(pages, {
    fields: [pages.parentId],
    references: [pages.id],
    relationName: "page_children",
  }),
  children: many(pages, { relationName: "page_children" }),
  template: one(pageTemplates, {
    fields: [pages.templateId],
    references: [pageTemplates.id],
  }),
}));

export const redirects = pgTable("redirects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  fromPath: varchar("from_path", { length: 500 }).notNull().unique(),
  toPath: varchar("to_path", { length: 500 }).notNull(),
  statusCode: integer("status_code").notNull().default(301),
  isActive: boolean("is_active").notNull().default(true),
  // 'manual' = creato dall'admin; 'auto_slug' = generato da cambio slug pagina.
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  // Per i redirect auto_slug: pagina di origine (SET NULL se la pagina viene
  // eliminata — il redirect rimane attivo per preservare le vecchie URL).
  pageId: integer("page_id").references(() => pages.id, { onDelete: "set null" }),
  // Locale del redirect auto_slug (NULL = default locale).
  locale: varchar("locale", { length: 5 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SnippetType =
  | "link_css"
  | "style"
  | "script_src"
  | "script"
  | "raw";
export type SnippetPosition = "head" | "body_end";

export const siteSnippets = pgTable("site_snippets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 150 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("script"),
  position: varchar("position", { length: 20 }).notNull().default("head"),
  content: text("content").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // FK opzionale al servizio cookie. Se valorizzato, lo snippet viene
  // caricato in pagina solo quando l'utente ha acconsentito alla categoria
  // del servizio collegato. Se NULL → snippet "always-on" (es. consent
  // banner script, cookie tecnici, snippet senza cookie).
  // ON DELETE SET NULL: cancellando il servizio lo snippet diventa
  // always-on senza spegnersi (ce ne accorgiamo dal badge admin).
  cookieServiceId: varchar("cookie_service_id", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  // SET NULL on delete: il purge GDPR (cron `soft-deleted-purge`) cancella
  // l'utente ma vogliamo preservare l'audit trail. La row resta con
  // user_id = null = "azione storica di un utente non più esistente".
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
});

export const ipBlacklist = pgTable("ip_blacklist", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ip: varchar("ip", { length: 45 }).notNull().unique(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const loginAttempts = pgTable("login_attempts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 255 }).notNull(),
  ip: varchar("ip", { length: 45 }).notNull(),
  attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
  success: boolean("success").notNull().default(false),
});

/**
 * Regole IP manuali (allow/deny) gestite dall'admin via /admin/security/ip-rules.
 * Coesiste con `ipBlacklist` (auto-popolata da bruteforce); una PR successiva
 * unificherà le due. Le query NON girano per request: il loader cached
 * (`lib/auth/ip-rules.ts`) carica tutto in memoria e fa match CIDR in JS.
 *
 * Vincolo unique(ip, scope): la stessa subnet può avere regole diverse per
 * scope differenti (es. permessa per signup ma negata per admin).
 */
export const ipRules = pgTable("ip_rules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ip: inet("ip").notNull(),
  // 'allow' bypass total, 'deny' reject. CHECK constraint a livello SQL.
  action: varchar("action", { length: 10 }).notNull(),
  // 'auth' | 'admin' | 'all' — scope di applicazione. CHECK SQL.
  scope: varchar("scope", { length: 10 }).notNull(),
  reason: varchar("reason", { length: 255 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Hit counter aggiornato fire-and-forget (Redis INCR) e flushato a DB
  // periodicamente da cron — mai sincrono nel hot path.
  hitCount: integer("hit_count").notNull().default(0),
  lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
});

export const emailVerifications = pgTable("email_verifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  type: varchar("type", { length: 50 }).notNull().default("email_verification"),
});

/**
 * Job di export dati GDPR. L'utente richiede l'export dalle impostazioni
 * privacy, viene creata una row `pending`; un cron worker la processa
 * (build JSON → upload bucket privato `gdpr-exports` → email con signed
 * URL 24h → status='ready'). I file restano nel bucket per 7 giorni
 * (re-download via signed URL fresca dalle impostazioni), poi un altro
 * passaggio del cron li purga e marca status='expired'.
 */
export const GDPR_EXPORT_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
  "expired",
] as const;
export type GdprExportStatus = (typeof GDPR_EXPORT_STATUSES)[number];

export const gdprExportJobs = pgTable(
  "gdpr_export_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("pending")
      .$type<GdprExportStatus>(),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    error: text("error"),
    /** Path nel bucket `gdpr-exports`, es. `{userId}/{jobId}.json`. */
    storagePath: text("storage_path"),
    /** Quando il file viene rimosso dal bucket (requestedAt + 7 giorni). */
    expiresAt: timestamp("expires_at"),
    emailSentAt: timestamp("email_sent_at"),
  },
  (table) => [
    index("idx_gdpr_export_jobs_user_status").on(table.userId, table.status),
  ],
);

/**
 * Append-only ledger di tutti gli eventi di consenso.
 *
 * Una row per ogni "granted" o "revoked" su qualsiasi consent_type
 * (terms / privacy / marketing / cookie_*). La scrittura passa SEMPRE
 * da `recordConsent()` in lib/account/consent-ledger.ts che applica le
 * settings (gdpr.consent_log.*) per scegliere se salvare IP, mascherarlo,
 * hashare il testo della policy, ecc.
 *
 * Immutabilità del CONTENUTO: un trigger BEFORE UPDATE in DB rifiuta
 * qualsiasi modifica della riga (RAISE EXCEPTION). Il contenuto del
 * consenso è quindi append-only.
 *
 * user_id ON DELETE CASCADE: quando l'utente è eliminato (dal cron
 * retention soft-delete o manualmente), il record di consenso viene
 * eliminato a sua volta. Allineamento letterale al "right to be
 * forgotten" GDPR Art. 17 — preferiamo zero residui a un audit trail
 * orfano (`user_id NULL`) che resterebbe comunque privo di valore
 * probatorio individuale. Il DELETE via cascade è permesso dal trigger
 * (il trigger BEFORE DELETE è stato rimosso nella migration 0027).
 */
export const CONSENT_TYPES = [
  "terms",
  "privacy",
  "marketing",
  "cookie_necessary",
  "cookie_preferences",
  "cookie_analytics",
  "cookie_marketing",
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_ACTIONS = ["granted", "revoked"] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

export const CONSENT_IP_STRATEGIES = [
  "full",
  "mask_last_octet",
  "hash_only",
] as const;
export type ConsentIpStrategy = (typeof CONSENT_IP_STRATEGIES)[number];

export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    consentType: varchar("consent_type", { length: 50 })
      .notNull()
      .$type<ConsentType>(),
    action: varchar("action", { length: 20 }).notNull().$type<ConsentAction>(),
    /** Versione policy al momento dell'evento (formato pages.contentVersion).
     *  Null per consent_type=cookie_* dove non esiste una policy unica. */
    policyVersion: varchar("policy_version", { length: 20 }),
    /** SHA-256 hex (64 chars) del testo policy mostrato all'utente.
     *  Null se hash_policy_text è disabilitato o se il testo non è disponibile. */
    policyTextHash: varchar("policy_text_hash", { length: 64 }),
    /** Forma dell'IP così come è stata SCRITTA (no trasformazioni successive):
     *  - full:            IP raw (IPv4 max 15ch, IPv6 max 39ch)
     *  - mask_last_octet: ultimo octet IPv4 mascherato (es. 192.168.1.X)
     *  - hash_only:       SHA-256 hex 64ch dell'IP raw
     *  Null se capture_ip è disabilitato o se l'IP non è disponibile. */
    ip: varchar("ip", { length: 64 }),
    ipStrategy: varchar("ip_strategy", { length: 20 })
      .notNull()
      .default("full")
      .$type<ConsentIpStrategy>(),
    userAgent: varchar("user_agent", { length: 512 }),
    /** Locale UI dell'utente al momento dell'evento (es. "it", "en"). */
    locale: varchar("locale", { length: 10 }),
    /** Extensibility bag: cookie categories, source ("backfill"|"signup"|...), etc. */
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_consent_records_user_type_time").on(
      table.userId,
      table.consentType,
      table.createdAt,
    ),
    index("idx_consent_records_type_time").on(
      table.consentType,
      table.createdAt,
    ),
    index("idx_consent_records_created_at").on(table.createdAt),
  ],
);

/**
 * Job table per il cron `policy-change-notifications`. Quando una pagina di
 * sistema (terms / privacy / marketing) viene aggiornata e
 * `gdpr.policy.force_reconsent_on_change` è ON, `upsertPage` enqueue una
 * riga `pending` per ogni utente con versione obsoleta. Il cron worker
 * raggruppa per `user_id`, manda UNA mail con tutte le policy aggiornate
 * di quell'utente, marca le righe `sent`. La frontend usa la presenza di
 * righe (di qualunque stato) e il `created_at` più vecchio per decidere
 * banner gentile vs modale bloccante (gdpr.policy.reconsent_grace_days).
 *
 * UNIQUE(user_id, policy_key, policy_version): se l'admin riapplica per
 * sbaglio o il cron rilancia, niente duplicati. user_id ON DELETE CASCADE
 * uniformemente con consent_records.
 */
export const POLICY_NOTIFICATION_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;
export type PolicyNotificationStatus =
  (typeof POLICY_NOTIFICATION_STATUSES)[number];

export const POLICY_NOTIFICATION_KEYS = [
  "terms",
  "privacy",
  "marketing",
] as const;
export type PolicyNotificationKey = (typeof POLICY_NOTIFICATION_KEYS)[number];

export const policyChangeNotifications = pgTable(
  "policy_change_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    policyKey: varchar("policy_key", { length: 20 })
      .notNull()
      .$type<PolicyNotificationKey>(),
    /** Versione NUOVA che l'utente deve riaccettare. */
    policyVersion: varchar("policy_version", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("pending")
      .$type<PolicyNotificationStatus>(),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    sentAt: timestamp("sent_at"),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("policy_change_notifications_uq").on(
      table.userId,
      table.policyKey,
      table.policyVersion,
    ),
    index("idx_policy_change_notifications_status").on(
      table.status,
      table.createdAt,
    ),
    index("idx_policy_change_notifications_user").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Cookie registry — gestione DB-driven del catalogo cookie/tracker
// ---------------------------------------------------------------------------
//
// Sostituisce il file statico `lib/cookie-consent/services.ts`. L'admin può
// aggiungere/rimuovere/disabilitare i servizi senza redeploy via
// `/admin/compliance/cookies`. Le 4 categorie ePrivacy sono fisse (seed
// `is_system=true`) — solo i servizi sono pienamente CRUD.
//
// **Performance:** il banner pubblico riceve i servizi `enabled=true` come
// prop dal RootLayout (server) con cache module-level 10min. Zero query DB
// dal client banner. Vedi `lib/db/cookie-services-queries.ts`.

export const cookieCategories = pgTable("cookie_categories", {
  /** ID = ConsentType (es. "cookie_necessary"). Usato come FK e come chiave i18n. */
  id: varchar("id", { length: 50 }).primaryKey(),
  /** True per "cookie_necessary": utente non può togliere consenso. */
  alwaysOn: boolean("always_on").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Le 4 categorie ePrivacy seed sono `is_system=true` → non eliminabili. */
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cookieServices = pgTable("cookie_services", {
  id: varchar("id", { length: 100 }).primaryKey(),
  categoryId: varchar("category_id", { length: 50 })
    .notNull()
    .references(() => cookieCategories.id, { onDelete: "restrict" }),
  /** Toggle on/off senza eliminare la riga (sospendi un tracker temporaneamente). */
  enabled: boolean("enabled").notNull().default(true),
  /** True se gestito da noi (session, csrf...). False per third-party. */
  firstParty: boolean("first_party").notNull().default(false),
  /** Provider (es. "Vercel Inc.", "Google LLC"). Vuoto per first-party. */
  provider: varchar("provider", { length: 200 }),
  providerPolicyUrl: text("provider_policy_url"),
  /**
   * Vero se il servizio richiede uno snippet user-managed in
   * /admin/settings/snippets per caricare effettivamente lo script.
   * False per cookie tecnici (session, csrf...) e per script
   * hardcoded nel codice (Vercel Analytics gated direttamente in
   * app/layout.tsx). Quando true, l'admin /admin/compliance/cookies
   * mostra un badge che indica se uno snippet collegato esiste già
   * o no — così non serve ricordarsi di fare i due step.
   */
  requiresSnippet: boolean("requires_snippet").notNull().default(true),
  /** I servizi seed di sistema (session/csrf/cookie_consent/vercel_analytics)
   *  sono `is_system=true` → non eliminabili dall'admin (toggle sì). */
  isSystem: boolean("is_system").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Traduzioni nome+description per ogni servizio + locale. Il default
 * locale (es. "it" per Gencry) può vivere come "default" qui o come
 * fallback nella query helper. Pattern analogo a `pageTranslations` /
 * `seoPageTranslations`.
 */
export const cookieServiceTranslations = pgTable(
  "cookie_service_translations",
  {
    serviceId: varchar("service_id", { length: 100 })
      .notNull()
      .references(() => cookieServices.id, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 5 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.serviceId, table.locale] }),
  ],
);

/**
 * Sessions server-side. Il cookie `session` contiene un JWT firmato che
 * imbusta solo `{ sid }` (sessionId opaco): la validazione passa per la
 * tabella sessions (cache Redis 60s, fallback DB), così possiamo
 * revocare puntualmente una sessione (logout-elsewhere su cambio password,
 * revoca da UI Sicurezza, ban admin) senza aspettare la scadenza JWT.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Riferimento al trusted device usato per autenticarsi (nullable). */
    deviceToken: varchar("device_token", { length: 255 }),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 45 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /** Aggiornato con throttle 5min — fire-and-forget dalle request. */
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    /** Hard expiry: createdAt + SESSION_DURATION_DAYS, non sliding. */
    expiresAt: timestamp("expires_at").notNull(),
    /** Set a now() su signOut/revoke; null = sessione attiva. */
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("idx_sessions_user_active").on(table.userId),
    index("idx_sessions_expires").on(table.expiresAt),
    // Active-list ordering: la dashboard admin filtra `revoked_at IS NULL`
    // + `expires_at > now()` e ordina per `last_seen_at desc`. Senza un
    // indice dedicato la pagina diventa lenta in pochi mesi.
    index("idx_sessions_active_last_seen").on(table.lastSeenAt),
    index("idx_sessions_revoked").on(table.revokedAt),
  ],
);

/**
 * Suspicious session alerts (Tier-1 heuristics, no external IP/geo).
 *
 * Reconciliation pattern: each detector emits a deterministic `dedupKey`
 * (e.g. `multiple_ips:<userId>:<dayBucket>`) and the runner uses
 * INSERT … ON CONFLICT (dedup_key) DO NOTHING. This keeps a stable record
 * per "incident" without exploding rows on every cron tick.
 *
 * `sessionId` and `userId` are nullable on purpose:
 *  - cross-user campaign alerts target an IP, not a single session
 *  - session FK can become stale if a session is later purged from history
 *
 * Lifecycle: `acknowledged_at` is set when an admin reviews the alert from
 * the panel. Acknowledged alerts stay in the table for audit; the alerts
 * UI filters them out by default.
 */
export const sessionAlerts = pgTable(
  "session_alerts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: uuid("session_id"),
    userId: uuid("user_id"),
    /** Heuristic id, e.g. `multiple_ips`, `bot_user_agent` … */
    reason: varchar("reason", { length: 50 }).notNull(),
    /** `info` | `warning` | `critical` */
    severity: varchar("severity", { length: 20 }).notNull(),
    /** Free-form payload the UI / email digest can read for context. */
    details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at"),
    acknowledgedBy: uuid("acknowledged_by"),
    /** Stamped by the email-digest worker once the alert ships in a digest. */
    emailSentAt: timestamp("email_sent_at"),
    /** Deterministic key for idempotency. UNIQUE. */
    dedupKey: text("dedup_key").notNull(),
  },
  (table) => [
    uniqueIndex("uniq_session_alerts_dedup").on(table.dedupKey),
    index("idx_session_alerts_user").on(table.userId),
    index("idx_session_alerts_created").on(table.createdAt),
    index("idx_session_alerts_unack").on(table.acknowledgedAt),
    index("idx_session_alerts_email_pending").on(table.emailSentAt),
  ],
);

export const trustedDevices = pgTable("trusted_devices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceToken: varchar("device_token", { length: 255 }).notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * MFA TOTP (RFC 6238) — secondo fattore opzionale al login.
 *
 * Tabella separata da `users` per isolare il secret cifrato e poter
 * estendere in futuro con WebAuthn senza toccare lo schema utente.
 *
 * - `secret_ciphertext` / `secret_iv` / `secret_tag`: secret cifrato
 *   AES-256-GCM con MFA_ENCRYPTION_KEY (vedi lib/crypto/aes-gcm.ts).
 * - `enabled_at` NULL = setup pending (utente ha generato il secret ma
 *   non ha ancora confermato col primo codice).
 * - `last_used_counter` (= floor(unix_ts / period)) previene replay
 *   dello stesso codice nello stesso step di 30s.
 */
export const userMfaTotp = pgTable(
  "user_mfa_totp",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    secretCiphertext: text("secret_ciphertext").notNull(),
    secretIv: text("secret_iv").notNull(),
    secretTag: text("secret_tag").notNull(),
    algorithm: varchar("algorithm", { length: 16 }).notNull().default("SHA1"),
    digits: integer("digits").notNull().default(6),
    period: integer("period").notNull().default(30),
    enabledAt: timestamp("enabled_at"),
    lastUsedAt: timestamp("last_used_at"),
    lastUsedCounter: bigint("last_used_counter", { mode: "number" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_user_mfa_totp_user_id").on(t.userId)],
);

/**
 * Recovery codes monouso per MFA TOTP. Generati 10 alla volta al
 * momento dell'attivazione (e rigenerabili dall'utente). Hashati con
 * bcrypt come le password — `used_at` valorizzato = già consumato.
 */
export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // Partial index sui codici non ancora consumati: la lookup calda al login
  // filtra `WHERE used_at IS NULL`. Le righe consumate restano (audit) ma
  // non gonfiano l'indice.
  (t) => [
    index("idx_mfa_recovery_codes_user_id_unused")
      .on(t.userId)
      .where(sql`${t.usedAt} IS NULL`),
  ],
);

export const userMfaTotpRelations = relations(userMfaTotp, ({ one }) => ({
  user: one(users, {
    fields: [userMfaTotp.userId],
    references: [users.id],
  }),
}));

export const mfaRecoveryCodesRelations = relations(
  mfaRecoveryCodes,
  ({ one }) => ({
    user: one(users, {
      fields: [mfaRecoveryCodes.userId],
      references: [users.id],
    }),
  }),
);

// 1:1 staff/admin-only preferences. Kept separate from `users` so the public
// table does not carry admin-specific columns (most users never get a row).
export const adminUserPreferences = pgTable("admin_user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // NULL = no user override → fall back to role preset / registry defaults.
  dashboardWidgets: jsonb("dashboard_widgets").$type<
    | { enabled: string[] }
    | { items: Array<{ id: string; x: number; y: number; w: number; h: number }> }
    | null
  >(),
  // NULL = user never customized Quick Actions → widget falls back to
  // QUICK_ACTIONS_DEFAULTS. Stored as text[] of nav-registry keys.
  quickActions: text("quick_actions").array(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const adminUserPreferencesRelations = relations(
  adminUserPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [adminUserPreferences.userId],
      references: [users.id],
    }),
  }),
);

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Override globale dell'ordinamento delle voci top-level della sidebar
 * admin. Solo le voci elencate qui hanno un ordinamento custom; le altre
 * mantengono l'ordine del codice (`lib/admin-nav.ts`). Una row per
 * `item_key` (es. "access-group", "settings-group", "module-prices").
 *
 * NB: copre solo i top-level (gruppi). Le children NON sono qui.
 */
export const adminNavOrder = pgTable("admin_nav_order", {
  itemKey: varchar("item_key", { length: 64 }).primaryKey(),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// i18n — locale registry e traduzioni dinamiche
// ---------------------------------------------------------------------------
//
// La fonte canonica del default locale è la env `I18N_DEFAULT_LOCALE` letta
// da proxy.ts e dal loader next-intl. Il flag `is_default` qui è solo per
// UI/seed/admin display: l'admin section mostra un warning se env↔DB
// divergono. Vedi project_i18n_plan.md per il piano completo.
export const appLocales = pgTable("app_locales", {
  code: varchar("code", { length: 5 }).primaryKey(),
  label: varchar("label", { length: 64 }).notNull(),
  nativeLabel: varchar("native_label", { length: 64 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Traduzioni dinamiche per chiave: contenuti NON UI-statici (email body,
// legal pages, copy admin-modificabile). Le chiavi UI statiche restano in
// `messages/{locale}/<ns>.json` per type-safety e versioning.
export const translations = pgTable(
  "translations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    locale: varchar("locale", { length: 5 }).notNull(),
    namespace: varchar("namespace", { length: 64 }).notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("translations_locale_ns_key_uq").on(
      table.locale,
      table.namespace,
      table.key,
    ),
    index("idx_translations_locale_ns").on(table.locale, table.namespace),
  ],
);

export const waitingList = pgTable("waiting_list", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WaitingListEntry = typeof waitingList.$inferSelect;
export type NewWaitingListEntry = typeof waitingList.$inferInsert;

export const adminNotifications = pgTable(
  "admin_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 50 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupKey: varchar("dedup_key", { length: 200 }).notNull().unique(),
    requiredPermission: varchar("required_permission", { length: 100 }).notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // Email dispatch tracking (vedi lib/notifications/email-channel).
    // Source of truth dello stato "inviata via email" per il dispatcher
    // generico. NULL = non ancora inviata (candidata se sopra threshold).
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    emailSendAttempts: integer("email_send_attempts").notNull().default(0),
    lastEmailError: text("last_email_error"),
  },
  (t) => ({
    activeIdx: index("idx_admin_notifications_active").on(
      t.requiredPermission,
      t.createdAt,
    ),
  }),
);

export type AdminNotification = typeof adminNotifications.$inferSelect;
export type NewAdminNotification = typeof adminNotifications.$inferInsert;

export const seoPages = pgTable("seo_pages", {
  pathname: varchar("pathname", { length: 255 }).primaryKey(),
  label: varchar("label", { length: 100 }).notNull(),
  title: varchar("title", { length: 70 }),
  description: varchar("description", { length: 160 }),
  ogTitle: varchar("og_title", { length: 70 }),
  ogDescription: varchar("og_description", { length: 200 }),
  ogImage: text("og_image"),
  robots: varchar("robots", { length: 50 }),
  jsonLdEnabled: boolean("json_ld_enabled").notNull().default(false),
  jsonLdType: varchar("json_ld_type", { length: 50 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Overlay per locale dei meta SEO testuali. Solo i 4 campi che hanno
 * senso tradurre (title, description, og_title, og_description) — og_image
 * resta condiviso da seo_pages, robots/json_ld sono direttive tecniche.
 *
 * FK su seo_pages.pathname con ON UPDATE CASCADE: se l'admin rinomina il
 * pathname della pagina SEO base, il rename si propaga alle traduzioni.
 * ON DELETE CASCADE: quando l'utente elimina la riga seo_pages, le
 * relative traduzioni vanno via insieme.
 *
 * Lookup: getSeoPage(pathname, locale) merge base + overlay.
 */
export const seoPageTranslations = pgTable(
  "seo_page_translations",
  {
    pathname: varchar("pathname", { length: 255 })
      .notNull()
      .references(() => seoPages.pathname, {
        onUpdate: "cascade",
        onDelete: "cascade",
      }),
    locale: varchar("locale", { length: 5 }).notNull(),
    title: varchar("title", { length: 70 }),
    description: varchar("description", { length: 160 }),
    ogTitle: varchar("og_title", { length: 70 }),
    ogDescription: varchar("og_description", { length: 200 }),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.pathname, table.locale] }),
  ],
);

export const routeVisibility = ["public", "private"] as const;
export type RouteVisibility = (typeof routeVisibility)[number];

export const staffInvitations = pgTable("staff_invitations", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type StaffInvitation = typeof staffInvitations.$inferSelect;

export const disposableDomains = pgTable("disposable_domains", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const blockedUsernames = pgTable("blocked_usernames", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  isPattern: boolean("is_pattern").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OauthAccount    = typeof oauthAccounts.$inferSelect;
export type NewOauthAccount = typeof oauthAccounts.$inferInsert;

export type DisposableDomain = typeof disposableDomains.$inferSelect;
export type BlockedUsername  = typeof blockedUsernames.$inferSelect;

export type CookieCategory             = typeof cookieCategories.$inferSelect;
export type NewCookieCategory          = typeof cookieCategories.$inferInsert;
export type CookieService              = typeof cookieServices.$inferSelect;
export type NewCookieService           = typeof cookieServices.$inferInsert;
export type CookieServiceTranslation   = typeof cookieServiceTranslations.$inferSelect;
export type NewCookieServiceTranslation = typeof cookieServiceTranslations.$inferInsert;

export type User                = typeof users.$inferSelect;
export type NewUser             = typeof users.$inferInsert;
export type UserProfile         = typeof userProfiles.$inferSelect;
export type NewUserProfile      = typeof userProfiles.$inferInsert;
export type UserSubscription    = typeof userSubscriptions.$inferSelect;
export type NewUserSubscription = typeof userSubscriptions.$inferInsert;

export type UserWithProfile = User & {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeProductId: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
};

export type Role            = typeof roles.$inferSelect;
export type NewRole         = typeof roles.$inferInsert;
export type Permission      = typeof permissions.$inferSelect;
export type NewPermission   = typeof permissions.$inferInsert;
export type RolePermission  = typeof rolePermissions.$inferSelect;
export type UserPermission  = typeof userPermissions.$inferSelect;
export type ActivityLog     = typeof activityLogs.$inferSelect;
export type NewActivityLog  = typeof activityLogs.$inferInsert;
export type EmailVerification  = typeof emailVerifications.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type TrustedDevice      = typeof trustedDevices.$inferSelect;
export type NewTrustedDevice   = typeof trustedDevices.$inferInsert;
export type UserMfaTotp        = typeof userMfaTotp.$inferSelect;
export type NewUserMfaTotp     = typeof userMfaTotp.$inferInsert;
export type MfaRecoveryCode    = typeof mfaRecoveryCodes.$inferSelect;
export type NewMfaRecoveryCode = typeof mfaRecoveryCodes.$inferInsert;
export type SeoPage         = typeof seoPages.$inferSelect;
export type NewSeoPage      = typeof seoPages.$inferInsert;
export type SeoPageTranslation    = typeof seoPageTranslations.$inferSelect;
export type NewSeoPageTranslation = typeof seoPageTranslations.$inferInsert;
export type Page            = typeof pages.$inferSelect;
export type NewPage         = typeof pages.$inferInsert;
export type PageTranslation    = typeof pageTranslations.$inferSelect;
export type NewPageTranslation = typeof pageTranslations.$inferInsert;
export type AppLocale       = typeof appLocales.$inferSelect;
export type NewAppLocale    = typeof appLocales.$inferInsert;
export type Translation     = typeof translations.$inferSelect;
export type NewTranslation  = typeof translations.$inferInsert;
export type PageTemplate    = typeof pageTemplates.$inferSelect;
export type NewPageTemplate = typeof pageTemplates.$inferInsert;
export type TemplateField   = typeof templateFields.$inferSelect;
export type NewTemplateField = typeof templateFields.$inferInsert;
export type Redirect        = typeof redirects.$inferSelect;
export type NewRedirect     = typeof redirects.$inferInsert;
export type SiteSnippet     = typeof siteSnippets.$inferSelect;
export type NewSiteSnippet  = typeof siteSnippets.$inferInsert;

// ---------------------------------------------------------------------------
// Prices Engine — coin metadata, current price, timeseries, source health
// (vedi migration 0026_prices_engine.sql per il commento architetturale)
// ---------------------------------------------------------------------------

export const pricesCoins = pgTable(
  "prices_coins",
  {
    symbol:         varchar("symbol", { length: 20 }).primaryKey(),
    coingeckoId:    varchar("coingecko_id", { length: 100 }).unique(),
    name:           varchar("name", { length: 120 }).notNull(),
    imageUrl:       text("image_url"),
    marketCap:      bigint("market_cap", { mode: "number" }),
    marketCapRank:  integer("market_cap_rank"),
    category:       varchar("category", { length: 50 }),
    isActive:       boolean("is_active").notNull().default(true),
    lastSeenAt:   timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt:    timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_prices_coins_active_mcap").on(t.isActive, t.marketCap),
  ],
);

export const pricesData = pgTable("prices_data", {
  symbol:       varchar("symbol", { length: 20 }).primaryKey()
                  .references(() => pricesCoins.symbol, { onDelete: "cascade" }),
  price:        numeric("price",      { precision: 24, scale: 8 }).notNull(),
  change24h:    numeric("change_24h", { precision: 10, scale: 4 }),
  volume24h:    numeric("volume_24h", { precision: 24, scale: 2 }),
  source:       varchar("source", { length: 20 }).notNull().default("coingecko"),
  lastUpdated:  timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
  // Sparkline settimanale pre-aggregata: 7 prezzi giornalieri dal più vecchio
  // al più recente (oggi). Aggiornata dentro runPricesSync se l'ultima
  // computazione è > 24h fa. Decorativa, non trading-grade.
  weeklySparkline:   jsonb("weekly_sparkline").$type<number[] | null>(),
  weeklySparklineAt: timestamp("weekly_sparkline_at", { withTimezone: true }),
});

export const pricesHistory = pgTable(
  "prices_history",
  {
    id:     bigserial("id", { mode: "number" }).primaryKey(),
    symbol: varchar("symbol", { length: 20 }).notNull()
              .references(() => pricesCoins.symbol, { onDelete: "cascade" }),
    ts:     timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    price:  numeric("price", { precision: 24, scale: 8 }).notNull(),
  },
  (t) => [
    index("idx_prices_history_symbol_ts").on(t.symbol, t.ts),
  ],
);

export const pricesSourceHealth = pgTable("prices_source_health", {
  source:        varchar("source", { length: 20 }).primaryKey(),
  status:        varchar("status", { length: 20 }).notNull().default("closed"),
  errorCount:    integer("error_count").notNull().default(0),
  successCount:  integer("success_count").notNull().default(0),
  lastError:     text("last_error"),
  lastErrorAt:   timestamp("last_error_at",   { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  openUntil:     timestamp("open_until",      { withTimezone: true }),
  avgLatencyMs:  integer("avg_latency_ms"),
  updatedAt:     timestamp("updated_at",      { withTimezone: true }).notNull().defaultNow(),
});

export const pricesSyncRuns = pgTable(
  "prices_sync_runs",
  {
    id:           bigserial("id", { mode: "number" }).primaryKey(),
    kind:         varchar("kind", { length: 20 }).notNull(),
    startedAt:    timestamp("started_at",  { withTimezone: true }).notNull().defaultNow(),
    finishedAt:   timestamp("finished_at", { withTimezone: true }),
    durationMs:   integer("duration_ms"),
    coinsTotal:   integer("coins_total").notNull().default(0),
    coinsUpdated: integer("coins_updated").notNull().default(0),
    sourceUsed:   varchar("source_used", { length: 20 }),
    ok:           boolean("ok").notNull().default(false),
    error:        text("error"),
  },
  (t) => [
    index("idx_prices_sync_runs_kind_started").on(t.kind, t.startedAt),
  ],
);

export type PricesCoin         = typeof pricesCoins.$inferSelect;
export type NewPricesCoin      = typeof pricesCoins.$inferInsert;
export type PricesDataRow      = typeof pricesData.$inferSelect;
export type NewPricesDataRow   = typeof pricesData.$inferInsert;
export type PricesHistoryRow   = typeof pricesHistory.$inferSelect;
export type NewPricesHistoryRow = typeof pricesHistory.$inferInsert;
export type PricesSourceHealth = typeof pricesSourceHealth.$inferSelect;
export type PricesSyncRun      = typeof pricesSyncRuns.$inferSelect;
export type NewPricesSyncRun   = typeof pricesSyncRuns.$inferInsert;

// ---------------------------------------------------------------------------
// Onboarding module — coin picks + risk profile
// (vedi migration M_onboarding_002_choices.sql)
// ---------------------------------------------------------------------------

export const onboardingCoinPicks = pgTable(
  "onboarding_coin_picks",
  {
    userId:     uuid("user_id").notNull()
                  .references(() => users.id, { onDelete: "cascade" }),
    coinSymbol: varchar("coin_symbol", { length: 20 }).notNull()
                  .references(() => pricesCoins.symbol, { onDelete: "cascade" }),
    position:   smallint("position").notNull().default(0),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.coinSymbol] }),
    index("idx_onboarding_coin_picks_user").on(t.userId, t.position),
    index("idx_onboarding_coin_picks_coin").on(t.coinSymbol),
  ],
);

export const onboardingRiskProfile = pgTable("onboarding_risk_profile", {
  userId:     uuid("user_id").primaryKey()
                .references(() => users.id, { onDelete: "cascade" }),
  // CHECK enforced lato DB ('cauto' | 'moderato' | 'aggressivo' | 'degen')
  profile:    varchar("profile", { length: 20 }).notNull(),
  // CHECK enforced lato DB ('newbie' | '1to3y' | 'over3y')
  experience: varchar("experience", { length: 20 }).notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OnboardingCoinPick    = typeof onboardingCoinPicks.$inferSelect;
export type NewOnboardingCoinPick = typeof onboardingCoinPicks.$inferInsert;
export type OnboardingRiskProfile = typeof onboardingRiskProfile.$inferSelect;
export type NewOnboardingRiskProfile = typeof onboardingRiskProfile.$inferInsert;

// ---------------------------------------------------------------------------
// Posts module — social feed root + media/reactions/comments/bookmarks/reports
// + tickers/mentions lookup + link previews + outbox
// (vedi migration M_posts_001_init.sql, design in
//  project_module_posts_architecture.md)
//
// ID = UUID v7 (time-ordered, funzione SQL `uuid_generate_v7()`).
// Enum modellati come varchar + CHECK SQL (coerente col resto del repo).
// I trigger DB per counter/outbox arrivano in M_posts_002_*.sql (PR-2).
// ---------------------------------------------------------------------------

export const posts = pgTable(
  "posts",
  {
    id:               uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    authorId:         uuid("author_id").notNull()
                        .references(() => users.id, { onDelete: "cascade" }),
    body:             text("body").notNull().default(""),
    // 'public' | 'members' | 'followers' | 'private' (CHECK SQL)
    visibility:       varchar("visibility", { length: 16 }).notNull().default("public"),
    repostOfId:       uuid("repost_of_id"),  // self-FK, dichiarato a livello SQL
    editedAt:         timestamp("edited_at",  { withTimezone: true }),
    deletedAt:        timestamp("deleted_at", { withTimezone: true }),
    // 'author' | <uuid moderatore> | null. Vedi M_posts_006_deleted_by.sql.
    deletedBy:        varchar("deleted_by", { length: 40 }),
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Counter denormalizzati (aggiornati da trigger in PR-2, refactor 008)
    reactionsLike:       integer("reactions_like").notNull().default(0),
    reactionsBullish:    integer("reactions_bullish").notNull().default(0),
    reactionsBearish:    integer("reactions_bearish").notNull().default(0),
    reactionsToTheMoon:  integer("reactions_to_the_moon").notNull().default(0),
    reactionsDump:       integer("reactions_dump").notNull().default(0),
    commentsCount:    integer("comments_count").notNull().default(0),
    repostsCount:     integer("reposts_count").notNull().default(0),
    bookmarksCount:   integer("bookmarks_count").notNull().default(0),
    // Flag "commenti disabilitati" — TRUE blocca l'aggiunta di commenti
    // (anche all'autore) e l'UI sostituisce la sezione con un banner.
    // Vedi M_posts_012_comments_disabled.sql.
    commentsDisabled: boolean("comments_disabled").notNull().default(false),
    // body_tsv: GENERATED ALWAYS, gestito a livello SQL — non esposto via Drizzle
  },
);

export const postsMedia = pgTable(
  "posts_media",
  {
    id:           uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    postId:       uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    authorId:     uuid("author_id").notNull()
                    .references(() => users.id, { onDelete: "cascade" }),
    storageKey:   text("storage_key").notNull().unique(),
    fullUrl:      text("full_url"),
    thumbUrl:     text("thumb_url"),
    mimeType:     varchar("mime_type", { length: 50 }).notNull(),
    width:        integer("width"),
    height:       integer("height"),
    sizeBytes:    bigint("size_bytes", { mode: "number" }).notNull(),
    position:     smallint("position").notNull().default(0),
    confirmedAt:  timestamp("confirmed_at", { withTimezone: true }),
    createdAt:    timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
  },
);

export const postsReactions = pgTable(
  "posts_reactions",
  {
    postId:    uuid("post_id").notNull()
                 .references(() => posts.id, { onDelete: "cascade" }),
    userId:    uuid("user_id").notNull()
                 .references(() => users.id, { onDelete: "cascade" }),
    // 'like' | 'bullish' | 'bearish' | 'to_the_moon' | 'dump' (refactor M_posts_008)
    reaction:  varchar("reaction", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId, t.reaction] }),
    index("idx_posts_reactions_post_kind").on(t.postId, t.reaction),
    index("idx_posts_reactions_user_recent").on(t.userId, t.createdAt),
  ],
);

export const postsComments = pgTable(
  "posts_comments",
  {
    id:                 uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    postId:             uuid("post_id").notNull()
                          .references(() => posts.id, { onDelete: "cascade" }),
    authorId:           uuid("author_id").notNull()
                          .references(() => users.id, { onDelete: "cascade" }),
    parentCommentId:    uuid("parent_comment_id"),  // self-FK, dichiarato a livello SQL
    body:               text("body").notNull(),
    editedAt:           timestamp("edited_at",  { withTimezone: true }),
    deletedAt:          timestamp("deleted_at", { withTimezone: true }),
    createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Counter denormalizzati reactions sui commenti (M_posts_008)
    reactionsLike:      integer("reactions_like").notNull().default(0),
    reactionsBullish:   integer("reactions_bullish").notNull().default(0),
    reactionsBearish:   integer("reactions_bearish").notNull().default(0),
    reactionsToTheMoon: integer("reactions_to_the_moon").notNull().default(0),
    reactionsDump:      integer("reactions_dump").notNull().default(0),
  },
);

// posts_comment_reactions — stessa shape di posts_reactions ma su commenti
// (M_posts_008). 1 user → 1 reaction per commento, enforced applicativamente
// dal service comment-reactions.ts (PK schema = composito kind incluso).
export const postsCommentReactions = pgTable(
  "posts_comment_reactions",
  {
    commentId: uuid("comment_id").notNull()
                 .references(() => postsComments.id, { onDelete: "cascade" }),
    userId:    uuid("user_id").notNull()
                 .references(() => users.id, { onDelete: "cascade" }),
    // 'like' | 'bullish' | 'bearish' | 'to_the_moon' | 'dump'
    reaction:  varchar("reaction", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.commentId, t.userId, t.reaction] }),
    index("idx_posts_comment_reactions_comment_kind").on(t.commentId, t.reaction),
    index("idx_posts_comment_reactions_user_recent").on(t.userId, t.createdAt),
  ],
);

export const postsBookmarks = pgTable(
  "posts_bookmarks",
  {
    userId:    uuid("user_id").notNull()
                 .references(() => users.id, { onDelete: "cascade" }),
    postId:    uuid("post_id").notNull()
                 .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index("idx_posts_bookmarks_user_recent").on(t.userId, t.createdAt),
  ],
);

export const postsReports = pgTable(
  "posts_reports",
  {
    id:          uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    // Polimorfismo discriminato via XOR (vedi M_posts_010): valorizzato
    // ESATTAMENTE 1 tra post_id e comment_id. Enforced lato SQL dal CHECK
    // `posts_reports_target_xor_chk` (num_nonnulls = 1).
    postId:      uuid("post_id")
                   .references(() => posts.id, { onDelete: "cascade" }),
    commentId:   uuid("comment_id")
                   .references(() => postsComments.id, { onDelete: "cascade" }),
    reporterId:  uuid("reporter_id").notNull()
                   .references(() => users.id, { onDelete: "cascade" }),
    // Key tra quelle attive in app_settings `modules.posts.report_reasons`
    // (vedi lib/modules/posts/services/report-reasons.ts). Validato runtime
    // dalla Server Action reportContent — il CHECK SQL controlla solo length 1..40.
    reason:      varchar("reason", { length: 40 }).notNull(),
    details:     text("details"),
    // 'open' | 'reviewed' | 'dismissed' | 'actioned'
    status:      varchar("status", { length: 16 }).notNull().default("open"),
    reviewedBy:  uuid("reviewed_by")
                   .references(() => users.id, { onDelete: "set null" }),
    reviewedAt:  timestamp("reviewed_at", { withTimezone: true }),
    createdAt:   timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  },
);

export const postsTickers = pgTable(
  "posts_tickers",
  {
    postId:    uuid("post_id").notNull()
                 .references(() => posts.id, { onDelete: "cascade" }),
    ticker:    varchar("ticker", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.ticker] }),
    index("idx_posts_tickers_feed").on(t.ticker, t.createdAt),
  ],
);

export const postsMentions = pgTable(
  "posts_mentions",
  {
    postId:           uuid("post_id").notNull()
                        .references(() => posts.id, { onDelete: "cascade" }),
    mentionedUserId:  uuid("mentioned_user_id").notNull()
                        .references(() => users.id, { onDelete: "cascade" }),
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.mentionedUserId] }),
    index("idx_posts_mentions_user").on(t.mentionedUserId, t.createdAt),
  ],
);

export const postsLinkPreviews = pgTable(
  "posts_link_previews",
  {
    url:          text("url").primaryKey(),
    title:        text("title"),
    description:  text("description"),
    imageUrl:     text("image_url"),
    siteName:     text("site_name"),
    // 'ok' | 'failed' | 'pending'
    fetchStatus:  varchar("fetch_status", { length: 16 }).notNull().default("pending"),
    fetchedAt:    timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// User-to-user block (mutual). Se A blocca B, NESSUNO dei due vede
// contenuti dell'altro nelle query del modulo Posts. Enforcement nei
// filtri di queries.ts (getFeedIds/getPostsByIds/getPostBySlug/getCommentsForPost).
// Vedi M_posts_005_user_blocks.sql.
export const postsUserBlocks = pgTable(
  "posts_user_blocks",
  {
    blockerId: uuid("blocker_id").notNull()
                 .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull()
                 .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("idx_posts_user_blocks_blocked").on(t.blockedId, t.blockerId),
  ],
);

export const postsOutbox = pgTable(
  "posts_outbox",
  {
    id:           uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    eventType:    varchar("event_type", { length: 64 }).notNull(),
    payload:      jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt:  timestamp("processed_at", { withTimezone: true }),
    createdAt:    timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
  },
);

export type Post                  = typeof posts.$inferSelect;
export type NewPost               = typeof posts.$inferInsert;
export type PostMedia             = typeof postsMedia.$inferSelect;
export type NewPostMedia          = typeof postsMedia.$inferInsert;
export type PostReaction          = typeof postsReactions.$inferSelect;
export type NewPostReaction       = typeof postsReactions.$inferInsert;
export type PostComment           = typeof postsComments.$inferSelect;
export type NewPostComment        = typeof postsComments.$inferInsert;
export type PostBookmark          = typeof postsBookmarks.$inferSelect;
export type NewPostBookmark       = typeof postsBookmarks.$inferInsert;
export type PostReport            = typeof postsReports.$inferSelect;
export type NewPostReport         = typeof postsReports.$inferInsert;
export type PostTicker            = typeof postsTickers.$inferSelect;
export type NewPostTicker         = typeof postsTickers.$inferInsert;
export type PostMention           = typeof postsMentions.$inferSelect;
export type NewPostMention        = typeof postsMentions.$inferInsert;
export type PostLinkPreview       = typeof postsLinkPreviews.$inferSelect;
export type NewPostLinkPreview    = typeof postsLinkPreviews.$inferInsert;
export type PostOutboxEvent       = typeof postsOutbox.$inferSelect;
export type NewPostOutboxEvent    = typeof postsOutbox.$inferInsert;

export const postsCronRuns = pgTable(
  "posts_cron_runs",
  {
    id:             bigserial("id", { mode: "number" }).primaryKey(),
    kind:           varchar("kind", { length: 40 }).notNull(),
    startedAt:      timestamp("started_at",  { withTimezone: true }).notNull().defaultNow(),
    finishedAt:     timestamp("finished_at", { withTimezone: true }),
    durationMs:     integer("duration_ms"),
    itemsProcessed: integer("items_processed").notNull().default(0),
    ok:             boolean("ok").notNull().default(false),
    error:          text("error"),
  },
  (t) => [
    index("idx_posts_cron_runs_kind_started").on(t.kind, t.startedAt),
  ],
);

// Sidecar 1:1 con users per preferenze del modulo posts. Row creata lazy
// on first set; assenza row = default app ("public"). Vedi
// M_posts_009_user_preferences.sql.
export const postsUserPreferences = pgTable("posts_user_preferences", {
  userId:            uuid("user_id").primaryKey()
                       .references(() => users.id, { onDelete: "cascade" }),
  defaultVisibility: varchar("default_visibility", { length: 16 }).notNull().default("public"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PostsUserPreferences    = typeof postsUserPreferences.$inferSelect;
export type NewPostsUserPreferences = typeof postsUserPreferences.$inferInsert;

export type PostsCronRun    = typeof postsCronRuns.$inferSelect;
export type NewPostsCronRun = typeof postsCronRuns.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────
// Module: notifications (end-user social notifications)
// ─────────────────────────────────────────────────────────────────────────
// NB: distinto da `adminNotifications` (core, notifiche admin di sistema).
// Popolata dal trigger `posts_outbox_to_notifications_trg` (M_notifications_001)
// con dedup integrato. UI scrive solo `read_at` via Server Action.
export const notifications = pgTable("notifications", {
  id:         uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
  userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:       varchar("type", { length: 64 }).notNull(),
  actorId:    uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  postId:     uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
  commentId:  uuid("comment_id").references(() => postsComments.id, { onDelete: "cascade" }),
  payload:    jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  readAt:     timestamp("read_at",    { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification    = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

/** Match 1:1 con posts_outbox.event_type — sync col CASE plpgsql del trigger.
 *  I tipi `moderation.*` NON passano dal trigger: sono emessi direttamente
 *  da Server Actions admin (vedi reviewReport*Action + revokeStrikeAction). */
export const NOTIFICATION_TYPES = [
  "post.reaction.added",
  "post.comment.created",
  "post.comment.reaction.added",
  "post.mention",
  "post.repost.created",
  "moderation.strike_received",
  "moderation.banned",
  "moderation.strike_revoked",
  // Achievement events (M_notifications_002+003, decisione 2026-05-26):
  // emessi dai trigger DB counter inline al counter update quando un
  // post attraversa una soglia. Recipient = autore del post, actor = NULL.
  "achievement.first_like",
  "achievement.post_viral_likes",
  "achievement.post_viral_comments",
  "achievement.post_viral_reposts",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Set di reaction supportate (allineato al CHECK SQL su posts_reactions.reaction).
 * Mantenere in sync con la migration e con i counter columns su `posts`.
 */
export const POST_REACTION_KINDS = [
  "like",
  "bullish",
  "bearish",
  "to_the_moon",
  "dump",
] as const;
export type PostReactionKind = (typeof POST_REACTION_KINDS)[number];

/**
 * Visibility valida per un post. Allineato al CHECK SQL su posts.visibility.
 * Vedi project_module_posts §Visibility per il significato di ciascun valore.
 */
export const POST_VISIBILITIES = [
  "public",
  "members",
  "followers",
  "private",
] as const;
export type PostVisibility = (typeof POST_VISIBILITIES)[number];

export enum ActivityType {
  SIGN_UP = "SIGN_UP",
  SIGN_IN = "SIGN_IN",
  SIGN_OUT = "SIGN_OUT",
  UPDATE_PASSWORD = "UPDATE_PASSWORD",
  DELETE_ACCOUNT = "DELETE_ACCOUNT",
  UPDATE_ACCOUNT = "UPDATE_ACCOUNT",
  EMAIL_VERIFIED = "EMAIL_VERIFIED",
  EMAIL_CHANGED = "EMAIL_CHANGED",
  PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED",
  SUBSCRIPTION_STARTED = "SUBSCRIPTION_STARTED",
  SUBSCRIPTION_CANCELLED = "SUBSCRIPTION_CANCELLED",
  SUBSCRIPTION_RENEWED = "SUBSCRIPTION_RENEWED",
  SUBSCRIPTION_UPGRADED = "SUBSCRIPTION_UPGRADED",
  SUBSCRIPTION_DOWNGRADED = "SUBSCRIPTION_DOWNGRADED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  ADMIN_BAN_USER = "ADMIN_BAN_USER",
  ADMIN_UNBAN_USER = "ADMIN_UNBAN_USER",
  ADMIN_CHANGE_ROLE = "ADMIN_CHANGE_ROLE",
  ADMIN_DELETE_USER = "ADMIN_DELETE_USER",
  ADMIN_CANCEL_USER_DELETION = "ADMIN_CANCEL_USER_DELETION",
  ADMIN_REVOKE_SESSION = "ADMIN_REVOKE_SESSION",
  ADMIN_REVOKE_ALL_USER_SESSIONS = "ADMIN_REVOKE_ALL_USER_SESSIONS",
  DEVICE_VERIFIED = "DEVICE_VERIFIED",
  MFA_ENABLED = "MFA_ENABLED",
  MFA_DISABLED = "MFA_DISABLED",
  MFA_VERIFIED = "MFA_VERIFIED",
  MFA_RECOVERY_CODE_USED = "MFA_RECOVERY_CODE_USED",
  MFA_RECOVERY_CODES_REGENERATED = "MFA_RECOVERY_CODES_REGENERATED",
  ADMIN_RESET_MFA = "ADMIN_RESET_MFA",
  AVATAR_UPDATED = "AVATAR_UPDATED",
  BIO_UPDATED = "BIO_UPDATED",
  PROFILE_VIEWED = "PROFILE_VIEWED",
  POST_CREATED = "POST_CREATED",
  POST_EDITED = "POST_EDITED",
  POST_DELETED = "POST_DELETED",
  COMMENT_CREATED = "COMMENT_CREATED",
  COMMENT_DELETED = "COMMENT_DELETED",
  LIKE_ADDED = "LIKE_ADDED",
  LIKE_REMOVED = "LIKE_REMOVED",
  FOLLOW_USER = "FOLLOW_USER",
  UNFOLLOW_USER = "UNFOLLOW_USER",
  BLOCK_USER = "BLOCK_USER",
  UNBLOCK_USER = "UNBLOCK_USER",
  NOTIFICATION_READ = "NOTIFICATION_READ",
  MESSAGE_SENT = "MESSAGE_SENT",
  CONTENT_REPORTED = "CONTENT_REPORTED",
  CONTENT_REMOVED = "CONTENT_REMOVED",
  PERMISSION_GRANTED = "PERMISSION_GRANTED",
  PERMISSION_REVOKED = "PERMISSION_REVOKED",
  ROLE_PERMISSION_ADDED = "ROLE_PERMISSION_ADDED",
  ROLE_PERMISSION_REMOVED = "ROLE_PERMISSION_REMOVED",
  PAGE_CREATED = "PAGE_CREATED",
  PAGE_UPDATED = "PAGE_UPDATED",
  PAGE_DELETED = "PAGE_DELETED",
  PAGE_PUBLISHED = "PAGE_PUBLISHED",
  PAGE_UNPUBLISHED = "PAGE_UNPUBLISHED",
  TEMPLATE_CREATED = "TEMPLATE_CREATED",
  TEMPLATE_UPDATED = "TEMPLATE_UPDATED",
  TEMPLATE_DELETED = "TEMPLATE_DELETED",
}

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "image"
  | "url"
  | "date"
  | "select"
  | "toggle"
  | "number";

// ─── Media Library ──────────────────────────────────────────────────────────
// Repository globale di asset (immagini, video, pdf) gestito da
// /admin/content/media. Storage fisico nel bucket Supabase "media", path
// {folder_id ?? "root"}/{uuid}.{ext}. Nel DB tracciamo solo i metadati.

export const mediaFolders = pgTable(
  "media_folders",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    parentId: integer("parent_id"),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_media_folders_parent").on(t.parentId),
    uniqueIndex("uq_media_folders_parent_slug").on(t.parentId, t.slug),
  ],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    folderId: integer("folder_id").references(() => mediaFolders.id, {
      onDelete: "set null",
    }),
    filename: varchar("filename", { length: 255 }).notNull(),
    mime: varchar("mime", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    storagePath: varchar("storage_path", { length: 500 }).notNull().unique(),
    publicUrl: text("public_url").notNull(),
    altText: varchar("alt_text", { length: 255 }),
    title: varchar("title", { length: 255 }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // null = draft (ticket creato, file non ancora confermato presente nel
    // bucket); set = upload completato e verificato. Cron giornaliero
    // pulisce le draft >24h non confermate (utente abbandona, browser
    // crash, network drop a metà PUT). Vedi migration 0038.
    confirmedAt: timestamp("confirmed_at"),
    // Varianti webp processate on-demand quando l'asset diventa l'hero
    // di un articolo news (vedi lib/modules/news/services/hero-processor.ts).
    // Shape: { hero: {url,w,h,size}, card: {...}, thumb: {...} }.
    // null = mai processato (asset usato in altri contesti del CMS).
    variants: jsonb("variants"),
  },
  (t) => [
    index("idx_media_assets_folder").on(t.folderId),
    index("idx_media_assets_created_at").on(t.createdAt),
  ],
);

export type MediaFolder = typeof mediaFolders.$inferSelect;
export type NewMediaFolder = typeof mediaFolders.$inferInsert;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type IpRule = typeof ipRules.$inferSelect;

// ──────────────────────────────────────────────────────────────────────────
// Module: News (curated content pipeline)
// Vedi M_news_001_init.sql per schema completo + razionale.
// ──────────────────────────────────────────────────────────────────────────

export const newsSources = pgTable(
  "news_sources",
  {
    id:             uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    name:           varchar("name", { length: 100 }).notNull(),
    feedUrl:        text("feed_url").notNull(),
    feedType:       varchar("feed_type", { length: 16 }).notNull().default("rss").$type<"rss" | "atom">(),
    active:         boolean("active").notNull().default(true),
    weight:         integer("weight").notNull().default(1),
    lastFetchedAt:  timestamp("last_fetched_at", { withTimezone: true }),
    lastEtag:       text("last_etag"),
    lastModified:   text("last_modified"),
    errorCount:     integer("error_count").notNull().default(0),
    lastError:      text("last_error"),
    lastErrorAt:    timestamp("last_error_at", { withTimezone: true }),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const NEWS_ITEM_STATUSES = [
  "proposed",
  "pending_rewrite",
  "review",
  "scheduled",
  "published",
  "rejected",
  "failed",
] as const;
export type NewsItemStatus = (typeof NEWS_ITEM_STATUSES)[number];

export const newsItems = pgTable(
  "news_items",
  {
    id:                  uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    sourceId:            uuid("source_id").references(() => newsSources.id, { onDelete: "set null" }),
    sourceUrl:           text("source_url").notNull(),
    sourceTitle:         text("source_title").notNull(),
    sourceExcerpt:       text("source_excerpt"),
    sourcePublishedAt:   timestamp("source_published_at", { withTimezone: true }),
    originalHash:        varchar("original_hash", { length: 64 }).notNull().unique(),
    generatedTitleIt:    text("generated_title_it"),
    generatedBodyItMd:   text("generated_body_it_md"),
    generatedExcerptIt:  text("generated_excerpt_it"),
    category:            varchar("category", { length: 40 }),
    heroAssetId:         integer("hero_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    status:              varchar("status", { length: 20 }).notNull().default("pending_rewrite").$type<NewsItemStatus>(),
    scheduledPublishAt:  timestamp("scheduled_publish_at", { withTimezone: true }),
    publishedAt:         timestamp("published_at", { withTimezone: true }),
    publishedPageId:     integer("published_page_id").references(() => pages.id, { onDelete: "set null" }),
    reviewedBy:          uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt:          timestamp("reviewed_at", { withTimezone: true }),
    rejectedReason:      text("rejected_reason"),
    editsCount:          integer("edits_count").notNull().default(0),
    aiModel:             varchar("ai_model", { length: 60 }),
    aiPromptVersion:     varchar("ai_prompt_version", { length: 20 }),
    aiCostCents:         integer("ai_cost_cents").notNull().default(0),
    aiAttemptCount:      integer("ai_attempt_count").notNull().default(0),
    aiLastError:         text("ai_last_error"),
    // Per-item flag: se true, al publish il modulo trasforma la prima
    // occorrenza del nome di un coin noto (Bitcoin, Ethereum, …) in link
    // verso /coins/<symbol>. Cap 1 link per articolo, scelta dall'admin
    // nel review editor. Default false.
    autoLinkCoins:       boolean("auto_link_coins").notNull().default(false),
    createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_news_items_status_created").on(t.status, t.createdAt),
    index("idx_news_items_source").on(t.sourceId, t.createdAt),
  ],
);

export type NewsSource    = typeof newsSources.$inferSelect;
export type NewNewsSource = typeof newsSources.$inferInsert;
export type NewsItem      = typeof newsItems.$inferSelect;
export type NewNewsItem   = typeof newsItems.$inferInsert;
