/**
 * Single source of truth for the core RBAC permission catalog and the
 * default role → permission map. Pure data — no DB access — so it can
 * be imported by both the CLI seed script (`permissions-seed.ts`) and
 * the runtime "Sync system permissions" admin action without dragging
 * Drizzle into either side.
 *
 * Adding a permission only takes editing CORE_PERMISSIONS (and, if it
 * should belong to admin / member by default, ROLE_PERMISSION_MAP) —
 * the rest is wired up automatically.
 */

import { INSTALLED_MODULES } from "@/lib/modules/registry";

export type SeedPermission = {
  key: string;
  label: string;
  group: string;
  isSystem: boolean;
};

export const CORE_PERMISSIONS: SeedPermission[] = [
  // ── Admin — accesso base ─────────────────────────────────────────────
  { key: "admin:access",     label: "Access admin panel",          group: "Admin", isSystem: true },
  { key: "admin:settings",   label: "Edit app settings",           group: "Admin", isSystem: true },
  { key: "admin:analytics",  label: "View analytics",              group: "Admin", isSystem: true },

  // ── Admin — section permissions (used by Nav Registry) ──────────────
  { key: "admin:content",      label: "Access Content section",            group: "Admin", isSystem: true },
  { key: "admin:seo",          label: "Access SEO section",                group: "Admin", isSystem: true },
  { key: "admin:users",        label: "Access Users section",              group: "Admin", isSystem: true },
  { key: "admin:staff",        label: "Access Staff section",              group: "Admin", isSystem: true },
  { key: "admin:roles",        label: "Access Roles & Permissions",        group: "Admin", isSystem: true },
  { key: "admin:logs",         label: "Access Activity Logs",              group: "Admin", isSystem: true },
  { key: "admin:moderation",   label: "Access Moderation section",         group: "Admin", isSystem: true },
  // [FUTURE] Billing — sezione non ancora implementata, permessi già registrati
  { key: "admin:billing",      label: "Access Billing & Payments section", group: "Admin", isSystem: true },
  { key: "admin:tests",        label: "Access Test Suite section",         group: "Admin", isSystem: true },
  { key: "admin:sessions",     label: "Access Sessions section",           group: "Admin", isSystem: true },
  { key: "admin:gdpr",         label: "Access Compliance & GDPR section",  group: "Admin", isSystem: true },
  { key: "admin:languages",    label: "Manage languages",                  group: "Admin", isSystem: true },

  // ── Users ────────────────────────────────────────────────────────────
  { key: "users:read",              label: "View user list",                  group: "Users", isSystem: true },
  { key: "users:edit",              label: "Edit other profiles",             group: "Users", isSystem: true },
  { key: "users:delete",            label: "Delete accounts",                 group: "Users", isSystem: true },
  { key: "users:ban",               label: "Suspend users",                   group: "Users", isSystem: true },
  { key: "users:role_assign",       label: "Assign roles",                    group: "Users", isSystem: true },
  { key: "users:permission_assign", label: "Assign individual permissions",   group: "Users", isSystem: true },

  // ── Moderation ───────────────────────────────────────────────────────
  { key: "moderation:read", label: "View reports",   group: "Moderation", isSystem: true },
  { key: "moderation:act",  label: "Handle reports", group: "Moderation", isSystem: true },

  // ── Content ──────────────────────────────────────────────────────────
  { key: "content:read",       label: "Read content",             group: "Content", isSystem: false },
  { key: "content:create",     label: "Create content",           group: "Content", isSystem: false },
  { key: "content:edit_own",   label: "Edit own content",         group: "Content", isSystem: false },
  { key: "content:edit_any",   label: "Edit any content",         group: "Content", isSystem: false },
  { key: "content:delete_own", label: "Delete own content",       group: "Content", isSystem: false },
  { key: "content:delete_any", label: "Delete any content",       group: "Content", isSystem: false },
  { key: "content:publish",    label: "Publish without approval", group: "Content", isSystem: false },
  // High-privilege content permissions: structural changes that affect
  // every CMS page, separate from per-article create/edit. A blogger
  // typically gets the create/edit_own set without these two.
  { key: "content:templates",  label: "Manage page templates",    group: "Content", isSystem: true  },
  { key: "content:styles",     label: "Manage CMS custom CSS",    group: "Content", isSystem: true  },

  // ── Profile ──────────────────────────────────────────────────────────
  { key: "profile:read",   label: "View own profile", group: "Profile", isSystem: false },
  { key: "profile:edit",   label: "Edit own profile", group: "Profile", isSystem: false },
  { key: "profile:export", label: "Export own data",  group: "Profile", isSystem: false },

  // ── Billing & Payments ───────────────────────────────────────────────
  // [FUTURE] Sezione non ancora implementata.
  { key: "billing:read",              label: "View billing & invoices",    group: "Billing", isSystem: true },
  { key: "billing:manage_plans",      label: "Create / edit plans",        group: "Billing", isSystem: true },
  { key: "billing:manage_gateways",   label: "Configure payment gateways", group: "Billing", isSystem: true },
  { key: "billing:issue_refund",      label: "Issue refunds",              group: "Billing", isSystem: true },
  { key: "billing:view_transactions", label: "View all transactions",      group: "Billing", isSystem: true },
  { key: "billing:export",            label: "Export billing data",        group: "Billing", isSystem: true },

  // ── Subscriptions ────────────────────────────────────────────────────
  { key: "subscriptions:read",        label: "View subscriptions",        group: "Subscriptions", isSystem: true },
  { key: "subscriptions:manage",      label: "Change user subscriptions", group: "Subscriptions", isSystem: true },
  { key: "subscriptions:cancel",      label: "Cancel subscriptions",      group: "Subscriptions", isSystem: true },
  { key: "subscriptions:grant_trial", label: "Grant trial access",        group: "Subscriptions", isSystem: true },
];

/**
 * Default permissions per role. Module permissions (`modules:*`) are
 * appended at runtime by reading INSTALLED_MODULES, so this map stays
 * free of module-specific keys.
 */
export const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  admin: [
    // admin panel
    "admin:access", "admin:settings", "admin:analytics",
    "admin:content", "admin:seo", "admin:users", "admin:staff",
    "admin:roles", "admin:logs", "admin:moderation", "admin:billing", "admin:tests",
    "admin:sessions", "admin:gdpr", "admin:languages",
    // users
    "users:read", "users:edit", "users:delete", "users:ban",
    "users:role_assign", "users:permission_assign",
    // moderation
    "moderation:read", "moderation:act",
    // content
    "content:read", "content:create", "content:edit_own", "content:edit_any",
    "content:delete_own", "content:delete_any", "content:publish",
    "content:templates", "content:styles",
    // profile
    "profile:read", "profile:edit", "profile:export",
    // billing
    "billing:read", "billing:manage_plans", "billing:manage_gateways",
    "billing:issue_refund", "billing:view_transactions", "billing:export",
    // subscriptions
    "subscriptions:read", "subscriptions:manage",
    "subscriptions:cancel", "subscriptions:grant_trial",
  ],
  member: [
    "content:read", "content:create",
    "content:edit_own", "content:delete_own",
    "profile:read", "profile:edit", "profile:export",
    // members can see their own subscription (frontend, not admin)
    "subscriptions:read",
  ],
};

/**
 * Builds the list of module-derived permissions from the installed
 * registry. Each module contributes `permission + permissionLabel`
 * plus any `extraPermissions[]`. All land in the "Modules" group.
 */
export function buildModulePermissions(): SeedPermission[] {
  const out: SeedPermission[] = [];
  for (const m of INSTALLED_MODULES) {
    out.push({
      key: m.permission,
      label: m.permissionLabel,
      group: "Modules",
      isSystem: true,
    });
    for (const extra of m.extraPermissions ?? []) {
      out.push({
        key: extra.key,
        label: extra.label,
        group: "Modules",
        isSystem: true,
      });
    }
  }
  return out;
}

/** Core + module permissions in one list. */
export function getAllSystemPermissions(): SeedPermission[] {
  return [...CORE_PERMISSIONS, ...buildModulePermissions()];
}

/** Keys that admin should always have (core admin map + every installed
 *  module's base permission). Module `extraPermissions` are NOT
 *  auto-granted: they go through manual assignment. */
export function getAdminRoleKeys(): string[] {
  return [
    ...ROLE_PERMISSION_MAP.admin,
    ...INSTALLED_MODULES.map((m) => m.permission),
  ];
}
