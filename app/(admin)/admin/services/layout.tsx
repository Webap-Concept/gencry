import {
  AdminParentHeader,
  type ParentHeaderGuide,
} from "@/app/(admin)/admin/_components/admin-parent-header";
import { getSectionTabs } from "@/lib/admin-section-tabs";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DependenciesGuide } from "./dependencies/_components/dependencies-guide";
import { RedisAdminGuide } from "./redis/_components/redis-guide";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:services");

  const [tNav, tServices] = await Promise.all([
    getTranslations("admin.nav"),
    getTranslations("admin.services"),
  ]);

  const tabs = await getSectionTabs("services-group", (k) => tNav(k));

  const segments = [
    "resend",
    "redis",
    "google-oauth",
    "github",
    "cloudflare",
    "supabase",
    "sentry",
    "dependencies",
  ] as const;

  const descriptions: Record<string, string> = Object.fromEntries(
    segments.map((s) => [s, tServices(`sections.${s}.description`)]),
  );

  const iconBySegment: Record<string, string> = {
    resend: "Send",
    redis: "Database",
    "google-oauth": "LogIn",
    github: "GitMerge",
    cloudflare: "Shield",
    supabase: "Database",
    sentry: "Bug",
    dependencies: "Package",
  };

  const guides: Partial<Record<string, ParentHeaderGuide>> = {
    redis: {
      title: tServices("sections.redis.guideTitle"),
      ariaLabel: `${tServices("guideAriaPrefix")} ${tServices("sections.redis.label")}`,
      content: <RedisAdminGuide />,
    },
    dependencies: {
      title: tServices("sections.dependencies.guideTitle"),
      ariaLabel: `${tServices("guideAriaPrefix")} ${tServices("sections.dependencies.label")}`,
      content: <DependenciesGuide />,
    },
  };

  return (
    <div className="space-y-5">
      <AdminParentHeader
        title={tNav("services-group")}
        defaultDescription={tNav("descriptions.services-group")}
        defaultIcon="Plug"
        iconBySegment={iconBySegment}
        descriptions={descriptions}
        guides={guides}
        tabs={tabs}
      />
      {children}
    </div>
  );
}
