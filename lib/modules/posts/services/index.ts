// lib/modules/posts/services/index.ts
//
// Barrel export del service layer del modulo posts. I consumer (Server
// Actions in PR-3, queries in PR-4, UI in PR-5) importano da
// `@/lib/modules/posts/services` senza preoccuparsi del singolo file.
//
// Tutti i service sono "hookable" (vedi feedback_hookable_services):
// l'impl V1 è la più semplice possibile (Drizzle diretto o pass-through),
// V2 può sostituirla SENZA toccare i consumer.
export * from "./reactions";
export * from "./comments";
export * from "./bookmarks";
export * from "./blocks";
export * from "./feed-cache";
export * from "./post-cache";
export * from "./outbox";
export * from "./media-processor";
export * from "./rate-limit";
