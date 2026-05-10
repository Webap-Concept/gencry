// Resolver for the admin dashboard — combines the 3 levels of preferences
// (user override → role preset → registry default) and applies the RBAC gate.
//
// Pure functions: take the data already fetched by the page, return the
// final list of widget items (id + position + size) to render. No DB calls.

import {
  DEFAULT_WIDGET_SIZE,
  GRID_COLS,
  type DashboardWidgetsPref,
  type WidgetItem,
  type WidgetMeta,
} from "./types";
import { normalizeLayout } from "./layout-utils";

/** Read the enabled-id list from either shape of DashboardWidgetsPref.
 *  Returns null when the pref carries no enabled set (e.g. malformed). */
function extractEnabledIds(pref: DashboardWidgetsPref | null): string[] | null {
  if (!pref) return null;
  if ("items" in pref && Array.isArray(pref.items)) {
    return pref.items.map((it) => it.id);
  }
  if ("enabled" in pref && Array.isArray(pref.enabled)) {
    return pref.enabled;
  }
  return null;
}

/** Read the layout items from a pref, or null if the pref is in the legacy
 *  `enabled`-only shape (no positional info to honor). */
function extractItems(pref: DashboardWidgetsPref | null): WidgetItem[] | null {
  if (!pref) return null;
  if ("items" in pref && Array.isArray(pref.items)) return pref.items;
  return null;
}

/** Build a default layout for an ordered list of ids: stack pairs of
 *  half-width cards (w=6, h=2) two-per-row down the grid. Used when the
 *  effective preference doesn't carry positional info. */
function defaultLayoutFor(ids: ReadonlyArray<string>): WidgetItem[] {
  const items: WidgetItem[] = [];
  let x = 0;
  let y = 0;
  for (const id of ids) {
    const w = DEFAULT_WIDGET_SIZE.w;
    const h = DEFAULT_WIDGET_SIZE.h;
    if (x + w > GRID_COLS) {
      x = 0;
      y += h;
    }
    items.push({ id, x, y, w, h });
    x += w;
  }
  return items;
}

/**
 * Compute which widgets should render for a given user, with their grid
 * positions. Resolution order (top wins):
 *   1. user override       → use as-is
 *   2. union(role.presets) → union ids; positions are merged when present
 *   3. registry default    → defaultEnabled list with auto-flow positions
 *
 * Then a non-bypassable RBAC filter removes widgets the user cannot see.
 * Finally, ids that no longer exist in the registry are dropped silently.
 */
export function resolveDashboardLayout(args: {
  registry: ReadonlyArray<WidgetMeta>;
  userPref: DashboardWidgetsPref | null;
  rolePresets: ReadonlyArray<DashboardWidgetsPref | null>;
  userPermissions: ReadonlySet<string>;
  isSuperAdmin: boolean;
}): WidgetItem[] {
  const { registry, userPref, rolePresets, userPermissions, isSuperAdmin } = args;
  const validIds = new Set(registry.map((w) => w.id));

  // 1) Determine the source layout (positional if available, else ids only).
  let baseItems: WidgetItem[] | null = null;
  let baseIds: string[] | null = null;

  const userItems = extractItems(userPref);
  if (userItems) {
    baseItems = userItems;
  } else {
    const userIds = extractEnabledIds(userPref);
    if (userIds) {
      baseIds = userIds;
    } else {
      // Union role presets. Prefer positional info when any preset has it;
      // otherwise fall back to id union with default layout.
      const presetItemsUnion = new Map<string, WidgetItem>();
      const presetIds = new Set<string>();
      let anyPresetItems = false;
      let anyPreset = false;

      for (const preset of rolePresets) {
        const items = extractItems(preset);
        if (items) {
          anyPresetItems = true;
          anyPreset = true;
          for (const it of items) {
            // Last write wins for duplicates across multi-role unions —
            // good enough for v1, single-role today anyway.
            presetItemsUnion.set(it.id, it);
          }
          continue;
        }
        const ids = extractEnabledIds(preset);
        if (ids) {
          anyPreset = true;
          for (const id of ids) presetIds.add(id);
        }
      }

      if (anyPresetItems) {
        baseItems = [...presetItemsUnion.values()];
      } else if (anyPreset) {
        baseIds = [...presetIds];
      } else {
        baseIds = registry.filter((w) => w.defaultEnabled).map((w) => w.id);
      }
    }
  }

  // 2) Materialize to a list of items with default sizing where needed.
  const items: WidgetItem[] = baseItems ?? defaultLayoutFor(baseIds ?? []);

  // 3) Drop unknown ids and apply the RBAC gate.
  const filtered = items.filter((it) => {
    if (!validIds.has(it.id)) return false;
    const widget = registry.find((w) => w.id === it.id);
    if (!widget) return false;
    if (
      widget.requiredPermission &&
      !isSuperAdmin &&
      !userPermissions.has(widget.requiredPermission)
    ) {
      return false;
    }
    return true;
  });

  // 4) Clamp to grid + vertical compaction. Auto-fixes historic data
  //    that was saved with overlapping x/y/w/h before this step landed
  //    (the static CSS grid render has no collision detection).
  return normalizeLayout(filtered, GRID_COLS);
}

/**
 * Returns just the enabled ids — kept for callers (e.g. customize modal)
 * that don't need positions, just "is X on?" checks.
 */
export function resolveEnabledWidgetIds(args: {
  registry: ReadonlyArray<WidgetMeta>;
  userPref: DashboardWidgetsPref | null;
  rolePresets: ReadonlyArray<DashboardWidgetsPref | null>;
  userPermissions: ReadonlySet<string>;
  isSuperAdmin: boolean;
}): string[] {
  return resolveDashboardLayout(args).map((it) => it.id);
}

/**
 * The list of widgets the user is *allowed* to see, registry filtered by
 * RBAC. Used by the customize modal to know which toggles to show.
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
