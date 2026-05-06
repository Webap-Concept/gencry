import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { Map } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function SitemapPage() {
  const t = await getTranslations("admin.seo.sitemap");
  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={Map}
        breadcrumbLabel={t("pageHeading")}
        subtitleSlot={
          <>
            {t("pageSubtitleBefore")}{" "}
            <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: "var(--admin-hover-bg)" }}>sitemap.xml</code>
            {t("pageSubtitleAfter")}
          </>
        }
      />

      <div
        className="rounded-xl p-12 flex flex-col items-center justify-center text-center"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px dashed var(--admin-card-border)",
        }}>
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "var(--admin-hover-bg)" }}>
          <Map size={28} style={{ color: "var(--admin-text-faint)" }} />
        </div>
        <p className="font-semibold text-sm mb-1" style={{ color: "var(--admin-text)" }}>
          {t("placeholderTitle")}
        </p>
        <p className="text-sm max-w-sm" style={{ color: "var(--admin-text-muted)" }}>
          {t("placeholderBody")}
        </p>
      </div>
    </div>
  );
}
