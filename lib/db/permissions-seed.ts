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
 * ── Permessi sezioni admin (admin:*) ────────────────────────────────
 * Ogni sezione del pannello admin ha un permesso dedicato.
 * Questo permette di creare ruoli che accedono all'admin ma vedono
 * solo le sezioni per cui hanno il permesso.
 *
 * ── Permessi dei moduli (modules:*) ─────────────────────────────────
 * I permessi dei moduli social plugabili NON sono hardcoded — vengono
 * raccolti a runtime da `INSTALLED_MODULES` (vedi permissions-data.ts).
 *
 * ── Source of truth ─────────────────────────────────────────────────
 * I dati (CORE_PERMISSIONS, ROLE_PERMISSION_MAP, builders dei moduli)
 * vivono in `lib/db/permissions-data.ts` per essere condivisi tra
 * questo script CLI e l'azione "Sync system permissions" del pannello.
 * Aggiungere un permesso = editare quel file.
 */
import { eq } from "drizzle-orm";
import { INSTALLED_MODULES } from "../modules/registry";
import { db } from "./drizzle";
import {
  buildModulePermissions,
  CORE_PERMISSIONS,
  getAdminRoleKeys,
  ROLE_PERMISSION_MAP,
} from "./permissions-data";
import { permissions, roles, rolePermissions } from "./schema";

async function seed() {
  console.log("🌱 Seeding RBAC permissions...");

  // Permessi core
  for (const p of CORE_PERMISSIONS) {
    await db
      .insert(permissions)
      .values({ key: p.key, label: p.label, group: p.group, isSystem: p.isSystem })
      .onConflictDoUpdate({
        target: permissions.key,
        set: { label: p.label, group: p.group },
      });
  }
  console.log(`  ✓ ${CORE_PERMISSIONS.length} core permissions upserted`);

  // Permessi dei moduli installati (caricati dinamicamente dal registry)
  const modulePerms = buildModulePermissions();
  for (const p of modulePerms) {
    await db
      .insert(permissions)
      .values({ key: p.key, label: p.label, group: p.group, isSystem: p.isSystem })
      .onConflictDoUpdate({
        target: permissions.key,
        set: { label: p.label, group: p.group },
      });
  }
  console.log(
    `  ✓ ${modulePerms.length} module permissions upserted (from ${INSTALLED_MODULES.length} installed modules)`,
  );

  // Role → permission map: combina map core + permessi base dei moduli installati
  // (gli extraPermissions vanno gestiti manualmente, non auto-granted ad admin)
  const fullRoleMap: Record<string, string[]> = {
    ...ROLE_PERMISSION_MAP,
    admin: getAdminRoleKeys(),
  };

  for (const [roleName, permKeys] of Object.entries(fullRoleMap)) {
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
