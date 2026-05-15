import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import RobotsEditor from "./_components/robots-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.seo.robots");
  return { title: t("metaTitle") };
}

async function RobotsContent() {
  const settings = await getAppSettings();
  const robotsTxt = (settings as Record<string, string | null>)["robots_txt"] ?? "";
  const humansTxt = (settings as Record<string, string | null>)["humans_txt"] ?? "";

  let domain = settings.app_domain?.trim() ?? "";
  if (domain && !/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
  domain = domain.replace(/\/$/, "");

  return (
    <RobotsEditor
      initialRobots={robotsTxt}
      initialHumans={humansTxt}
      domain={domain}
    />
  );
}

export default async function RobotsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-32">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{
              borderColor: "var(--admin-accent)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      }>
      <RobotsContent />
    </Suspense>
  );
}
