// lib/admin/dependencies/usage.ts
//
// Conta quanti file del repo importano ciascuna dipendenza. Serve a dare
// un proxy del "blast radius" di un upgrade: aggiornare `next` (~200 file
// di importazioni) richiede attenzione diversa da `posthog-js` (3 file).
//
// Implementazione: scansiamo ricorsivamente i file source rilevanti
// (.ts/.tsx/.js/.jsx/.mjs) sotto le cartelle del progetto e contiamo
// gli `import ... from "<dep>"` o `from "<dep>/sub-path"`. Saltiamo
// node_modules, .next, dist, build per ovvie ragioni di performance.
//
// Cost: scansione completa fa ~2-3k file. Su una macchina moderna è
// meno di 1s; in più la cachiamo dentro al report 6h.

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

const SCAN_ROOTS = [
  "app",
  "components",
  "lib",
  "scripts",
  "messages", // anche se non importa nulla, è veloce e non rompe nulla
];

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".vercel",
  "dist",
  "build",
  "out",
  ".git",
  "drizzle",
]);

/**
 * Costruisce una mappa name → count scansionando il repo una sola volta.
 * Dato che vogliamo i conteggi per N nomi insieme, è molto più
 * efficiente fare 1 read per file e N regex test in memoria che N read
 * full-tree per ciascun nome.
 */
export async function scanUsageCounts(
  packageNames: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const n of packageNames) counts.set(n, 0);
  if (packageNames.length === 0) return counts;

  // Pre-compila i pattern: matchiamo `from "name"`, `from 'name'`,
  // `require("name")` e anche subpaths `from "name/something"`.
  // Usiamo un singolo Set per O(1) lookup invece di N regex per file.
  const namesSet = new Set(packageNames);

  for (const root of SCAN_ROOTS) {
    const absRoot = path.join(process.cwd(), root);
    try {
      await scanDir(absRoot, namesSet, counts);
    } catch {
      // root inesistente (es. messages se sono in DB) — ignora
    }
  }

  return counts;
}

async function scanDir(
  dir: string,
  names: Set<string>,
  counts: Map<string, number>,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await scanDir(path.join(dir, entry.name), names, counts);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    if (!EXTENSIONS.has(ext)) continue;
    await scanFile(path.join(dir, entry.name), names, counts);
  }
}

// Tre forme di import che ci interessano:
//   import x from "name";       → matcha "from"
//   const x = require("name");  → matcha "require("
//   import "name";              → side-effect import, NIENTE "from"
//                                  (es. `import "server-only";`)
// Senza il terzo pattern le dep usate solo per side-effect risultano
// "0 file la usano" — falso negativo. Ancoriamo `import` a inizio riga
// (multiline) per non matchare la parola "import" dentro stringhe/commenti.
const IMPORT_RE =
  /(?:from|require\()\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

async function scanFile(
  file: string,
  names: Set<string>,
  counts: Map<string, number>,
): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(file, "utf8");
  } catch {
    return;
  }

  // Conserva il fatto che un file può importare la stessa dep più volte
  // ma noi vogliamo "1 file lo usa", non "5 import". Usiamo un set per file.
  const seenInThisFile = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    // Capture 1 = ramo "from"/"require(", capture 2 = ramo side-effect.
    // Solo uno dei due è valorizzato per match.
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    // Skip relative + alias TS path che cominciano con @/
    if (spec.startsWith(".") || spec.startsWith("@/")) continue;
    // Risolvi il package name: per scoped (@scope/name/sub) prendi i
    // primi 2 segmenti, altrimenti il primo.
    const name = spec.startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0];

    if (!names.has(name) || seenInThisFile.has(name)) continue;
    seenInThisFile.add(name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
}
