import type { Metadata } from "next";
import { getAllRules } from "@/lib/modules/rewards/queries";
import { RewardsSettingsForm } from "./_components/settings-form";

export const metadata: Metadata = { title: "Rewards / Settings" };
export const dynamic = "force-dynamic";

export default async function RewardsSettingsPage() {
  const rules = await getAllRules();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
          Earn Rules
        </h1>
        <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
          Configura amount e daily cap per ogni evento. Le modifiche sono immediate: il trigger DB
          e il service applicativo leggono le regole da DB ad ogni invocazione.
        </p>
      </header>

      <RewardsSettingsForm rules={rules} />
    </div>
  );
}
