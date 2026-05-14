// Server component: risolve l'admin slug a runtime così le tab non
// usano `/admin/` hardcoded ma il valore in app_settings.admin.url_slug.
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { MessageSquare } from "lucide-react";
import { ModuleAdminTabs } from "@/app/(admin)/admin/_components/module-admin-tabs";

export async function PostsHeader() {
  const slug = await getAdminUrlSlug();
  const base = `/${slug}/modules/posts`;

  return (
    <header>
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}
        >
          <MessageSquare size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--admin-text)" }}
          >
            Posts
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Modulo social feed — composer, reactions, comments, moderation.
          </p>
        </div>
      </div>
      <ModuleAdminTabs
        tabs={[
          { href: base,              label: "Overview", exact: true },
          { href: `${base}/settings`, label: "Settings" },
        ]}
      />
    </header>
  );
}
