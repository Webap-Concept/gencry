import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/drizzle", () => ({ db: {} }));

import { computeAccountDeletionCandidates } from "@/lib/notifications/generators/account-deletions";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-05-02T12:00:00Z").getTime();
const GRACE = 30;

function row(daysSinceDeletion: number, id = "user-1", email = "u@example.com") {
  return {
    id,
    email,
    deletedAt: new Date(NOW - daysSinceDeletion * DAY_MS),
  };
}

describe("computeAccountDeletionCandidates", () => {
  it("non emette nulla se nessuna riga", () => {
    expect(computeAccountDeletionCandidates([], NOW, GRACE)).toEqual([]);
  });

  it("emette severity=info dentro la grace, lontano dalla scadenza", () => {
    const out = computeAccountDeletionCandidates([row(2)], NOW, GRACE);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("info");
    expect(out[0].dedupKey).toBe("account_deletion_requested:user-1");
    expect(out[0].link).toBe(
      "/admin/access/users/user-1?status=deletion_requested",
    );
    expect(out[0].metadata).toMatchObject({
      userId: "user-1",
      email: "u@example.com",
      daysRemaining: 28,
    });
  });

  it("escala a warning a 7 giorni dalla scadenza", () => {
    const out = computeAccountDeletionCandidates([row(GRACE - 7)], NOW, GRACE);
    expect(out[0].severity).toBe("warning");
  });

  it("escala a critical entro l'ultimo giorno", () => {
    const out = computeAccountDeletionCandidates(
      [row(GRACE - 1 + 0.1)],
      NOW,
      GRACE,
    );
    expect(out[0].severity).toBe("critical");
  });

  it("non emette nulla per righe oltre la grace (msRemaining <= 0)", () => {
    expect(
      computeAccountDeletionCandidates([row(GRACE + 1)], NOW, GRACE),
    ).toEqual([]);
  });

  it("emette un candidato per ogni utente in stato di soft-delete", () => {
    const out = computeAccountDeletionCandidates(
      [row(2, "u1", "a@x"), row(10, "u2", "b@x")],
      NOW,
      GRACE,
    );
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.dedupKey).sort()).toEqual([
      "account_deletion_requested:u1",
      "account_deletion_requested:u2",
    ]);
  });

  it("e' deterministico sulla dedupKey (stesso input -> stessa key)", () => {
    const a = computeAccountDeletionCandidates([row(5)], NOW, GRACE);
    const b = computeAccountDeletionCandidates([row(5)], NOW, GRACE);
    expect(a[0].dedupKey).toBe(b[0].dedupKey);
  });
});
