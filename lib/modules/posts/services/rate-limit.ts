// lib/modules/posts/services/rate-limit.ts
//
// Service astratto per il rate limiting delle azioni write del modulo
// posts. Hookable: V1 = open (sempre ok), V2 = Upstash sliding window
// quando `@upstash/ratelimit` + `@upstash/redis` sono installati e
// configurati.
//
// Le soglie sono lette via `modules.posts.rate_limit_*` da app_settings
// (vedi PR-1 settings keys). I default coprono uso normale; cambiabili
// dall'admin senza redeploy.
//
// Perché V1 stub e non Upstash subito:
//   - costo dipendenze: `@upstash/redis` + `@upstash/ratelimit` non sono
//     ancora nel package.json. Aggiungerle senza configurare un endpoint
//     KV reale rende il modulo non installabile su preview Vercel "free".
//   - in fase early (<100 utenti) il rate-limit serve a poco: il vincolo
//     reale sono i bot e gli spammer, che arrivano dopo l'apertura al
//     pubblico. Quando avremo abuse reale faremo `pnpm add @upstash/...`
//     e cambieremo SOLO l'impl di questo file.
//
// Il consumer (Server Action PR-3) DEVE comunque chiamare
// checkPostRateLimit() prima di ogni write. Così il giorno che attiviamo
// l'enforcement è invisibile.

export type PostAction =
  | "post"
  | "reaction"
  | "comment"
  | "repost"
  | "report"
  | "media";

export type RateLimitResult = {
  /** true = il chiamante può procedere */
  ok: boolean;
  /** secondi prima del prossimo retry, se ok=false */
  retryAfter?: number;
  /** Soglia per la finestra (debug/header info) */
  limit?: number;
  /** Quante richieste sono rimaste nella finestra (debug/header info) */
  remaining?: number;
};

/**
 * Stub V1: ritorna sempre ok=true. Le Server Actions DEVONO comunque
 * chiamarla — la logica reale (Upstash sliding window) arriverà in un
 * follow-up senza modifica del chiamante.
 *
 * @param _userId  utente che esegue l'azione (per scoping della key)
 * @param _action  azione tentata (per scegliere la finestra/limit corretta)
 */
export async function checkPostRateLimit(
  _userId: string,
  _action: PostAction,
): Promise<RateLimitResult> {
  return { ok: true };
}
