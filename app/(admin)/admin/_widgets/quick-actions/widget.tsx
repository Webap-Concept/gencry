import { getAdminPath } from "@/lib/admin-paths";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Users, ShieldCheck, Settings, FileText } from "lucide-react";
import WidgetCard from "@/app/(admin)/admin/_components/widget-card";

export default async function QuickActionsWidget() {
  const t = await getTranslations("admin.dashboard.widgets.quickActions");

  const [usersPath, rolesPath, settingsPath, pagesPath] = await Promise.all([
    getAdminPath("users-list"),
    getAdminPath("users-roles"),
    getAdminPath("settings-general"),
    getAdminPath("content-pages"),
  ]);

  const actions = [
    { href: usersPath, label: t("users"), Icon: Users },
    { href: rolesPath, label: t("roles"), Icon: ShieldCheck },
    { href: pagesPath, label: t("pages"), Icon: FileText },
    { href: settingsPath, label: t("settings"), Icon: Settings },
  ];

  // Content is fixed-size (4 links), no need to scroll. WidgetCard
  // owns the header chrome; we only need to lay out the inner grid.
  return (
    <WidgetCard title={t("title")}>
      <div className="grid grid-cols-2 gap-2">
        {actions.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-card-border)",
              color: "var(--admin-text)",
            }}
          >
            <Icon size={15} style={{ color: "var(--admin-text-muted)" }} />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </WidgetCard>
  );
}
