import { getUser } from "@/lib/db/queries";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import WelcomeClock from "./clock";

export default async function WelcomeWidget() {
  const [user, t] = await Promise.all([
    getUser(),
    getTranslations("admin.dashboard.widgets.welcome"),
  ]);

  const firstName = user?.firstName?.trim() ?? "";
  const greeting = firstName ? t("greetingNamed", { name: firstName }) : t("greeting");

  // Welcome is a "freeform" card: no uppercase title header. We render a
  // small accent badge + personalized greeting, and hand off the date/time
  // line to a client component that keeps ticking after mount.
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
        <div className="min-w-0 flex-1">
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}
          >
            {greeting}
          </h2>
          <WelcomeClock initialNow={Date.now()} />
        </div>
      </div>
    </WidgetCard>
  );
}
