/**
 * Logica pura per la trasformazione dei dati di consenso prima dell'INSERT.
 *
 * Estratta in un file senza dipendenze (no DB, no node:crypto, no settings)
 * così è testabile in isolamento. La funzione hash è iniettata: il consumer
 * server-side passa SHA-256 da node:crypto.
 */

import type { ConsentIpStrategy } from "@/lib/db/schema";

export type ConsentLogPolicyInput = {
  ip: string | null;
  userAgent: string | null;
  policyText: string | null;
  captureIp: boolean;
  captureUa: boolean;
  hashPolicy: boolean;
  ipStrategy: ConsentIpStrategy;
  /** Funzione hash iniettata (sha256 hex). */
  hashFn: (input: string) => string;
};

export type ConsentLogPolicyOutput = {
  ip: string | null;
  appliedStrategy: ConsentIpStrategy;
  userAgent: string | null;
  policyTextHash: string | null;
};

const USER_AGENT_MAX_LENGTH = 512;

export function applyConsentLogPolicy(
  input: ConsentLogPolicyInput,
): ConsentLogPolicyOutput {
  const ip =
    input.captureIp && input.ip
      ? transformIp(input.ip, input.ipStrategy, input.hashFn)
      : null;

  const userAgent =
    input.captureUa && input.userAgent
      ? input.userAgent.slice(0, USER_AGENT_MAX_LENGTH)
      : null;

  const policyTextHash =
    input.hashPolicy && input.policyText
      ? input.hashFn(input.policyText)
      : null;

  return {
    ip,
    // L'effective strategy che è stata applicata. Se captureIp=false e quindi
    // ip è null, salviamo comunque la strategy "dichiarata" — utile per
    // l'audit ("come avremmo dovuto trattare l'IP, anche se non l'abbiamo
    // catturato").
    appliedStrategy: input.ipStrategy,
    userAgent,
    policyTextHash,
  };
}

/**
 * Applica la strategy di anonimizzazione all'IP raw.
 * Ritorna null per input vuoti o non riconosciuti dopo la trasformazione.
 */
export function transformIp(
  rawIp: string,
  strategy: ConsentIpStrategy,
  hashFn: (input: string) => string,
): string | null {
  const ip = rawIp.trim();
  if (!ip) return null;

  if (strategy === "hash_only") return hashFn(ip);
  if (strategy === "full") return truncate(ip, 64);
  if (strategy === "mask_last_octet") return maskLastOctet(ip);

  // Strategia sconosciuta: fallback al comportamento più conservativo.
  return hashFn(ip);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * IPv4: maschera l'ultimo octet (es. 192.168.1.42 → 192.168.1.0)
 * IPv6: maschera gli ultimi 4 hextet a 0 (manteniamo il /64 prefix che
 *       identifica la subnet ma non l'host singolo).
 * Input non riconosciuto: ritorna null (preferiamo perdere il dato che
 *       memorizzare un IP intero quando lo strategy è "mask").
 */
export function maskLastOctet(ip: string): string | null {
  // IPv4 dotted (anche IPv4-mapped IPv6 come ::ffff:192.0.2.1 → tratta come IPv4)
  const v4Match = ip.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4Match) {
    const octets = v4Match[1].split(".");
    if (octets.length === 4 && octets.every(isV4Octet)) {
      const prefix = ip.slice(0, ip.length - v4Match[1].length);
      return `${prefix}${octets[0]}.${octets[1]}.${octets[2]}.0`;
    }
  }

  if (ip.includes(":")) {
    return maskIpv6Suffix(ip);
  }

  return null;
}

function isV4Octet(s: string): boolean {
  if (!/^\d{1,3}$/.test(s)) return false;
  const n = Number(s);
  return n >= 0 && n <= 255;
}

/**
 * Riduce un IPv6 al suo /64 prefix: prende i primi 4 gruppi non vuoti e
 * li ricompone in una notazione canonica seguita da `::`.
 * Es.  "2001:db8:abcd:1234:5678::1"  → "2001:db8:abcd:1234::"
 *      "fe80::1"                     → "fe80::"
 *      "::1"                         → "::"
 */
function maskIpv6Suffix(ip: string): string | null {
  // Espande "::" per contare correttamente i gruppi.
  const parts = ip.split("::");
  if (parts.length > 2) return null; // formato invalido (più di un "::")

  let groups: string[];
  if (parts.length === 2) {
    const left = parts[0] === "" ? [] : parts[0].split(":");
    const right = parts[1] === "" ? [] : parts[1].split(":");
    const fillCount = 8 - left.length - right.length;
    if (fillCount < 0) return null;
    groups = [...left, ...Array<string>(fillCount).fill("0"), ...right];
  } else {
    groups = ip.split(":");
  }

  if (groups.length !== 8) return null;
  if (!groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return null;

  const prefix = groups.slice(0, 4).map((g) => g.toLowerCase());
  return `${prefix.join(":")}::`;
}
