// lib/admin/dependencies/github.ts
//
// Fetch dei dati GitHub utili alla dashboard:
// - lista delle PR Dependabot aperte sul nostro repo (con CI status)
// - il changelog di un pacchetto a una specifica versione (per
//   identificare BREAKING CHANGES via grep sul testo)
//
// Auth: usa lo stesso settings.github_pat che già alimenta /admin/tests
// per i CI artifacts. Se il PAT non è configurato, le PR e i changelog
// non sono disponibili — la dashboard funziona comunque ma senza i
// segnali "PR aperta" / "breaking changes".

import "server-only";
import { getAppSettings } from "@/lib/db/settings-queries";
import type { DependabotPrInfo, DependabotPrCiStatus } from "./types";

const GITHUB_API = "https://api.github.com";
const FETCH_TIMEOUT_MS = 8000;

// ── Auth ────────────────────────────────────────────────────────────────────

interface GithubCreds {
  repo: string;
  token: string;
}

/** Risolve repo + token dal medesimo store usato da /admin/tests. */
async function getGithubCreds(): Promise<GithubCreds | null> {
  const settings = await getAppSettings();
  const repo = settings.github_repo ?? process.env.GITHUB_REPO ?? null;
  const token = settings.github_pat ?? process.env.GITHUB_PAT ?? null;
  if (!repo || !token) return null;
  return { repo, token };
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function timedFetch(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Dependabot PRs ──────────────────────────────────────────────────────────

interface RawPr {
  number: number;
  title: string;
  html_url: string;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
  head: { sha: string };
}

interface RawCheckRunsResp {
  check_runs: Array<{ status: string; conclusion: string | null }>;
}

/**
 * Lista PR open create da dependabot[bot] sul repo configurato.
 * Per ognuna, fa una seconda call al check-runs API per derivare il
 * CI status complessivo. Tutto in parallelo.
 */
export async function fetchDependabotPrs(): Promise<{
  prs: DependabotPrInfo[];
  error: string | null;
}> {
  const creds = await getGithubCreds();
  if (!creds) {
    return { prs: [], error: "GitHub credentials not configured" };
  }

  // Filtro per autore. Il login canonico è "dependabot[bot]" su GitHub
  // ma per il search syntax bisogna usare "app/dependabot".
  const url =
    `${GITHUB_API}/repos/${creds.repo}/pulls?state=open&per_page=50&sort=created&direction=desc`;

  const res = await timedFetch(url, { headers: authHeaders(creds.token) });
  if (!res) return { prs: [], error: "Network timeout fetching PRs" };
  if (!res.ok) {
    return { prs: [], error: `GitHub API ${res.status} fetching PRs` };
  }

  const allPrs = (await res.json()) as RawPr[];
  const dependabot = allPrs.filter(
    (pr) => pr.user?.login === "dependabot[bot]" || pr.user?.login === "dependabot",
  );

  // Per ogni PR, fetcha il CI status del SHA del head commit (in parallelo).
  const enriched = await Promise.all(
    dependabot.map(async (pr) => {
      const ciStatus = await fetchCiStatusForSha(creds, pr.head.sha);
      const hasSecurityLabel = pr.labels.some(
        (l) => l.name.toLowerCase().includes("security"),
      );
      return {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        ciStatus,
        hasSecurityLabel,
      } satisfies DependabotPrInfo;
    }),
  );

  return { prs: enriched, error: null };
}

async function fetchCiStatusForSha(
  creds: GithubCreds,
  sha: string,
): Promise<DependabotPrCiStatus> {
  const url = `${GITHUB_API}/repos/${creds.repo}/commits/${sha}/check-runs`;
  const res = await timedFetch(url, { headers: authHeaders(creds.token) });
  if (!res || !res.ok) return null;
  const data = (await res.json()) as RawCheckRunsResp;
  if (!data.check_runs || data.check_runs.length === 0) return "pending";

  let anyFailure = false;
  let anyPending = false;
  for (const run of data.check_runs) {
    if (run.status !== "completed") {
      anyPending = true;
      continue;
    }
    if (run.conclusion === "failure" || run.conclusion === "cancelled" || run.conclusion === "timed_out") {
      anyFailure = true;
    }
  }
  if (anyFailure) return "failure";
  if (anyPending) return "pending";
  return "success";
}

/**
 * Associa una PR Dependabot a un nome di pacchetto. Dependabot mette il
 * package nel titolo: "chore(deps): bump foo from 1.0.0 to 1.0.1" o
 * "chore(deps-dev): bump bar from 2.0.0 to 2.0.1".
 *
 * Per i grouped updates il titolo è "chore(deps): bump the types group
 * with N updates" → matchPackageInPrTitle ritorna null e la PR finisce
 * nella lista "groupedDependabotPrs" del report.
 */
export function matchPackageInPrTitle(
  title: string,
  packageName: string,
): boolean {
  // Match su un boundary di parola così "next" non matcha "next-intl".
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\bbump\\s+${escaped}\\s+from\\b`, "i");
  return re.test(title);
}

/** True se il titolo ha il pattern "bump the <X> group". */
export function isGroupedDependabotPr(title: string): boolean {
  return /\bbump\s+the\s+\S+\s+group\b/i.test(title);
}

// ── Changelog scan ──────────────────────────────────────────────────────────

const BREAKING_KEYWORDS = [
  /\bBREAKING\s*CHANGES?\b/i,
  /\bBREAKING\b\s*[:\-]/,
  /\b(removed|removal of|drops? support|no longer)\b/i,
];

const CHANGELOG_PATHS = [
  "CHANGELOG.md",
  "CHANGELOG.MD",
  "CHANGELOG",
  "HISTORY.md",
  "RELEASES.md",
];

/**
 * Tenta di stabilire se la nuova versione contiene breaking changes.
 *
 * Strategia (best-effort, in ordine):
 * 1. Se conosciamo `githubRepo`, prova a leggere il CHANGELOG via raw
 *    GitHub e cerca BREAKING in un range di righe attorno a "## X.Y.Z".
 * 2. Se non c'è changelog, ritorna null (= "non lo so").
 *
 * Niente cache qui — la cachatura del report a 6h ammortizza.
 */
export async function checkForBreakingChanges(params: {
  githubRepo: string | null;
  fromVersion: string;
  toVersion: string;
}): Promise<{ hasBreakingChanges: boolean | null; changelogUrl: string | null }> {
  const { githubRepo, fromVersion, toVersion } = params;
  if (!githubRepo) return { hasBreakingChanges: null, changelogUrl: null };

  for (const branch of ["main", "master"]) {
    for (const filePath of CHANGELOG_PATHS) {
      const rawUrl = `https://raw.githubusercontent.com/${githubRepo}/${branch}/${filePath}`;
      const res = await timedFetch(rawUrl, { headers: {} });
      if (!res || !res.ok) continue;
      const text = await res.text();
      const has = scanForBreaking(text, fromVersion, toVersion);
      const changelogUrl = `https://github.com/${githubRepo}/blob/${branch}/${filePath}`;
      return { hasBreakingChanges: has, changelogUrl };
    }
  }
  // Fallback: link al releases page
  return {
    hasBreakingChanges: null,
    changelogUrl: `https://github.com/${githubRepo}/releases`,
  };
}

/**
 * Scansiona il testo del changelog cercando BREAKING nelle sezioni
 * relative alle versioni fra `from` (esclusa) e `to` (inclusa). Usa la
 * convenzione comune "## X.Y.Z" per i delimitatori di sezione.
 *
 * Falla gracefully se il formato non è quello — preferiamo "non sappiamo
 * se rompe" (ritornando false) a "spaventiamo l'utente per ogni upgrade".
 */
export function scanForBreaking(
  changelog: string,
  fromVersion: string,
  toVersion: string,
): boolean {
  // Trova tutte le posizioni delle headings di versione.
  const headingRe = /^##\s*(?:\[?v?)?(\d+\.\d+\.\d+)/gim;
  const headings: Array<{ index: number; version: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(changelog)) !== null) {
    headings.push({ index: match.index, version: match[1] });
  }
  if (headings.length === 0) return false;

  // Determina quale slice analizzare: dalla heading "to" (incluso) fino
  // alla heading "from" (esclusa, perché quella era già installata).
  const toIdx = headings.findIndex((h) => h.version === toVersion);
  if (toIdx === -1) return false; // versione "to" non documentata, skip
  const fromIdx = headings.findIndex((h) => h.version === fromVersion);

  // Slice dalla heading "to" alla "from" o, se from non c'è, fino al EOF.
  const start = headings[toIdx].index;
  const end =
    fromIdx > toIdx ? headings[fromIdx].index : changelog.length;
  if (end <= start) return false;
  const window = changelog.slice(start, end);

  return BREAKING_KEYWORDS.some((re) => re.test(window));
}
