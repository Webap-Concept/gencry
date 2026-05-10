// lib/auth/ip-rules.ts
//
// Valutazione IP rules con costo ~zero per request:
//   1. Loader DB cached con `unstable_cache` (TTL 30s + tag invalidation)
//   2. Match CIDR fatto in memoria via BigInt bitmask (microsecondi)
//   3. Hit counter scritto fire-and-forget su Redis (mai sincrono)
//
// Pattern usage:
//   - rate-limit.ts → evaluateIpForAuth() prima di tutto, allow short-circuita
//     completamente il bruteforce
//   - proxy.ts → evaluateIpForAdmin() SOLO se admin.ip_lockdown_enabled = true
//     (toggle OFF = zero overhead, default)
//
// Allow batte deny (stile UNIX). Una regola allow trovata short-circuita;
// una deny è ricordata e ritornata solo dopo aver scansionato tutto il set
// (così un allow successivo nello stesso scope ha la priorità).

import "server-only";

import { db } from "@/lib/db/drizzle";
import { ipRules } from "@/lib/db/schema";
import { unstable_cache, updateTag } from "next/cache";
import { sql } from "drizzle-orm";
import { redisCmd } from "./rate-limit-redis";

export const IP_RULES_TAG = "ip-rules";

export type IpRuleScope = "auth" | "admin" | "all";
export type IpRuleAction = "allow" | "deny";

type LoadedIpRule = {
  id: number;
  ip: string; // singolo IP o CIDR ("10.0.0.0/8", "2a01::/32", ecc.)
  action: IpRuleAction;
  scope: IpRuleScope;
};

// ─── Loader cached ──────────────────────────────────────────────────────────

const loadActiveRules = unstable_cache(
  async (): Promise<LoadedIpRule[]> => {
    const rows = await db
      .select({
        id: ipRules.id,
        ip: ipRules.ip,
        action: ipRules.action,
        scope: ipRules.scope,
      })
      .from(ipRules)
      .where(sql`${ipRules.expiresAt} IS NULL OR ${ipRules.expiresAt} > NOW()`);
    // Cast sicuro: i CHECK constraint a livello DB garantiscono i valori
    // permessi; la varchar non ha tipi più stretti in drizzle.
    return rows as LoadedIpRule[];
  },
  ["ip-rules-active"],
  { revalidate: 30, tags: [IP_RULES_TAG] },
);

/**
 * Invalida la cache dopo una mutation (add/remove/extend/toggle).
 * Chiamare dopo OGNI modifica di `ip_rules` o di `admin.ip_lockdown_enabled`.
 *
 * Next 16: `updateTag` è la nuova API single-arg dentro Server Actions; ha
 * semantica read-your-own-writes (la prossima lettura nello stesso
 * routing pass vede già il nuovo valore). Per i Route Handler GET (es. cron)
 * NON è disponibile, ma lì non serve invalidare: la TTL 30s del cache copre.
 */
export function invalidateIpRulesCache(): void {
  updateTag(IP_RULES_TAG);
}

// ─── CIDR matching in memoria ───────────────────────────────────────────────
//
// Strategia: convertiamo IP+CIDR in BigInt e applichiamo bitmask. Funziona
// uniformemente per v4 (32 bit) e v6 (128 bit). v4-mapped v6 ("::ffff:1.2.3.4")
// gestito espandendo a v4 e ri-confrontando. Niente lib esterna — il parser
// è ~50 righe.

function parseV4(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    result = (result << 8n) | BigInt(n);
  }
  return result;
}

function parseV6(ip: string): bigint | null {
  // v4-mapped: "::ffff:192.168.1.1" → riscrivi le ultime 32 bit
  const v4Suffix = /:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  let s = ip;
  if (v4Suffix) {
    const v4 = parseV4(v4Suffix[1]);
    if (v4 === null) return null;
    const hi = (v4 >> 16n) & 0xffffn;
    const lo = v4 & 0xffffn;
    s = ip.slice(0, v4Suffix.index) + ":" + hi.toString(16) + ":" + lo.toString(16);
  }

  // Espandi "::" in zeri necessari
  const dcIdx = s.indexOf("::");
  let head: string[];
  let tail: string[];
  if (dcIdx >= 0) {
    const headStr = s.slice(0, dcIdx);
    const tailStr = s.slice(dcIdx + 2);
    head = headStr === "" ? [] : headStr.split(":");
    tail = tailStr === "" ? [] : tailStr.split(":");
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    head = [...head, ...new Array(fill).fill("0"), ...tail];
  } else {
    head = s.split(":");
  }
  if (head.length !== 8) return null;

  let result = 0n;
  for (const part of head) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
    result = (result << 16n) | BigInt(parseInt(part, 16));
  }
  return result;
}

type ParsedIp = { value: bigint; isV4: boolean };

function parseIp(ip: string): ParsedIp | null {
  if (ip.includes(":")) {
    const v = parseV6(ip);
    return v === null ? null : { value: v, isV4: false };
  }
  const v = parseV4(ip);
  return v === null ? null : { value: v, isV4: true };
}

type ParsedCidr = { value: bigint; prefix: number; isV4: boolean };

function parseCidr(cidr: string): ParsedCidr | null {
  const slash = cidr.indexOf("/");
  if (slash < 0) {
    const ip = parseIp(cidr);
    if (!ip) return null;
    return { value: ip.value, prefix: ip.isV4 ? 32 : 128, isV4: ip.isV4 };
  }
  const ipPart = cidr.slice(0, slash);
  const prefStr = cidr.slice(slash + 1);
  if (!/^\d+$/.test(prefStr)) return null;
  const prefix = Number(prefStr);
  const ip = parseIp(ipPart);
  if (!ip) return null;
  const max = ip.isV4 ? 32 : 128;
  if (prefix < 0 || prefix > max) return null;
  return { value: ip.value, prefix, isV4: ip.isV4 };
}

function ipMatches(ip: ParsedIp, cidr: ParsedCidr): boolean {
  if (ip.isV4 !== cidr.isV4) return false;
  const total = cidr.isV4 ? 32 : 128;
  if (cidr.prefix === total) return ip.value === cidr.value;
  const shift = BigInt(total - cidr.prefix);
  return ip.value >> shift === cidr.value >> shift;
}

// ─── API pubblica ───────────────────────────────────────────────────────────

export type IpEvaluation =
  | { decision: "allow"; ruleId: number }
  | { decision: "deny"; ruleId: number }
  | { decision: "no-rule"; ruleId: null };

const NO_RULE: IpEvaluation = { decision: "no-rule", ruleId: null };

async function evaluate(
  clientIp: string | null,
  scopes: ReadonlyArray<IpRuleScope>,
): Promise<IpEvaluation> {
  if (!clientIp) return NO_RULE;
  const parsed = parseIp(clientIp);
  if (!parsed) return NO_RULE;

  const rules = await loadActiveRules();
  if (rules.length === 0) return NO_RULE;

  // Allow batte deny: scansiona tutto, ricorda l'eventuale deny match,
  // ritorna allow non appena trovato.
  let denyId: number | null = null;
  for (const r of rules) {
    if (!scopes.includes(r.scope)) continue;
    const cidr = parseCidr(r.ip);
    if (!cidr) continue;
    if (!ipMatches(parsed, cidr)) continue;
    if (r.action === "allow") return { decision: "allow", ruleId: r.id };
    if (r.action === "deny" && denyId === null) denyId = r.id;
  }
  if (denyId !== null) return { decision: "deny", ruleId: denyId };
  return NO_RULE;
}

const AUTH_SCOPES = ["auth", "all"] as const;
const ADMIN_SCOPES = ["admin", "all"] as const;

/** Valuta IP per il layer auth (signup/login/availability). */
export function evaluateIpForAuth(clientIp: string | null): Promise<IpEvaluation> {
  return evaluate(clientIp, AUTH_SCOPES);
}

/** Valuta IP per il layer admin (proxy.ts, lockdown). */
export function evaluateIpForAdmin(clientIp: string | null): Promise<IpEvaluation> {
  return evaluate(clientIp, ADMIN_SCOPES);
}

// ─── Hit counter (fire-and-forget) ──────────────────────────────────────────

/**
 * Incrementa il counter Redis di una regola. Mai await-ato dal caller —
 * se Redis è down il counter resta a zero, accettabile (è solo analytics).
 * Il cron `ip-rules-flush-hits` (da implementare) leggerà i counter e li
 * persisterà in DB periodicamente.
 */
export function recordIpRuleHit(ruleId: number): void {
  void redisCmd(["INCR", `ip-rule:hits:${ruleId}`]).catch(() => {
    // Drop silente: counter è analytics, MAI rallentare la request reale.
  });
}

// ─── Helpers per le actions / cleanup ───────────────────────────────────────

/** Riscrive l'IP raw (o lo lascia null) come ricevuto dal proxy/headers. */
export function isValidIpOrCidr(input: string): boolean {
  return parseCidr(input) !== null;
}

/** Esposto per i test. */
export const __internals = { parseIp, parseCidr, ipMatches };
