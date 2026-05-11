// lib/admin/health/aggregate.ts
//
// Aggregates a status snapshot for the external services the admin
// dashboard cares about (database, Supabase, Redis, Resend, Cloudflare,
// Sentry). Each individual probe is a pure function that reads
// credentials from app_settings (or runs a built-in query for the DB)
// and returns a uniform ServiceHealth shape — never throws.
//
// The public `getHealthSnapshot` is wrapped in `unstable_cache` with a
// 60s TTL so the dashboard widget never fans out 6 outbound HTTP calls
// per page load: the first viewer pays the cost, everyone within the
// next minute reads from the cache. Set `HEALTH_SNAPSHOT_TAG` and call
// `revalidateTag` from a connection-test action if you ever want to
// invalidate sooner.
//
// Sentry note: the probe does NOT send a live event. A live envelope
// POST every 60s would flood the project with synthetic events; we just
// validate the DSN format. The full live test stays behind the manual
// "Test connection" button in /admin/services/sentry.

import "server-only";

import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { getAppSettings } from "@/lib/db/settings-queries";
import { checkSupabaseConnection } from "@/lib/admin/supabase/management";
import { isValidDsn } from "@/lib/sentry/config";

const FETCH_TIMEOUT_MS = 5000;

export type HealthStatus = "ok" | "down" | "missing_config";

export type HealthServiceId =
  | "database"
  | "supabase"
  | "redis"
  | "resend"
  | "cloudflare"
  | "sentry";

export interface ServiceHealth {
  id: HealthServiceId;
  status: HealthStatus;
  latencyMs: number | null;
  /** Free-form short code for debugging — surfaced to admins in a tooltip. */
  error?: string;
}

export interface HealthSnapshot {
  services: ServiceHealth[];
  /** Unix ms — when the snapshot was generated (cache key, not now). */
  fetchedAt: number;
}

export const HEALTH_SNAPSHOT_TAG = "admin-health-snapshot";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function timedFetch(
  url: string,
  init: RequestInit,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Probes ──────────────────────────────────────────────────────────────────

async function checkDatabase(): Promise<ServiceHealth> {
  const t0 = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { id: "database", status: "ok", latencyMs: Date.now() - t0 };
  } catch (e) {
    return {
      id: "database",
      status: "down",
      latencyMs: null,
      error: e instanceof Error ? e.message.slice(0, 80) : "query_failed",
    };
  }
}

async function checkSupabase(): Promise<ServiceHealth> {
  const t0 = Date.now();
  const result = await checkSupabaseConnection();
  if (result.ok) {
    return { id: "supabase", status: "ok", latencyMs: Date.now() - t0 };
  }
  if (result.error === "credentials_missing") {
    return { id: "supabase", status: "missing_config", latencyMs: null };
  }
  return {
    id: "supabase",
    status: "down",
    latencyMs: null,
    error: result.error,
  };
}

async function checkRedis(): Promise<ServiceHealth> {
  const settings = await getAppSettings();
  const url = settings.upstash_redis_rest_url?.trim() ?? "";
  const token = settings.upstash_redis_rest_token?.trim() ?? "";
  if (!url || !token) {
    return { id: "redis", status: "missing_config", latencyMs: null };
  }
  const t0 = Date.now();
  const res = await timedFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["PING"]),
  });
  if (!res) {
    return { id: "redis", status: "down", latencyMs: null, error: "network" };
  }
  if (!res.ok) {
    return {
      id: "redis",
      status: "down",
      latencyMs: null,
      error: `http_${res.status}`,
    };
  }
  return { id: "redis", status: "ok", latencyMs: Date.now() - t0 };
}

async function checkResend(): Promise<ServiceHealth> {
  const settings = await getAppSettings();
  const apiKey = settings.resend_api_key?.trim() ?? "";
  if (!apiKey) {
    return { id: "resend", status: "missing_config", latencyMs: null };
  }
  const t0 = Date.now();
  const res = await timedFetch("https://api.resend.com/domains", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res) {
    return { id: "resend", status: "down", latencyMs: null, error: "network" };
  }
  if (!res.ok) {
    return {
      id: "resend",
      status: "down",
      latencyMs: null,
      error: `http_${res.status}`,
    };
  }
  return { id: "resend", status: "ok", latencyMs: Date.now() - t0 };
}

async function checkCloudflare(): Promise<ServiceHealth> {
  const settings = await getAppSettings();
  const secret = settings.cf_turnstile_secret_key?.trim() ?? "";
  if (!secret) {
    return { id: "cloudflare", status: "missing_config", latencyMs: null };
  }
  // Same probe used by /admin/services/cloudflare: a deliberately bogus
  // token. Cloudflare reports `invalid-input-secret` when the secret is
  // wrong and `invalid-input-response` when the secret is fine — both
  // outcomes prove we can talk to the endpoint with the configured key.
  const t0 = Date.now();
  const res = await timedFetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: "probe-token-invalid",
      }),
    },
  );
  if (!res) {
    return {
      id: "cloudflare",
      status: "down",
      latencyMs: null,
      error: "network",
    };
  }
  const data = (await res.json().catch(() => null)) as
    | { "error-codes"?: string[] }
    | null;
  if (!data) {
    return {
      id: "cloudflare",
      status: "down",
      latencyMs: null,
      error: "unreadable",
    };
  }
  const codes = data["error-codes"] ?? [];
  if (codes.includes("invalid-input-secret")) {
    return {
      id: "cloudflare",
      status: "down",
      latencyMs: null,
      error: "invalid_secret",
    };
  }
  return { id: "cloudflare", status: "ok", latencyMs: Date.now() - t0 };
}

async function checkSentry(): Promise<ServiceHealth> {
  const settings = await getAppSettings();
  const dsn = settings["sentry.dsn"]?.trim() ?? "";
  if (!dsn) {
    return { id: "sentry", status: "missing_config", latencyMs: null };
  }
  if (!isValidDsn(dsn)) {
    return {
      id: "sentry",
      status: "down",
      latencyMs: null,
      error: "invalid_dsn",
    };
  }
  return { id: "sentry", status: "ok", latencyMs: null };
}

// ── Public API ──────────────────────────────────────────────────────────────

async function fetchHealthSnapshotUncached(): Promise<HealthSnapshot> {
  const services = await Promise.all([
    checkDatabase(),
    checkSupabase(),
    checkRedis(),
    checkResend(),
    checkCloudflare(),
    checkSentry(),
  ]);
  return { services, fetchedAt: Date.now() };
}

export const getHealthSnapshot = unstable_cache(
  fetchHealthSnapshotUncached,
  ["admin-health-snapshot-v1"],
  { tags: [HEALTH_SNAPSHOT_TAG], revalidate: 60 },
);
