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
  // Tile look (background, border, hover, focus, icon scale-on-hover)
  // lives on .dashboard-action-tile in admin.css — keeps :hover etc.
  // where CSS can actually express them.
  return (
    <WidgetCard title={t("title")}>
      <div className="grid grid-cols-2 gap-2">
        {actions.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="dashboard-action-tile"
          >
            <Icon size={15} className="dashboard-action-tile__icon" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </WidgetCard>
  );
}
