import { getTranslations } from "next-intl/server";
import Link from "next/link";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import { getNavIcon } from "@/lib/admin/nav/icon-map";
import { resolveQuickActions } from "@/lib/admin/dashboard/quick-actions-options";
import { getUser } from "@/lib/db/queries";
import { buildAdminPath } from "@/lib/admin-paths";
import CustomizeTrigger from "./customize-trigger";

export default async function QuickActionsWidget() {
  // The whole admin area is auth-gated above us, but staying defensive
  // here lets the widget no-op gracefully if a layout assumption flips.
  const user = await getUser();
  if (!user) return null;

  const [t, tNav, { options, available, hasUserOverride }] = await Promise.all(
    [
      getTranslations("admin.dashboard.widgets.quickActions"),
      getTranslations("admin.nav"),
      resolveQuickActions(user),
    ],
  );

  // Prefix relative hrefs with the runtime admin slug once per render,
  // and resolve the user-facing label from admin.nav.<key> when present
  // (falling back to the registry's English label otherwise).
  const resolved = await Promise.all(
    options.map(async (opt) => ({
      key: opt.key,
      hrefAbs: await buildAdminPath(opt.href),
      icon: opt.icon,
      labelI18n: tNav.has(opt.key) ? tNav(opt.key) : opt.label,
    })),
  );

  const availableForModal = available.map((opt) => ({
    key: opt.key,
    groupKey: opt.groupKey,
    groupLabel: tNav.has(opt.groupKey) ? tNav(opt.groupKey) : opt.groupLabel,
    label: tNav.has(opt.key) ? tNav(opt.key) : opt.label,
    icon: opt.icon,
  }));

  return (
    <WidgetCard
      title={t("title")}
      scrollable
      headerActions={
        <CustomizeTrigger
          available={availableForModal}
          initialSelected={options.map((o) => o.key)}
          hasUserOverride={hasUserOverride}
        />
      }
    >
      {resolved.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--admin-text-muted)",
          }}
        >
          {t("emptySelection")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {resolved.map((opt) => {
            const Icon = getNavIcon(opt.icon);
            return (
              <Link
                key={opt.key}
                href={opt.hrefAbs}
                className="dashboard-action-tile"
              >
                <Icon size={15} className="dashboard-action-tile__icon" />
                <span className="truncate">{opt.labelI18n}</span>
              </Link>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
