"use server";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { db } from "@/lib/db/drizzle";
import { rewardsRules } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { RewardEventType } from "@/lib/modules/rewards/types";
import { batchUpdateAppSettings } from "@/lib/db/settings-queries";
import { checkRewardsR2Connection } from "@/lib/modules/rewards/storage";

const RuleSchema = z.object({
  eventType: z.enum(["daily_checkin", "post_created", "like_received", "comment_created", "streak_7", "streak_14", "streak_30"]),
  amount:    z.coerce.number().min(0.01).max(10_000),
  dailyCap:  z.coerce.number().int().min(0).max(10_000).nullable(),
  enabled:   z.boolean(),
});

export type UpdateRuleInput = z.input<typeof RuleSchema>;

export async function updateRewardRule(
  input: UpdateRuleInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminSectionPage("modules:rewards");

  const parsed = RuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { eventType, amount, dailyCap, enabled } = parsed.data;

  await db
    .update(rewardsRules)
    .set({
      amount: String(amount),
      dailyCap: dailyCap === 0 ? null : dailyCap,
      enabled,
      updatedAt: sql`now()`,
    })
    .where(eq(rewardsRules.eventType, eventType as RewardEventType));

  return { ok: true };
}

const R2SettingsSchema = z.object({
  accessKeyId:     z.string().max(200),
  secretAccessKey: z.string().max(200),
  bucket:          z.string().max(100),
  publicBaseUrl:   z.string().max(500),
});

export async function saveRewardsR2Settings(
  input: z.input<typeof R2SettingsSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminSectionPage("modules:rewards");
  const parsed = R2SettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { accessKeyId, secretAccessKey, bucket, publicBaseUrl } = parsed.data;
  await batchUpdateAppSettings({
    "modules.rewards.r2.access_key_id":     accessKeyId     || null,
    "modules.rewards.r2.secret_access_key": secretAccessKey || null,
    "modules.rewards.r2.bucket":            bucket          || null,
    "modules.rewards.r2.public_base_url":   publicBaseUrl   || null,
  });
  return { ok: true };
}

export async function testRewardsR2Connection(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireAdminSectionPage("modules:rewards");
  const result = await checkRewardsR2Connection();
  return result.ok ? { ok: true, message: "Connessione R2 rewards OK." } : result;
}
