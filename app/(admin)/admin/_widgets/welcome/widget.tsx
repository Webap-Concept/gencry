import { getUser } from "@/lib/db/queries";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import WidgetCard from "@/app/(admin)/admin/_components/widget-card";

export default async function WelcomeWidget() {
  const [user, t] = await Promise.all([
    getUser(),
    getTranslations("admin.dashboard.widgets.welcome"),
  ]);

  const firstName = user?.firstName?.trim() ?? "";
  const greeting = firstName ? t("greetingNamed", { name: firstName }) : t("greeting");

  // Welcome is a "freeform" card: no uppercase title header, just a
  // small icon + greeting laid out side-by-side. WidgetCard handles
  // h-full / padding / scroll-when-needed; we provide the inner body.
  return (
    <WidgetCard>
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
            color: "var(--admin-accent)",
          }}
        >
          <Sparkles size={16} />
        </div>
        <div className="min-w-0">
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}
          >
            {greeting}
          </h2>
          <p
            className="text-xs mt-1 leading-relaxed"
            style={{ color: "var(--admin-text-muted)" }}
          >
            {t("body")}
          </p>
        </div>
      </div>
    </WidgetCard>
  );
}
