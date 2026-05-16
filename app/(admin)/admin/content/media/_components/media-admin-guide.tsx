// Guide content shown inside the AdminSectionInfo modal on
// /admin/content/media. Texts live in admin.content.media.guide* i18n
// keys.
import { getTranslations } from "next-intl/server";

export async function MediaAdminGuide() {
  const t = await getTranslations("admin.content.media");
  return (
    <>
      <p>{t("guideIntro")}</p>
      <ul>
        <li>{t("guideBulletOriginal")}</li>
        <li>{t("guideBulletVariants")}</li>
        <li>{t("guideBulletWhereCmsBody")}</li>
        <li>{t("guideBulletWhereCmsHero")}</li>
        <li>{t("guideBulletWhereLightbox")}</li>
        <li>{t("guideBulletWhereAdmin")}</li>
      </ul>
      <p>{t("guideTuning")}</p>
    </>
  );
}
