// @vitest-environment node

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("recovery-codes", () => {
  it("genera 10 codici nel formato xxxxx-xxxxx", async () => {
    const { generateRecoveryCodes } = await import(
      "@/lib/auth/mfa/recovery-codes"
    );
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    for (const c of codes) {
      expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    }
  });

  it("i 10 codici sono tutti diversi (entropia OK)", async () => {
    const { generateRecoveryCodes } = await import(
      "@/lib/auth/mfa/recovery-codes"
    );
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
  });

  it("non usa caratteri ambigui (0, o, 1, i, l)", async () => {
    const { generateRecoveryCodes } = await import(
      "@/lib/auth/mfa/recovery-codes"
    );
    // Genera molti codici per coprire l'alfabeto.
    const allCodes = Array.from({ length: 50 }, () => generateRecoveryCodes()).flat();
    const joined = allCodes.join("");
    expect(joined).not.toMatch(/[01ilo]/);
  });

  it("normalizeRecoveryCode tollera maiuscole, spazi e dash mancanti", async () => {
    const { normalizeRecoveryCode } = await import(
      "@/lib/auth/mfa/recovery-codes"
    );
    expect(normalizeRecoveryCode("ABCDE-FGHIJ")).toBe("abcde-fghij");
    expect(normalizeRecoveryCode("abcdefghij")).toBe("abcde-fghij");
    expect(normalizeRecoveryCode("  abcde fghij  ")).toBe("abcde-fghij");
    expect(normalizeRecoveryCode("ABCDE-fghij\n")).toBe("abcde-fghij");
  });

  it("hashRecoveryCode + compareRecoveryCode round-trip", async () => {
    const { hashRecoveryCode, compareRecoveryCode } = await import(
      "@/lib/auth/mfa/recovery-codes"
    );
    const code = "abcde-fghij";
    const hashed = await hashRecoveryCode(code);
    expect(hashed).not.toBe(code);
    expect(hashed.startsWith("$2")).toBe(true);
    expect(await compareRecoveryCode(code, hashed)).toBe(true);
    expect(await compareRecoveryCode("wrong-input", hashed)).toBe(false);
  });

  it("due hash dello stesso codice sono diversi (salt)", async () => {
    const { hashRecoveryCode } = await import(
      "@/lib/auth/mfa/recovery-codes"
    );
    const code = "abcde-fghij";
    const h1 = await hashRecoveryCode(code);
    const h2 = await hashRecoveryCode(code);
    expect(h1).not.toBe(h2);
  });
});
