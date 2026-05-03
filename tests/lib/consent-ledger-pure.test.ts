import { describe, expect, it } from "vitest";
import {
  applyConsentLogPolicy,
  maskLastOctet,
  transformIp,
} from "@/lib/account/consent-ledger-pure";

// Hash mock deterministico: replica le proprietà che ci interessano (input
// uguale → output uguale, input diverso → output diverso) senza tirare
// dentro node:crypto nei test puri.
const fakeHash = (s: string) => `h(${s})`;

describe("transformIp — strategy=full", () => {
  it("preserva l'IPv4 raw", () => {
    expect(transformIp("192.168.1.42", "full", fakeHash)).toBe("192.168.1.42");
  });

  it("preserva l'IPv6 raw", () => {
    expect(transformIp("2001:db8::1", "full", fakeHash)).toBe("2001:db8::1");
  });

  it("tronca a 64 caratteri (pari alla colonna DB)", () => {
    const long = "x".repeat(120);
    const out = transformIp(long, "full", fakeHash);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(64);
  });

  it("ritorna null su stringa vuota / whitespace", () => {
    expect(transformIp("", "full", fakeHash)).toBeNull();
    expect(transformIp("   ", "full", fakeHash)).toBeNull();
  });
});

describe("transformIp — strategy=hash_only", () => {
  it("hasha l'IP intero", () => {
    expect(transformIp("192.168.1.42", "hash_only", fakeHash)).toBe(
      "h(192.168.1.42)",
    );
  });

  it("trim+hash così whitespace ai bordi non produce hash distinti", () => {
    expect(transformIp("  10.0.0.1  ", "hash_only", fakeHash)).toBe(
      "h(10.0.0.1)",
    );
  });
});

describe("maskLastOctet — IPv4", () => {
  it("azzera il quarto octet", () => {
    expect(maskLastOctet("192.168.1.42")).toBe("192.168.1.0");
    expect(maskLastOctet("10.0.0.1")).toBe("10.0.0.0");
    expect(maskLastOctet("8.8.8.8")).toBe("8.8.8.0");
  });

  it("rifiuta IPv4 invalidi", () => {
    expect(maskLastOctet("999.0.0.1")).toBeNull();
    expect(maskLastOctet("1.2.3")).toBeNull();
    expect(maskLastOctet("1.2.3.4.5")).toBeNull();
  });

  it("gestisce IPv4-mapped IPv6 (::ffff:a.b.c.d)", () => {
    expect(maskLastOctet("::ffff:192.0.2.1")).toBe("::ffff:192.0.2.0");
  });
});

describe("maskLastOctet — IPv6", () => {
  it("riduce un IPv6 fully-spelled al /64 prefix", () => {
    expect(maskLastOctet("2001:db8:abcd:1234:5678:9abc:def0:1111")).toBe(
      "2001:db8:abcd:1234::",
    );
  });

  it("espande '::' prima di mascherare", () => {
    expect(maskLastOctet("2001:db8::1")).toBe("2001:db8:0:0::");
    expect(maskLastOctet("fe80::1")).toBe("fe80:0:0:0::");
    expect(maskLastOctet("::1")).toBe("0:0:0:0::");
  });

  it("rifiuta IPv6 con doppio '::'", () => {
    expect(maskLastOctet("2001::db8::1")).toBeNull();
  });

  it("rifiuta gruppi non-hex", () => {
    expect(maskLastOctet("2001:db8:zzzz:1::1")).toBeNull();
  });

  it("normalizza la case (output sempre lowercase)", () => {
    expect(maskLastOctet("2001:DB8:ABCD:1234::")).toBe("2001:db8:abcd:1234::");
  });
});

describe("applyConsentLogPolicy", () => {
  const baseInput = {
    ip: "192.168.1.42",
    userAgent: "Mozilla/5.0 ...",
    policyText: "Lorem ipsum dolor sit amet",
    captureIp: true,
    captureUa: true,
    hashPolicy: true,
    ipStrategy: "full" as const,
    hashFn: fakeHash,
  };

  it("happy path: applica tutte le strategie", () => {
    const out = applyConsentLogPolicy(baseInput);
    expect(out.ip).toBe("192.168.1.42");
    expect(out.userAgent).toBe("Mozilla/5.0 ...");
    expect(out.policyTextHash).toBe("h(Lorem ipsum dolor sit amet)");
    expect(out.appliedStrategy).toBe("full");
  });

  it("captureIp=false → ip null indipendentemente dall'input", () => {
    const out = applyConsentLogPolicy({ ...baseInput, captureIp: false });
    expect(out.ip).toBeNull();
    // appliedStrategy resta dichiarato anche se non l'abbiamo applicato.
    expect(out.appliedStrategy).toBe("full");
  });

  it("captureUa=false → userAgent null", () => {
    const out = applyConsentLogPolicy({ ...baseInput, captureUa: false });
    expect(out.userAgent).toBeNull();
  });

  it("hashPolicy=false → policyTextHash null", () => {
    const out = applyConsentLogPolicy({ ...baseInput, hashPolicy: false });
    expect(out.policyTextHash).toBeNull();
  });

  it("policyText null → policyTextHash null anche con hashPolicy=true", () => {
    const out = applyConsentLogPolicy({ ...baseInput, policyText: null });
    expect(out.policyTextHash).toBeNull();
  });

  it("ip strategy=mask_last_octet trasforma 192.168.1.42 → 192.168.1.0", () => {
    const out = applyConsentLogPolicy({
      ...baseInput,
      ipStrategy: "mask_last_octet",
    });
    expect(out.ip).toBe("192.168.1.0");
    expect(out.appliedStrategy).toBe("mask_last_octet");
  });

  it("ip strategy=hash_only produce sha256 fittizio", () => {
    const out = applyConsentLogPolicy({
      ...baseInput,
      ipStrategy: "hash_only",
    });
    expect(out.ip).toBe("h(192.168.1.42)");
  });

  it("user agent troncato a 512 char", () => {
    const long = "U".repeat(700);
    const out = applyConsentLogPolicy({ ...baseInput, userAgent: long });
    expect(out.userAgent!.length).toBe(512);
  });
});
