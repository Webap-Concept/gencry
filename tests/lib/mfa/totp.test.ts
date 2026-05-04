// @vitest-environment node
//
// Test per lib/auth/mfa/totp.ts. Include i test vector RFC 6238 per
// verificare l'aderenza allo standard.

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// RFC 6238 Appendix B test vector:
//   K (ASCII)  = "12345678901234567890"  (20 byte = HMAC-SHA1 block size)
//   K (base32) = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
//   digits     = 8
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp - RFC 6238 vectors", () => {
  it.each([
    { tSec: 59, expected: "94287082" },
    { tSec: 1111111109, expected: "07081804" },
    { tSec: 1111111111, expected: "14050471" },
    { tSec: 1234567890, expected: "89005924" },
    { tSec: 2000000000, expected: "69279037" },
  ])("T=$tSec → $expected", async ({ tSec, expected }) => {
    const { verifyTotpToken } = await import("@/lib/auth/mfa/totp");
    const result = verifyTotpToken({
      secretBase32: RFC_SECRET_BASE32,
      token: expected,
      at: new Date(tSec * 1000),
      digits: 8,
    });
    expect(result.valid).toBe(true);
  });
});

describe("totp - generation/verification round-trip", () => {
  it("getCurrentTotpCode produce 6 cifre", async () => {
    const { generateTotpSecretBase32, getCurrentTotpCode } = await import(
      "@/lib/auth/mfa/totp"
    );
    const secret = generateTotpSecretBase32();
    const code = getCurrentTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("verifyTotpToken accetta il codice corrente", async () => {
    const { generateTotpSecretBase32, getCurrentTotpCode, verifyTotpToken } =
      await import("@/lib/auth/mfa/totp");
    const secret = generateTotpSecretBase32();
    const at = new Date("2025-06-15T12:00:00Z");
    const token = getCurrentTotpCode(secret, at);
    const result = verifyTotpToken({ secretBase32: secret, token, at });
    expect(result.valid).toBe(true);
  });

  it("verifyTotpToken rifiuta un codice random non valido", async () => {
    const { generateTotpSecretBase32, verifyTotpToken } = await import(
      "@/lib/auth/mfa/totp"
    );
    const secret = generateTotpSecretBase32();
    const result = verifyTotpToken({
      secretBase32: secret,
      token: "000000",
      at: new Date("2025-06-15T12:00:00Z"),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("invalid");
  });

  it("buildOtpauthUrl produce un URI otpauth:// con i parametri attesi", async () => {
    const { buildOtpauthUrl, generateTotpSecretBase32 } = await import(
      "@/lib/auth/mfa/totp"
    );
    const secret = generateTotpSecretBase32();
    const url = buildOtpauthUrl({
      secretBase32: secret,
      label: "frank@example.com",
      issuer: "GenCrypto",
    });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain("issuer=GenCrypto");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
    expect(url).toContain(`secret=${secret}`);
  });
});

describe("totp - window tolerance", () => {
  it("accetta un codice del passo precedente (window = 1)", async () => {
    const { generateTotpSecretBase32, getCurrentTotpCode, verifyTotpToken } =
      await import("@/lib/auth/mfa/totp");
    const secret = generateTotpSecretBase32();
    const now = new Date("2025-06-15T12:00:00Z");
    const prevStep = new Date(now.getTime() - 30_000);
    const token = getCurrentTotpCode(secret, prevStep);
    const result = verifyTotpToken({ secretBase32: secret, token, at: now });
    expect(result.valid).toBe(true);
  });

  it("rifiuta un codice di 2 step fa (fuori window)", async () => {
    const { generateTotpSecretBase32, getCurrentTotpCode, verifyTotpToken } =
      await import("@/lib/auth/mfa/totp");
    const secret = generateTotpSecretBase32();
    const now = new Date("2025-06-15T12:00:00Z");
    const twoStepsAgo = new Date(now.getTime() - 60_000 - 1);
    const token = getCurrentTotpCode(secret, twoStepsAgo);
    const result = verifyTotpToken({ secretBase32: secret, token, at: now });
    expect(result.valid).toBe(false);
  });
});

describe("totp - replay prevention", () => {
  it("rifiuta lo stesso codice se gia' usato (counter <= lastUsedCounter)", async () => {
    const { generateTotpSecretBase32, getCurrentTotpCode, verifyTotpToken } =
      await import("@/lib/auth/mfa/totp");
    const secret = generateTotpSecretBase32();
    const at = new Date("2025-06-15T12:00:00Z");
    const token = getCurrentTotpCode(secret, at);

    const first = verifyTotpToken({ secretBase32: secret, token, at });
    expect(first.valid).toBe(true);
    if (!first.valid) return;

    const second = verifyTotpToken({
      secretBase32: secret,
      token,
      at,
      lastUsedCounter: first.counter,
    });
    expect(second.valid).toBe(false);
    if (!second.valid) expect(second.reason).toBe("replay");
  });

  it("permette il codice del passo successivo (counter > lastUsedCounter)", async () => {
    const { generateTotpSecretBase32, getCurrentTotpCode, verifyTotpToken } =
      await import("@/lib/auth/mfa/totp");
    const secret = generateTotpSecretBase32();
    const t0 = new Date("2025-06-15T12:00:00Z");
    const t1 = new Date(t0.getTime() + 30_000);

    const tok0 = getCurrentTotpCode(secret, t0);
    const r0 = verifyTotpToken({ secretBase32: secret, token: tok0, at: t0 });
    expect(r0.valid).toBe(true);
    if (!r0.valid) return;

    const tok1 = getCurrentTotpCode(secret, t1);
    const r1 = verifyTotpToken({
      secretBase32: secret,
      token: tok1,
      at: t1,
      lastUsedCounter: r0.counter,
    });
    expect(r1.valid).toBe(true);
  });

  it("lastUsedCounter null/undefined non blocca la prima verifica", async () => {
    const { generateTotpSecretBase32, getCurrentTotpCode, verifyTotpToken } =
      await import("@/lib/auth/mfa/totp");
    const secret = generateTotpSecretBase32();
    const at = new Date("2025-06-15T12:00:00Z");
    const token = getCurrentTotpCode(secret, at);

    const r1 = verifyTotpToken({
      secretBase32: secret,
      token,
      at,
      lastUsedCounter: null,
    });
    expect(r1.valid).toBe(true);

    const r2 = verifyTotpToken({ secretBase32: secret, token, at });
    expect(r2.valid).toBe(true);
  });
});
