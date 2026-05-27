// app/(protected)/notifiche/page.tsx
//
// Lista notifiche end-user. First batch SSR, infinite scroll +
// realtime client-side (vedi NotificationsList). La bulk mark-all-read
// è gestita dal client component al mount (debounced 1.5s) per
// azzerare il badge sidebar in 1 UPDATE invece di N.
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/db/queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getMyNotifications } from "@/lib/modules/notifications/queries";
import { NotificationsList } from "@/components/modules/notifications/NotificationsList";

export const dynamic = "force-dynamic";

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export default async function NotifichePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const [t, settings] = await Promise.all([
    getTranslations("core.pages.notifications"),
    getAppSettings(),
  ]);
  const pageSize = clampInt(
    (settings as Record<string, string>)["modules.notifications.list_page_size"],
    30,
    5,
    100,
  );

  const initial = await getMyNotifications({
    viewerUserId: user.id,
    pageSize,
  });

  // Favicon usato come avatar fallback per le notifiche "di sistema"
  // (actor IS NULL — es. achievement.post_viral_*). Null fa cadere il
  // render sul vecchio comportamento "?" di UserAvatar.
  const systemAvatarUrl = settings.app_favicon_url?.trim() || null;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-gc-fg">{t("title")}</h1>
        <p className="text-sm text-gc-fg-muted mt-1">{t("description")}</p>
      </header>
      <NotificationsList
        viewerUserId={user.id}
        initial={initial}
        systemAvatarUrl={systemAvatarUrl}
      />
    </div>
  );
}
