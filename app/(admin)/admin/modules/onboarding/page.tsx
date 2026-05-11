import { getAppSettings } from "@/lib/db/settings-queries";
import { OnboardingSettingsForm } from "./_components/onboarding-settings-form";

export default async function OnboardingModulePage() {
  const settings = await getAppSettings();
  return (
    <OnboardingSettingsForm
      initialEnabled={settings["modules.onboarding.enabled"] !== "false"}
    />
  );
}
