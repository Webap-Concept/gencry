// app/(protected)/watchlist/page.tsx
//
// Lista delle watchlist proprie (loggato). RSC: nessun fetch client.
// `getMyWatchlists` carica tutto in 4 round-trip (vedi queries.ts):
// rows + coins-batch + coin views pool + perf 30g MGET.
//
// Layout: header (title + new-button + caption "N di M"), poi grid
// responsive 1col mobile / 2col desktop di WatchlistCard. Empty
// state quando 0 watchlist.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getUser } from "@/lib/db/queries";
import { getMyWatchlists } from "@/lib/modules/watchlist/queries";
import { WatchlistCard } from "@/components/modules/watchlist/watchlist-card";
import { NewWatchlistButton } from "./_components/new-watchlist-button";
import { WatchlistCardActions } from "./_components/watchlist-card-actions";
import { WatchlistListSkeleton } from "./_components/watchlist-list-skeleton";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("watchlist.page");
  return { title: t("title") };
}

export default async function WatchlistPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const t = await getTranslations("watchlist.page");

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <Suspense fallback={<WatchlistListSkeleton />}>
        <WatchlistListBody userId={user.id} t={t} />
      </Suspense>
    </div>
  );
}

async function WatchlistListBody({
  userId,
  t,
}: {
  userId: string;
  t: Awaited<ReturnType<typeof getTranslations<"watchlist.page">>>;
}) {
  const [watchlists, locale, viewer] = await Promise.all([
    getMyWatchlists(userId),
    getLocale(),
    getUser(),
  ]);
  // viewer non-null garantito dal redirect del parent — il Promise.all
  // qui re-fetcha solo per leggere l'username (React.cache: zero extra DB).
  const ownerUsername = viewer?.username ?? null;

  return (
    <>
      <PageHeader t={t} count={watchlists.length} />
      {watchlists.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {watchlists.map((w) => (
            <li key={w.id}>
              <WatchlistCard
                watchlist={w}
                updatedAtLabel={formatUpdatedAt(w.updatedAt, locale)}
                actions={
                  <WatchlistCardActions
                    id={w.id}
                    slug={w.slug}
                    name={w.name}
                    description={w.description}
                    visibility={w.visibility}
                    coinsCount={w.coinsCount}
                    ownerUsername={ownerUsername}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PageHeader({
  t,
  count,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"watchlist.page">>>;
  count: number;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-serif text-gc-fg leading-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-gc-fg-3 mt-1 max-w-2xl">
          {t("subtitle")}
        </p>
      </div>
      {count > 0 ? <NewWatchlistButton label={t("new_button")} /> : null}
    </header>
  );
}

function EmptyState({
  t,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"watchlist.page">>>;
}) {
  return (
    <div className="bg-gc-bg-2 border border-dashed border-gc-line rounded-2xl p-8 text-center flex flex-col items-center gap-3">
      <h2 className="text-lg font-serif text-gc-fg">{t("empty_title")}</h2>
      <p className="text-sm text-gc-fg-3 max-w-md">
        {t("empty_description")}
      </p>
      <div className="pt-2">
        <NewWatchlistButton label={t("empty_cta")} />
      </div>
    </div>
  );
}

function formatUpdatedAt(date: Date, locale: string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return locale.startsWith("it") ? "adesso" : "now";
  if (sec < 3600) {
    const n = Math.floor(sec / 60);
    return locale.startsWith("it") ? `${n}m fa` : `${n}m ago`;
  }
  if (sec < 86_400) {
    const n = Math.floor(sec / 3600);
    return locale.startsWith("it") ? `${n}h fa` : `${n}h ago`;
  }
  if (sec < 604_800) {
    const n = Math.floor(sec / 86_400);
    return locale.startsWith("it") ? `${n}g fa` : `${n}d ago`;
  }
  return new Date(date).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}
