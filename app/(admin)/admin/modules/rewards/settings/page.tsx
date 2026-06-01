import type { Metadata } from "next";
import { getAllRules } from "@/lib/modules/rewards/queries";
import { RewardsSettingsForm } from "./_components/settings-form";
import { RewardsR2Form } from "./_components/r2-form";
import { CoinIconForm } from "./_components/coin-icon-form";
import { getAppSettings } from "@/lib/db/settings-queries";

export const metadata: Metadata = { title: "Rewards / Settings" };
export const dynamic = "force-dynamic";

export default async function RewardsSettingsPage() {
  const [rules, settings] = await Promise.all([getAllRules(), getAppSettings()]);
  const baseRules = rules.filter((r) => !r.eventType.startsWith("streak_") && r.eventType !== "redemption");
  const streakRules = rules.filter((r) => r.eventType.startsWith("streak_"));

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <header>
          <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
            Earn Rules
          </h1>
          <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
            Configura amount e daily cap per ogni evento. Le modifiche sono immediate.
          </p>
        </header>
        <RewardsSettingsForm rules={baseRules} />
      </div>

      <div className="space-y-4">
        <header>
          <h2 className="text-base font-semibold" style={{ color: "var(--admin-text)" }}>
            Streak Milestones
          </h2>
          <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
            Bonus GCC per streak di accesso consecutive (7, 14, 30 giorni). I giorni sono fissi;
            configura solo l&apos;amount del bonus e se abilitare il milestone.
          </p>
        </header>
        <RewardsSettingsForm rules={streakRules} isStreakSection />
      </div>
      <RewardsR2Form
        initialValues={{
          accessKeyId:     settings["modules.rewards.r2.access_key_id"]     ?? "",
          secretAccessKey: settings["modules.rewards.r2.secret_access_key"] ?? "",
          bucket:          settings["modules.rewards.r2.bucket"]             ?? "rewards",
          publicBaseUrl:   settings["modules.rewards.r2.public_base_url"]   ?? "",
        }}
      />
      <CoinIconForm initialIconUrl={settings["modules.rewards.coin_icon_url"] ?? null} />
    </div>
  );
}
