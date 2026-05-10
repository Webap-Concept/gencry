"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { adminUserPreferences } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/rbac/guards";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DASHBOARD_WIDGETS_META } from "./_widgets/meta";

// ─── Validation ─────────────────────────────────────────────────────
// We accept any string array, but only persist ids that are still in the
// registry. This protects against stale clients sending removed ids and
// against payload pollution.
const dashboardPrefSchema = z.object({
  enabled: z.array(z.string().min(1).max(64)).max(64),
});

function sanitizeIds(ids: ReadonlyArray<string>): string[] {
  const valid = new Set(DASHBOARD_WIDGETS_META.map((w) => w.id));
  // Preserve incoming order but drop unknown ids and dedupe.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// ─── Save user override ─────────────────────────────────────────────
export async function saveUserDashboardWidgets(
  enabled: string[],
): Promise<{ success: true } | { error: string }> {
  const user = await requireAdmin();

  const parsed = dashboardPrefSchema.safeParse({ enabled });
  if (!parsed.success) return { error: "invalid_payload" };

  const cleanedIds = sanitizeIds(parsed.data.enabled);
  const payload = { enabled: cleanedIds };
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
