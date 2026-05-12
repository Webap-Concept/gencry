import { describe, expect, it } from "vitest";
import { resolveSlotFrom, validateSections } from "@/lib/home/registry-utils";
import type { HomeSection } from "@/lib/home/types";

// Fixture builder: una sezione "minimal" con campi opzionali sovrascrivibili.
function section(overrides: Partial<HomeSection>): HomeSection {
  return {
    key: "test.section",
    slot: "home.main",
    order: 10,
    Component: () => null as unknown as JSX.Element,
    Skeleton: () => null as unknown as JSX.Element,
    ...overrides,
  };
}

describe("validateSections", () => {
  it("returns no warnings for a valid registry", () => {
    const sections: HomeSection[] = [
      section({ key: "a", slot: "home.hero", order: 10 }),
      section({ key: "b", slot: "home.main", order: 10 }),
      section({ key: "c", slot: "home.rail.top", order: 20 }),
    ];
    expect(validateSections(sections)).toEqual([]);
  });

  it("warns on duplicate keys", () => {
    const sections: HomeSection[] = [
      section({ key: "dup", slot: "home.main", order: 10 }),
      section({ key: "dup", slot: "home.rail.top", order: 10 }),
    ];
    const warnings = validateSections(sections);
    expect(warnings).toContain('duplicate key "dup"');
  });

  it("warns on unknown slot", () => {
    const sections: HomeSection[] = [
      section({
        key: "x",
        // Forza uno slot fake via cast — TS protegge solo a compile time,
        // a runtime un import sbagliato (es. typo) può sfuggire.
        slot: "home.nonexistent" as HomeSection["slot"],
        order: 10,
      }),
    ];
    const warnings = validateSections(sections);
    expect(warnings).toContain('section "x" uses unknown slot "home.nonexistent"');
  });

  it("warns on order collisions within the same slot", () => {
    const sections: HomeSection[] = [
      section({ key: "a", slot: "home.main", order: 50 }),
      section({ key: "b", slot: "home.main", order: 50 }),
    ];
    const warnings = validateSections(sections);
    expect(warnings).toContain(
      'section "b" collides on order=50 in slot "home.main"',
    );
  });

  it("does NOT warn on the same order in DIFFERENT slots", () => {
    const sections: HomeSection[] = [
      section({ key: "a", slot: "home.main", order: 50 }),
      section({ key: "b", slot: "home.rail.top", order: 50 }),
    ];
    expect(validateSections(sections)).toEqual([]);
  });
});

describe("resolveSlotFrom", () => {
  it("returns empty result for a slot with no sections", async () => {
    const sections: HomeSection[] = [
      section({ key: "a", slot: "home.main", order: 10 }),
    ];
    const result = await resolveSlotFrom("home.hero", sections);
    expect(result.sections).toEqual([]);
    expect(result.gateErrors).toEqual([]);
  });

  it("filters by slot", async () => {
    const sections: HomeSection[] = [
      section({ key: "main", slot: "home.main", order: 10 }),
      section({ key: "rail", slot: "home.rail.top", order: 10 }),
    ];
    const result = await resolveSlotFrom("home.main", sections);
    expect(result.sections.map((s) => s.key)).toEqual(["main"]);
  });

  it("sorts ascending by order", async () => {
    const sections: HomeSection[] = [
      section({ key: "c", slot: "home.main", order: 30 }),
      section({ key: "a", slot: "home.main", order: 10 }),
      section({ key: "b", slot: "home.main", order: 20 }),
    ];
    const result = await resolveSlotFrom("home.main", sections);
    expect(result.sections.map((s) => s.key)).toEqual(["a", "b", "c"]);
  });

  it("treats sections without isEnabled as always visible", async () => {
    const sections: HomeSection[] = [
      section({ key: "no-gate", slot: "home.main", order: 10 }),
    ];
    const result = await resolveSlotFrom("home.main", sections);
    expect(result.sections.map((s) => s.key)).toEqual(["no-gate"]);
  });

  it("excludes sections whose isEnabled returns false", async () => {
    const sections: HomeSection[] = [
      section({ key: "yes", slot: "home.main", order: 10, isEnabled: () => true }),
      section({ key: "no", slot: "home.main", order: 20, isEnabled: () => false }),
    ];
    const result = await resolveSlotFrom("home.main", sections);
    expect(result.sections.map((s) => s.key)).toEqual(["yes"]);
  });

  it("awaits async isEnabled and filters accordingly", async () => {
    const sections: HomeSection[] = [
      section({
        key: "async-yes",
        slot: "home.main",
        order: 10,
        isEnabled: async () => true,
      }),
      section({
        key: "async-no",
        slot: "home.main",
        order: 20,
        isEnabled: async () => false,
      }),
    ];
    const result = await resolveSlotFrom("home.main", sections);
    expect(result.sections.map((s) => s.key)).toEqual(["async-yes"]);
  });

  it("captures gate throws and treats section as disabled", async () => {
    const boom = new Error("gate exploded");
    const sections: HomeSection[] = [
      section({ key: "ok", slot: "home.main", order: 10 }),
      section({
        key: "kaboom",
        slot: "home.main",
        order: 20,
        isEnabled: () => {
          throw boom;
        },
      }),
    ];
    const result = await resolveSlotFrom("home.main", sections);

    // La sezione che throwa non finisce nell'output...
    expect(result.sections.map((s) => s.key)).toEqual(["ok"]);
    // ...ma l'errore è registrato in gateErrors per logging dal caller.
    expect(result.gateErrors).toHaveLength(1);
    expect(result.gateErrors[0]).toEqual({ key: "kaboom", error: boom });
  });

  it("runs gates in parallel (Promise.all, not sequential)", async () => {
    // Verifica indiretta: 2 gate che attendono 50ms ciascuno → totale
    // deve essere ~50ms (parallel), non 100ms (sequential).
    const sections: HomeSection[] = [
      section({
        key: "slow1",
        slot: "home.main",
        order: 10,
        isEnabled: () => new Promise((r) => setTimeout(() => r(true), 50)),
      }),
      section({
        key: "slow2",
        slot: "home.main",
        order: 20,
        isEnabled: () => new Promise((r) => setTimeout(() => r(true), 50)),
      }),
    ];
    const start = Date.now();
    await resolveSlotFrom("home.main", sections);
    const elapsed = Date.now() - start;
    // Margine generoso per CI/jitter: meno di 90ms = parallelizzato.
    expect(elapsed).toBeLessThan(90);
  });
});
