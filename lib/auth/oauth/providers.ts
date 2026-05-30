// lib/auth/oauth/providers.ts
//
// Registry dei provider OAuth supportati. Single source of truth per:
//   - la UI di /settings/account (itera su questo array)
//   - la validazione del provider nelle server action (unlink)
//
// Per aggiungere un provider domani (Apple, Facebook, ...):
//   1. aggiungi la entry qui
//   2. crea l'adapter lib/auth/oauth/<provider>.ts (buildAuthUrl + callback)
//   3. aggiungi l'endpoint /api/auth/<provider> e il branch nel callback
// La UI e la logica di link/unlink non vanno toccate.

export interface OAuthProviderMeta {
  id: string;
  /** Nome visibile (proprio, non tradotto). */
  label: string;
  /** Endpoint GET che avvia il flusso. `?intent=link` per il collegamento
   *  da utente loggato. */
  authPath: string;
}

export const OAUTH_PROVIDERS = [
  { id: "google", label: "Google", authPath: "/api/auth/google" },
] as const satisfies readonly OAuthProviderMeta[];

export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number]["id"];

export function isSupportedProvider(id: string): boolean {
  return OAUTH_PROVIDERS.some((p) => p.id === id);
}
