"use server";
// app/(admin)/admin/tests/actions.ts
//
// Infrastructure health checks (read-only) + Vitest report reader.
// Called by the Server Component page.tsx — no client state required.
//
// Architettura del Vitest report:
//   - Il workflow CI .github/workflows/test.yml esegue vitest sul push a main
//   - Il JSON viene pusha sul branch ci-results (orphan, force-pushed)
//   - Qui leggiamo via GitHub Contents API con cache di 60s
//   - Niente fs.readFile: il file non è sotto la directory di deploy
import { requireAdminPage } from "@/lib/rbac/guards";
import { db } from "@/lib/db/drizzle";
import { getAppSettings } from "@/lib/db/settings-queries";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type HealthStatus = "ok" | "degraded" | "error" | "unknown";

export type ServiceHealth = {
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
  detail?: string;
};

export type HealthChecks = {
  supabase: ServiceHealth;
  redis: ServiceHealth;
  resend: ServiceHealth;
  google: ServiceHealth;
  cloudflare: ServiceHealth;
  checkedAt: string;
};

export type VitestTestResult = {
  name: string;
  status: "passed" | "failed" | "skipped" | "pending";
  duration?: number;
  failureMessages?: string[];
};

export type VitestSuite = {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  tests: VitestTestResult[];
};

export type VitestReport = {
  suites: VitestSuite[];
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTotalTests: number;
  startTime: number;
  success: boolean;
};

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------
async function pingSupabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { name: "Supabase", status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return { name: "Supabase", status: "error", latencyMs: Date.now() - start, detail: String(e) };
  }
}

async function pingRedis(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const settings = await getAppSettings();
    const url = settings.upstash_redis_rest_url;
    const token = settings.upstash_redis_rest_token;
    if (!url || !token) {
      return { name: "Upstash Redis", status: "unknown", latencyMs: null, detail: "Credentials not configured" };
    }
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { name: "Upstash Redis", status: "error", latencyMs, detail: `HTTP ${res.status}` };
    const body = await res.json() as { result?: string };
    const pong = body?.result === "PONG";
    return {
      name: "Upstash Redis",
      status: pong ? "ok" : "degraded",
      latencyMs,
      detail: pong ? undefined : `Unexpected response: ${JSON.stringify(body)}`,
    };
  } catch (e) {
    return { name: "Upstash Redis", status: "error", latencyMs: Date.now() - start, detail: String(e) };
  }
}

async function pingResend(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { name: "Resend", status: "unknown", latencyMs: null, detail: "RESEND_API_KEY not set" };
    }
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Date.now() - start;
    if (res.status === 200) return { name: "Resend", status: "ok", latencyMs };
    if (res.status === 401) return { name: "Resend", status: "error", latencyMs, detail: "Invalid API key" };
    return { name: "Resend", status: "degraded", latencyMs, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { name: "Resend", status: "error", latencyMs: Date.now() - start, detail: String(e) };
  }
}

async function pingGoogle(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const settings = await getAppSettings();
    const clientId = settings.google_client_id;
    const clientSecret = settings.google_client_secret;
    if (!clientId || !clientSecret) {
      return { name: "Google OAuth", status: "unknown", latencyMs: null, detail: "Credentials not configured in settings" };
    }
    // 400 = invalid token (expected — means endpoint is live and reachable)
    const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=probe", {
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Date.now() - start;
    if (res.status === 400) {
      return { name: "Google OAuth", status: "ok", latencyMs, detail: "Endpoint reachable · credentials present" };
    }
    return { name: "Google OAuth", status: "degraded", latencyMs, detail: `Unexpected HTTP ${res.status}` };
  } catch (e) {
    return { name: "Google OAuth", status: "error", latencyMs: Date.now() - start, detail: String(e) };
  }
}

async function pingCloudflare(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const settings = await getAppSettings();
    const siteKey   = settings.cf_turnstile_site_key;
    const secretKey = settings.cf_turnstile_secret_key;
    if (!siteKey || !secretKey) {
      return { name: "Cloudflare Turnstile", status: "unknown", latencyMs: null, detail: "Keys not configured" };
    }
    // POST with an invalid token — Turnstile returns 200 + error-codes.
    // If the secret itself is wrong we get error-codes: ["invalid-input-secret"].
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: "probe" }),
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { name: "Cloudflare Turnstile", status: "error", latencyMs, detail: `HTTP ${res.status}` };
    const body = await res.json() as { success: boolean; "error-codes"?: string[] };
    const errCodes = body["error-codes"] ?? [];
    if (errCodes.includes("invalid-input-secret")) {
      return { name: "Cloudflare Turnstile", status: "error", latencyMs, detail: "Invalid secret key" };
    }
    return { name: "Cloudflare Turnstile", status: "ok", latencyMs, detail: "Endpoint reachable · keys present" };
  } catch (e) {
    return { name: "Cloudflare Turnstile", status: "error", latencyMs: Date.now() - start, detail: String(e) };
  }
}

export async function getHealthChecks(): Promise<HealthChecks> {
  await requireAdminPage();
  const [supabase, redis, resend, google, cloudflare] = await Promise.all([
    pingSupabase(),
    pingRedis(),
    pingResend(),
    pingGoogle(),
    pingCloudflare(),
  ]);
  return { supabase, redis, resend, google, cloudflare, checkedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Vitest JSON reporter format
// The --reporter=json output has this shape per file entry:
//   {
//     name: "/abs/path/to/tests/foo.test.ts",   // absolute runner path
//     status: "passed" | "failed",
//     startTime: number,
//     endTime: number,
//     assertionResults: [                        // individual tests
//       { fullName, status, duration, failureMessages, ... }
//     ]
//   }
// ---------------------------------------------------------------------------

type RawAssertion = {
  fullName?: string;
  title?: string;
  status: string;
  duration?: number;
  failureMessages?: string[];
};

type RawFileResult = {
  name: string;
  status: string;
  startTime?: number;
  endTime?: number;
  assertionResults: RawAssertion[];
};

type RawReport = {
  success: boolean;
  startTime: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: RawFileResult[];
};

/**
 * Fetcha il report da GitHub Contents API leggendo il branch ci-results.
 * Cache di 60s via Next.js fetch cache: la dashboard è sempre fresca entro
 * 1 minuto dall'ultimo push del CI senza martellare l'API.
 *
 * Ritorna null se le credenziali non sono configurate, se l'API risponde
 * un errore, o se il file non esiste ancora (primo run del CI non avvenuto).
 */
async function fetchVitestReportFromGitHub(): Promise<RawReport | null> {
  const settings = await getAppSettings();
  const repo   = settings.github_repo   ?? process.env.GITHUB_REPO ?? null;
  const token  = settings.github_pat    ?? process.env.GITHUB_PAT ?? null;
  const branch = settings.github_ci_branch ?? "ci-results";

  if (!repo || !token) return null;

  const url = `https://api.github.com/repos/${repo}/contents/vitest-results.json?ref=${branch}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      // 404 = branch o file non esistono ancora (primo run pendente)
      // 401/403 = token non valido o senza permessi
      // 5xx = problemi GitHub
      console.warn(`[admin/tests] GitHub Contents API ${res.status} for ${repo}@${branch}`);
      return null;
    }

    return (await res.json()) as RawReport;
  } catch (err) {
    console.error("[admin/tests] fetchVitestReportFromGitHub failed:", err);
    return null;
  }
}

export async function getVitestReport(): Promise<VitestReport | null> {
  await requireAdminPage();

  const json = await fetchVitestReportFromGitHub();
  if (!json) return null;

  const suites: VitestSuite[] = (json.testResults ?? []).map((file) => {
    // Il path nel JSON è quello del runner CI (es. /home/runner/work/librolo/librolo/tests/...).
    // Strippiamo fino a /tests/ per avere "tests/lib/auth.test.ts" leggibile.
    let name = file.name ?? "unknown";
    const testsIdx = name.indexOf("/tests/");
    if (testsIdx !== -1) name = name.slice(testsIdx + 1);

    const duration =
      file.startTime != null && file.endTime != null
        ? file.endTime - file.startTime
        : 0;

    const tests: VitestTestResult[] = (file.assertionResults ?? []).map((t) => ({
      name: t.fullName ?? t.title ?? "(unnamed)",
      status: t.status as VitestTestResult["status"],
      duration: t.duration,
      failureMessages: t.failureMessages,
    }));

    return {
      name,
      status: file.status as VitestSuite["status"],
      duration,
      tests,
    };
  });

  return {
    suites,
    numPassedTests:  json.numPassedTests  ?? 0,
    numFailedTests:  json.numFailedTests  ?? 0,
    numPendingTests: json.numPendingTests ?? 0,
    numTotalTests:   json.numTotalTests   ?? 0,
    startTime:       json.startTime       ?? 0,
    success:         json.success         ?? false,
  };
}
