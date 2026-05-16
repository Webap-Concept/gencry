import { getTranslations } from "next-intl/server";
import { ComingSoon } from "../_components/coming-soon";

export default async function ProfiloPage() {
  const t = await getTranslations("core.pages.profile");
  return <ComingSoon title={t("title")} description={t("description")} />;
}
