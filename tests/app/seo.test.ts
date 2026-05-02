// tests/app/seo.test.ts
// Test unit per la logica SEO: validazione schema pathname, limiti campi,
// robots values, ogImage URL, jsonLd.

import { describe, it, expect } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema identico a app/(admin)/admin/seo/actions.ts
// ---------------------------------------------------------------------------
const ROBOTS_VALUES = ["", "noindex,nofollow", "noindex,follow"] as const;

const schema = z.object({
  pathname: z
    .string()
    .min(1)
    .regex(/^\//, { message: "Il pathname deve iniziare con /" }),
  originalPathname: z.string().optional(),
  label: z.string().min(1, "Il nome è obbligatorio").max(100),
  title: z.string().max(70).optional(),
  description: z.string().max(160).optional(),
  ogTitle: z.string().max(70).optional(),
  ogDescription: z.string().max(200).optional(),
  ogImage: z.string().url().optional().or(z.literal("")),
  robots: z
    .enum(ROBOTS_VALUES)
    .optional()
    .transform((v) => v || null),
  jsonLdEnabled: z.boolean().default(false),
  jsonLdType: z.string().optional().nullable(),
});

type SeoInput = z.input<typeof schema>;

const valid: SeoInput = {
  pathname: "/chi-siamo",
  label: "Chi siamo",
  title: "Chi siamo | Librolo",
  description: "Scopri il team di Librolo.",
  robots: "",
  jsonLdEnabled: false,
};

// ---------------------------------------------------------------------------
// pathname
// ---------------------------------------------------------------------------
describe("SEO schema — pathname", () => {
  it("accetta pathname che inizia con /", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it("rifiuta pathname senza /", () => {
    const r = schema.safeParse({ ...valid, pathname: "chi-siamo" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Il pathname deve iniziare con /");
  });

  it("rifiuta pathname vuoto", () => {
    expect(schema.safeParse({ ...valid, pathname: "" }).success).toBe(false);
  });

  it("accetta pathname con sottocartelle /blog/post-1", () => {
    expect(schema.safeParse({ ...valid, pathname: "/blog/post-1" }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// label
// ---------------------------------------------------------------------------
describe("SEO schema — label", () => {
  it("rifiuta label vuota", () => {
    const r = schema.safeParse({ ...valid, label: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Il nome è obbligatorio");
  });

  it("rifiuta label oltre 100 caratteri", () => {
    expect(schema.safeParse({ ...valid, label: "a".repeat(101) }).success).toBe(false);
  });

  it("accetta label di esattamente 100 caratteri", () => {
    expect(schema.safeParse({ ...valid, label: "a".repeat(100) }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// title / description limiti
// ---------------------------------------------------------------------------
describe("SEO schema — title & description", () => {
  it("rifiuta title oltre 70 caratteri", () => {
    expect(schema.safeParse({ ...valid, title: "a".repeat(71) }).success).toBe(false);
  });

  it("accetta title di esattamente 70 caratteri", () => {
    expect(schema.safeParse({ ...valid, title: "a".repeat(70) }).success).toBe(true);
  });

  it("rifiuta description oltre 160 caratteri", () => {
    expect(schema.safeParse({ ...valid, description: "a".repeat(161) }).success).toBe(false);
  });

  it("accetta description di esattamente 160 caratteri", () => {
    expect(schema.safeParse({ ...valid, description: "a".repeat(160) }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ogImage
// ---------------------------------------------------------------------------
describe("SEO schema — ogImage", () => {
  it("accetta stringa vuota come ogImage", () => {
    expect(schema.safeParse({ ...valid, ogImage: "" }).success).toBe(true);
  });

  it("accetta URL https valido come ogImage", () => {
    expect(schema.safeParse({ ...valid, ogImage: "https://cdn.example.com/img.jpg" }).success).toBe(true);
  });

  it("rifiuta stringa non-URL come ogImage", () => {
    expect(schema.safeParse({ ...valid, ogImage: "non-un-url" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// robots
// ---------------------------------------------------------------------------
describe("SEO schema — robots", () => {
  it("trasforma '' in null", () => {
    const r = schema.safeParse({ ...valid, robots: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.robots).toBeNull();
  });

  it("accetta 'noindex,nofollow'", () => {
    const r = schema.safeParse({ ...valid, robots: "noindex,nofollow" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.robots).toBe("noindex,nofollow");
  });

  it("accetta 'noindex,follow'", () => {
    const r = schema.safeParse({ ...valid, robots: "noindex,follow" });
    expect(r.success).toBe(true);
  });

  it("rifiuta valore robots non previsto", () => {
    expect(schema.safeParse({ ...valid, robots: "all" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// jsonLd
// ---------------------------------------------------------------------------
describe("SEO schema — jsonLd", () => {
  it("jsonLdEnabled default false", () => {
    const r = schema.safeParse({ pathname: "/test", label: "Test" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.jsonLdEnabled).toBe(false);
  });

  it("accetta jsonLdEnabled true con jsonLdType", () => {
    const r = schema.safeParse({ ...valid, jsonLdEnabled: true, jsonLdType: "WebPage" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.jsonLdEnabled).toBe(true);
  });

  it("accetta jsonLdType null", () => {
    expect(schema.safeParse({ ...valid, jsonLdEnabled: true, jsonLdType: null }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ogTitle / ogDescription limiti
// ---------------------------------------------------------------------------
describe("SEO schema — og fields", () => {
  it("rifiuta ogTitle oltre 70 caratteri", () => {
    expect(schema.safeParse({ ...valid, ogTitle: "a".repeat(71) }).success).toBe(false);
  });

  it("rifiuta ogDescription oltre 200 caratteri", () => {
    expect(schema.safeParse({ ...valid, ogDescription: "a".repeat(201) }).success).toBe(false);
  });

  it("accetta ogDescription di esattamente 200 caratteri", () => {
    expect(schema.safeParse({ ...valid, ogDescription: "a".repeat(200) }).success).toBe(true);
  });
});
