// tests/app/template.test.ts
// Unit test per la logica Template:
// - slugify (trasformazione nome → slug)
// - rules JSON parsing/serializzazione (allowedChildTemplateIds)
// - fields JSON parsing
// - validazione campi obbligatori (name, slug)
// NON richiede DB — 100% unit, gira in CI.

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// slugify — replica della funzione usata in actions.ts
// (testata isolatamente senza importare il modulo Next.js)
// ---------------------------------------------------------------------------
const slugify = (str: string): string =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

describe("Template — slugify", () => {
  it("converte spazi in trattini", () => {
    expect(slugify("Chi Siamo")).toBe("chi-siamo");
  });

  it("lowercasifica tutto", () => {
    expect(slugify("HOMEPAGE")).toBe("homepage");
  });

  it("rimuove caratteri speciali", () => {
    expect(slugify("Blog & News!")).toBe("blog-news");
  });

  it("collassa spazi multipli in un singolo trattino", () => {
    expect(slugify("  chi   siamo  ")).toBe("chi-siamo");
  });

  it("rimuove trattini iniziali e finali", () => {
    expect(slugify("-test-")).toBe("test");
  });

  it("gestisce stringa già valida senza modifiche", () => {
    expect(slugify("blog-post-1")).toBe("blog-post-1");
  });

  it("gestisce stringa vuota", () => {
    expect(slugify("")).toBe("");
  });

  it("gestisce caratteri accentati italiani", () => {
    // àèìòù vengono rimossi dallo slug (non sono word chars)
    expect(slugify("città")).toBe("citt");
  });

  it("underscore vengono convertiti in trattino", () => {
    expect(slugify("my_template_name")).toBe("my-template-name");
  });
});

// ---------------------------------------------------------------------------
// allowedChildTemplateIds JSON parsing
// ---------------------------------------------------------------------------
const parseAllowedChildIds = (json: string | null): number[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.map(Number).filter(Boolean);
    return [];
  } catch {
    return [];
  }
};

describe("Template — allowedChildTemplateIds parsing", () => {
  it("null → array vuoto", () => {
    expect(parseAllowedChildIds(null)).toEqual([]);
  });

  it("stringa vuota → array vuoto", () => {
    expect(parseAllowedChildIds("")).toEqual([]);
  });

  it("array numerico valido", () => {
    expect(parseAllowedChildIds("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("filtra gli zero (falsy)", () => {
    expect(parseAllowedChildIds("[0,1,2]")).toEqual([1, 2]);
  });

  it("converte stringhe numeriche in numeri", () => {
    expect(parseAllowedChildIds('["1","2"]')).toEqual([1, 2]);
  });

  it("JSON non valido → array vuoto", () => {
    expect(parseAllowedChildIds("{ bad }")).toEqual([]);
  });

  it("JSON non array (oggetto) → array vuoto", () => {
    expect(parseAllowedChildIds('{"id":1}')).toEqual([]);
  });

  it("array misto con NaN viene filtrato", () => {
    expect(parseAllowedChildIds('[1,null,"abc",3]')).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// rules costruzione e serializzazione
// ---------------------------------------------------------------------------
type TemplateRules = {
  allowedChildTemplateIds: number[];
};

const buildRules = (overrides: Partial<TemplateRules> = {}): TemplateRules => ({
  allowedChildTemplateIds: [],
  ...overrides,
});

describe("Template — rules", () => {
  it("valori default corretti", () => {
    const cfg = buildRules();
    expect(cfg.allowedChildTemplateIds).toEqual([]);
  });

  it("override allowedChildTemplateIds", () => {
    const cfg = buildRules({ allowedChildTemplateIds: [1, 2] });
    expect(cfg.allowedChildTemplateIds).toEqual([1, 2]);
  });

  it("serializza correttamente in JSON", () => {
    const cfg = buildRules({ allowedChildTemplateIds: [3] });
    const parsed = JSON.parse(JSON.stringify(cfg)) as TemplateRules;
    expect(parsed.allowedChildTemplateIds).toEqual([3]);
  });

  it("JSON.stringify → JSON.parse è idempotente", () => {
    const cfg = buildRules({ allowedChildTemplateIds: [1, 2, 3] });
    const roundTrip = JSON.parse(JSON.stringify(cfg)) as TemplateRules;
    expect(roundTrip).toEqual(cfg);
  });
});

// ---------------------------------------------------------------------------
// fieldsJson parsing
// ---------------------------------------------------------------------------
type TemplateField = {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  sortOrder?: number;
};

const parseFieldsJson = (json: string | null): TemplateField[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

describe("Template — fieldsJson parsing", () => {
  it("null → array vuoto", () => {
    expect(parseFieldsJson(null)).toEqual([]);
  });

  it("JSON non valido → array vuoto", () => {
    expect(parseFieldsJson("{ bad json }")).toEqual([]);
  });

  it("array vuoto → array vuoto", () => {
    expect(parseFieldsJson("[]")).toEqual([]);
  });

  it("un campo valido viene parsato", () => {
    const fields: TemplateField[] = [
      { name: "hero_title", label: "Titolo Hero", type: "text", required: true },
    ];
    const result = parseFieldsJson(JSON.stringify(fields));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("hero_title");
    expect(result[0].type).toBe("text");
  });

  it("più campi vengono parsati tutti", () => {
    const fields: TemplateField[] = [
      { name: "title", label: "Titolo", type: "text" },
      { name: "body", label: "Corpo", type: "richtext" },
      { name: "cover", label: "Immagine", type: "image" },
    ];
    expect(parseFieldsJson(JSON.stringify(fields))).toHaveLength(3);
  });

  it("JSON oggetto (non array) → array vuoto", () => {
    expect(parseFieldsJson('{"name":"test"}')).toEqual([]);
  });

  it("sortOrder viene preservato", () => {
    const fields: TemplateField[] = [
      { name: "a", label: "A", type: "text", sortOrder: 2 },
      { name: "b", label: "B", type: "text", sortOrder: 1 },
    ];
    const result = parseFieldsJson(JSON.stringify(fields));
    expect(result[0].sortOrder).toBe(2);
    expect(result[1].sortOrder).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Validazione campi obbligatori (name e slug)
// ---------------------------------------------------------------------------
describe("Template — validazione name e slug", () => {
  const validate = (name: string, slug: string): string | null => {
    if (!name.trim()) return "Il nome del template è obbligatorio";
    if (!slug.trim()) return "Lo slug è obbligatorio";
    if (name.length > 255) return "Il nome supera i 255 caratteri";
    if (slug.length > 255) return "Lo slug supera i 255 caratteri";
    return null;
  };

  it("name e slug validi → nessun errore", () => {
    expect(validate("Homepage", "homepage")).toBeNull();
  });

  it("name vuoto → errore", () => {
    expect(validate("", "homepage")).toBe("Il nome del template è obbligatorio");
  });

  it("name solo spazi → errore", () => {
    expect(validate("   ", "homepage")).toBe("Il nome del template è obbligatorio");
  });

  it("slug vuoto → errore", () => {
    expect(validate("Homepage", "")).toBe("Lo slug è obbligatorio");
  });

  it("name oltre 255 caratteri → errore", () => {
    expect(validate("a".repeat(256), "homepage")).toBe("Il nome supera i 255 caratteri");
  });

  it("name di esattamente 255 caratteri → ok", () => {
    expect(validate("a".repeat(255), "homepage")).toBeNull();
  });

  it("slug oltre 255 caratteri → errore", () => {
    expect(validate("Homepage", "a".repeat(256))).toBe("Lo slug supera i 255 caratteri");
  });
});
