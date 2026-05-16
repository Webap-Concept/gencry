import { getTranslations } from "next-intl/server";
import { ComingSoon } from "../_components/coming-soon";

export default async function NotifichePage() {
  const t = await getTranslations("core.pages.notifications");
  return <ComingSoon title={t("title")} description={t("description")} />;
}
