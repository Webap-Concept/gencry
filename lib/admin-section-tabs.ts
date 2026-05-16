/**
 * lib/admin-section-tabs.ts
 *
 * Helper server per costruire la lista di tab di una parent section admin
 * leggendo `ADMIN_NAV` come single source of truth. Filtra i child per
 * permission dell'utente corrente e pre-compone gli href con lo slug admin
 * runtime, così il caller (parent layout) passa il risultato direttamente
 * a `<AdminSectionTabs />` (client component, puro presentational).
 *
 * Aggiungere/togliere una sub-section dalla sidebar è sufficiente per
 * far apparire/sparire la tab nella sezione corrispondente — zero
 * duplicazione di config.
 */
import "server-only";

import { ADMIN_NAV, type NavChild } from "@/lib/admin-nav";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { getNavOrderOverrides } from "@/lib/db/admin-nav-order-queries";
import { getUser } from "@/lib/db/queries";
import { getUserPermissions } from "@/lib/rbac/can";
import type { AdminSectionTab } from "@/app/(admin)/admin/_components/admin-section-tabs";

/** Stesso comportamento del sidebar: voci con override DB ordinate per
 *  `sortOrder`, le altre dopo nell'ordine del codice. Stable sort. */
function applyNavOrder<T extends { key: string }>(
  items: T[],
  order: Record<string, number>,
): T[] {
  return [...items].sort((a, b) => {
    const oa = order[a.key];
    const ob = order[b.key];
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return 0;
  });
}

/** Restituisce le tab visibili per la parent section `parentKey`
 *  (es. "content-group", "settings-group"). Già filtrate per permission
 *  e con href assoluti che includono lo slug admin. Le label sono prese
 *  da `admin.shell.nav.<child.key>` via traduzione lato server. */
export async function getSectionTabs(
  parentKey: string,
  labelResolver: (key: string) => string,
): Promise<AdminSectionTab[]> {
  const parent = ADMIN_NAV.find((n) => n.key === parentKey);
  if (!parent || !parent.children) return [];

  const [slug, user, navOrder] = await Promise.all([
    getAdminUrlSlug(),
    getUser(),
    getNavOrderOverrides(),
  ]);
  if (!user) return [];

  // Super admin bypassa la permission check (stesso comportamento della
  // sidebar). Per gli altri utenti calcoliamo il Set dei permessi e
  // filtriamo le child.
  const isSuperAdmin = user.isAdmin === true;
  const perms = isSuperAdmin
    ? null
    : await getUserPermissions({ id: user.id, role: user.role });
  const base = `/${slug}`;

  const filtered = parent.children
    .filter((c): c is NavChild & { href: string } => !!c.href)
    .filter((c) => isSuperAdmin || perms!.has(c.permission));

  return applyNavOrder(filtered, navOrder).map((c) => ({
    href: `${base}${c.href}`,
    label: labelResolver(c.key),
    exact: c.exact ?? false,
    iconName: c.icon,
  }));
}
