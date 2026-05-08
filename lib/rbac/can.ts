/**
 * RBAC — can() e getUserPermissions()
 *
 * Risoluzione in ordine di priorità:
 *  1. Override individuale non scaduto (user_permissions) → usa `granted`
 *  2. Permesso nel ruolo dell'utente (role_permissions)  → true
 *  3. Default                                             → false
 *
 * Helper disponibili:
 *  - can(user, key)                     → boolean (singolo permesso, Server)
 *  - canAny(user, keys[])               → boolean (almeno uno, Server)
 *  - canAll(user, keys[])               → boolean (tutti, Server)
 *  - getUserPermissions(user)           → Set<string> (batch, Server)
 *  - withPermission(key, action)        → Server Action wrapper
 *  - requirePermission(key)             → page guard con redirect
 */
import { db } from "@/lib/db/drizzle";
import { permissions, rolePermissions, userPermissions, roles } from "@/lib/db/schema";
import { and, eq, gt, isNull, or, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getUser } from "@/lib/db/queries";
import "server-only";

export type UserLike = { id: string; role: string };

// ---------------------------------------------------------------------------
// Core — singolo permesso
// ---------------------------------------------------------------------------

/**
 * Controlla un singolo permesso per un utente.
 * Ottimizzato per chiamate singole in Server Actions / Route Handlers.
 *
 * @example
 * const allowed = await can(user, "posts:publish");
 * if (!allowed) throw new Error("Non autorizzato");
 */
export async function can(user: UserLike, permissionKey: string): Promise<boolean> {
  const now = new Date();

  const override = await db
    .select({ granted: userPermissions.granted })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(
      and(
        eq(userPermissions.userId, user.id),
        eq(permissions.key, permissionKey),
        or(isNull(userPermissions.expiresAt), gt(userPermissions.expiresAt, now)),
      ),
    )
    .orderBy(desc(userPermissions.createdAt))
    .limit(1);

  if (override.length > 0) return override[0].granted;

  const roleMatch = await db
    .select({ id: rolePermissions.permissionId })
    .from(rolePermissions)
    .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(and(eq(roles.name, user.role), eq(permissions.key, permissionKey)))
    .limit(1);

  return roleMatch.length > 0;
}

// ---------------------------------------------------------------------------
// Batch — Set completo dei permessi attivi
// ---------------------------------------------------------------------------

/**
 * Restituisce il Set completo dei permessi attivi per un utente.
 * Usalo nei layout / Server Components per evitare N query:
 *
 * @example
 * const perms = await getUserPermissions(user);
 * perms.has("posts:publish"); // → boolean
 *
 * Wrappata in React `cache()` per deduplicare le call entro la stessa
 * request: i layout admin (root + protected) e il loro contenuto
 * arrivano qui in cascata con lo stesso `user` object (a sua volta
 * cached da `getUser()` in lib/db/queries), quindi la cache scatta su
 * argument identity e fa girare le 2 query DB una sola volta per page.
 * Niente cache cross-request: ogni nuova request riparte fresca.
 */
export const getUserPermissions = cache(async function getUserPermissions(
  user: UserLike,
): Promise<Set<string>> {
  const now = new Date();

  const rolePerms = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(roles.name, user.role));

  const set = new Set(rolePerms.map((p) => p.key));

  const overrides = await db
    .select({ key: permissions.key, granted: userPermissions.granted, createdAt: userPermissions.createdAt })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(
      and(
        eq(userPermissions.userId, user.id),
        or(isNull(userPermissions.expiresAt), gt(userPermissions.expiresAt, now)),
      ),
    )
    .orderBy(desc(userPermissions.createdAt));

  const seenOverrides = new Map<string, boolean>();
  for (const o of overrides) {
    if (!seenOverrides.has(o.key)) seenOverrides.set(o.key, o.granted);
  }
  for (const [key, granted] of seenOverrides) {
    if (granted) set.add(key);
    else set.delete(key);
  }

  return set;
});

// ---------------------------------------------------------------------------
// Composizione — canAny / canAll
// ---------------------------------------------------------------------------

export async function canAny(user: UserLike, keys: string[]): Promise<boolean> {
  const perms = await getUserPermissions(user);
  return keys.some((k) => perms.has(k));
}

export async function canAll(user: UserLike, keys: string[]): Promise<boolean> {
  const perms = await getUserPermissions(user);
  return keys.every((k) => perms.has(k));
}

// ---------------------------------------------------------------------------
// Server Action wrapper — withPermission
// ---------------------------------------------------------------------------

export function withPermission<TArgs extends unknown[], TReturn>(
  permissionKey: string,
  action: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const user = await getUser();
    if (!user) throw new Error("Non autenticato");

    const allowed = await can(user, permissionKey);
    if (!allowed) throw new Error(`Permesso negato: ${permissionKey}`);

    return action(...args);
  };
}

// ---------------------------------------------------------------------------
// Page guard — requirePermission
// ---------------------------------------------------------------------------

export async function requirePermission(
  permissionKey: string,
  redirectTo = "/unauthorized",
) {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const allowed = await can(user, permissionKey);
  if (!allowed) redirect(redirectTo);

  return user;
}

export async function requireAdminPermission(permissionKey: string) {
  const { getAdminUrlSlug } = await import("@/lib/admin-paths");
  const slug = await getAdminUrlSlug();

  const user = await getUser();
  if (!user) redirect(`/${slug}/sign-in`);

  const allowed = await can(user, permissionKey);
  if (!allowed) redirect(`/${slug}`);

  return user;
}
