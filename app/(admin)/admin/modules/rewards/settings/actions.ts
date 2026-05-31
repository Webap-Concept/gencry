"use server";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { db } from "@/lib/db/drizzle";
import { rewardsRules } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { RewardEventType } from "@/lib/modules/rewards/types";

const RuleSchema = z.object({
  eventType: z.enum(["daily_checkin", "post_created", "like_received"]),
  amount:    z.coerce.number().int().min(1).max(10_000),
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
      amount,
      dailyCap: dailyCap === 0 ? null : dailyCap,
      enabled,
      updatedAt: sql`now()`,
    })
    .where(eq(rewardsRules.eventType, eventType as RewardEventType));

  return { ok: true };
}
