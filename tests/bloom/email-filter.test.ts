import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockPipelineResponse(results: number[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => results.map((r) => ({ result: r })),
  });
}

function mockPipelineHttpError(status: number, body: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
    json: async () => {
      throw new Error("should not call json on error");
    },
  });
}

// Mock getAppSettings — getRedisConfig() lo chiama per leggere le credenziali
// Upstash dal DB. Nei test restituiamo le stesse credenziali fake usate nel beforeEach.
vi.mock("@/lib/db/settings-queries", () => ({
  getAppSettings: vi.fn().mockResolvedValue({
    upstash_redis_rest_url: "https://fake.upstash.io",
    upstash_redis_rest_token: "fake-token",
  }),
}));

// Mock Drizzle DB
const mockDbLimit = vi.fn();
vi.mock("@/lib/db/drizzle", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockDbLimit,
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "id", email: "email" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import {
    addEmailToBloom,
    addEmailsBulkToBloom,
    checkEmailAvailability,
    ensureBloomFilter,
    invalidateBloomCheckCache,
    invalidateRedisConfigCache,
} from "@/lib/bloom/bloom-filter";

const ALL_ZEROS = Array(7).fill(0);
const ALL_ONES = Array(7).fill(1);

// ─── Tests ─────────────────────────────────────────────────────────────
describe("Bloom Filter — Email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level Redis config cache so each test starts cold.
    // Without this, getRedisConfig() would return the cached credentials
    // from the previous test and never call getAppSettings() again,
    // breaking tests that mock getAppSettings with different values.
    invalidateRedisConfigCache();
    invalidateBloomCheckCache();
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
  });

  // ─── checkEmailAvailability ────────────────────────────────────────────
  describe("checkEmailAvailability", () => {
    it("returns available=true without DB query when all bits are 0 (certainly absent)", async () => {
      mockPipelineResponse(ALL_ZEROS);

      const result = await checkEmailAvailability("nuovo@example.com");

      expect(result.available).toBe(true);
      expect(result.checkedViaDb).toBe(false);
      expect(mockDbLimit).not.toHaveBeenCalled();
    });

    it("returns available=true without DB query when at least one bit is 0", async () => {
      mockPipelineResponse([1, 1, 0, 1, 1, 1, 1]);

      const result = await checkEmailAvailability("nuovo@example.com");

      expect(result.available).toBe(true);
      expect(result.checkedViaDb).toBe(false);
      expect(mockDbLimit).not.toHaveBeenCalled();
    });

    it("returns available=false when all bits are 1 and DB confirms email exists", async () => {
      mockPipelineResponse(ALL_ONES);
      mockDbLimit.mockResolvedValueOnce([{ id: "123" }]);

      const result = await checkEmailAvailability("esistente@example.com");

      expect(result.available).toBe(false);
      expect(result.checkedViaDb).toBe(true);
    });

    it("returns available=true when all bits are 1 but DB finds nothing (false positive)", async () => {
      mockPipelineResponse(ALL_ONES);
      mockDbLimit.mockResolvedValueOnce([]);

      const result = await checkEmailAvailability("falsopos@example.com");

      expect(result.available).toBe(true);
      expect(result.checkedViaDb).toBe(true);
    });

    it("normalizes email to lowercase before hashing", async () => {
      mockPipelineResponse(ALL_ZEROS);

      await checkEmailAvailability("  UTENTE@Example.COM  ");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toMatch(/\/pipeline$/);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as [
        string,
        string,
        number,
      ][];
      expect(body).toHaveLength(7);
      body.forEach((cmd) => {
        expect(cmd[0]).toBe("GETBIT");
        expect(cmd[1]).toBe("bloom:emails");
        expect(typeof cmd[2]).toBe("number");
      });
    });

    it("sends GETBIT commands to the /pipeline endpoint", async () => {
      mockPipelineResponse(ALL_ZEROS);

      await checkEmailAvailability("test@example.com");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toMatch(/\/pipeline$/);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as unknown[];
      expect(body).toHaveLength(7);
    });
  });

  // ─── addEmailToBloom ───────────────────────────────────────────────────
  describe("addEmailToBloom", () => {
    it("sends k=7 SETBIT commands via pipeline for a single email", async () => {
      mockPipelineResponse(Array(7).fill(0));

      await addEmailToBloom("  NUOVO@Test.COM  ");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toMatch(/\/pipeline$/);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as [
        string,
        string,
        number,
        number,
      ][];
      expect(body).toHaveLength(7);
      body.forEach((cmd) => {
        expect(cmd[0]).toBe("SETBIT");
        expect(cmd[1]).toBe("bloom:emails");
        expect(typeof cmd[2]).toBe("number");
        expect(cmd[3]).toBe(1);
      });
    });

    it("normalizes email before setting bits (uppercase == lowercase same positions)", async () => {
      mockPipelineResponse(Array(7).fill(0));
      await addEmailToBloom("UPPER@CASE.COM");
      const body1 = JSON.parse(mockFetch.mock.calls[0][1].body) as [
        string,
        string,
        number,
        number,
      ][];
      const positions1 = body1.map((c) => c[2]);

      mockPipelineResponse(Array(7).fill(0));
      await addEmailToBloom("upper@case.com");
      const body2 = JSON.parse(mockFetch.mock.calls[1][1].body) as [
        string,
        string,
        number,
        number,
      ][];
      const positions2 = body2.map((c) => c[2]);

      expect(positions1).toEqual(positions2);
    });
  });

  // ─── addEmailsBulkToBloom ─────────────────────────────────────────────
  describe("addEmailsBulkToBloom", () => {
    it("sends k*n SETBIT commands for n emails", async () => {
      mockPipelineResponse(Array(21).fill(0));

      await addEmailsBulkToBloom(["a@b.com", "c@d.com", "e@f.com"]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as unknown[];
      expect(body).toHaveLength(21);
    });

    it("normalizes all emails before setting bits", async () => {
      mockPipelineResponse(Array(7).fill(0));

      await addEmailsBulkToBloom(["A@B.COM"]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as [
        string,
        string,
        number,
        number,
      ][];
      body.forEach((cmd) => {
        expect(cmd[0]).toBe("SETBIT");
        expect(typeof cmd[2]).toBe("number");
      });
    });

    it("does nothing when given an empty array", async () => {
      await addEmailsBulkToBloom([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── ensureBloomFilter ─────────────────────────────────────────────────
  describe("ensureBloomFilter", () => {
    it("is a no-op (SETBIT auto-creates the key)", async () => {
      await expect(ensureBloomFilter()).resolves.toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("resolves without throwing even if called multiple times", async () => {
      await expect(ensureBloomFilter()).resolves.toBeUndefined();
      await expect(ensureBloomFilter()).resolves.toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── Error handling ────────────────────────────────────────────────────
  describe("Error handling", () => {
    it("throws on Upstash HTTP error in pipeline", async () => {
      mockPipelineHttpError(500, "Internal Server Error");

      await expect(addEmailToBloom("test@example.com")).rejects.toThrow(
        "Upstash pipeline error 500",
      );
    });

    it("throws when env vars are missing", async () => {
      const { getAppSettings } = await import("@/lib/db/settings-queries");
      vi.mocked(getAppSettings).mockResolvedValueOnce({
        upstash_redis_rest_url: "",
        upstash_redis_rest_token: "",
      } as Awaited<ReturnType<typeof getAppSettings>>);

      await expect(addEmailToBloom("test@example.com")).rejects.toThrow(
        "Missing Upstash Redis credentials",
      );
    });
  });
});
