import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/drizzle", () => ({ db: {} }));

import { computeRotationCandidates } from "@/lib/notifications/generators/rotation";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-04-28T12:00:00Z").getTime();

const TARGETS = [
  {
    key: "google_client_secret",
    label: "Google Client Secret",
    maxAgeDays: 180,
    subPath: "/admin/settings/google-oauth",
  },
];

function rowAged(ageDays: number, value: string | null = "secret-value") {
  return {
    key: "google_client_secret",
    value,
    updatedAt: new Date(NOW - ageDays * DAY_MS),
  };
}

describe("computeRotationCandidates", () => {
  it("non emette nulla se nessuna riga", () => {
    expect(computeRotationCandidates([], NOW, TARGETS)).toEqual([]);
  });

  it("non emette se la chiave non e' configurata (value null)", () => {
    expect(
      computeRotationCandidates([rowAged(365, null)], NOW, TARGETS),
    ).toEqual([]);
  });

  it("non emette se la chiave e' stringa vuota", () => {
    expect(
      computeRotationCandidates([rowAged(365, "")], NOW, TARGETS),
    ).toEqual([]);
  });

  it("non emette se updatedAt manca", () => {
    expect(
      computeRotationCandidates(
        [{ key: "google_client_secret", value: "x", updatedAt: null }],
        NOW,
        TARGETS,
      ),
    ).toEqual([]);
  });

  it("non emette se entro la soglia (ageDays <= maxAgeDays)", () => {
    expect(computeRotationCandidates([rowAged(180)], NOW, TARGETS)).toEqual([]);
    expect(computeRotationCandidates([rowAged(50)], NOW, TARGETS)).toEqual([]);
  });

  it("emette severity=info appena oltre la soglia", () => {
    const out = computeRotationCandidates([rowAged(181)], NOW, TARGETS);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("info");
    expect(out[0].dedupKey).toBe("rotation:google_client_secret");
    expect(out[0].link).toBe("/admin/settings/google-oauth");
    expect(out[0].metadata).toMatchObject({
      settingKey: "google_client_secret",
      ageDays: 181,
      maxAgeDays: 180,
    });
  });

  it("escala a warning oltre maxAgeDays + 30", () => {
    const out = computeRotationCandidates([rowAged(220)], NOW, TARGETS);
    expect(out[0].severity).toBe("warning");
  });

  it("escala a critical oltre maxAgeDays + 90", () => {
    const out = computeRotationCandidates([rowAged(280)], NOW, TARGETS);
    expect(out[0].severity).toBe("critical");
  });

  it("e' deterministico sulla dedupKey (stesso input -> stessa key)", () => {
    const a = computeRotationCandidates([rowAged(200)], NOW, TARGETS);
    const b = computeRotationCandidates([rowAged(200)], NOW, TARGETS);
    expect(a[0].dedupKey).toBe(b[0].dedupKey);
  });

  it("ignora chiavi non presenti tra i target", () => {
    const out = computeRotationCandidates(
      [
        { key: "unknown_key", value: "x", updatedAt: new Date(NOW - 999 * DAY_MS) },
      ],
      NOW,
      TARGETS,
    );
    expect(out).toEqual([]);
  });

  it("emette un candidato per ogni target scaduto", () => {
    const targets = [
      { key: "k1", label: "K1", maxAgeDays: 180, subPath: "/a" },
      { key: "k2", label: "K2", maxAgeDays: 365, subPath: "/b" },
    ];
    const rows = [
      { key: "k1", value: "v", updatedAt: new Date(NOW - 200 * DAY_MS) },
      { key: "k2", value: "v", updatedAt: new Date(NOW - 400 * DAY_MS) },
    ];
    const out = computeRotationCandidates(rows, NOW, targets);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.dedupKey).sort()).toEqual([
      "rotation:k1",
      "rotation:k2",
    ]);
  });
});
