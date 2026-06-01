"use server";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { db } from "@/lib/db/drizzle";
import { rewardsCatalog, type RewardsCatalogType } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const CatalogItemSchema = z.object({
  slug:        z.string().min(2).max(50).regex(/^[a-z0-9_]+$/, "Solo lettere minuscole, numeri e underscore"),
  label:       z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type:        z.enum(["badge", "perk"]),
  iconUrl:     z.string().url().optional().or(z.literal("")),
  iconBg:      z.string().max(20).optional(),
  costGcc:     z.coerce.number().min(0).max(1_000_000),
  isActive:    z.boolean(),
  isUnique:    z.boolean(),
  perkData:    z.string().optional(), // JSON string
});

export type CatalogItemInput = z.input<typeof CatalogItemSchema>;

export type CatalogActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createCatalogItem(input: CatalogItemInput): Promise<CatalogActionResult> {
  await requireAdminSectionPage("modules:rewards");

  const parsed = CatalogItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { slug, label, description, type, iconUrl, iconBg, costGcc, isActive, isUnique, perkData } = parsed.data;

  let perkDataJson: Record<string, unknown> | null = null;
  if (perkData) {
    try { perkDataJson = JSON.parse(perkData); } catch { return { ok: false, error: "perk_data non è JSON valido." }; }
  }

  const [item] = await db
    .insert(rewardsCatalog)
    .values({
      slug,
      label,
      description: description || null,
      type: type as RewardsCatalogType,
      iconUrl: iconUrl || null,
      iconBg: iconBg || null,
      costGcc: String(costGcc),
      isActive,
      isUnique,
      perkData: perkDataJson,
    })
    .returning({ id: rewardsCatalog.id });

  return { ok: true, id: item.id };
}

export async function updateCatalogItem(
  id: string,
  input: CatalogItemInput & { isLocked: boolean },
): Promise<CatalogActionResult> {
  await requireAdminSectionPage("modules:rewards");

  const parsed = CatalogItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { label, description, iconUrl, iconBg, costGcc, isActive, isUnique, perkData, slug, type } = parsed.data;

  let perkDataJson: Record<string, unknown> | null = null;
  if (perkData) {
    try { perkDataJson = JSON.parse(perkData); } catch { return { ok: false, error: "perk_data non è JSON valido." }; }
  }

  // Se l'item è locked, non aggiorniamo slug, type, perkData
  const updatePayload = input.isLocked
    ? { label, description: description || null, iconUrl: iconUrl || null, iconBg: iconBg || null, costGcc: String(costGcc), isActive, updatedAt: sql`now()` }
    : { slug, label, description: description || null, type: type as RewardsCatalogType, iconUrl: iconUrl || null, iconBg: iconBg || null, costGcc: String(costGcc), isActive, isUnique, perkData: perkDataJson, updatedAt: sql`now()` };

  await db.update(rewardsCatalog).set(updatePayload).where(eq(rewardsCatalog.id, id));
  return { ok: true, id };
}

export async function toggleCatalogItemActive(id: string, isActive: boolean): Promise<void> {
  await requireAdminSectionPage("modules:rewards");
  await db.update(rewardsCatalog).set({ isActive, updatedAt: sql`now()` }).where(eq(rewardsCatalog.id, id));
}
