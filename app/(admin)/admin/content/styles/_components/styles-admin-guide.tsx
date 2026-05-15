// Guide content shown inside the AdminSectionInfo modal on
// /admin/content/styles. Texts live in admin.content.styles.guide* i18n
// keys, mirroring the pattern used by PagesAdminGuide.
import { getTranslations } from "next-intl/server";

export async function StylesAdminGuide() {
  const t = await getTranslations("admin.content.styles");
  return (
    <>
      <p>{t("guideIntro")}</p>
      <ul>
        <li>{t("guideBullet1")}</li>
        <li>{t("guideBullet2")}</li>
        <li>{t("guideBullet3")}</li>
      </ul>
    </>
  );
}
