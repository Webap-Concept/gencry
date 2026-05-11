"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { adminUserPreferences } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/rbac/guards";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DASHBOARD_WIDGETS_META } from "./_widgets/meta";
import {
  DEFAULT_WIDGET_SIZE,
  GRID_COLS,
  type DashboardWidgetsPref,
  type WidgetItem,
} from "@/lib/admin/dashboard/types";
import { normalizeLayout } from "@/lib/admin/dashboard/layout-utils";
import { getAdminUserDashboardPref } from "@/lib/admin/dashboard/queries";

// ─── Validation schemas ─────────────────────────────────────────────
const enabledSchema = z.object({
  enabled: z.array(z.string().min(1).max(64)).max(64),
});

const itemSchema = z.object({
  id: z.string().min(1).max(64),
  x: z.number().int().min(0).max(GRID_COLS - 1),
  y: z.number().int().min(0).max(200),
  w: z.number().int().min(1).max(GRID_COLS),
  h: z.number().int().min(1).max(40),
});

const itemsSchema = z.object({
  items: z.array(itemSchema).max(64),
});

// ─── Helpers ────────────────────────────────────────────────────────
const VALID_IDS = new Set(DASHBOARD_WIDGETS_META.map((w) => w.id));

function sanitizeIds(ids: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!VALID_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sanitizeItems(items: ReadonlyArray<WidgetItem>): WidgetItem[] {
  const seen = new Set<string>();
  const out: WidgetItem[] = [];
  for (const it of items) {
    if (!VALID_IDS.has(it.id) || seen.has(it.id)) continue;
    seen.add(it.id);
    // Clamp x+w to never exceed the grid edge.
    const w = Math.min(it.w, GRID_COLS);
    const x = Math.min(it.x, GRID_COLS - w);
    out.push({ id: it.id, x, y: it.y, w, h: it.h });
  }
  return out;
}

/** Read existing items from a pref (any shape). Returns empty array
 *  when the pref is null or in a shape we can't extract from. */
function existingItemsFromPref(pref: DashboardWidgetsPref | null): WidgetItem[] {
  if (!pref) return [];
  if ("items" in pref && Array.isArray(pref.items)) return pref.items;
  return [];
}

/** Append default-sized items for ids not already in `existing`. Per-widget
 *  `defaultSize` (declared in meta.ts) is honored so newly-toggled widgets
 *  match the initial dimensions used by the registry default layout. */
function appendNewItems(
  existing: WidgetItem[],
  newIds: ReadonlyArray<string>,
): WidgetItem[] {
  const knownIds = new Set(existing.map((it) => it.id));
  const sizesById = new Map(
    DASHBOARD_WIDGETS_META.map((w) => [w.id, w.defaultSize ?? DEFAULT_WIDGET_SIZE]),
  );
  const out: WidgetItem[] = [...existing];

  // Find a row to start placing the new items from: just below the
  // bottom-most existing item.
  let nextY = 0;
  for (const it of existing) {
    nextY = Math.max(nextY, it.y + it.h);
  }
  let nextX = 0;
  let rowMaxH = 0;

  for (const id of newIds) {
    if (knownIds.has(id)) continue;
    const { w, h } = sizesById.get(id) ?? DEFAULT_WIDGET_SIZE;
    if (nextX + w > GRID_COLS) {
      nextX = 0;
      nextY += rowMaxH;
      rowMaxH = 0;
    }
    out.push({ id, x: nextX, y: nextY, w, h });
    nextX += w;
    if (h > rowMaxH) rowMaxH = h;
  }
  return out;
}

// ─── Save user override (toggle on/off via Customize modal) ─────────
//
// Accepts the list of currently-enabled ids. We DON'T overwrite the
// existing layout: items already positioned keep their x/y/w/h, items
// no longer enabled are dropped, brand-new items are appended at the
// bottom with the default size.
export async function saveUserDashboardWidgets(
  enabled: string[],
): Promise<{ success: true } | { error: string }> {
  const user = await requireAdmin();

  const parsed = enabledSchema.safeParse({ enabled });
  if (!parsed.success) return { error: "invalid_payload" };

  const cleanedIds = sanitizeIds(parsed.data.enabled);

  // Pull current user pref to preserve any positional data.
  const currentPref = await getAdminUserDashboardPref(user.id);
  const existing = existingItemsFromPref(currentPref);

  // Keep only items still enabled, append new ones at the bottom.
  const enabledSet = new Set(cleanedIds);
  const kept = existing.filter((it) => enabledSet.has(it.id));
  const merged = appendNewItems(kept, cleanedIds);

  // Compact vertically so we never persist overlapping rectangles.
  const payload = { items: normalizeLayout(merged, GRID_COLS) };
  const now = new Date();

  await db
    .insert(adminUserPreferences)
    .values({
      userId: user.id,
      dashboardWidgets: payload,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: adminUserPreferences.userId,
      set: {
        dashboardWidgets: payload,
        updatedAt: now,
      },
    });

  revalidatePath(await getAdminPath("dashboard"));
  return { success: true };
}

// ─── Save user layout (drag/resize via Edit Layout mode) ────────────
//
// Accepts the full set of items with their positions. The set of ids
// is treated as authoritative — anything not in the payload is removed.
export async function saveUserDashboardLayout(
  items: WidgetItem[],
): Promise<{ success: true } | { error: string }> {
  const user = await requireAdmin();

  const parsed = itemsSchema.safeParse({ items });
  if (!parsed.success) return { error: "invalid_payload" };

  const cleanedItems = sanitizeItems(parsed.data.items);
  // Compact vertically: even if the client sent slightly overlapping
  // rectangles (RGL edge cases, paste-from-DB, etc.), the persisted
  // shape is always collision-free.
  const payload = { items: normalizeLayout(cleanedItems, GRID_COLS) };
  const now = new Date();

  await db
    .insert(adminUserPreferences)
    .values({
      userId: user.id,
      dashboardWidgets: payload,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: adminUserPreferences.userId,
      set: {
        dashboardWidgets: payload,
        updatedAt: now,
      },
    });

  revalidatePath(await getAdminPath("dashboard"));
  return { success: true };
}

// ─── Reset to role default ──────────────────────────────────────────
// Sets the user override to NULL so the resolver falls back to the role
// preset (or registry defaults if no preset). We keep the row to track
// updatedAt; an explicit DELETE would also work but is not necessary.
export async function resetUserDashboardWidgets(): Promise<
  { success: true } | { error: string }
> {
  const user = await requireAdmin();
  const now = new Date();

  await db
    .insert(adminUserPreferences)
    .values({
      userId: user.id,
      dashboardWidgets: sql`NULL`,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: adminUserPreferences.userId,
      set: {
        dashboardWidgets: sql`NULL`,
        updatedAt: now,
      },
    });

  revalidatePath(await getAdminPath("dashboard"));
  return { success: true };
}
