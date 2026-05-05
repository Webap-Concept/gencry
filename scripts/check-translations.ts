/**
 * scripts/check-translations.ts
 *
 * Confronta i namespace messages tra il default locale (sorgente di
 * verità — generalmente quello in cui si scrivono per primi i testi)
 * e gli altri locale supportati. Fallisce se uno qualsiasi degli
 * altri locale ha chiavi mancanti rispetto al default.
 *
 * Eseguito da `pnpm test:translations` e dal CI di vitest (vedi
 * tests/i18n/translations.test.ts), così ogni PR che aggiunge una
 * stringa nel default deve aggiungerla anche negli altri locale o
 * il check fallisce.
 *
 * Esempio output:
 *   ✗ admin: "settings-foo" missing in en
 *   ✗ public.landing.lede missing in en
 *
 * NON ricontrolla l'inverso (chiavi presenti in altri locale ma non
 * nel default): potrebbe essere intenzionale (es. variazioni del
 * locale ricche) e comunque non rompe l'UX.
 */

import { LOCALES, DEFAULT_LOCALE } from "../lib/i18n/config";
import fs from "node:fs";
import path from "node:path";

const NAMESPACES = ["core", "auth", "public", "admin"] as const;
type Namespace = (typeof NAMESPACES)[number];

type JsonObject = { [key: string]: JsonValue };
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

function loadJson(locale: string, ns: Namespace): JsonObject {
  const filepath = path.resolve(
    process.cwd(),
    "messages",
    locale,
    `${ns}.json`,
  );
  if (!fs.existsSync(filepath)) {
    throw new Error(`Missing messages file: ${filepath}`);
  }
  const raw = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(raw) as JsonObject;
}

function isPlainObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Estrae tutte le chiavi dotted da un oggetto annidato.
 * Esempio: { a: { b: "x", c: "y" } } → ["a.b", "a.c"]
 */
function flattenKeys(obj: JsonObject, prefix = ""): string[] {
  const keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (isPlainObject(v)) {
      keys.push(...flattenKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

export type TranslationDiff = {
  namespace: Namespace;
  locale: string;
  /** Chiavi presenti nel default ma assenti in `locale`. */
  missing: string[];
};

/**
 * Confronta tutti i locale rispetto al default. Ritorna i diff
 * (namespace × locale) con almeno una chiave mancante.
 */
export function findTranslationGaps(): TranslationDiff[] {
  const diffs: TranslationDiff[] = [];

  for (const ns of NAMESPACES) {
    const defaultKeys = new Set(flattenKeys(loadJson(DEFAULT_LOCALE, ns)));

    for (const locale of LOCALES) {
      if (locale === DEFAULT_LOCALE) continue;
      const otherKeys = new Set(flattenKeys(loadJson(locale, ns)));

      const missing: string[] = [];
      for (const k of defaultKeys) {
        if (!otherKeys.has(k)) missing.push(k);
      }

      if (missing.length > 0) {
        diffs.push({ namespace: ns, locale, missing });
      }
    }
  }

  return diffs;
}

/**
 * CLI entry point. Stampa i diff trovati ed esce con codice 1 se ne
 * trova; altrimenti stampa "OK" ed esce con 0.
 */
function main() {
  const diffs = findTranslationGaps();

  if (diffs.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `OK — all locales (${LOCALES.filter((l) => l !== DEFAULT_LOCALE).join(", ")}) match the "${DEFAULT_LOCALE}" default across ${NAMESPACES.length} namespaces`,
    );
    process.exit(0);
  }

  // eslint-disable-next-line no-console
  console.error("Translation gaps detected:\n");
  for (const diff of diffs) {
    // eslint-disable-next-line no-console
    console.error(
      `  [${diff.namespace}] ${diff.locale} is missing ${diff.missing.length} key(s):`,
    );
    for (const key of diff.missing) {
      // eslint-disable-next-line no-console
      console.error(`    - ${key}`);
    }
  }
  // eslint-disable-next-line no-console
  console.error(
    `\nFix: add the missing keys to messages/<locale>/<namespace>.json or remove them from messages/${DEFAULT_LOCALE}.`,
  );
  process.exit(1);
}

// Esecuzione diretta (CLI)
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-translations.ts")
) {
  main();
}
