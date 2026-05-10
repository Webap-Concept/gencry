// Resolver for the admin dashboard — combines the 3 levels of preferences
// (user override → role preset → registry default) and applies the RBAC gate.
//
// Pure functions: take the data already fetched by the page, return the
// final list of widget ids to render. No DB calls here.

import type { DashboardWidgetsPref, WidgetMeta } from "./types";

/**
 * Compute which widget ids should render for a given user, given:
 *  - the registry (source of truth for what widgets exist)
 *  - the user's per-user override (or null)
 *  - the role presets attached to the user's role(s) (array — multi-role
 *    union semantics; today users have a single role, but the API takes
 *    an array so multi-role can land later without touching callers)
 *  - the user's permission set (or `superAdmin` flag for bypass)
 *
 * Resolution order (top wins):
 *   1. user.enabled       → use as-is
 *   2. union(role.enabled) → use union of all role presets (any non-null)
 *   3. registry.defaultEnabled
 *
 * Then a non-bypassable RBAC filter removes ids the user cannot see.
 * Super admins bypass the RBAC filter (they have everything).
 *
 * Finally, ids that no longer exist in the registry are dropped (a widget
 * was removed in code but persisted prefs still reference it).
 */
export function resolveEnabledWidgetIds(args: {
  registry: ReadonlyArray<WidgetMeta>;
  userPref: DashboardWidgetsPref | null;
  rolePresets: ReadonlyArray<DashboardWidgetsPref | null>;
  userPermissions: ReadonlySet<string>;
  isSuperAdmin: boolean;
}): string[] {
  const { registry, userPref, rolePresets, userPermissions, isSuperAdmin } = args;

  const validIds = new Set(registry.map((w) => w.id));

  const baseEnabled: string[] = (() => {
    if (userPref?.enabled) return userPref.enabled;

    const presetUnion = new Set<string>();
    let anyRolePreset = false;
    for (const preset of rolePresets) {
      if (preset?.enabled) {
        anyRolePreset = true;
        for (const id of preset.enabled) presetUnion.add(id);
      }
    }
    if (anyRolePreset) return [...presetUnion];

    return registry.filter((w) => w.defaultEnabled).map((w) => w.id);
  })();

  // Drop ids that are no longer in the registry, then enforce RBAC.
  const result: string[] = [];
  for (const id of baseEnabled) {
    if (!validIds.has(id)) continue;
    const widget = registry.find((w) => w.id === id);
    if (!widget) continue;
    if (
      widget.requiredPermission &&
      !isSuperAdmin &&
      !userPermissions.has(widget.requiredPermission)
    ) {
      continue;
    }
    result.push(id);
  }

  // Preserve registry order for stable rendering, regardless of how the
  // persisted array is sorted.
  const order = new Map(registry.map((w, i) => [w.id, i]));
  result.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  return result;
}

/**
 * Same as resolveEnabledWidgetIds but also returns the list of widgets the
 * user is *allowed* to see (registry filtered by RBAC). Used by the
 * customize modal to know which toggles to show.
 */
export function getVisibleRegistry(args: {
  registry: ReadonlyArray<WidgetMeta>;
  userPermissions: ReadonlySet<string>;
  isSuperAdmin: boolean;
}): WidgetMeta[] {
  const { registry, userPermissions, isSuperAdmin } = args;
  return registry.filter((w) => {
    if (!w.requiredPermission) return true;
    if (isSuperAdmin) return true;
    return userPermissions.has(w.requiredPermission);
  });
}
