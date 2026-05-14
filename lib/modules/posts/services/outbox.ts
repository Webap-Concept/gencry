// lib/modules/posts/services/outbox.ts
//
// Outbox pattern: gli eventi social interessanti (reaction added, comment
// created, mention, repost) vengono accumulati nella tabella
// `posts_outbox`. Un consumer separato (modulo `notifications` futuro,
// o un cron worker) li drena, li trasforma in `notifications` row e
// li marca `processed_at = NOW()`.
//
// La popolazione dell'outbox in V1 è fatta DAI TRIGGER DB (vedi
// M_posts_002_triggers.sql) sulle 4 sorgenti standard. Questo service
// espone l'API ESPLICITA per eventuali eventi che non hanno una sorgente
// SQL deterministica (es. "post.feed.served" se un giorno volessimo
// instrumentare l'utilizzo, oppure eventi custom dal modulo predictions
// in futuro).
//
// Hookable: V2 può sostituire l'INSERT diretto con un enqueue su
// Upstash QStash / Cloudflare Queue per ridurre la pressione su Postgres
// quando il volume di eventi cresce.
import { db } from "@/lib/db/drizzle";
import { postsOutbox } from "@/lib/db/schema";

export type OutboxEventType =
  | "post.reaction.added"
  | "post.comment.created"
  | "post.mention"
  | "post.repost.created"
  | (string & {});  // estendibile dai moduli che dipendono da posts

/**
 * Accoda un evento outbox. V1 = INSERT diretto, V2 può fare race con
 * un'altra queue.
 *
 * Per gli eventi delle 4 fonti standard sopra NON è necessario chiamare
 * questa funzione manualmente — i trigger DB li emettono automaticamente.
 * Questa API serve a:
 *   - moduli futuri (predictions, sentiment) che hanno eventi proprietari
 *     ma vogliono usare lo stesso outbox per la notifications pipeline
 *   - script di admin / migration che vogliono backfill di eventi storici
 */
export async function enqueueOutboxEvent(
  eventType: OutboxEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(postsOutbox).values({ eventType, payload });
}
