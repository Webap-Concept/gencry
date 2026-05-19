#!/usr/bin/env tsx
/**
 * scripts/generate-templates.ts
 *
 * Scansiona app/(cms)/_templates/Template*.tsx e genera
 * app/(cms)/_templates/index.generated.ts con:
 *   - import statici (richiesti da Turbopack/webpack)
 *   - mappa slug -> componente derivata dal nome file
 *
 * Conversione nome file -> slug:
 *   TemplateArticolo    -> articolo
 *   TemplateBlogPost    -> blog-post
 *   TemplateDefault     -> ESCLUSO (è il fallback hardcoded)
 *
 * Eseguito automaticamente da prebuild e predev.
 */

import { readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "../app/(cms)/_templates");
const OUTPUT_FILE = join(TEMPLATES_DIR, "index.generated.ts");

/**
 * TemplateArticoloBlog -> articolo-blog
 * Rimuove il prefisso "Template", poi converte CamelCase in kebab-case.
 */
function componentNameToSlug(name: string): string {
  return name
    .replace(/^Template/, "")
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
}

const EXCLUDED = ["TemplateDefault.tsx"];

const files = readdirSync(TEMPLATES_DIR)
  .filter(
    (f) =>
      f.startsWith("Template") &&
      f.endsWith(".tsx") &&
      !EXCLUDED.includes(f)
  )
  .sort();

const componentNames = files.map((f) => f.replace(".tsx", ""));

const importLines = componentNames
  .map((name) => `import { ${name} } from "./${name}";`)
  .join("\n");

const mapEntries = componentNames
  .map((name) => {
    const slug = componentNameToSlug(name);
    return `  "${slug}": ${name},`;
  })
  .join("\n");

const output = `// AUTO-GENERATO da scripts/generate-templates.ts
// NON modificare manualmente — viene sovrascritto a ogni build/dev.
// Per aggiungere un template: crea Template{Nome}.tsx in questa cartella.

import type { ComponentType } from "react";
import type { TemplateProps } from "./types";

${importLines}

export const GENERATED_TEMPLATE_MAP: Record<string, ComponentType<TemplateProps>> = {
${mapEntries}
};
`;

writeFileSync(OUTPUT_FILE, output, "utf-8");
console.log(
  `[generate-templates] ${files.length} template trovati:\n` +
    componentNames
      .map((n) => `  ${n} -> slug: "${componentNameToSlug(n)}"`)
      .join("\n")
);
