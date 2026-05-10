/**
 * Sentry issues API client for the admin dashboard widget.
 *
 * Reads credentials from env vars (NOT app_settings DB):
 *   - SENTRY_ORG          → organization slug, also used by build plugin
 *   - SENTRY_PROJECT      → project slug, also used by build plugin
 *   - SENTRY_API_AUTH_TOKEN → User Auth Token with scopes:
 *                             - `project:read` + `event:read` (always required)
 *                             - `event:write` (optional — only needed for the
 *                                "Resolve" button in the All Errors modal)
 *                             Recommended: separate from the build token
 *                             (which is an Org token with scope `org:ci`).
 *                             Falls back to SENTRY_AUTH_TOKEN if missing.
 *
 * Cached 60s via unstable_cache + tag "admin-sentry-issues" so any
 * mutation (e.g. resolving an issue) can call revalidateTag(SENTRY_ISSUES_TAG)
 * to force a fresh fetch on the next render.
 *
 * Errors never throw: every failure mode returns a discriminated result
 * the widget can render as a card. We don't want a Sentry hiccup to
 * break the dashboard.
 */
import "server-only";
import { unstable_cache } from "next/cache";

export const SENTRY_ISSUES_TAG = "admin-sentry-issues";

export type SentryIssueSummary = {
  id: string;
  shortId: string;
  title: string;
  level: string;
  count: number;
  lastSeen: string;
  permalink: string;
};

export type SentryWidgetConfig = {
  org: string;
  project: string;
  token: string;
};

export type SentryIssuesResult =
  | { ok: true; total: number; issues: SentryIssueSummary[] }
  | {
      ok: false;
      reason: "missing_env" | "unauthorized" | "network" | "unknown";
      detail?: string;
    };

/** Returns the widget's runtime config from env vars, or null if any is missing. */
export function loadSentryWidgetConfig(): SentryWidgetConfig | null {
  const org = process.env.SENTRY_ORG?.trim();
  const project = process.env.SENTRY_PROJECT?.trim();
  const token = (
    process.env.SENTRY_API_AUTH_TOKEN ?? process.env.SENTRY_AUTH_TOKEN
  )?.trim();
  if (!org || !project || !token) return null;
  return { org, project, token };
}

type RawSentryIssue = {
  id?: unknown;
  shortId?: unknown;
  title?: unknown;
  level?: unknown;
  count?: unknown;
  lastSeen?: unknown;
  permalink?: unknown;
};

function toSummary(raw: RawSentryIssue): SentryIssueSummary | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  return {
    id,
    shortId: typeof raw.shortId === "string" ? raw.shortId : id,
    title: typeof raw.title === "string" ? raw.title : "(untitled)",
    level: typeof raw.level === "string" ? raw.level : "error",
    count: Number.isFinite(Number(raw.count)) ? Number(raw.count) : 0,
    lastSeen: typeof raw.lastSeen === "string" ? raw.lastSeen : "",
    permalink: typeof raw.permalink === "string" ? raw.permalink : "",
  };
}

async function fetchIssuesUncached(): Promise<SentryIssuesResult> {
  const cfg = loadSentryWidgetConfig();
  if (!cfg) return { ok: false, reason: "missing_env" };

  // Pull up to 100 unresolved issues from the last 24h. Sentry caps the
  // page size so 100 is the usable upper bound; we display only the
  // first 5 in the widget but use the full count for the "total" number.
  const url = `https://sentry.io/api/0/projects/${encodeURIComponent(
    cfg.org,
  )}/${encodeURIComponent(
    cfg.project,
  )}/issues/?statsPeriod=24h&query=${encodeURIComponent("is:unresolved")}&limit=100`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/json",
      },
      // The cache lives at the unstable_cache wrapper layer below; we
      // don't want fetch's own cache here because it would interact
      // weirdly with unstable_cache (double cache, stale-while-revalidate
      // overlap).
      cache: "no-store",
    });
  } catch (err) {
    console.error("[sentry/issues] network error:", err);
    return {
      ok: false,
      reason: "network",
      detail: err instanceof Error ? err.message : "fetch failed",
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "unauthorized" };
  }
  if (!response.ok) {
    console.error("[sentry/issues] unexpected status:", response.status);
    return {
      ok: false,
      reason: "unknown",
      detail: String(response.status),
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, reason: "unknown", detail: "invalid_json" };
  }
  if (!Array.isArray(data)) {
    return { ok: false, reason: "unknown", detail: "unexpected_payload" };
  }

  const all = (data as RawSentryIssue[])
    .map(toSummary)
    .filter((x): x is SentryIssueSummary => x !== null);

  // Return ALL fetched issues (capped at the API's limit of 100). The
  // widget shows the first 5 inline; the "Show all" modal renders the
  // full list. Slicing here would force a second fetch from the modal.
  return { ok: true, total: all.length, issues: all };
}

export const fetchSentryIssues24h = unstable_cache(
  fetchIssuesUncached,
  ["admin-sentry-issues-24h"],
  { tags: [SENTRY_ISSUES_TAG], revalidate: 60 },
);

// ─── Mutations ───────────────────────────────────────────────────────────
export type SentryResolveResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_env" | "scope_insufficient" | "network" | "unknown";
      detail?: string;
    };

/**
 * Marks a Sentry issue as resolved via PUT to the org-scoped issues
 * endpoint. The API requires `event:write` on the auth token; if missing
 * Sentry returns 403 and we surface it as `scope_insufficient` so the UI
 * can tell the user to update their token, not retry blindly.
 *
 * Caller should `revalidateTag(SENTRY_ISSUES_TAG)` on success so the next
 * widget render shows the issue gone.
 */
export async function markSentryIssueAsResolved(
  issueId: string,
): Promise<SentryResolveResult> {
  const cfg = loadSentryWidgetConfig();
  if (!cfg) return { ok: false, reason: "missing_env" };

  const url = `https://sentry.io/api/0/organizations/${encodeURIComponent(
    cfg.org,
  )}/issues/${encodeURIComponent(issueId)}/`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ status: "resolved" }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[sentry/issues] resolve network error:", err);
    return {
      ok: false,
      reason: "network",
      detail: err instanceof Error ? err.message : "fetch failed",
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "scope_insufficient" };
  }
  if (response.status === 404) {
    // Issue already resolved/deleted, or the id is wrong. Either way the
    // user will not see it after the next refresh — treat as success.
    return { ok: true };
  }
  if (!response.ok) {
    console.error("[sentry/issues] resolve unexpected status:", response.status);
    return {
      ok: false,
      reason: "unknown",
      detail: String(response.status),
    };
  }

  return { ok: true };
}
