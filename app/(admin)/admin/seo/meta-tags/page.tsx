// app/(admin)/admin/seo/meta-tags/page.tsx
import { getAllPages } from "@/lib/db/pages-queries";
import { getActiveRoutes } from "@/lib/db/route-registry-queries";
import { getAllSeoPages } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { SYSTEM_ALWAYS_PUBLIC, SYSTEM_AUTH_ROUTES } from "@/lib/routes";
import { SearchCheck } from "lucide-react";
import { Suspense } from "react";
import SeoManager from "../_components/seo-manager";

export const dynamic = "force-dynamic";

async function SeoContent() {
  const [seoPagesList, cmsPages, settings, registryRoutes] = await Promise.all([
    getAllSeoPages(),
    getAllPages(),
    getAppSettings(),
    getActiveRoutes(),
  ]);

  let domain = settings.app_domain?.trim() ?? "";
  if (domain && !/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
  domain = domain.replace(/\/$/, "");

  const appName = settings.app_name?.trim() ?? "";

  // Route editoriali dal registry (getActiveRoutes esclude già le system
  // route tramite isSystemRoute; qui prendiamo direttamente i pathname)
  const registryPaths = registryRoutes.map((r) => r.pathname);

  // Route di sistema hardcoded: pathname reali del sito non presenti
  // nel route_registry dal punto di vista editoriale, ma per cui
  // l'admin deve poter creare meta tag (title, description, og, ecc.)
  const systemPaths = [...SYSTEM_AUTH_ROUTES, ...SYSTEM_ALWAYS_PUBLIC];

  // Pathname che hanno una page in `pages` (CMS o system): vanno
  // gestite da /admin/content/pages → tab SEO. Le filtriamo da qui per
  // evitare la doppia UI (l'admin ha confuso records duplicati con
  // questa lista quando esistevano sia pages.slug='404' sia
  // seo_pages.pathname='/404'). Il salvataggio dei meta scrive comunque
  // sulla stessa tabella seo_pages — il tab SEO del page-editor riusa
  // il SeoForm con pathname=/${slug}.
  const pagesPathnames = new Set(cmsPages.map((p) => `/${p.slug}`));

  // Lista finale deduplicata, filtrata e ordinata. Niente cmsRoutes:
  // tutte le routes da pages sono escluse a prescindere.
  const allRoutes = [...new Set([...systemPaths, ...registryPaths])]
    .filter((r) => !pagesPathnames.has(r))
    .sort();

  // Anche tra le righe seo_pages già configurate: nascondo quelle che
  // ora sono "owned" da una page CMS, perché si gestiscono da lì.
  const filteredSeoPages = seoPagesList.filter(
    (p) => !pagesPathnames.has(p.pathname),
  );

  const configuredPaths = new Set(filteredSeoPages.map((p) => p.pathname));
  const unconfiguredRoutes = allRoutes.filter((r) => !configuredPaths.has(r));

  return (
    <SeoManager
      initialPages={filteredSeoPages}
      unconfiguredRoutes={unconfiguredRoutes}
      domain={domain}
      appName={appName}
    />
  );
}

export default function MetaTagsPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <SearchCheck size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--admin-text)" }}>
            Meta Tags
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            Gestisci i meta tag delle pagine predefinite e dei contenuti
            dell&apos;app.
          </p>
        </div>
      </div>

      <div
        className="rounded-xl shadow-sm p-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-32">
              <div
                className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{
                  borderColor: "var(--admin-accent)",
                  borderTopColor: "transparent",
                }}
              />
            </div>
          }>
          <SeoContent />
        </Suspense>
      </div>
    </div>
  );
}
