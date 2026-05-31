import type { RewardEventType } from "@/lib/db/schema";

export type { RewardEventType };

export interface EarnResult {
  awarded: boolean;
  amount: number;
}
