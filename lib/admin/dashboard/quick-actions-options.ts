// lib/admin/dashboard/quick-actions-options.ts
//
// Backing data + resolver for the Customizable Quick Actions widget on
// the admin dashboard. Three concerns live here:
//
//   1. Flatten ADMIN_NAV into a flat list of LEAF entries (the ones
//      with an href — group headers are excluded), tagged with their
//      group for display in the customize modal.
//   2. Permission gating: a leaf is only "available" if the current
//      user has both the leaf's permission AND the group's permission.
//      Super-admins bypass both checks.
//   3. Resolver: given the user, return the list of QuickActionOption
//      that should render right now — applying user override → defaults,
//      intersecting with current permissions, and capping at MAX.
//
// Why a dedicated module: the widget (RSC) and the customize modal
// (client component, via server action wrapper) both need the same
// resolution logic; keeping it here avoids duplication and guarantees
// the modal's "available" list matches the widget's render exactly.

import "server-only";

import { eq } from "drizzle-orm";
import { ADMIN_NAV, type NavChild, type NavItem } from "@/lib/admin-nav";
import { db } from "@/lib/db/drizzle";
import { adminUserPreferences } from "@/lib/db/schema";
import { getUserPermissions, type UserLike } from "@/lib/rbac/can";

export const QUICK_ACTIONS_MAX = 10;

/**
 * Default tiles when the user has never customized. Picked to be the
 * four most universally useful shortcuts; the keys live in ADMIN_NAV.
 * If you rename any of these in admin-nav, update this list too — a
 * stale key here would just be filtered out at resolve time, leaving
 * the widget with fewer defaults than expected.
 */
export const QUICK_ACTIONS_DEFAULTS: ReadonlyArray<string> = [
  "users-list",
  "users-roles",
  "content-pages",
  "settings-general",
];

export interface QuickActionOption {
  /** Stable nav-registry key — what we persist in DB. */
  key: string;
  /** Path RELATIVE to the admin slug; combine with the slug at render. */
  href: string;
  /** Fallback label from the nav registry (i18n preferred at render time). */
  label: string;
  /** Lucide icon name; resolve via getNavIcon. */
  icon: string;
  /** Top-level nav group key (e.g. "users-group") for modal grouping. */
  groupKey: string;
  /** Fallback group label from the registry. */
  groupLabel: string;
}

// ── Flatten ─────────────────────────────────────────────────────────────────

/**
 * Walk ADMIN_NAV and emit one QuickActionOption per leaf (entry with an
 * href). Group headers and sub-group nodes are skipped. We DON'T filter
 * by permission here — callers do that, because the modal needs the
 * raw "available to me" list while the widget needs an even stricter
 * intersection with the user's saved selection.
 *
 * Top-level items that are themselves leaves (e.g. `dashboard`, `tests`,
 * `logs`) get a synthetic group of themselves — they still need a
 * groupKey for the modal layout. The `dashboard` leaf is excluded
 * explicitly: putting a "go to dashboard" tile on the dashboard is
 * never what an admin wants.
 */
function flattenLeaves(): QuickActionOption[] {
  const out: QuickActionOption[] = [];

  function visit(
    node: NavChild,
    groupKey: string,
    groupLabel: string,
  ): void {
    if (node.children && node.children.length > 0) {
      for (const c of node.children) visit(c, groupKey, groupLabel);
      return;
    }
    if (!node.href) return;
    out.push({
      key: node.key,
      href: node.href,
      label: node.label,
      icon: node.icon,
      groupKey,
      groupLabel,
    });
  }

  for (const top of ADMIN_NAV) {
    if (top.key === "dashboard") continue;
    if (top.children && top.children.length > 0) {
      for (const c of top.children) visit(c, top.key, top.label);
    } else if (top.href) {
      out.push({
        key: top.key,
        href: top.href,
        label: top.label,
        icon: top.icon,
        groupKey: top.key,
        groupLabel: top.label,
      });
    }
  }

  return out;
}

// ── Permission gating ───────────────────────────────────────────────────────

/**
 * Build the set of leaves the user can see. Mirrors the sidebar's
 * permission walk: a leaf is included only when the user has BOTH the
 * leaf's permission and its umbrella group's permission. Super-admins
 * (`user.isAdmin`) bypass the check.
 */
export async function getAvailableQuickActions(
  user: UserLike & { isAdmin?: boolean },
): Promise<QuickActionOption[]> {
  const all = flattenLeaves();
  if (user.isAdmin) return all;

  const perms = await getUserPermissions(user);

  // Group umbrella permission lookup — same source the sidebar uses.
  const groupPerm = new Map<string, string>();
  for (const top of ADMIN_NAV) groupPerm.set(top.key, top.permission);

  // Map leaf key → leaf permission (we walked children only).
  const leafPerm = new Map<string, string>();
  function indexLeaves(node: NavItem | NavChild) {
    if (node.children && node.children.length > 0) {
      for (const c of node.children) indexLeaves(c);
    } else {
      leafPerm.set(node.key, node.permission);
    }
  }
  for (const top of ADMIN_NAV) indexLeaves(top);

  return all.filter((opt) => {
    const groupPermKey = groupPerm.get(opt.groupKey);
    const leafPermKey = leafPerm.get(opt.key);
    if (groupPermKey && !perms.has(groupPermKey)) return false;
    if (leafPermKey && !perms.has(leafPermKey)) return false;
    return true;
  });
}

// ── Persistence ─────────────────────────────────────────────────────────────

/** Fetch the user's saved quick_actions, or null if they never saved. */
export async function getUserQuickActions(
  userId: string,
): Promise<string[] | null> {
  const rows = await db
    .select({ quickActions: adminUserPreferences.quickActions })
    .from(adminUserPreferences)
    .where(eq(adminUserPreferences.userId, userId))
    .limit(1);
  return rows[0]?.quickActions ?? null;
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * What the widget actually renders. Pipeline:
 *  1. Compute the user's "available" leaves (RBAC-filtered).
 *  2. If the user has saved selections, keep only those that are still
 *     available (lost permission, renamed key, etc. are filtered out).
 *  3. Otherwise fall back to QUICK_ACTIONS_DEFAULTS, also intersected
 *     with available — admins without all 4 default permissions still
 *     get a sensible subset rather than a broken tile.
 *  4. Cap at QUICK_ACTIONS_MAX (defensive — the action also caps).
 *
 * Returns both the resolved options AND `hasUserOverride` so the modal
 * can decide whether to show the "Reset" button.
 */
export async function resolveQuickActions(
  user: UserLike & { isAdmin?: boolean },
): Promise<{
  options: QuickActionOption[];
  available: QuickActionOption[];
  hasUserOverride: boolean;
}> {
  const [available, saved] = await Promise.all([
    getAvailableQuickActions(user),
    getUserQuickActions(user.id),
  ]);

  const availableByKey = new Map(available.map((o) => [o.key, o]));
  const sourceKeys = saved ?? QUICK_ACTIONS_DEFAULTS;

  const options: QuickActionOption[] = [];
  for (const key of sourceKeys) {
    const opt = availableByKey.get(key);
    if (opt) options.push(opt);
    if (options.length >= QUICK_ACTIONS_MAX) break;
  }

  return {
    options,
    available,
    hasUserOverride: saved !== null,
  };
}
