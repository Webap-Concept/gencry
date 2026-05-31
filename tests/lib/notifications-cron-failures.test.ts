import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/cron/registry", () => ({
  getCronJobMeta: (jobname: string | null) => {
    if (jobname === "prices-sync") {
      return {
        jobname: "prices-sync",
        label: "Prices Sync",
        description: "desc",
        purpose: "Keeps live prices fresh.",
        owner: { module: "prices" } as const,
      };
    }
    return undefined;
  },
  CORE_CRON_JOBS: [],
  getAllRegisteredJobnames: () => new Set<string>(),
  getModuleJobnames: () => new Set<string>(),
}));
vi.mock("@/lib/modules/registry", () => ({ INSTALLED_MODULES: [] }));
// Il test esercita solo la logica pura `computeCronFailureCandidates`, mai
// `.run()`: mockiamo il client QStash per non trascinarne la catena
// (server-only + settings + db) all'import.
vi.mock("@/lib/cron/qstash-client", () => ({
  getDlqFailuresByJobname: vi.fn(),
}));

import {
  computeCronFailureCandidates,
  type CronJobRow,
} from "@/lib/notifications/generators/cron-failures";

const buildLink = (jobname: string) => `/cron/${jobname}`;

function job(
  jobname: string,
  active: boolean,
  runs: Array<{ status: string; startTime?: string; returnMessage?: string }>,
): CronJobRow {
  return {
    jobid: 1,
    jobname,
    active,
    runs: runs.map((r) => ({
      status: r.status,
      startTime: r.startTime ? new Date(r.startTime) : null,
      returnMessage: r.returnMessage ?? null,
    })),
  };
}

describe("computeCronFailureCandidates", () => {
  it("nessun candidato se nessun job", () => {
    expect(computeCronFailureCandidates([], buildLink)).toEqual([]);
  });

  it("nessun candidato se ultimo run = succeeded", () => {
    const out = computeCronFailureCandidates(
      [job("a", true, [{ status: "succeeded" }, { status: "failed" }])],
      buildLink,
    );
    expect(out).toEqual([]);
  });

  it("nessun candidato se job disattivato (anche se ultimo run failed)", () => {
    const out = computeCronFailureCandidates(
      [job("a", false, [{ status: "failed" }, { status: "failed" }])],
      buildLink,
    );
    expect(out).toEqual([]);
  });

  it("nessun candidato se job senza run", () => {
    expect(computeCronFailureCandidates([job("a", true, [])], buildLink)).toEqual([]);
  });

  it("severity warning con 1 fallimento", () => {
    const out = computeCronFailureCandidates(
      [
        job("a", true, [
          { status: "failed", startTime: "2026-04-28T12:00:00Z" },
          { status: "succeeded" },
        ]),
      ],
      buildLink,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].dedupKey).toBe("cron-failure:a");
    expect(out[0].link).toBe("/cron/a");
    expect(out[0].metadata?.consecutiveFailures).toBe(1);
  });

  it("severity warning con 4 fallimenti consecutivi", () => {
    const out = computeCronFailureCandidates(
      [
        job(
          "a",
          true,
          Array.from({ length: 4 }, () => ({ status: "failed" })),
        ),
      ],
      buildLink,
    );
    expect(out[0].severity).toBe("warning");
    expect(out[0].metadata?.consecutiveFailures).toBe(4);
  });

  it("severity critical con 5+ fallimenti consecutivi", () => {
    const out = computeCronFailureCandidates(
      [
        job(
          "a",
          true,
          Array.from({ length: 7 }, () => ({ status: "failed" })),
        ),
      ],
      buildLink,
    );
    expect(out[0].severity).toBe("critical");
    expect(out[0].metadata?.consecutiveFailures).toBe(7);
  });

  it("conteggio si ferma al primo successo", () => {
    const out = computeCronFailureCandidates(
      [
        job("a", true, [
          { status: "failed" },
          { status: "failed" },
          { status: "succeeded" },
          { status: "failed" },
          { status: "failed" },
        ]),
      ],
      buildLink,
    );
    expect(out[0].metadata?.consecutiveFailures).toBe(2);
  });

  it("titolo e body usano label + purpose dal registry quando disponibile", () => {
    const out = computeCronFailureCandidates(
      [
        job("prices-sync", true, [
          { status: "failed", returnMessage: "boom" },
        ]),
      ],
      buildLink,
    );
    expect(out[0].title).toBe("Cron failed — Prices Sync");
    expect(out[0].body).toContain("Error: boom");
    expect(out[0].body).toContain("Keeps live prices fresh.");
  });

  it("fallback al jobname nudo se metadata non in registry", () => {
    const out = computeCronFailureCandidates(
      [job("ghost-job", true, [{ status: "failed" }])],
      buildLink,
    );
    expect(out[0].title).toBe("Cron failed — ghost-job");
  });

  it("status case-insensitive", () => {
    const out = computeCronFailureCandidates(
      [job("a", true, [{ status: "FAILED" }, { status: "Succeeded" }])],
      buildLink,
    );
    expect(out).toHaveLength(1);
    expect(out[0].metadata?.consecutiveFailures).toBe(1);
  });

  it("tronca return message lunghi a 240 caratteri", () => {
    const longMsg = "x".repeat(500);
    const out = computeCronFailureCandidates(
      [job("a", true, [{ status: "failed", returnMessage: longMsg }])],
      buildLink,
    );
    const errPart = out[0].body!.split("Error: ")[1].split(" · ")[0];
    expect(errPart.length).toBeLessThanOrEqual(240);
    expect(errPart.endsWith("…")).toBe(true);
  });
});
