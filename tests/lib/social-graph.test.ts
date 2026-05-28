// @vitest-environment node
//
// PR1 modulo social-graph: test pure-logic.
// Coverage:
//   - follows-cache: L1 (in-process Map) TTL + invalidate
//   - queries: postsFromFollowingFragment empty set short-circuit
//   - actions: gate self-follow + unauthenticated (mock getUser)
//
// Tutte le dipendenze DB/KV sono mockate. Counter consistency dei trigger
// SQL e' verificata dall'utente al primo apply della migration in Supabase.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock Redis SDK (Upstash) ────────────────────────────────────────────
vi.mock("@/lib/kv/sdk", () => ({
  getRedisClient: vi.fn(async () => null),
}));

// ─── Mock Drizzle DB ─────────────────────────────────────────────────────
const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/db/drizzle", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// ─── Mock getUser ────────────────────────────────────────────────────────
const mockGetUser = vi.fn();
vi.mock("@/lib/db/queries", () => ({
  getUser: () => mockGetUser(),
}));

// ─── Mock app settings ───────────────────────────────────────────────────
vi.mock("@/lib/db/settings-queries", () => ({
  getAppSettings: vi.fn(async () => ({})),
}));

// ─── Mock posts blocks service (isBlockedBetween) ────────────────────────
const mockIsBlockedBetween = vi.fn();
vi.mock("@/lib/modules/posts/services/blocks", () => ({
  isBlockedBetween: (...args: unknown[]) => mockIsBlockedBetween(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── follows-cache ───────────────────────────────────────────────────────

describe("follows-cache L1 + invalidate", () => {
  it("returns Set vuoto se DB ritorna []", async () => {
    mockExecute.mockResolvedValueOnce([]);
    const { getFollowingSet, __resetLocalFollowingCacheForTests } = await import(
      "@/lib/modules/social-graph/services/follows-cache"
    );
    __resetLocalFollowingCacheForTests();

    const set = await getFollowingSet("viewer-1");
    expect(set.size).toBe(0);
  });

  it("cache locale evita seconda DB call per stesso viewer", async () => {
    mockExecute.mockResolvedValueOnce([
      { id: "a" },
      { id: "b" },
    ]);
    const { getFollowingSet, __resetLocalFollowingCacheForTests } = await import(
      "@/lib/modules/social-graph/services/follows-cache"
    );
    __resetLocalFollowingCacheForTests();

    const set1 = await getFollowingSet("viewer-cache");
    expect(set1.has("a")).toBe(true);
    expect(set1.has("b")).toBe(true);

    // Seconda call: NON deve invocare DB (cache locale L1 hit).
    const dbCallsBefore = mockExecute.mock.calls.length;
    const set2 = await getFollowingSet("viewer-cache");
    expect(set2.size).toBe(2);
    expect(mockExecute.mock.calls.length).toBe(dbCallsBefore);
  });

  it("invalidateFollowingSet svuota L1 → prossimo read riCarica da DB", async () => {
    mockExecute.mockResolvedValueOnce([{ id: "a" }]);
    const { getFollowingSet, invalidateFollowingSet, __resetLocalFollowingCacheForTests } =
      await import("@/lib/modules/social-graph/services/follows-cache");
    __resetLocalFollowingCacheForTests();

    await getFollowingSet("viewer-inv");
    await invalidateFollowingSet("viewer-inv");

    mockExecute.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    const set2 = await getFollowingSet("viewer-inv");
    expect(set2.size).toBe(2);
  });

  it("DB error → Set vuoto, never-throw", async () => {
    mockExecute.mockRejectedValueOnce(new Error("conn lost"));
    const { getFollowingSet, __resetLocalFollowingCacheForTests } = await import(
      "@/lib/modules/social-graph/services/follows-cache"
    );
    __resetLocalFollowingCacheForTests();

    const set = await getFollowingSet("viewer-err");
    expect(set.size).toBe(0);
  });
});

// ─── queries: SQL fragment ───────────────────────────────────────────────

describe("postsFromFollowingFragment", () => {
  it("ritorna undefined su empty set (no-op nel where)", async () => {
    const { postsFromFollowingFragment } = await import(
      "@/lib/modules/social-graph/queries"
    );
    const fakeColumn = {} as import("drizzle-orm").Column;
    const frag = postsFromFollowingFragment(new Set<string>(), fakeColumn);
    expect(frag).toBeUndefined();
  });

  it("ritorna SQL fragment su set non vuoto", async () => {
    const { postsFromFollowingFragment } = await import(
      "@/lib/modules/social-graph/queries"
    );
    const fakeColumn = { name: "author_id" } as unknown as import("drizzle-orm").Column;
    const frag = postsFromFollowingFragment(new Set(["u1", "u2"]), fakeColumn);
    expect(frag).toBeDefined();
  });
});

// ─── actions: gate logic ──────────────────────────────────────────────────

describe("followUserAction — gates", () => {
  it("unauthenticated → error code unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const { followUserAction } = await import(
      "@/lib/modules/social-graph/actions"
    );
    const res = await followUserAction("target-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("unauthenticated");
  });

  it("self-follow → error code self_follow (no DB write)", async () => {
    mockGetUser.mockResolvedValueOnce({ id: "user-self" });
    const { followUserAction } = await import(
      "@/lib/modules/social-graph/actions"
    );
    const res = await followUserAction("user-self");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("self_follow");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("unfollowUserAction — gates", () => {
  it("unauthenticated → error code unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const { unfollowUserAction } = await import(
      "@/lib/modules/social-graph/actions"
    );
    const res = await unfollowUserAction("target-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("unauthenticated");
  });

  it("self-unfollow → error code self_follow (no DB write)", async () => {
    mockGetUser.mockResolvedValueOnce({ id: "user-self" });
    const { unfollowUserAction } = await import(
      "@/lib/modules/social-graph/actions"
    );
    const res = await unfollowUserAction("user-self");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("self_follow");
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
