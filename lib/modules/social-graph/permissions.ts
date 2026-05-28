// lib/modules/social-graph/permissions.ts
//
// Permission keys del modulo social-graph. Il valore base `modules:social-graph`
// gate la UI admin del modulo. Il follow/unfollow lato utente NON usa una
// permission RBAC (è un'azione pubblica per tutti gli authenticated), ma
// passa solo dal gate AUTH + rate limit.

export const SOCIAL_GRAPH_PERMISSION = "modules:social-graph" as const;
export type SocialGraphPermission = typeof SOCIAL_GRAPH_PERMISSION;
