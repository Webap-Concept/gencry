// lib/admin/dependencies/semver.ts
//
// Semver helpers minimi per non importare un'intera dipendenza esterna
// solo per parsare "16.2.2". Gestiamo il subset semver che troviamo
// nelle versioni npm: x.y.z[-prerelease][+build]. Per range complessi
// (caret, tilde) non parsiamo, leggiamo solo la versione esatta dal
// lockfile.

import type { SemverBump } from "./types";

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(input: string): ParsedVersion | null {
  const m = VERSION_REGEX.exec(input.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

/**
 * Confronta due versioni semver. Ritorna il tipo di bump per andare DA
 * `from` A `to`. Se from === to → "current". Se from > to (downgrade)
 * → "current" (assumiamo che `to` sia "latest" e quindi non c'è
 * upgrade da fare).
 */
export function diffBump(from: string, to: string | null): SemverBump {
  if (!to) return "unknown";
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (!a || !b) return "unknown";
  if (a.prerelease) return "prerelease";

  if (a.major === b.major && a.minor === b.minor && a.patch === b.patch) {
    return "current";
  }
  // Downgrade o pari: trattiamo come "current" (non c'è upgrade).
  if (
    a.major > b.major ||
    (a.major === b.major && a.minor > b.minor) ||
    (a.major === b.major && a.minor === b.minor && a.patch > b.patch)
  ) {
    return "current";
  }
  if (a.major !== b.major) return "major";
  if (a.minor !== b.minor) return "minor";
  return "patch";
}

/**
 * Estrae la versione esatta da un range npm (`^16.2.2`, `~1.5`, `>=2`).
 * Per range complessi che non portano a un singolo numero ritorna null;
 * la versione installata vera viene poi presa dal lockfile, questa è
 * solo per visualizzazione del "declared".
 */
export function extractVersionFromRange(range: string): string | null {
  // Strip caret/tilde/comparator e prendi il primo segmento numerico.
  const stripped = range
    .trim()
    .replace(/^[\^~>=<\s]+/, "")
    .split(/\s+/)[0];
  return parseVersion(stripped) ? stripped : null;
}
