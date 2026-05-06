import { getAppSettings } from "@/lib/db/settings-queries";
import { Globe } from "lucide-react";
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
  const t = await getTranslations("admin.seo.robots");
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}
        >
          <Globe size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--admin-text)" }}>
            {t("pageHeading")}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
            {t("pageSubtitleBefore")}{" "}
            <code
              className="font-mono text-xs px-1 py-0.5 rounded"
              style={{ background: "var(--admin-hover-bg)" }}>
              robots.txt
            </code>{" "}
            {t("pageSubtitleMiddle")}{" "}
            <code
              className="font-mono text-xs px-1 py-0.5 rounded"
              style={{ background: "var(--admin-hover-bg)" }}>
              humans.txt
            </code>{" "}
            {t("pageSubtitleAfter")}
          </p>
        </div>
      </div>

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
    </div>
  );
}
