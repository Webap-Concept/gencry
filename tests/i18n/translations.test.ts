// tests/i18n/translations.test.ts
//
// Lint a CI: ogni locale (≠ DEFAULT_LOCALE) deve avere TUTTE le chiavi
// presenti nel default. Se aggiungi una chiave in messages/it/<ns>.json
// e dimentichi messages/en/<ns>.json (o viceversa), questo test fallisce
// e il merge è bloccato.
//
// Usa la stessa logica di scripts/check-translations.ts (la riusa).

import { describe, expect, it } from "vitest";
import { findTranslationGaps } from "../../scripts/check-translations";

describe("i18n — translation key parity", () => {
  it("every locale has all the keys present in the default locale", () => {
    const diffs = findTranslationGaps();

    if (diffs.length > 0) {
      const lines = diffs.flatMap((d) => [
        `[${d.namespace}] ${d.locale} missing ${d.missing.length} key(s):`,
        ...d.missing.map((k) => `  - ${k}`),
      ]);
      throw new Error(
        `Translation gaps detected:\n${lines.join("\n")}\n\nFix: align messages/<locale>/<namespace>.json to the default.`,
      );
    }

    expect(diffs).toEqual([]);
  });
});
