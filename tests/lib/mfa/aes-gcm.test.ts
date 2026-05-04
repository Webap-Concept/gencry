// @vitest-environment node
//
// Test per lib/crypto/aes-gcm.ts. L'env "node" è necessario per usare
// node:crypto (createCipheriv/createDecipheriv).

import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";

vi.mock("server-only", () => ({}));

describe("aes-gcm", () => {
  it("round-trip preserva la stringa originale", async () => {
    const { encryptStringRaw, decryptStringRaw } = await import(
      "@/lib/crypto/aes-gcm"
    );
    const key = randomBytes(32);
    const plain = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // tipico secret base32
    const enc = encryptStringRaw(plain, key);
    expect(enc.ciphertext).not.toContain(plain);
    expect(decryptStringRaw(enc, key)).toBe(plain);
  });

  it("ciphertext + iv + tag sono base64 validi", async () => {
    const { encryptStringRaw } = await import("@/lib/crypto/aes-gcm");
    const key = randomBytes(32);
    const enc = encryptStringRaw("hello world", key);
    expect(Buffer.from(enc.ciphertext, "base64").length).toBeGreaterThan(0);
    expect(Buffer.from(enc.iv, "base64").length).toBe(12);
    expect(Buffer.from(enc.tag, "base64").length).toBe(16);
  });

  it("due encrypt dello stesso plaintext producono iv diversi", async () => {
    const { encryptStringRaw } = await import("@/lib/crypto/aes-gcm");
    const key = randomBytes(32);
    const a = encryptStringRaw("same input", key);
    const b = encryptStringRaw("same input", key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("decrypt con tag manomesso fallisce", async () => {
    const { encryptStringRaw, decryptStringRaw } = await import(
      "@/lib/crypto/aes-gcm"
    );
    const key = randomBytes(32);
    const enc = encryptStringRaw("secret-payload", key);

    const tagBytes = Buffer.from(enc.tag, "base64");
    tagBytes[0] = tagBytes[0]! ^ 0xff;
    const tampered = { ...enc, tag: tagBytes.toString("base64") };

    expect(() => decryptStringRaw(tampered, key)).toThrow();
  });

  it("decrypt con ciphertext manomesso fallisce", async () => {
    const { encryptStringRaw, decryptStringRaw } = await import(
      "@/lib/crypto/aes-gcm"
    );
    const key = randomBytes(32);
    const enc = encryptStringRaw("secret-payload", key);

    const ctBytes = Buffer.from(enc.ciphertext, "base64");
    ctBytes[0] = ctBytes[0]! ^ 0xff;
    const tampered = { ...enc, ciphertext: ctBytes.toString("base64") };

    expect(() => decryptStringRaw(tampered, key)).toThrow();
  });

  it("decrypt con chiave sbagliata fallisce", async () => {
    const { encryptStringRaw, decryptStringRaw } = await import(
      "@/lib/crypto/aes-gcm"
    );
    const k1 = randomBytes(32);
    const k2 = randomBytes(32);
    const enc = encryptStringRaw("secret", k1);
    expect(() => decryptStringRaw(enc, k2)).toThrow();
  });

  it("rifiuta chiave di lunghezza diversa da 32 byte", async () => {
    const { encryptStringRaw } = await import("@/lib/crypto/aes-gcm");
    expect(() => encryptStringRaw("x", randomBytes(16))).toThrow(/32 bytes/);
  });

  it("encryptSecret usa MFA_ENCRYPTION_KEY dall'env", async () => {
    const key = randomBytes(32).toString("base64");
    process.env.MFA_ENCRYPTION_KEY = key;

    vi.resetModules();
    const { encryptSecret, decryptSecret } = await import(
      "@/lib/crypto/aes-gcm"
    );
    const enc = encryptSecret("ciao");
    expect(decryptSecret(enc)).toBe("ciao");
  });

  it("encryptSecret throwa se MFA_ENCRYPTION_KEY non e' settato", async () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    vi.resetModules();
    const { encryptSecret } = await import("@/lib/crypto/aes-gcm");
    expect(() => encryptSecret("x")).toThrow(/MFA_ENCRYPTION_KEY/);
  });
});
