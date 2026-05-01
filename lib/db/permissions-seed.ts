/**
 * Seed dei permessi base del sistema RBAC.
 * Eseguire con:
 *   pnpm run db:seed-permissions
 *
 * Ruoli di sistema: SOLO "admin" e "member".
 *  - admin  : super admin con isAdmin=true, accesso completo
 *  - member : ruolo default per ogni nuovo utente registrato
 *
 * Tutti gli altri ruoli (es. editor, supporto, moderatore)
 * si creano dall'UI /admin/roles assegnando i permessi granulari RBAC.
 *
 * ── Permessi sezioni admin (admin:*) ─────────────────────────────────────
 * Ogni sezione del pannello admin ha un permesso dedicato.
 * Questo permette di creare ruoli che accedono all'admin ma vedono
 * solo le sezioni per cui hanno il permesso.
 *
 * Esempio ruolo "Billing Manager":
 *  1. Crea ruolo dall'UI /admin/roles
 *  2. Assegna: admin:access, admin:billing
 *  3. Assegna: billing:read, billing:manage_plans, billing:manage_gateways
 *  4. L'utente entra nell'admin e vede solo la sezione Billing
 */
import { db } from "./drizzle";
import { permissions, roles, rolePermissions } from "./schema";
import { eq } from "drizzle-orm";

const PERMISSIONS_SEED = [
  // ── Admin — accesso base ──────────────────────────────────────────────
  { key: "admin:access",     label: "Access admin panel",          group: "Admin", isSystem: true },
  { key: "admin:settings",   label: "Edit app settings",           group: "Admin", isSystem: true },
  { key: "admin:analytics",  label: "View analytics",              group: "Admin", isSystem: true },

  // ── Admin — section permissions (used by Nav Registry) ───────────────
  { key: "admin:content",      label: "Access Content section",        group: "Admin", isSystem: true },
  { key: "admin:seo",          label: "Access SEO section",            group: "Admin", isSystem: true },
  { key: "admin:users",        label: "Access Users section",          group: "Admin", isSystem: true },
  { key: "admin:staff",        label: "Access Staff section",          group: "Admin", isSystem: true },
  { key: "admin:roles",        label: "Access Roles & Permissions",    group: "Admin", isSystem: true },
  { key: "admin:logs",         label: "Access Activity Logs",          group: "Admin", isSystem: true },
  { key: "admin:moderation",   label: "Access Moderation section",     group: "Admin", isSystem: true },
  // [FUTURE] Billing — sezione non ancora implementata, permessi già registrati
  { key: "admin:billing",      label: "Access Billing & Payments section", group: "Admin", isSystem: true },
  { key: "admin:tests",        label: "Access Test Suite section",          group: "Admin", isSystem: true },
  { key: "admin:prices",       label: "Access Prices section",              group: "Admin", isSystem: true },

  // ── Users ─────────────────────────────────────────────────────────────
  { key: "users:read",              label: "View user list",                group: "Users", isSystem: true },
  { key: "users:edit",              label: "Edit other profiles",           group: "Users", isSystem: true },
  { key: "users:delete",            label: "Delete accounts",               group: "Users", isSystem: true },
  { key: "users:ban",               label: "Suspend users",                 group: "Users", isSystem: true },
  { key: "users:role_assign",       label: "Assign roles",                  group: "Users", isSystem: true },
  { key: "users:permission_assign", label: "Assign individual permissions",  group: "Users", isSystem: true },

  // ── Moderation ────────────────────────────────────────────────────────
  { key: "moderation:read", label: "View reports",   group: "Moderation", isSystem: true },
  { key: "moderation:act",  label: "Handle reports", group: "Moderation", isSystem: true },

  // ── Content ───────────────────────────────────────────────────────────
  { key: "content:read",       label: "Read content",             group: "Content", isSystem: false },
  { key: "content:create",     label: "Create content",           group: "Content", isSystem: false },
  { key: "content:edit_own",   label: "Edit own content",         group: "Content", isSystem: false },
  { key: "content:edit_any",   label: "Edit any content",         group: "Content", isSystem: false },
  { key: "content:delete_own", label: "Delete own content",       group: "Content", isSystem: false },
  { key: "content:delete_any", label: "Delete any content",       group: "Content", isSystem: false },
  { key: "content:publish",    label: "Publish without approval", group: "Content", isSystem: false },

  // ── Profile ───────────────────────────────────────────────────────────
  { key: "profile:read",   label: "View own profile", group: "Profile", isSystem: false },
  { key: "profile:edit",   label: "Edit own profile", group: "Profile", isSystem: false },
  { key: "profile:export", label: "Export own data",  group: "Profile", isSystem: false },

  // ── Billing & Payments ────────────────────────────────────────────────
  // [FUTURE] Sezione non ancora implementata.
  // I permessi sono già registrati così:
  //  - il ruolo admin li eredita subito (vedere ROLE_PERMISSION_MAP)
  //  - i ruoli custom possono riceverli già dall'UI matrice permessi
  //  - quando la sezione /admin/billing sarà pronta basta aggiungere
  //    il layout guard + la voce nav (commentata sotto in admin-nav.ts)
  { key: "billing:read",             label: "View billing & invoices",      group: "Billing", isSystem: true },
  { key: "billing:manage_plans",     label: "Create / edit plans",          group: "Billing", isSystem: true },
  { key: "billing:manage_gateways",  label: "Configure payment gateways",   group: "Billing", isSystem: true },
  { key: "billing:issue_refund",     label: "Issue refunds",                group: "Billing", isSystem: true },
  { key: "billing:view_transactions",label: "View all transactions",        group: "Billing", isSystem: true },
  { key: "billing:export",           label: "Export billing data",          group: "Billing", isSystem: true },

  // ── Subscriptions ─────────────────────────────────────────────────────
  // Permessi per la gestione degli abbonamenti degli utenti
  // (upgrade, downgrade, cancel, trial)
  { key: "subscriptions:read",       label: "View subscriptions",           group: "Subscriptions", isSystem: true },
  { key: "subscriptions:manage",     label: "Change user subscriptions",    group: "Subscriptions", isSystem: true },
  { key: "subscriptions:cancel",     label: "Cancel subscriptions",         group: "Subscriptions", isSystem: true },
  { key: "subscriptions:grant_trial",label: "Grant trial access",           group: "Subscriptions", isSystem: true },
] as const;

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  admin: [
    // admin panel
    "admin:access", "admin:settings", "admin:analytics",
    "admin:content", "admin:seo", "admin:users", "admin:staff",
    "admin:roles", "admin:logs", "admin:moderation", "admin:billing", "admin:tests",
    "admin:prices",
    // users
    "users:read", "users:edit", "users:delete", "users:ban",
    "users:role_assign", "users:permission_assign",
    // moderation
    "moderation:read", "moderation:act",
    // content
    "content:read", "content:create", "content:edit_own", "content:edit_any",
    "content:delete_own", "content:delete_any", "content:publish",
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
    // members possono vedere il proprio abbonamento (lato frontend, non admin)
    "subscriptions:read",
  ],
};

async function seed() {
  console.log("🌱 Seeding RBAC permissions...");

  for (const p of PERMISSIONS_SEED) {
    await db
      .insert(permissions)
      .values({ key: p.key, label: p.label, group: p.group, isSystem: p.isSystem })
      .onConflictDoUpdate({
        target: permissions.key,
        set: { label: p.label, group: p.group },
      });
  }
  console.log(`  ✓ ${PERMISSIONS_SEED.length} permissions upserted`);

  for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = await db.query.roles.findFirst({ where: eq(roles.name, roleName) });
    if (!role) { console.warn(`  ⚠ Role "${roleName}" not found — skip`); continue; }

    for (const key of permKeys) {
      const perm = await db.query.permissions.findFirst({ where: eq(permissions.key, key) });
      if (!perm) { console.warn(`  ⚠ Permission "${key}" not found — skip`); continue; }

      await db
        .insert(rolePermissions)
        .values({ roleId: role.id, permissionId: perm.id })
        .onConflictDoNothing();
    }
    console.log(`  ✓ Role "${roleName}": ${permKeys.length} permissions assigned`);
  }

  console.log("✅ Seed complete.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
