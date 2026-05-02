import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  // Nullable: gli utenti registrati via OAuth non hanno password
  passwordHash: text("password_hash"),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  isAdmin: boolean("is_admin").notNull().default(false),
  bannedAt: timestamp("banned_at"),
  bannedReason: varchar("banned_reason", { length: 255 }),
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
  bio: text("bio"),
  // Interessi crypto scelti durante l'onboarding (mock — implementazione vera in seguito)
  interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
    grantedBy: uuid("granted_by").references(() => users.id),
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

export const SYSTEM_PAGE_KEYS = ["terms", "privacy", "marketing"] as const;
export type SystemPageKey = (typeof SYSTEM_PAGE_KEYS)[number];

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
  pageType: varchar("page_type", { length: 50 }).notNull().default("page"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  systemKey: varchar("system_key", {
    length: 50,
  }).$type<SystemPageKey | null>(),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").references(() => users.id),
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

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

export const routeVisibility = ["public", "private"] as const;
export type RouteVisibility = (typeof routeVisibility)[number];

export const routeRegistry = pgTable("route_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  pathname: varchar("pathname", { length: 500 }).notNull().unique(),
  label: varchar("label", { length: 150 }).notNull(),
  visibility: varchar("visibility", { length: 20 })
    .notNull()
    .default("public")
    .$type<RouteVisibility>(),
  isActive: boolean("is_active").notNull().default(true),
  isSystemRoute: boolean("is_system_route").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
export type SeoPage         = typeof seoPages.$inferSelect;
export type NewSeoPage      = typeof seoPages.$inferInsert;
export type Page            = typeof pages.$inferSelect;
export type NewPage         = typeof pages.$inferInsert;
export type PageTemplate    = typeof pageTemplates.$inferSelect;
export type NewPageTemplate = typeof pageTemplates.$inferInsert;
export type TemplateField   = typeof templateFields.$inferSelect;
export type NewTemplateField = typeof templateFields.$inferInsert;
export type Redirect        = typeof redirects.$inferSelect;
export type NewRedirect     = typeof redirects.$inferInsert;
export type SiteSnippet     = typeof siteSnippets.$inferSelect;
export type NewSiteSnippet  = typeof siteSnippets.$inferInsert;
export type RouteRegistry   = typeof routeRegistry.$inferSelect;
export type NewRouteRegistry = typeof routeRegistry.$inferInsert;

// ---------------------------------------------------------------------------
// Prices Engine — coin metadata, current price, timeseries, source health
// (vedi migration 0026_prices_engine.sql per il commento architetturale)
// ---------------------------------------------------------------------------

export const coins = pgTable(
  "coins",
  {
    symbol:       varchar("symbol", { length: 20 }).primaryKey(),
    coingeckoId:  varchar("coingecko_id", { length: 100 }).unique(),
    name:         varchar("name", { length: 120 }).notNull(),
    imageUrl:     text("image_url"),
    marketCap:    bigint("market_cap", { mode: "number" }),
    category:     varchar("category", { length: 50 }),
    isActive:     boolean("is_active").notNull().default(true),
    lastSeenAt:   timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt:    timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_coins_active_mcap").on(t.isActive, t.marketCap),
  ],
);

export const prices = pgTable("prices", {
  symbol:       varchar("symbol", { length: 20 }).primaryKey()
                  .references(() => coins.symbol, { onDelete: "cascade" }),
  price:        numeric("price",      { precision: 24, scale: 8 }).notNull(),
  change24h:    numeric("change_24h", { precision: 10, scale: 4 }),
  volume24h:    numeric("volume_24h", { precision: 24, scale: 2 }),
  source:       varchar("source", { length: 20 }).notNull().default("coingecko"),
  lastUpdated:  timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

export const coinPrices = pgTable(
  "coin_prices",
  {
    id:     bigserial("id", { mode: "number" }).primaryKey(),
    symbol: varchar("symbol", { length: 20 }).notNull()
              .references(() => coins.symbol, { onDelete: "cascade" }),
    ts:     timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    price:  numeric("price", { precision: 24, scale: 8 }).notNull(),
  },
  (t) => [
    index("idx_coin_prices_symbol_ts").on(t.symbol, t.ts),
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

export type Coin              = typeof coins.$inferSelect;
export type NewCoin           = typeof coins.$inferInsert;
export type Price             = typeof prices.$inferSelect;
export type NewPrice          = typeof prices.$inferInsert;
export type CoinPrice         = typeof coinPrices.$inferSelect;
export type NewCoinPrice      = typeof coinPrices.$inferInsert;
export type PriceSourceHealth = typeof pricesSourceHealth.$inferSelect;
export type PriceSyncRun      = typeof pricesSyncRuns.$inferSelect;
export type NewPriceSyncRun   = typeof pricesSyncRuns.$inferInsert;

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
  DEVICE_VERIFIED = "DEVICE_VERIFIED",
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
