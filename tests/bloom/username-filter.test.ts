import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
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

function mockRedisDown() {
  mockFetch.mockRejectedValueOnce(new Error("Redis unreachable"));
}

// Mock getAppSettings
vi.mock("@/lib/db/settings-queries", () => ({
  getAppSettings: vi.fn().mockResolvedValue({
    upstash_redis_rest_url: "https://fake.upstash.io",
    upstash_redis_rest_token: "fake-token",
  }),
}));

// Mock Drizzle DB — userProfiles table for username checks
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
  users:        { id: "id", email: "email" },
  userProfiles: { id: "id", username: "username" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import {
  addUsernameToBloom,
  checkUsernameAvailability,
  ensureBloomFilter,
  invalidateBloomCheckCache,
  invalidateRedisConfigCache,
} from "@/lib/bloom/bloom-filter";

const ALL_ZEROS = Array(7).fill(0);
const ALL_ONES  = Array(7).fill(1);

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("Bloom Filter — Username", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateRedisConfigCache();
    invalidateBloomCheckCache();
    process.env.UPSTASH_REDIS_REST_URL   = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
  });

  // ─── checkUsernameAvailability ────────────────────────────────────────────────
describe("checkUsernameAvailability", () => {
    it("returns available=true without DB query when all bits are 0 (certainly absent)", async () => {
      mockPipelineResponse(ALL_ZEROS);

      const result = await checkUsernameAvailability("nuovoutente");

      expect(result.available).toBe(true);
      expect(result.checkedViaDb).toBe(false);
      expect(mockDbLimit).not.toHaveBeenCalled();
    });

    it("returns available=true without DB query when at least one bit is 0", async () => {
      mockPipelineResponse([1, 1, 0, 1, 1, 1, 1]);

      const result = await checkUsernameAvailability("nuovoutente");

      expect(result.available).toBe(true);
      expect(result.checkedViaDb).toBe(false);
      expect(mockDbLimit).not.toHaveBeenCalled();
    });

    it("returns available=false when all bits are 1 and DB confirms username taken", async () => {
      mockPipelineResponse(ALL_ONES);
      mockDbLimit.mockResolvedValueOnce([{ id: "profile-123" }]);

      const result = await checkUsernameAvailability("utenteesistente");

      expect(result.available).toBe(false);
      expect(result.checkedViaDb).toBe(true);
    });

    it("returns available=true when all bits are 1 but DB finds nothing (false positive)", async () => {
      mockPipelineResponse(ALL_ONES);
      mockDbLimit.mockResolvedValueOnce([]);

      const result = await checkUsernameAvailability("falsopositivo");

      expect(result.available).toBe(true);
      expect(result.checkedViaDb).toBe(true);
    });

    it("normalizes username to lowercase and trims whitespace before hashing", async () => {
      mockPipelineResponse(ALL_ZEROS);

      await checkUsernameAvailability("  MARIO_Rossi  ");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toMatch(/\/pipeline$/);

      const body = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as [string, string, number][];

      expect(body).toHaveLength(7);
      body.forEach((cmd) => {
        expect(cmd[0]).toBe("GETBIT");
        // Must target the username key, NOT the email key
        expect(cmd[1]).toBe("bloom:usernames");
        expect(typeof cmd[2]).toBe("number");
      });
    });

    it("sends GETBIT commands to the /pipeline endpoint targeting bloom:usernames", async () => {
      mockPipelineResponse(ALL_ZEROS);

      await checkUsernameAvailability("testuser");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toMatch(/\/pipeline$/);

      const body = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as [string, string, number][];

      expect(body).toHaveLength(7);
      body.forEach((cmd) => {
        expect(cmd[1]).toBe("bloom:usernames");
      });
    });

    it("does NOT target bloom:emails key (key isolation)", async () => {
      mockPipelineResponse(ALL_ZEROS);

      await checkUsernameAvailability("isolationcheck");

      const body = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as [string, string, number][];

      body.forEach((cmd) => {
        expect(cmd[1]).not.toBe("bloom:emails");
      });
    });
  });

  // ─── addUsernameToBloom ───────────────────────────────────────────────────────
describe("addUsernameToBloom", () => {
    it("sends k=7 SETBIT commands via pipeline targeting bloom:usernames", async () => {
      mockPipelineResponse(Array(7).fill(0));

      await addUsernameToBloom("  NUOVO_User  ");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toMatch(/\/pipeline$/);

      const body = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as [string, string, number, number][];

      expect(body).toHaveLength(7);
      body.forEach((cmd) => {
        expect(cmd[0]).toBe("SETBIT");
        expect(cmd[1]).toBe("bloom:usernames");
        expect(typeof cmd[2]).toBe("number");
        expect(cmd[3]).toBe(1);
      });
    });

    it("does NOT target bloom:emails key (key isolation)", async () => {
      mockPipelineResponse(Array(7).fill(0));

      await addUsernameToBloom("isolationcheck");

      const body = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as [string, string, number, number][];

      body.forEach((cmd) => {
        expect(cmd[1]).not.toBe("bloom:emails");
      });
    });

    it("normalization: uppercase and lowercase produce identical bit positions", async () => {
      mockPipelineResponse(Array(7).fill(0));
      await addUsernameToBloom("UPPER_CASE");
      const body1 = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as [string, string, number, number][];
      const positions1 = body1.map((c) => c[2]);

      mockPipelineResponse(Array(7).fill(0));
      await addUsernameToBloom("upper_case");
      const body2 = JSON.parse(
        mockFetch.mock.calls[1][1].body as string,
      ) as [string, string, number, number][];
      const positions2 = body2.map((c) => c[2]);

      expect(positions1).toEqual(positions2);
    });

    it("normalization: leading/trailing spaces are ignored", async () => {
      mockPipelineResponse(Array(7).fill(0));
      await addUsernameToBloom("   mario   ");
      const body1 = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as [string, string, number, number][];
      const positions1 = body1.map((c) => c[2]);

      mockPipelineResponse(Array(7).fill(0));
      await addUsernameToBloom("mario");
      const body2 = JSON.parse(
        mockFetch.mock.calls[1][1].body as string,
      ) as [string, string, number, number][];
      const positions2 = body2.map((c) => c[2]);

      expect(positions1).toEqual(positions2);
    });
  });

  // ─── Redis fallback ──────────────────────────────────────────────────────────
describe("Redis fallback (Redis unavailable)", () => {
    it("falls back to DB when Redis is down and returns available=false if username taken", async () => {
      mockRedisDown();
      mockDbLimit.mockResolvedValueOnce([{ id: "profile-999" }]);

      const result = await checkUsernameAvailability("utentetaken");

      expect(result.available).toBe(false);
      expect(result.checkedViaDb).toBe(true);
      expect(mockDbLimit).toHaveBeenCalledTimes(1);
    });

    it("falls back to DB when Redis is down and returns available=true if username free", async () => {
      mockRedisDown();
      mockDbLimit.mockResolvedValueOnce([]);

      const result = await checkUsernameAvailability("utentelibero");

      expect(result.available).toBe(true);
      expect(result.checkedViaDb).toBe(true);
    });
  });

  // ─── ensureBloomFilter ─────────────────────────────────────────────────────────
describe("ensureBloomFilter", () => {
    it("is a no-op (SETBIT auto-creates both keys)", async () => {
      await expect(ensureBloomFilter()).resolves.toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("resolves without throwing even if called multiple times", async () => {
      await expect(ensureBloomFilter()).resolves.toBeUndefined();
      await expect(ensureBloomFilter()).resolves.toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────────
describe("Error handling", () => {
    it("throws on Upstash HTTP error in pipeline", async () => {
      mockPipelineHttpError(500, "Internal Server Error");

      await expect(addUsernameToBloom("testuser")).rejects.toThrow(
        "Upstash pipeline error 500",
      );
    });

    it("throws when credentials are missing", async () => {
      const { getAppSettings } = await import("@/lib/db/settings-queries");
      vi.mocked(getAppSettings).mockResolvedValueOnce({
        upstash_redis_rest_url:   "",
        upstash_redis_rest_token: "",
      } as Awaited<ReturnType<typeof getAppSettings>>);

      await expect(addUsernameToBloom("testuser")).rejects.toThrow(
        "Missing Upstash Redis credentials",
      );
    });
  });
});
