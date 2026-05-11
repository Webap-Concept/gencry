import { getAdminPath } from "@/lib/admin-paths";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Users, ShieldCheck, Settings, FileText } from "lucide-react";

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

  return (
    <div
      className="rounded-xl p-5 h-full flex flex-col"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-3 shrink-0"
        style={{ color: "var(--admin-text-faint)" }}
      >
        {t("title")}
      </h2>
      {/* min-h-0 lets the grid shrink below its content height when the
          user resizes the widget tighter than 3 rows; overflow-auto
          keeps the layout from busting out of the card. */}
      <div className="grid grid-cols-2 gap-2 flex-1 min-h-0 overflow-auto content-start">
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
    </div>
  );
}
