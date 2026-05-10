// Server-only queries for the admin dashboard widget system.

import { db } from "@/lib/db/drizzle";
import { adminUserPreferences, roles } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { cache } from "react";
import "server-only";
import type { DashboardWidgetsPref } from "./types";

/**
 * Read the per-user dashboard preference, or null if no row exists yet.
 * Cached per-request: the page resolves widgets once and might re-read
 * inside the customize-modal data flow.
 */
export const getAdminUserDashboardPref = cache(async function getAdminUserDashboardPref(
  userId: string,
): Promise<DashboardWidgetsPref | null> {
  const [row] = await db
    .select({ dashboardWidgets: adminUserPreferences.dashboardWidgets })
    .from(adminUserPreferences)
    .where(eq(adminUserPreferences.userId, userId))
    .limit(1);

  return row?.dashboardWidgets ?? null;
});

/**
 * Read role presets for a list of role names. Returns an array aligned
 * with the input order, with `null` for roles that don't exist or have
 * no preset configured. Today users only have one role; the array shape
 * is here so multi-role can land later without touching callers.
 */
export const getRolePresetsByNames = cache(async function getRolePresetsByNames(
  roleNames: ReadonlyArray<string>,
): Promise<Array<DashboardWidgetsPref | null>> {
  if (roleNames.length === 0) return [];

  const rows = await db
    .select({ name: roles.name, dashboardWidgets: roles.dashboardWidgets })
    .from(roles)
    .where(inArray(roles.name, [...roleNames]));

  const byName = new Map(rows.map((r) => [r.name, r.dashboardWidgets]));
  return roleNames.map((n) => byName.get(n) ?? null);
});
