// lib/admin/dependencies/registry.ts
//
// Orchestratore della dashboard /admin/services/dependencies.
// Costruisce il `DependencyReport` mettendo insieme:
//   1. lista dipendenze da package.json (prod + dev)
//   2. versioni installate da pnpm-lock.yaml
//   3. metadata + ultima versione da npm registry
//   4. PR Dependabot del nostro repo + CI status
//   5. flag breaking changes dal CHANGELOG (best-effort)
//   6. usage count dal repo (file che importano la dep)
//
// Cache module-level 6h: ~80 dependency × (1 npm fetch + 1 changelog
// fetch) = ~160 round-trip rete. Una volta cachato, l'admin può
// ricaricare la pagina N volte gratis. Il bottone "Refresh" forza il
// ricalcolo.

import "server-only";

import packageJson from "@/package.json" with { type: "json" };
import {
  checkForBreakingChanges,
  fetchDependabotPrs,
  isGroupedDependabotPr,
  matchPackageInPrTitle,
} from "./github";
import { readInstalledVersions } from "./lockfile";
import { fetchNpmPackage } from "./npm";
import { diffBump, extractVersionFromRange } from "./semver";
import type {
  DependabotPrInfo,
  DependencyInfo,
  DependencyReport,
  RiskLevel,
  SemverBump,
} from "./types";
import { scanUsageCounts } from "./usage";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
let _cache: DependencyReport | null = null;
let _cacheAt = 0;

export function invalidateDependencyCache(): void {
  _cache = null;
  _cacheAt = 0;
}

/** Limita la concorrenza dei fetch npm — 80 chiamate parallele sono
 *  troppe per Vercel serverless (rischio di port exhaustion + rate
 *  limit). 12 in flight è abbondante e resta prudente. */
const FETCH_CONCURRENCY = 12;

async function pMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Aggrega bump + breaking + Dependabot CI + security in un livello sintetico. */
function computeRisk(input: {
  bump: SemverBump;
  hasBreakingChanges: boolean | null;
  dependabotPr: DependabotPrInfo | null;
}): RiskLevel {
  const { bump, hasBreakingChanges, dependabotPr } = input;

  if (dependabotPr?.hasSecurityLabel) return "vulnerable";
  if (bump === "current" || bump === "prerelease") return "current";
  if (bump === "unknown") return "low";

  if (bump === "major") {
    return hasBreakingChanges === false ? "high" : "high";
  }
  if (bump === "minor") {
    if (hasBreakingChanges) return "medium";
    if (dependabotPr?.ciStatus === "failure") return "medium";
    return "low";
  }
  // patch
  if (dependabotPr?.ciStatus === "failure") return "medium";
  return "low";
}

/** Trova la PR Dependabot specifica per un package (esclusa quella grouped). */
function pickDependabotPrForPackage(
  packageName: string,
  prs: DependabotPrInfo[],
): DependabotPrInfo | null {
  for (const pr of prs) {
    if (isGroupedDependabotPr(pr.title)) continue;
    if (matchPackageInPrTitle(pr.title, packageName)) return pr;
  }
  return null;
}

/** Costruisce un'unica DependencyInfo aggregando le sorgenti. */
async function buildDependencyInfo(params: {
  name: string;
  declared: string;
  installed: string;
  isDev: boolean;
  usageCount: number;
  dependabotPrs: DependabotPrInfo[];
}): Promise<DependencyInfo> {
  const { name, declared, installed, isDev, usageCount, dependabotPrs } = params;

  const npm = await fetchNpmPackage(name);
  const latest = npm?.latest ?? null;
  const bump = diffBump(installed, latest);

  let hasBreakingChanges: boolean | null = null;
  let changelogUrl: string | null = null;
  // Skip del fetch changelog quando non serve: se siamo current o se non
  // sappiamo neanche risolvere il bump non c'è motivo di scaricare il file.
  if (npm && latest && (bump === "minor" || bump === "major")) {
    const cl = await checkForBreakingChanges({
      githubRepo: npm.githubRepo,
      fromVersion: installed,
      toVersion: latest,
    });
    hasBreakingChanges = cl.hasBreakingChanges;
    changelogUrl = cl.changelogUrl;
  } else if (npm?.githubRepo) {
    changelogUrl = `https://github.com/${npm.githubRepo}/releases`;
  }

  const dependabotPr = pickDependabotPrForPackage(name, dependabotPrs);
  const risk = computeRisk({ bump, hasBreakingChanges, dependabotPr });

  return {
    name,
    declared,
    installed,
    latest,
    bump,
    risk,
    isDev,
    homepage: npm?.homepage ?? null,
    description: npm?.description ?? null,
    changelogUrl,
    hasBreakingChanges,
    usageCount,
    dependabotPr,
    error: npm ? null : "Failed to fetch npm metadata",
  };
}

/** Versione installata da preferire: lockfile > range estratto > range raw. */
function resolveInstalledVersion(
  declared: string,
  fromLock: string | undefined,
): string {
  if (fromLock) return fromLock;
  return extractVersionFromRange(declared) ?? declared;
}

/** Build dell'intero report. Non rilancia mai — gli errori finiscono in
 *  `globalErrors` o nei singoli `dependency.error`. */
async function buildReport(): Promise<DependencyReport> {
  const globalErrors: string[] = [];

  const deps: Record<string, string> =
    (packageJson as { dependencies?: Record<string, string> }).dependencies ?? {};
  const devDeps: Record<string, string> =
    (packageJson as { devDependencies?: Record<string, string> }).devDependencies ?? {};

  const allNames = [...Object.keys(deps), ...Object.keys(devDeps)];

  // Step 1: parallelo lockfile + dependabot prs + usage scan.
  // Sono indipendenti fra loro, condividono solo il filesystem locale.
  const [lockEntries, dependabotResp, usageMap] = await Promise.all([
    readInstalledVersions(deps, devDeps),
    fetchDependabotPrs(),
    scanUsageCounts(allNames),
  ]);

  if (dependabotResp.error) globalErrors.push(`Dependabot: ${dependabotResp.error}`);

  const installedByName = new Map(
    lockEntries.map((e) => [e.name, e.installed]),
  );

  // Step 2: per ogni dep, fetch npm + changelog (concurrency-limited).
  async function buildList(
    source: Record<string, string>,
    isDev: boolean,
  ): Promise<DependencyInfo[]> {
    const names = Object.keys(source);
    return pMap(names, FETCH_CONCURRENCY, (name) =>
      buildDependencyInfo({
        name,
        declared: source[name],
        installed: resolveInstalledVersion(source[name], installedByName.get(name)),
        isDev,
        usageCount: usageMap.get(name) ?? 0,
        dependabotPrs: dependabotResp.prs,
      }),
    );
  }

  const [production, development] = await Promise.all([
    buildList(deps, false),
    buildList(devDeps, true),
  ]);

  // Sort: rischio high prima, poi installed (alfabetico) come tiebreak.
  const RISK_ORDER: Record<RiskLevel, number> = {
    vulnerable: 0,
    high: 1,
    medium: 2,
    low: 3,
    current: 4,
  };
  const sorter = (a: DependencyInfo, b: DependencyInfo) => {
    const r = RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
    if (r !== 0) return r;
    return a.name.localeCompare(b.name);
  };
  production.sort(sorter);
  development.sort(sorter);

  // Step 3: PR Dependabot grouped (non associate a nessun pkg).
  const pkgPrs = new Set([
    ...production.map((d) => d.dependabotPr?.number),
    ...development.map((d) => d.dependabotPr?.number),
  ]);
  const groupedDependabotPrs = dependabotResp.prs.filter(
    (pr) => isGroupedDependabotPr(pr.title) || !pkgPrs.has(pr.number),
  );

  return {
    generatedAt: new Date().toISOString(),
    production,
    development,
    groupedDependabotPrs,
    globalErrors,
  };
}

/** Lettura cached del report. Dopo TTL ricalcola in foreground. */
export async function getDependencyReport(): Promise<DependencyReport> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) return _cache;
  const report = await buildReport();
  _cache = report;
  _cacheAt = Date.now();
  return report;
}
