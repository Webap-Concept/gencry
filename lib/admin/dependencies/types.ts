// lib/admin/dependencies/types.ts
//
// Tipi pubblici della dashboard /admin/services/dependencies. Tenuti
// separati dalla logica di fetch così l'UI può importarli senza
// trascinarsi dietro server-only code.

/** Tipo di bump semver fra versione installata e ultima disponibile. */
export type SemverBump =
  | "current" // installato == latest
  | "patch"   // x.y.Z
  | "minor"   // x.Y.z
  | "major"   // X.y.z
  | "prerelease" // installato è una pre-release (es. -beta)
  | "unknown"; // versione non parsabile o latest non disponibile

/**
 * Livello di rischio aggregato. Calcolato dalla composizione di:
 * - bump type (major > minor > patch)
 * - flag breaking changes nel changelog
 * - presenza di Dependabot PR + CI status
 * - vulnerabilità note (security advisory)
 */
export type RiskLevel =
  | "current"     // niente da fare
  | "low"         // patch o minor con CI verde
  | "medium"      // minor senza CI / minor con breaking flag
  | "high"        // major con breaking
  | "vulnerable"; // CVE attiva, da aggiornare comunque

/** Stato CI di una PR Dependabot collegata a questa dipendenza. */
export type DependabotPrCiStatus = "success" | "failure" | "pending" | null;

export interface DependabotPrInfo {
  number: number;
  title: string;
  url: string;
  ciStatus: DependabotPrCiStatus;
  hasSecurityLabel: boolean;
}

export interface DependencyInfo {
  name: string;
  /** Range dichiarato in package.json (es. "^16.2.2"). */
  declared: string;
  /** Versione effettivamente installata, risolta dal lockfile. */
  installed: string;
  /** Ultima versione stabile su npm (null se fetch fallito). */
  latest: string | null;
  bump: SemverBump;
  risk: RiskLevel;
  isDev: boolean;
  homepage: string | null;
  description: string | null;
  /** URL al changelog (CHANGELOG.md su GitHub o release page). */
  changelogUrl: string | null;
  /**
   * True se il fetch del changelog ha trovato keyword come BREAKING CHANGE,
   * "removed", ecc. False se fetch riuscito ma niente trovato. Null se
   * non siamo riusciti a recuperare il changelog (repo non github o 404).
   */
  hasBreakingChanges: boolean | null;
  /** Numero di file nel repo che importano questa dipendenza. */
  usageCount: number;
  /** PR Dependabot aperta per questa dep, se esiste. */
  dependabotPr: DependabotPrInfo | null;
  /** Errore non recuperato durante il fetch (timeout npm, repo privato, …). */
  error: string | null;
}

export interface DependencyReport {
  /** Quando è stato calcolato (ISO string). */
  generatedAt: string;
  /** Tutte le `dependencies` di package.json. */
  production: DependencyInfo[];
  /** Tutte le `devDependencies`. */
  development: DependencyInfo[];
  /**
   * PR Dependabot trovate ma non associate a nessuna dep specifica
   * (es. grouped PR "lint" che copre 5 pkg insieme — la mostriamo
   * separatamente per non duplicarla 5 volte).
   */
  groupedDependabotPrs: DependabotPrInfo[];
  /** Errori a livello di report (npm registry down, GitHub API timeout). */
  globalErrors: string[];
}
