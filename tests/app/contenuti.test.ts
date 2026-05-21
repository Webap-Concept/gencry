// tests/app/contenuti.test.ts
// Test unit per la logica Contenuti: validazione schema slug, title,
// status, date, customFields JSON, sortOrder.

import { describe, it, expect } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema identico a app/(admin)/admin/contenuti/actions.ts
// ---------------------------------------------------------------------------
const schema = z.object({
  id: z.string().optional(),
  originalSlug: z.string().optional(),
  slug: z
    .string()
    .min(1, "Lo slug è obbligatorio")
    .max(255)
    .regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/, {
      message: "Slug non valido: usa solo lettere minuscole, numeri, trattini e slash",
    }),
  title: z.string().min(1, "Il titolo è obbligatorio").max(255),
  content: z.string().default(""),
  status: z.enum(["draft", "published"]).default("draft"),
  publishedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  parentId: z.string().optional(),
  templateId: z.string().optional(),
  customFields: z.string().optional(),
  sortOrder: z.string().optional(),
});

type PageInput = z.input<typeof schema>;

const valid: PageInput = {
  slug: "chi-siamo",
  title: "Chi siamo",
  status: "draft",
};

// ---------------------------------------------------------------------------
// slug
// ---------------------------------------------------------------------------
describe("Contenuti schema — slug", () => {
  it("accetta slug semplice lowercase", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it("accetta slug con trattini", () => {
    expect(schema.safeParse({ ...valid, slug: "blog-post-1" }).success).toBe(true);
  });

  it("accetta slug con slash (sottocartella)", () => {
    expect(schema.safeParse({ ...valid, slug: "blog/post-1" }).success).toBe(true);
  });

  it("rifiuta slug vuoto", () => {
    const r = schema.safeParse({ ...valid, slug: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Lo slug è obbligatorio");
  });

  it("rifiuta slug con lettere maiuscole", () => {
    const r = schema.safeParse({ ...valid, slug: "ChiSiamo" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("Slug non valido");
  });

  it("rifiuta slug con spazi", () => {
    expect(schema.safeParse({ ...valid, slug: "chi siamo" }).success).toBe(false);
  });

  it("rifiuta slug che inizia con trattino", () => {
    expect(schema.safeParse({ ...valid, slug: "-chi-siamo" }).success).toBe(false);
  });

  it("rifiuta slug che termina con slash", () => {
    expect(schema.safeParse({ ...valid, slug: "blog/" }).success).toBe(false);
  });

  it("rifiuta slug con doppio slash", () => {
    expect(schema.safeParse({ ...valid, slug: "blog//post" }).success).toBe(false);
  });

  it("rifiuta slug oltre 255 caratteri", () => {
    expect(schema.safeParse({ ...valid, slug: "a".repeat(256) }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// title
// ---------------------------------------------------------------------------
describe("Contenuti schema — title", () => {
  it("rifiuta titolo vuoto", () => {
    const r = schema.safeParse({ ...valid, title: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Il titolo è obbligatorio");
  });

  it("rifiuta titolo oltre 255 caratteri", () => {
    expect(schema.safeParse({ ...valid, title: "a".repeat(256) }).success).toBe(false);
  });

  it("accetta titolo di esattamente 255 caratteri", () => {
    expect(schema.safeParse({ ...valid, title: "a".repeat(255) }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
describe("Contenuti schema — status", () => {
  it("default status è draft", () => {
    const r = schema.safeParse({ slug: "test", title: "Test" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe("draft");
  });

  it("accetta status 'published'", () => {
    const r = schema.safeParse({ ...valid, status: "published" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe("published");
  });

  it("rifiuta status non previsto", () => {
    expect(schema.safeParse({ ...valid, status: "archived" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// content default
// ---------------------------------------------------------------------------
describe("Contenuti schema — content", () => {
  it("content default è stringa vuota", () => {
    const r = schema.safeParse({ slug: "test", title: "Test" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.content).toBe("");
  });

  it("accetta content con HTML", () => {
    expect(schema.safeParse({ ...valid, content: "<p>Testo</p>" }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// togglePageStatus logic (unit, senza DB)
// ---------------------------------------------------------------------------
describe("Contenuti — togglePageStatus logic", () => {
  const toggle = (current: string) =>
    current === "published" ? "draft" : "published";

  it("published → draft", () => {
    expect(toggle("published")).toBe("draft");
  });

  it("draft → published", () => {
    expect(toggle("draft")).toBe("published");
  });

  it("valore sconosciuto → published", () => {
    expect(toggle("archived")).toBe("published");
  });
});

// ---------------------------------------------------------------------------
// customFields JSON parsing
// ---------------------------------------------------------------------------
describe("Contenuti — customFields JSON parsing", () => {
  const parseCustomFields = (raw: string | undefined): Record<string, unknown> => {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  };

  it("stringa vuota → oggetto vuoto", () => {
    expect(parseCustomFields("")).toEqual({});
  });

  it("undefined → oggetto vuoto", () => {
    expect(parseCustomFields(undefined)).toEqual({});
  });

  it("JSON valido viene parsato", () => {
    expect(parseCustomFields('{"key":"value"}')).toEqual({ key: "value" });
  });

  it("JSON non valido → oggetto vuoto (nessun throw)", () => {
    expect(parseCustomFields("{ bad json }")).toEqual({});
  });

  it("JSON annidato viene parsato", () => {
    expect(parseCustomFields('{"a":{"b":1}}')).toEqual({ a: { b: 1 } });
  });
});

// ---------------------------------------------------------------------------
// publishedAt logic
// ---------------------------------------------------------------------------
describe("Contenuti — publishedAt risoluzione", () => {
  const resolvePublishedAt = (status: string, publishedAt?: string): Date | null => {
    if (status === "published") {
      return publishedAt ? new Date(publishedAt) : new Date();
    } else if (publishedAt) {
      return new Date(publishedAt);
    }
    return null;
  };

  it("status published senza data → now", () => {
    const before = Date.now();
    const result = resolvePublishedAt("published");
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("status published con data specifica", () => {
    const r = resolvePublishedAt("published", "2025-01-15T10:00:00.000Z");
    expect(r?.toISOString()).toBe("2025-01-15T10:00:00.000Z");
  });

  it("status draft senza data → null", () => {
    expect(resolvePublishedAt("draft")).toBeNull();
  });

  it("status draft con data → conserva la data", () => {
    const r = resolvePublishedAt("draft", "2025-06-01T00:00:00.000Z");
    expect(r?.toISOString()).toBe("2025-06-01T00:00:00.000Z");
  });
});
