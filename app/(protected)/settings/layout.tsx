import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth/session";
import { SettingsNav } from "./_components/settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const t = await getTranslations("core.settings");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] leading-[1.1] tracking-[-0.01em] text-gc-fg">
          {t("title")}
        </h1>
        <p className="text-[13.5px] text-gc-fg-3 mt-1">{t("subtitle")}</p>
      </div>

      <SettingsNav />

      <div>{children}</div>
    </div>
  );
}
