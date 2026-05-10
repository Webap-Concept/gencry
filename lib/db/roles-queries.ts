// lib/db/roles-queries.ts
import { db } from "@/lib/db/drizzle";
import { permissions, rolePermissions, roles } from "@/lib/db/schema";
import { asc, or, eq, sql } from "drizzle-orm";
import "server-only";

export type RoleRow = {
  id: number;
  name: string;
  label: string;
  color: string;
  description: string | null;
  isAdmin: boolean;
  isSystem: boolean;
  sortOrder: number;
  dashboardWidgets: { enabled: string[] } | null;
};

export async function getAdminRoles(): Promise<RoleRow[]> {
  return db
    .select({
      id: roles.id,
      name: roles.name,
      label: roles.label,
      color: roles.color,
      description: roles.description,
      isAdmin: roles.isAdmin,
      isSystem: roles.isSystem,
      sortOrder: roles.sortOrder,
      dashboardWidgets: roles.dashboardWidgets,
    })
    .from(roles)
    .orderBy(asc(roles.sortOrder), asc(roles.name));
}

/** Ruoli assegnabili allo staff: isAdmin=true OPPURE almeno un permesso admin:* */
export async function getStaffAssignableRoles(): Promise<RoleRow[]> {
  return db
    .select({
      id: roles.id,
      name: roles.name,
      label: roles.label,
      color: roles.color,
      description: roles.description,
      isAdmin: roles.isAdmin,
      isSystem: roles.isSystem,
      sortOrder: roles.sortOrder,
      dashboardWidgets: roles.dashboardWidgets,
    })
    .from(roles)
    .where(
      or(
        eq(roles.isAdmin, true),
        sql`EXISTS (
          SELECT 1 FROM ${rolePermissions} rp
          INNER JOIN ${permissions} p ON p.id = rp.permission_id
          WHERE rp.role_id = ${roles.id}
            AND p.key LIKE 'admin:%'
        )`,
      ),
    )
    .orderBy(asc(roles.sortOrder), asc(roles.name));
}
