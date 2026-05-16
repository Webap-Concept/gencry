// lib/sessions/suspicious/detectors.ts
//
// Tier-1 heuristics for flagging suspicious sessions. Each detector is an
// async function that takes its rule config + the orchestrator clock and
// returns AlertCandidate[]. They MUST be pure w.r.t. side-effects: the
// runner is the only thing that writes to the DB.
//
// Idempotency: every candidate carries a deterministic `dedupKey`. The
// runner uses INSERT … ON CONFLICT DO NOTHING on the unique index, so
// running the cron twice on the same dataset never duplicates alerts.
//
// Cost discipline: every detector aims for 1 query (or 2 when joining
// historical data), with the time window keeping the scanned set small
// (last N hours of `sessions` / `login_attempts` / `activity_logs`).

import "server-only";
import { db } from "@/lib/db/drizzle";
import { sql } from "drizzle-orm";
import { redisCmd, redisPipeline } from "@/lib/auth/rate-limit-redis";
import type { AlertsConfig } from "./config";
import type { AlertCandidate } from "./types";
import { ipToSubnet } from "./types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Bucket id, useful for "one alert per user per day/hour". */
function dayBucket(now: Date): string {
  return Math.floor(now.getTime() / DAY_MS).toString();
}
function hourBucket(now: Date): string {
  return Math.floor(now.getTime() / HOUR_MS).toString();
}

// ---------------------------------------------------------------------------
// 1. multiple_ips — same user with N+ distinct IPs in last X hours
// ---------------------------------------------------------------------------

export async function detectMultipleIps(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["multiple_ips"],
  now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];
  const rows = await db.execute<{
    user_id: string;
    ip_count: number;
    ips: string[];
  }>(sql`
    SELECT user_id,
           COUNT(DISTINCT ip)::int AS ip_count,
           ARRAY_AGG(DISTINCT ip) AS ips
    FROM sessions
    WHERE ip IS NOT NULL
      AND created_at >= NOW() - (${rule.windowHours} * INTERVAL '1 hour')
    GROUP BY user_id
    HAVING COUNT(DISTINCT ip) >= ${rule.count}
  `);

  const bucket = dayBucket(now);
  return (rows as unknown as Array<{
    user_id: string;
    ip_count: number;
    ips: string[];
  }>).map((r) => ({
    reason: "multiple_ips",
    severity: rule.severity,
    sessionId: null,
    userId: r.user_id,
    details: {
      ipCount: r.ip_count,
      ips: r.ips.slice(0, 10),
      windowHours: rule.windowHours,
    },
    dedupKey: `multiple_ips:${r.user_id}:${bucket}`,
  }));
}

// ---------------------------------------------------------------------------
// 2. concurrent_devices — N+ active sessions for the same user
// ---------------------------------------------------------------------------

export async function detectConcurrentDevices(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["concurrent_devices"],
  now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];
  const rows = await db.execute<{
    user_id: string;
    active_count: number;
  }>(sql`
    SELECT user_id, COUNT(*)::int AS active_count
    FROM sessions
    WHERE revoked_at IS NULL
      AND expires_at > NOW()
    GROUP BY user_id
    HAVING COUNT(*) >= ${rule.count}
  `);

  const bucket = hourBucket(now);
  return (rows as unknown as Array<{ user_id: string; active_count: number }>).map(
    (r) => ({
      reason: "concurrent_devices",
      severity: rule.severity,
      sessionId: null,
      userId: r.user_id,
      details: { activeCount: r.active_count },
      dedupKey: `concurrent_devices:${r.user_id}:${bucket}`,
    }),
  );
}

// ---------------------------------------------------------------------------
// 3. burst_creation — N+ sessions opened by same user in short window
// ---------------------------------------------------------------------------

export async function detectBurstCreation(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["burst_creation"],
  now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];
  const rows = await db.execute<{ user_id: string; n: number }>(sql`
    SELECT user_id, COUNT(*)::int AS n
    FROM sessions
    WHERE created_at >= NOW() - (${rule.windowMinutes} * INTERVAL '1 minute')
    GROUP BY user_id
    HAVING COUNT(*) >= ${rule.count}
  `);

  const bucket = hourBucket(now);
  return (rows as unknown as Array<{ user_id: string; n: number }>).map((r) => ({
    reason: "burst_creation",
    severity: rule.severity,
    sessionId: null,
    userId: r.user_id,
    details: { count: r.n, windowMinutes: rule.windowMinutes },
    dedupKey: `burst_creation:${r.user_id}:${bucket}`,
  }));
}

// ---------------------------------------------------------------------------
// 4. bot_user_agent — UA matches a bot/scraper pattern
// ---------------------------------------------------------------------------

export async function detectBotUserAgent(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["bot_user_agent"],
  _now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];

  // Validate the regex client-side first: a malformed pattern would raise a
  // server error, and a single bad save in the UI shouldn't break the cron.
  try {
    new RegExp(rule.pattern, "i");
  } catch (e) {
    console.warn("[detect/bot_user_agent] invalid regex, skipping:", e);
    return [];
  }

  // Scan the last 24h. Earlier sessions either already alerted (dedup) or
  // are stale enough to be irrelevant.
  const rows = await db.execute<{
    id: string;
    user_id: string;
    user_agent: string | null;
    ip: string | null;
  }>(sql`
    SELECT id, user_id, user_agent, ip
    FROM sessions
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND user_agent IS NOT NULL
      AND user_agent ~* ${rule.pattern}
  `);

  return (rows as unknown as Array<{
    id: string;
    user_id: string;
    user_agent: string | null;
    ip: string | null;
  }>).map((r) => ({
    reason: "bot_user_agent",
    severity: rule.severity,
    sessionId: r.id,
    userId: r.user_id,
    details: { userAgent: r.user_agent, ip: r.ip },
    dedupKey: `bot_user_agent:${r.id}`,
  }));
}

// ---------------------------------------------------------------------------
// 5. long_idle_resurrect — old session newly active after a long gap
//
// Needs state we don't have in `sessions` (only `last_seen_at` current
// value). We snapshot per session in Redis and compare on the next tick.
// If Redis is unavailable, the detector returns [] and logs a warning —
// no other heuristic depends on Redis being up.
//
// Round-trip discipline: we MGET all keys in one call and then push all
// SET-EX in one pipelined call, so the cost is O(1) round-trips instead
// of O(N) where N is the number of recently active sessions.
// ---------------------------------------------------------------------------

const RESURRECT_KEY_PREFIX = "alert:lastseen:";

/** How many keys per Upstash REST round-trip. Tuned defensively: a
 *  payload of ~500 UUID-keyed commands is well under the 10MB REST limit
 *  and keeps any single timeout window tight. */
const RESURRECT_BATCH_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0 || arr.length <= size) return arr.length === 0 ? [] : [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function detectLongIdleResurrect(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["long_idle_resurrect"],
  now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];

  // Scope: only sessions touched in the last hour (cron runs more often than
  // that, so this stays a tight working set).
  const rows = await db.execute<{
    id: string;
    user_id: string;
    last_seen_at: string;
    ip: string | null;
  }>(sql`
    SELECT id, user_id, last_seen_at, ip
    FROM sessions
    WHERE revoked_at IS NULL
      AND last_seen_at >= NOW() - INTERVAL '1 hour'
  `);

  const sessions = rows as unknown as Array<{
    id: string;
    user_id: string;
    last_seen_at: string;
    ip: string | null;
  }>;
  if (sessions.length === 0) return [];

  // Step 1: read all snapshots in batches of MGET (1 round-trip per batch).
  const keys = sessions.map((s) => RESURRECT_KEY_PREFIX + s.id);
  const previous: Array<number | null> = new Array(sessions.length).fill(null);

  try {
    let offset = 0;
    for (const batch of chunk(keys, RESURRECT_BATCH_SIZE)) {
      const raws = await redisCmd<Array<string | null>>(["MGET", ...batch]);
      for (let i = 0; i < raws.length; i++) {
        const raw = raws[i];
        if (!raw) continue;
        const n = Number(raw);
        if (!Number.isNaN(n) && n > 0) previous[offset + i] = n;
      }
      offset += batch.length;
    }
  } catch (e) {
    // Redis unavailable — fail closed for this run, other detectors keep going.
    console.warn("[detect/long_idle_resurrect] Redis MGET failed:", e);
    return [];
  }

  // Step 2: build candidates + the SET-EX commands at the same time.
  const idleMs = rule.idleDays * DAY_MS;
  const ttlSeconds = Math.max(rule.idleDays * 2, 1) * 24 * 3600;
  const out: AlertCandidate[] = [];
  const writes: (string | number)[][] = [];

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const currentTs = new Date(s.last_seen_at).getTime();
    const prev = previous[i];

    if (prev !== null && currentTs - prev >= idleMs) {
      out.push({
        reason: "long_idle_resurrect",
        severity: rule.severity,
        sessionId: s.id,
        userId: s.user_id,
        details: {
          ip: s.ip,
          idleDays: Math.round((currentTs - prev) / DAY_MS),
          previousLastSeen: new Date(prev).toISOString(),
        },
        dedupKey: `long_idle_resurrect:${s.id}:${Math.floor(currentTs / DAY_MS)}`,
      });
    }

    // Refresh the snapshot regardless of alert — every tick re-arms the
    // window. We use SET … EX so stale rows for revoked/expired sessions
    // self-evict without explicit DELETE.
    writes.push([
      "SET",
      keys[i],
      currentTs.toString(),
      "EX",
      String(ttlSeconds),
    ]);
  }

  // Step 3: write back snapshots in a pipelined call (1 round-trip per batch).
  // Failures here are non-fatal: worst case the detector misses one tick of
  // updates and re-converges next time.
  for (const batch of chunk(writes, RESURRECT_BATCH_SIZE)) {
    try {
      await redisPipeline(batch);
    } catch (e) {
      console.warn("[detect/long_idle_resurrect] Redis pipeline write failed:", e);
      break;
    }
  }

  // Reference `now` to keep the signature symmetric with the other detectors.
  void now;
  return out;
}

// ---------------------------------------------------------------------------
// 6. failed_then_success — N+ failed login attempts then a successful one
// ---------------------------------------------------------------------------

export async function detectFailedThenSuccess(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["failed_then_success"],
  now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];

  // Find users who succeeded recently AND had >=N failed attempts in the
  // window leading up to that success.
  const rows = await db.execute<{
    user_id: string;
    email: string;
    ip: string;
    failed_count: number;
    last_failed_at: string;
  }>(sql`
    WITH recent_success AS (
      SELECT u.id AS user_id, la.email, la.ip, la.attempted_at
      FROM login_attempts la
      INNER JOIN users u ON u.email = la.email
      WHERE la.success = true
        AND la.attempted_at >= NOW() - (${rule.windowMinutes} * INTERVAL '1 minute')
    )
    SELECT rs.user_id, rs.email, rs.ip,
           COUNT(la2.id)::int AS failed_count,
           MAX(la2.attempted_at)::text AS last_failed_at
    FROM recent_success rs
    INNER JOIN login_attempts la2
      ON la2.email = rs.email
      AND la2.success = false
      AND la2.attempted_at >= rs.attempted_at - (${rule.windowMinutes} * INTERVAL '1 minute')
      AND la2.attempted_at < rs.attempted_at
    GROUP BY rs.user_id, rs.email, rs.ip
    HAVING COUNT(la2.id) >= ${rule.failedCount}
  `);

  const bucket = hourBucket(now);
  return (rows as unknown as Array<{
    user_id: string;
    email: string;
    ip: string;
    failed_count: number;
    last_failed_at: string;
  }>).map((r) => ({
    reason: "failed_then_success",
    severity: rule.severity,
    sessionId: null,
    userId: r.user_id,
    details: {
      failedCount: r.failed_count,
      ip: r.ip,
      lastFailedAt: r.last_failed_at,
      windowMinutes: rule.windowMinutes,
    },
    dedupKey: `failed_then_success:${r.user_id}:${bucket}`,
  }));
}

// ---------------------------------------------------------------------------
// 7. sensitive_action_new_ip — dangerous action right after a new-IP session
// ---------------------------------------------------------------------------

export async function detectSensitiveActionNewIp(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["sensitive_action_new_ip"],
  _now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];
  if (rule.actions.length === 0) return [];

  // Find activity_logs of sensitive types in the recent window, joined back
  // to a session opened on a "new" IP for that user (one not seen in the
  // last 90 days). Cheap-ish via NOT EXISTS.
  // IN (sql.join) invece di ANY(::text[]) — vedi commento gemello in
  // lib/notifications/generators/cron-failures.ts per il razionale.
  const actionsInList = sql.join(
    rule.actions.map((a) => sql`${a}`),
    sql`, `,
  );
  const rows = await db.execute<{
    activity_id: number;
    user_id: string;
    action: string;
    activity_at: string;
    session_id: string | null;
    ip: string | null;
  }>(sql`
    SELECT a.id AS activity_id,
           a.user_id,
           a.action,
           a.timestamp::text AS activity_at,
           s.id AS session_id,
           s.ip
    FROM activity_logs a
    INNER JOIN sessions s
      ON s.user_id = a.user_id
      AND s.created_at >= a.timestamp - (${rule.withinMinutes} * INTERVAL '1 minute')
      AND s.created_at <= a.timestamp
    WHERE a.action IN (${actionsInList})
      AND a.timestamp >= NOW() - INTERVAL '24 hours'
      AND s.ip IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sessions s2
        WHERE s2.user_id = a.user_id
          AND s2.id <> s.id
          AND s2.ip = s.ip
          AND s2.created_at < s.created_at - INTERVAL '5 minutes'
          AND s2.created_at >= NOW() - INTERVAL '90 days'
      )
  `);

  return (rows as unknown as Array<{
    activity_id: number;
    user_id: string;
    action: string;
    activity_at: string;
    session_id: string | null;
    ip: string | null;
  }>).map((r) => ({
    reason: "sensitive_action_new_ip",
    severity: rule.severity,
    sessionId: r.session_id,
    userId: r.user_id,
    details: {
      action: r.action,
      ip: r.ip,
      activityAt: r.activity_at,
      withinMinutes: rule.withinMinutes,
    },
    dedupKey: `sensitive_action_new_ip:${r.user_id}:${r.activity_id}`,
  }));
}

// ---------------------------------------------------------------------------
// 8. new_subnet — login from a /16 (or /64 for IPv6) never seen by user
// ---------------------------------------------------------------------------

export async function detectNewSubnet(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["new_subnet"],
  _now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];

  // Pull recent sessions + the user's historical IPs, then compute "new
  // subnet" in JS. SQL-only would need network functions we can't assume.
  const rows = await db.execute<{
    id: string;
    user_id: string;
    ip: string | null;
    created_at: string;
  }>(sql`
    SELECT id, user_id, ip, created_at::text AS created_at
    FROM sessions
    WHERE created_at >= NOW() - INTERVAL '6 hours'
      AND ip IS NOT NULL
  `);

  const recent = rows as unknown as Array<{
    id: string;
    user_id: string;
    ip: string | null;
    created_at: string;
  }>;
  if (recent.length === 0) return [];

  const userIds = [...new Set(recent.map((r) => r.user_id))];
  if (userIds.length === 0) return [];
  // IN (sql.join) invece di ANY(::uuid[]) — vedi commento gemello in
  // lib/notifications/generators/cron-failures.ts per il razionale.
  const userIdsInList = sql.join(
    userIds.map((u) => sql`${u}`),
    sql`, `,
  );
  const histRows = await db.execute<{
    user_id: string;
    ip: string;
    first_seen: string;
  }>(sql`
    SELECT user_id, ip, MIN(created_at)::text AS first_seen
    FROM sessions
    WHERE user_id IN (${userIdsInList})
      AND ip IS NOT NULL
      AND created_at >= NOW() - (${rule.lookbackDays} * INTERVAL '1 day')
      AND created_at < NOW() - INTERVAL '6 hours'
    GROUP BY user_id, ip
  `);

  const knownSubnets = new Map<string, Set<string>>();
  for (const h of histRows as unknown as Array<{
    user_id: string;
    ip: string;
    first_seen: string;
  }>) {
    const s = ipToSubnet(h.ip);
    if (!s) continue;
    if (!knownSubnets.has(h.user_id)) knownSubnets.set(h.user_id, new Set());
    knownSubnets.get(h.user_id)!.add(s);
  }

  const out: AlertCandidate[] = [];
  for (const r of recent) {
    const subnet = ipToSubnet(r.ip);
    if (!subnet) continue;
    const known = knownSubnets.get(r.user_id);
    // First-ever session for this user in the lookback → don't alert.
    if (!known || known.size === 0) continue;
    if (known.has(subnet)) continue;
    out.push({
      reason: "new_subnet",
      severity: rule.severity,
      sessionId: r.id,
      userId: r.user_id,
      details: {
        ip: r.ip,
        subnet,
        knownSubnetsCount: known.size,
      },
      dedupKey: `new_subnet:${r.user_id}:${r.id}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 9. ua_churn — same user with N+ distinct UAs in short window
// ---------------------------------------------------------------------------

export async function detectUaChurn(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["ua_churn"],
  now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];
  const rows = await db.execute<{
    user_id: string;
    ua_count: number;
  }>(sql`
    SELECT user_id, COUNT(DISTINCT user_agent)::int AS ua_count
    FROM sessions
    WHERE created_at >= NOW() - (${rule.windowMinutes} * INTERVAL '1 minute')
      AND user_agent IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(DISTINCT user_agent) >= ${rule.count}
  `);

  const bucket = hourBucket(now);
  return (rows as unknown as Array<{ user_id: string; ua_count: number }>).map(
    (r) => ({
      reason: "ua_churn",
      severity: rule.severity,
      sessionId: null,
      userId: r.user_id,
      details: { uaCount: r.ua_count, windowMinutes: rule.windowMinutes },
      dedupKey: `ua_churn:${r.user_id}:${bucket}`,
    }),
  );
}

// ---------------------------------------------------------------------------
// 10. cross_user_campaign — same IP creating sessions for many users
// ---------------------------------------------------------------------------

export async function detectCrossUserCampaign(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["cross_user_campaign"],
  now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];
  const rows = await db.execute<{
    ip: string;
    user_count: number;
    users: string[];
  }>(sql`
    SELECT ip,
           COUNT(DISTINCT user_id)::int AS user_count,
           ARRAY_AGG(DISTINCT user_id::text) AS users
    FROM sessions
    WHERE ip IS NOT NULL
      AND created_at >= NOW() - (${rule.windowMinutes} * INTERVAL '1 minute')
    GROUP BY ip
    HAVING COUNT(DISTINCT user_id) >= ${rule.minUsers}
  `);

  const bucket = hourBucket(now);
  return (rows as unknown as Array<{
    ip: string;
    user_count: number;
    users: string[];
  }>).map((r) => ({
    reason: "cross_user_campaign",
    severity: rule.severity,
    sessionId: null,
    userId: null,
    details: {
      ip: r.ip,
      userCount: r.user_count,
      sampleUsers: r.users.slice(0, 10),
      windowMinutes: rule.windowMinutes,
    },
    dedupKey: `cross_user_campaign:${r.ip}:${bucket}`,
  }));
}

// ---------------------------------------------------------------------------
// 11. off_baseline_hours — user logs in outside their typical hour window
// ---------------------------------------------------------------------------

export async function detectOffBaselineHours(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["off_baseline_hours"],
  _now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];

  // Recent sessions + per-user historical hour distribution. We ask Postgres
  // to compute median + p10/p90 ourselves: any login outside [p10-dev, p90+dev]
  // counts as "off baseline".
  const rows = await db.execute<{
    id: string;
    user_id: string;
    ip: string | null;
    new_hour: number;
    sample_count: number;
    p10: number | null;
    p90: number | null;
  }>(sql`
    WITH recent AS (
      SELECT id, user_id, ip,
             EXTRACT(HOUR FROM created_at)::int AS new_hour,
             created_at
      FROM sessions
      WHERE created_at >= NOW() - INTERVAL '6 hours'
    ),
    baseline AS (
      SELECT user_id,
             COUNT(*)::int AS sample_count,
             percentile_cont(0.1) WITHIN GROUP (
               ORDER BY EXTRACT(HOUR FROM created_at)
             ) AS p10,
             percentile_cont(0.9) WITHIN GROUP (
               ORDER BY EXTRACT(HOUR FROM created_at)
             ) AS p90
      FROM sessions
      WHERE created_at >= NOW() - (${rule.lookbackDays} * INTERVAL '1 day')
        AND created_at < NOW() - INTERVAL '6 hours'
      GROUP BY user_id
    )
    SELECT r.id, r.user_id, r.ip, r.new_hour,
           b.sample_count, b.p10, b.p90
    FROM recent r
    INNER JOIN baseline b ON b.user_id = r.user_id
    WHERE b.sample_count >= ${rule.minSamples}
  `);

  const out: AlertCandidate[] = [];
  for (const r of rows as unknown as Array<{
    id: string;
    user_id: string;
    ip: string | null;
    new_hour: number;
    sample_count: number;
    p10: number | null;
    p90: number | null;
  }>) {
    if (r.p10 == null || r.p90 == null) continue;
    const lower = r.p10 - rule.deviationHours;
    const upper = r.p90 + rule.deviationHours;
    const outside = r.new_hour < lower || r.new_hour > upper;
    if (!outside) continue;
    out.push({
      reason: "off_baseline_hours",
      severity: rule.severity,
      sessionId: r.id,
      userId: r.user_id,
      details: {
        ip: r.ip,
        loginHour: r.new_hour,
        baselineP10: r.p10,
        baselineP90: r.p90,
        sampleCount: r.sample_count,
      },
      dedupKey: `off_baseline_hours:${r.user_id}:${r.id}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 12. admin_off_hours — admin login outside the configured business window
// ---------------------------------------------------------------------------

export async function detectAdminOffHours(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["admin_off_hours"],
  _now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];

  // "Admin" = users.is_admin OR has admin:access via role. Cheap inner-join
  // approach here: superadmins (is_admin=true). For RBAC-granted admins,
  // covering them too means an extra join + EXISTS — we keep that path
  // open behind the same SQL, but for now restrict to is_admin to avoid
  // false positives during initial roll-out.
  const rows = await db.execute<{
    id: string;
    user_id: string;
    ip: string | null;
    login_hour: number;
  }>(sql`
    SELECT s.id, s.user_id, s.ip,
           EXTRACT(HOUR FROM s.created_at)::int AS login_hour
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.created_at >= NOW() - INTERVAL '6 hours'
      AND u.is_admin = true
      AND (
        EXTRACT(HOUR FROM s.created_at) < ${rule.startUtcHour}
        OR EXTRACT(HOUR FROM s.created_at) >= ${rule.endUtcHour}
      )
  `);

  return (rows as unknown as Array<{
    id: string;
    user_id: string;
    ip: string | null;
    login_hour: number;
  }>).map((r) => ({
    reason: "admin_off_hours",
    severity: rule.severity,
    sessionId: r.id,
    userId: r.user_id,
    details: {
      ip: r.ip,
      loginHour: r.login_hour,
      allowedWindow: `${rule.startUtcHour}:00–${rule.endUtcHour}:00 UTC`,
    },
    dedupKey: `admin_off_hours:${r.user_id}:${r.id}`,
  }));
}

// ---------------------------------------------------------------------------
// 13. trusted_device_from_fresh_session — trusted device added right after
//     a fresh session (within N minutes)
// ---------------------------------------------------------------------------

export async function detectTrustedDeviceFromFresh(
  rule: AlertsConfig["sources"]["sessions"]["rules"]["trusted_device_from_fresh_session"],
  _now: Date,
): Promise<AlertCandidate[]> {
  if (!rule.enabled) return [];

  const rows = await db.execute<{
    device_id: number;
    user_id: string;
    device_token: string;
    ip: string | null;
    session_id: string | null;
    created_at: string;
  }>(sql`
    SELECT td.id AS device_id,
           td.user_id,
           td.device_token,
           s.ip,
           s.id AS session_id,
           td.created_at::text AS created_at
    FROM trusted_devices td
    INNER JOIN sessions s
      ON s.user_id = td.user_id
      AND s.device_token = td.device_token
      AND s.created_at >= td.created_at - (${rule.withinMinutes} * INTERVAL '1 minute')
      AND s.created_at <= td.created_at
    WHERE td.created_at >= NOW() - INTERVAL '24 hours'
  `);

  return (rows as unknown as Array<{
    device_id: number;
    user_id: string;
    device_token: string;
    ip: string | null;
    session_id: string | null;
    created_at: string;
  }>).map((r) => ({
    reason: "trusted_device_from_fresh_session",
    severity: rule.severity,
    sessionId: r.session_id,
    userId: r.user_id,
    details: {
      ip: r.ip,
      deviceId: r.device_id,
      addedAt: r.created_at,
      withinMinutes: rule.withinMinutes,
    },
    dedupKey: `trusted_device_from_fresh_session:${r.user_id}:${r.device_id}`,
  }));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Runs every detector in parallel; collects + flattens candidates.
 *  Failures in a single detector are logged but never fail the run. */
export async function runAllDetectors(
  config: AlertsConfig,
  now: Date,
): Promise<AlertCandidate[]> {
  const detectors: Array<{
    name: string;
    fn: () => Promise<AlertCandidate[]>;
  }> = [
    {
      name: "multiple_ips",
      fn: () => detectMultipleIps(config.sources.sessions.rules.multiple_ips, now),
    },
    {
      name: "concurrent_devices",
      fn: () => detectConcurrentDevices(config.sources.sessions.rules.concurrent_devices, now),
    },
    {
      name: "burst_creation",
      fn: () => detectBurstCreation(config.sources.sessions.rules.burst_creation, now),
    },
    {
      name: "bot_user_agent",
      fn: () => detectBotUserAgent(config.sources.sessions.rules.bot_user_agent, now),
    },
    {
      name: "long_idle_resurrect",
      fn: () =>
        detectLongIdleResurrect(config.sources.sessions.rules.long_idle_resurrect, now),
    },
    {
      name: "failed_then_success",
      fn: () => detectFailedThenSuccess(config.sources.sessions.rules.failed_then_success, now),
    },
    {
      name: "sensitive_action_new_ip",
      fn: () =>
        detectSensitiveActionNewIp(config.sources.sessions.rules.sensitive_action_new_ip, now),
    },
    {
      name: "new_subnet",
      fn: () => detectNewSubnet(config.sources.sessions.rules.new_subnet, now),
    },
    {
      name: "ua_churn",
      fn: () => detectUaChurn(config.sources.sessions.rules.ua_churn, now),
    },
    {
      name: "cross_user_campaign",
      fn: () =>
        detectCrossUserCampaign(config.sources.sessions.rules.cross_user_campaign, now),
    },
    {
      name: "off_baseline_hours",
      fn: () => detectOffBaselineHours(config.sources.sessions.rules.off_baseline_hours, now),
    },
    {
      name: "admin_off_hours",
      fn: () => detectAdminOffHours(config.sources.sessions.rules.admin_off_hours, now),
    },
    {
      name: "trusted_device_from_fresh_session",
      fn: () =>
        detectTrustedDeviceFromFresh(
          config.sources.sessions.rules.trusted_device_from_fresh_session,
          now,
        ),
    },
  ];

  const results = await Promise.allSettled(detectors.map((d) => d.fn()));
  const out: AlertCandidate[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      out.push(...r.value);
    } else {
      console.warn(
        `[suspicious/runAllDetectors] detector "${detectors[i].name}" failed:`,
        r.reason,
      );
    }
  });
  return out;
}
