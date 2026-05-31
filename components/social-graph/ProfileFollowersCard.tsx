// components/social-graph/ProfileFollowersCard.tsx
//
// Card "Follower" mostrata nella sidebar destra della profile page.
// Mostra fino a 8 follower con avatar + nome, link "Vedi tutti" → pagina
// /u/[username]/followers paginata. Server component RSC.
//
// Caching: la preview list e' wrappata in `unstable_cache` TTL 60s. Per
// profili virali la stessa card e' renderizzata N volte/minuto su
// richieste indipendenti — la query SQL diventa 1/min per userId invece
// di 1/render. Tag `profile-followers:<userId>` esposto per future
// `revalidateTag` (oggi non chiamato: il TTL e' sufficiente perche' la
// preview e' UX-tolerante a 60s di stale).
import "server-only";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getTranslations } from "next-intl/server";
import { listFollowers, type FollowListItem } from "@/lib/modules/social-graph/queries";

const PREVIEW_LIMIT = 8;
const CACHE_TTL_SECONDS = 60;

function getCachedPreview(userId: string): Promise<FollowListItem[]> {
  return unstable_cache(
    async () => {
      const page = await listFollowers(userId, null, PREVIEW_LIMIT);
      return page.items;
    },
    ["social-graph", "profile-followers-preview", userId],
    {
      revalidate: CACHE_TTL_SECONDS,
      tags: [`profile-followers:${userId}`],
    },
  )();
}

function displayName(u: FollowListItem): string {
  const fn = u.firstName?.trim();
  const ln = u.lastName?.trim();
  if (fn && ln) return `${fn} ${ln}`;
  if (fn) return fn;
  if (ln) return ln;
  return u.username ?? "—";
}

function Avatar({ item }: { item: FollowListItem }) {
  return (
    <UserAvatar
      user={{
        id: item.userId,
        username: item.username,
        firstName: item.firstName,
        lastName: item.lastName,
        avatarUrl: item.avatarUrl,
      }}
      size={36}
      verifiedBusiness={item.isVerifiedBusiness}
    />
  );
}

export async function ProfileFollowersCard({
  userId,
  username,
  totalCount,
}: {
  userId: string;
  username: string;
  totalCount: number;
}) {
  const [items, t] = await Promise.all([
    getCachedPreview(userId),
    getTranslations("socialGraph.profile_followers_card"),
  ]);

  if (items.length === 0) {
    return (
      <section className="bg-gc-bg-2 border border-gc-line rounded-2xl p-5">
        <h2 className="text-base font-serif italic text-gc-fg mb-2">
          {t("title")}
        </h2>
        <p className="text-xs text-gc-fg-3">{t("empty")}</p>
      </section>
    );
  }

  const usernameLower = username.toLowerCase();
  const hasMore = totalCount > items.length;

  return (
    <section className="bg-gc-bg-2 border border-gc-line rounded-2xl p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-serif italic text-gc-fg">{t("title")}</h2>
        <span className="text-xs text-gc-fg-3 tabular-nums">{totalCount}</span>
      </header>
      <ul className="space-y-2">
        {items.map((u) => (
          <li key={u.userId}>
            <Link
              href={u.username ? `/u/${u.username.toLowerCase()}` : "#"}
              prefetch={false}
              className="flex items-center gap-2.5 -mx-1.5 px-1.5 py-1 rounded-lg hover:bg-gc-bg-3 transition"
            >
              <Avatar item={u} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gc-fg truncate leading-tight">
                  {displayName(u)}
                </p>
                {u.username ? (
                  <p className="text-[11px] text-gc-fg-3 truncate">
                    @{u.username}
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <div className="mt-3 pt-3 border-t border-gc-line">
          <Link
            href={`/u/${usernameLower}/followers`}
            prefetch={false}
            className="text-xs font-medium text-gc-accent hover:underline"
          >
            {t("view_all")} →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
