// lib/rbac/guards.ts
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { getUser } from "@/lib/db/queries";
import type { UserWithProfile } from "@/lib/db/schema";
import { redirect } from "next/navigation";
import { can, getUserPermissions } from "@/lib/rbac/can";
import "server-only";

/** true se l'utente è il super admin (flag di emergenza, bypassa RBAC) */
export function isAdmin(user: UserWithProfile): boolean {
  return user.isAdmin === true;
}

async function hasAdminAccess(user: UserWithProfile): Promise<boolean> {
  if (user.isAdmin) return true;
  return can(user, "admin:access");
}

// ---------------------------------------------------------------------------
// Server Action guards — lanciano eccezione
// ---------------------------------------------------------------------------

export async function requireAdmin(): Promise<UserWithProfile> {
  const user = await getUser();
  if (!user) throw new Error("Non autenticato");
  const ok = await hasAdminAccess(user);
  if (!ok) throw new Error("Non autorizzato");
  return user;
}

// ---------------------------------------------------------------------------
// Page guards — redirect
// ---------------------------------------------------------------------------

export async function requireAdminPage(): Promise<UserWithProfile> {
  const user = await getUser();
  if (!user) {
    const slug = await getAdminUrlSlug();
    redirect(`/${slug}/sign-in`);
  }

  const ok = await hasAdminAccess(user);
  if (!ok) {
    const slug = await getAdminUrlSlug();
    redirect(`/${slug}/sign-in`);
  }

  return user;
}

export async function requireAdminSectionPage(
  permissionKey: string,
): Promise<UserWithProfile> {
  const user = await getUser();
  if (!user) {
    const slug = await getAdminUrlSlug();
    redirect(`/${slug}/sign-in`);
  }

  if (user.isAdmin) return user;

  // Previously this issued two `can(user, ...)` calls — each costs 2 DB
  // round-trips (override lookup + role match) for a total of 4 queries
  // per section layout, and every admin nav has 1–3 stacked section
  // layouts. We now fetch the user's full permission Set once and do
  // Set lookups for both checks. `getUserPermissions` is React `cache()`-
  // wrapped so when the root admin layout has already loaded the Set
  // for the sidebar render, this resolves to 0 additional DB calls.
  // Net: 4 queries → 0–2 queries per section layout per request.
  const perms = await getUserPermissions(user);

  if (!perms.has("admin:access")) {
    const slug = await getAdminUrlSlug();
    redirect(`/${slug}/sign-in`);
  }

  if (!perms.has(permissionKey)) {
    const slug = await getAdminUrlSlug();
    redirect(`/${slug}`);
  }

  return user;
}
