import { getModuleTabs } from "@/lib/admin-module-tabs";
import { REWARDS_MODULE } from "@/lib/modules/rewards/manifest";
import { RewardsHeaderClient } from "./rewards-header-client";

export async function RewardsHeader() {
  const tabs = await getModuleTabs(REWARDS_MODULE);
  return <RewardsHeaderClient tabs={tabs} />;
}
