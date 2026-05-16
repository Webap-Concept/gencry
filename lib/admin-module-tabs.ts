/**
 * lib/admin-module-tabs.ts
 *
 * Variante "moduli" di `getSectionTabs`. Legge `manifest.navChildren`
 * come single source of truth → restituisce gli AdminSectionTab[] già
 * filtrati per permission RBAC, con href assoluti (slug admin prefix)
 * e iconName propagato.
 *
 * Caller tipico: il PostsHeader / PricesHeader (server component) che
 * chiama questo helper e passa il risultato al client component delle
 * tabs. Aggiungere una sub-section a un modulo = 1 modifica al manifest
 * (la sidebar la prende già da lì, ora pure le tabs in pagina).
 */
import "server-only";

import { getAdminUrlSlug } from "@/lib/admin-paths";
import { getUser } from "@/lib/db/queries";
import { getUserPermissions } from "@/lib/rbac/can";
import type { ModuleManifest } from "@/lib/modules/types";
import type { NavChild } from "@/lib/admin-nav";
import type { AdminSectionTab } from "@/app/(admin)/admin/_components/admin-section-tabs";

export async function getModuleTabs(
  manifest: ModuleManifest,
): Promise<AdminSectionTab[]> {
  const [slug, user] = await Promise.all([getAdminUrlSlug(), getUser()]);
  if (!user) return [];

  const isSuperAdmin = user.isAdmin === true;
  const perms = isSuperAdmin
    ? null
    : await getUserPermissions({ id: user.id, role: user.role });
  const base = `/${slug}`;

  return manifest.navChildren
    .filter((c): c is NavChild & { href: string } => !!c.href)
    .filter((c) => isSuperAdmin || perms!.has(c.permission))
    .map((c) => ({
      href: `${base}${c.href!}`,
      label: c.label,
      iconName: c.icon,
      exact: c.exact ?? false,
    }));
}
