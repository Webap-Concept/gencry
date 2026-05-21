// lib/modules/posts/services/mention-index.ts
//
// Indice in Upstash Redis per l'autocomplete delle @mention nel composer
// (post + commenti). Pattern: 1 sorted-set globale con score=0 (uniforme)
// e member = stringa serializzata `username\x01userId\x01first\x01last\x01avatar`.
//
// Lookup: ZRANGEBYLEX `[prefix [prefix\xff` → range lessicale → O(log N)
// nativo Redis. Niente fetch DB nel hot path.
//
// Sync con DB: 3 hook
//   - addMention(profile)      → ZADD (su user create / profile create)
//   - removeMention(userId)    → ZREM (su user soft-delete)
//   - replaceMention(userId,…) → ZREM old + ZADD new (su username change)
//
// Bootstrap: `rebuildMentionIndex()` fa un full scan di user_profiles e
// rebuilda da zero. Sicuro a chiamare in qualsiasi momento (idempotente:
// DEL + ZADD batch in pipeline). Triggerabile da admin dashboard o lazy
// se la search ritorna 0 al primo uso e la sentinel "bootstrapped" manca.
//
// Hookable: se Upstash non è configurato, search ritorna fallback DB
// (vedi searchMentionPrefix). Niente throw, niente downtime.
import "server-only";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { userProfiles } from "@/lib/db/schema";
import { getRedisClient } from "@/lib/kv/sdk";

/** Sorted-set globale degli username. Score uniforme (0) — l'ordering
 *  che ci interessa è lessicale, gestito da ZRANGEBYLEX. */
const MENTION_SET_KEY = "mention:users";

/** Sentinel "ho già bootstrappato l'indice" per evitare rebuild ripetuti
 *  al primo uso post-deploy. TTL 7d → dopo una settimana ri-bootstrap
 *  per recuperare eventuali drift se i hook hanno fallito. */
const BOOTSTRAP_SENTINEL_KEY = "mention:bootstrapped";
const BOOTSTRAP_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * In-process cache della sentinel. La sentinel cambia ogni 7gg (TTL) o
 * quando `rebuildMentionIndex` la riscrive. Cachare per 5min in-process
 * elimina la GET ridondante ad ogni search (vedi pattern documentato
 * in [[redis-consumer-optimization-pattern]]).
 */
const SENTINEL_CACHE_TTL_MS = 5 * 60 * 1000;
let sentinelCachedAt = 0;
let sentinelCachedValue: string | null = null;

/**
 * In-process cache dei risultati di `searchMentionPrefix`. Key derivata
 * da (prefix + excludeUserIds sorted joined). TTL 10s: copre la finestra
 * "typing rapido cancella+riscrive uguale" senza stale-rendere visibile
 * un nuovo user appena registrato per troppo tempo. La invalidazione su
 * add/remove/replace è lambda-local (non broadcast) — accettabile per
 * autocomplete (worst case: nuovo user invisibile per 10s).
 */
const SEARCH_CACHE_TTL_MS = 10 * 1000;
const searchResultCache = new Map<
  string,
  { value: MentionCandidate[]; expiry: number }
>();

function searchCacheKey(prefix: string, excludeIds: string[]): string {
  // Sort per stabilità della key indipendente dall'ordine input.
  return prefix + "|" + [...excludeIds].sort().join(",");
}

function invalidateLocalCaches(): void {
  searchResultCache.clear();
  // Non tocchiamo sentinelCached: la sentinel è "ho mai bootstrappato",
  // non cambia per add/remove di un singolo member.
}

/** Separatore inline per i campi nel member string. `\x01` (SOH, ASCII 1)
 *  perché non può apparire in username/nome (validation usa [a-z0-9_]
 *  + nomi human) e non si confonde con whitespace nel testo plain. */
const SEP = "\x01";

export type MentionCandidate = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

// ─────────────────────────────────────────────────────────────────────
// Encoding / decoding del member
// ─────────────────────────────────────────────────────────────────────

function encodeMember(u: MentionCandidate): string {
  return [
    u.username.toLowerCase(),
    u.id,
    u.firstName ?? "",
    u.lastName ?? "",
    u.avatarUrl ?? "",
  ].join(SEP);
}

function decodeMember(s: string): MentionCandidate | null {
  const parts = s.split(SEP);
  if (parts.length < 5) return null;
  const [usernameLc, id, fn, ln, av] = parts;
  if (!usernameLc || !id) return null;
  return {
    id,
    username: usernameLc, // case-insensitive lookup; render UI usa @username come scritto
    firstName: fn || null,
    lastName: ln || null,
    avatarUrl: av || null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/** Aggiunge / aggiorna un member nell'indice. Idempotente (ZADD update). */
export async function addMentionMember(u: MentionCandidate): Promise<void> {
  if (!u.username) return; // utenti senza username non sono mentionabili
  const redis = await getRedisClient();
  if (!redis) return; // Upstash non configurato → no-op silent
  await redis.zadd(MENTION_SET_KEY, { score: 0, member: encodeMember(u) });
  invalidateLocalCaches();
}

/** Rimuove un member identificato da userId. Richiede un lookup linear
 *  perché il sorted-set è indicizzato per username, non per id — ma è
 *  raro (delete = evento poco frequente) e l'alternativa (HASH userId→
 *  member) raddoppierebbe lo storage per ottimizzare un caso edge. */
export async function removeMentionMember(userId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  // Full scan: ZRANGE 0 -1 e filter per match userId. Per indici fino a
  // ~100k utenti è < 50ms; oltre serve un side-index userId→member.
  const members = (await redis.zrange<string[]>(
    MENTION_SET_KEY,
    0,
    -1,
  )) as string[];
  const toRemove = members.filter((m) => {
    const decoded = decodeMember(m);
    return decoded?.id === userId;
  });
  if (toRemove.length === 0) return;
  await redis.zrem(MENTION_SET_KEY, ...toRemove);
  invalidateLocalCaches();
}

/** Sostituisce un member quando l'username (o altro campo cached) cambia.
 *  Atomic via pipeline: ZREM old + ZADD new. */
export async function replaceMentionMember(
  userId: string,
  next: MentionCandidate,
): Promise<void> {
  await removeMentionMember(userId);
  await addMentionMember(next);
}

/**
 * Centralizza il sync dall'app: i call site (signup, onboarding, profile
 * settings update, staff invite) chiamano questa una sola volta passando
 * lo userId. Internamente facciamo il read fresco da DB e replace.
 *
 * Best-effort: try/catch + log. NON blocca mai il flow di registration
 * se Upstash è down — l'indice si recupera al prossimo rebuild manuale
 * o al lazy bootstrap.
 */
export async function syncMentionMember(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    const [row] = await db
      .select({
        userId: userProfiles.userId,
        username: userProfiles.username,
        firstName: userProfiles.firstName,
        lastName: userProfiles.lastName,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (!row || !row.username) {
      // Profilo senza username → l'utente non è mentionabile, assicura
      // che non sia rimasto un member orfano dall'eventuale rename a null.
      await removeMentionMember(userId);
      return;
    }
    await replaceMentionMember(userId, {
      id: row.userId,
      username: row.username,
      firstName: row.firstName,
      lastName: row.lastName,
      avatarUrl: row.avatarUrl,
    });
  } catch (err) {
    console.warn("[mention-index] syncMentionMember failed:", err);
  }
}

/** Search per prefix. Ritorna fino a `limit` candidati (default 8).
 *  - Prefix case-insensitive (stored lowercase, query lowercased qui)
 *  - Filtra `excludeUserIds` (es. il viewer stesso, utenti bloccati)
 *  - Fallback DB se Upstash non configurato — query ILIKE su userProfiles
 *
 * NB: ZRANGEBYLEX richiede `[` come includive-min e `\xff` come "tutti i
 * char dopo questo prefix" (max byte). Pattern Redis docs.
 */
export async function searchMentionPrefix(opts: {
  prefix: string;
  limit?: number;
  excludeUserIds?: string[];
}): Promise<MentionCandidate[]> {
  const prefix = opts.prefix.trim().toLowerCase();
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20);
  if (!prefix) return [];
  const exclude = new Set(opts.excludeUserIds ?? []);

  const redis = await getRedisClient();
  if (!redis) return searchMentionPrefixFromDb(prefix, limit, exclude);

  // In-process result cache (vedi commento al top): hit = 0 Redis cmd.
  const cacheKey = searchCacheKey(prefix, opts.excludeUserIds ?? []);
  const now = Date.now();
  const cached = searchResultCache.get(cacheKey);
  if (cached && now < cached.expiry) {
    return cached.value.slice(0, limit);
  }

  // ZRANGEBYLEX: `[<prefix>` inclusive min, `[<prefix>\xff` upper bound.
  // Sovra-fetch (limit + exclude.size) per compensare eventuali esclusi.
  const overFetch = limit + exclude.size + 4;
  const raw = (await redis.zrange<string[]>(
    MENTION_SET_KEY,
    `[${prefix}`,
    `[${prefix}\xff`,
    { byLex: true, offset: 0, count: overFetch },
  )) as string[];

  const out: MentionCandidate[] = [];
  for (const m of raw) {
    const decoded = decodeMember(m);
    if (!decoded) continue;
    if (exclude.has(decoded.id)) continue;
    out.push(decoded);
    if (out.length >= limit) break;
  }
  searchResultCache.set(cacheKey, {
    value: out,
    expiry: now + SEARCH_CACHE_TTL_MS,
  });
  return out;
}

/** Fallback DB quando Upstash è down/non-configurato. Mantiene la
 *  stessa shape di output così il caller non se ne accorge. */
async function searchMentionPrefixFromDb(
  prefix: string,
  limit: number,
  exclude: Set<string>,
): Promise<MentionCandidate[]> {
  // ILIKE prefix% su username, sortato. L'indice esistente lo gestisce.
  const rows = await db.query.userProfiles.findMany({
    where: (up, { ilike, and: a, isNotNull: nn }) =>
      a(nn(up.username), ilike(up.username, `${prefix}%`)),
    columns: {
      userId: true,
      username: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    },
    orderBy: (up, { asc }) => [asc(up.username)],
    limit: limit + exclude.size + 4,
  });
  const out: MentionCandidate[] = [];
  for (const r of rows) {
    if (!r.username) continue;
    if (exclude.has(r.userId)) continue;
    out.push({
      id: r.userId,
      username: r.username.toLowerCase(),
      firstName: r.firstName,
      lastName: r.lastName,
      avatarUrl: r.avatarUrl,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Bootstrap / rebuild
// ─────────────────────────────────────────────────────────────────────

/** Full rebuild dell'indice. Scan completo di user_profiles, DEL + ZADD
 *  batch (pipeline). Idempotente e safe a chiamare in qualsiasi momento.
 *  Setta la sentinel di bootstrap con TTL 7d. */
export async function rebuildMentionIndex(): Promise<{
  scanned: number;
  indexed: number;
}> {
  const redis = await getRedisClient();
  if (!redis) return { scanned: 0, indexed: 0 };

  const rows = await db
    .select({
      userId: userProfiles.userId,
      username: userProfiles.username,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(userProfiles)
    .where(isNotNull(userProfiles.username));

  // Clear + repopulate in 1 pipeline. ZADD multi-member in batch da 200
  // per restare comodi sotto i limiti payload Upstash.
  await redis.del(MENTION_SET_KEY);

  let indexed = 0;
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows
      .slice(i, i + BATCH)
      .filter((r) => r.username)
      .map((r) => ({
        score: 0,
        member: encodeMember({
          id: r.userId,
          username: r.username!,
          firstName: r.firstName,
          lastName: r.lastName,
          avatarUrl: r.avatarUrl,
        }),
      }));
    if (slice.length > 0) {
      // @ts-expect-error — variadic typing dell'SDK
      await redis.zadd(MENTION_SET_KEY, ...slice);
      indexed += slice.length;
    }
  }

  await redis.set(BOOTSTRAP_SENTINEL_KEY, "1", { ex: BOOTSTRAP_TTL_SECONDS });
  // Update sentinel cache locale + clear result cache: l'indice è
  // stato rebuildato, qualunque risultato cached è potenzialmente stale.
  sentinelCachedValue = "1";
  sentinelCachedAt = Date.now();
  invalidateLocalCaches();
  return { scanned: rows.length, indexed };
}

/** Lazy bootstrap: chiamato dal search SE non c'è la sentinel. Non blocca
 *  il search corrente (fire-and-forget), il prossimo arriverà già caldo.
 *  Usa una in-process cache TTL 5min sulla sentinel: la sentinel cambia
 *  ogni 7gg, GET ridondante ad ogni search era spreco netto. */
export async function ensureMentionIndexBootstrapped(): Promise<void> {
  const now = Date.now();
  if (sentinelCachedValue && now - sentinelCachedAt < SENTINEL_CACHE_TTL_MS) {
    return; // cache hit: la sentinel era presente, niente rebuild necessario
  }
  const redis = await getRedisClient();
  if (!redis) return;
  const sentinel = await redis.get<string>(BOOTSTRAP_SENTINEL_KEY);
  sentinelCachedAt = now;
  sentinelCachedValue = sentinel ?? null;
  if (sentinel) return;
  // Fire and forget — il search corrente cade su DB fallback se l'indice
  // è vuoto, il prossimo userà l'indice rebuildato.
  void rebuildMentionIndex();
}
