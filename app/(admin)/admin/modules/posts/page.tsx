import type { Metadata } from "next";
import { db } from "@/lib/db/drizzle";
import { posts, postsReports } from "@/lib/db/schema";
import { count, eq, isNull } from "drizzle-orm";
import { loadPostsR2Config } from "@/lib/modules/posts/storage";

export const metadata: Metadata = { title: "Posts / Overview" };
export const dynamic = "force-dynamic";

export default async function PostsAdminOverviewPage() {
  const [totalRow] = await db
    .select({ n: count() })
    .from(posts)
    .where(isNull(posts.deletedAt));
  const [reportsRow] = await db
    .select({ n: count() })
    .from(postsReports)
    .where(eq(postsReports.status, "open"));

  const r2 = await loadPostsR2Config();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Post pubblicati" value={totalRow?.n ?? 0} />
        <Stat label="Report aperti"   value={reportsRow?.n ?? 0} />
        <Stat
          label="Storage R2"
          value={r2 ? "Configurato" : "Non configurato"}
          tone={r2 ? "ok" : "warn"}
        />
      </div>
      <p className="text-sm text-[var(--admin-fg-2)]">
        Configura le credenziali Cloudflare R2 in{" "}
        <strong>Settings</strong> per abilitare l&apos;upload immagini ai
        post.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-lg border border-[var(--admin-line)] bg-[var(--admin-bg-2)] p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--admin-fg-3)]">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          tone === "warn"
            ? "text-[var(--admin-danger)]"
            : "text-[var(--admin-fg)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
