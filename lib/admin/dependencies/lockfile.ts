// lib/admin/dependencies/lockfile.ts
//
// Reader minimo del file pnpm-lock.yaml (v9). Ci serve solo per
// risolvere "specifier" → versione esatta installata. Niente parser YAML
// completo per non aggiungere dipendenze: il lockfile pnpm v9 ha una
// struttura riga-per-riga molto regolare, basta una grammatica ad-hoc.
//
// Formato atteso (sezione importers):
//
//   importers:
//     .:
//       dependencies:
//         '@dnd-kit/core':
//           specifier: ^6.3.1
//           version: 6.3.1(react-dom@...)(react@...)
//       devDependencies:
//         vitest:
//           specifier: ^3.1.3
//           version: 3.1.3(...)
//
// Per ogni "version: X.Y.Z[(...)][...]" estraiamo X.Y.Z prima della
// prima parentesi.

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface LockfileEntry {
  name: string;
  installed: string;
  isDev: boolean;
}

const VERSION_LINE = /^\s+version:\s+(\S+)/;
const NAME_LINE = /^\s{6}'?([^'\s]+)'?:\s*$/;

/**
 * Estrae le versioni installate per la root del workspace dal lockfile
 * pnpm v9. Restituisce solo entry il cui name corrisponde a una chiave
 * di `dependencies` o `devDependencies` in package.json — il lockfile
 * contiene anche transitive deps che non ci interessano.
 */
export async function readInstalledVersions(
  packageJsonDeps: Record<string, string>,
  packageJsonDevDeps: Record<string, string>,
): Promise<LockfileEntry[]> {
  const lockPath = path.join(process.cwd(), "pnpm-lock.yaml");

  let content: string;
  try {
    content = await fs.readFile(lockPath, "utf8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const out: LockfileEntry[] = [];

  let section: "deps" | "devDeps" | null = null;
  let inRootImporter = false;
  let currentName: string | null = null;

  for (const line of lines) {
    if (line.startsWith("importers:")) {
      inRootImporter = false;
      continue;
    }
    // La sezione root è indentata di 2 spazi; sotto-importer di workspace
    // sarebbero prefissati con altri path. Noi usiamo solo "  .:".
    if (line.match(/^\s{2}\.:\s*$/)) {
      inRootImporter = true;
      continue;
    }
    // Una nuova top-level key (no indentazione) chiude il blocco importers.
    if (inRootImporter && line.length > 0 && !line.startsWith(" ")) {
      inRootImporter = false;
      section = null;
    }
    if (!inRootImporter) continue;

    if (line.match(/^\s{4}dependencies:\s*$/)) {
      section = "deps";
      currentName = null;
      continue;
    }
    if (line.match(/^\s{4}devDependencies:\s*$/)) {
      section = "devDeps";
      currentName = null;
      continue;
    }
    // Cambio di sezione (un altro key a 4 spazi tipo "specifiers" o
    // "optionalDependencies") chiude la sezione corrente.
    if (line.match(/^\s{4}\S/) && !line.match(/^\s{4}(dev)?[Dd]ependencies:/)) {
      section = null;
      currentName = null;
      continue;
    }
    if (!section) continue;

    const nameMatch = NAME_LINE.exec(line);
    if (nameMatch) {
      currentName = nameMatch[1];
      continue;
    }

    const versionMatch = VERSION_LINE.exec(line);
    if (versionMatch && currentName) {
      const raw = versionMatch[1];
      // Strip dei "(transitive)(...)"
      const installed = raw.split("(")[0];
      const isDev = section === "devDeps";

      // Filtra: solo se compare in package.json
      const declared =
        (isDev ? packageJsonDevDeps : packageJsonDeps)[currentName];
      if (declared !== undefined) {
        out.push({ name: currentName, installed, isDev });
      }
      currentName = null;
    }
  }

  return out;
}
