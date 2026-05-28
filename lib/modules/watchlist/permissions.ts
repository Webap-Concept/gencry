// lib/modules/watchlist/permissions.ts
//
// Permission del modulo watchlist. La base `modules:watchlist` gate
// la UI admin del modulo. CRUD lato utente sulle proprie watchlist
// NON usa permission RBAC: e' un'azione consentita a tutti gli
// authenticated, gated da ownership check (user_id = session user).

export const WATCHLIST_PERMISSION = "modules:watchlist" as const;
export type WatchlistPermission = typeof WATCHLIST_PERMISSION;
