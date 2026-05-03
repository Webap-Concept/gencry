// lib/sessions/suspicious/types.ts
//
// Shared types for the suspicious-sessions pipeline. Live in their own
// file so detectors / runner / UI can import without pulling Zod or DB.

import type { AlertSeverity, SuspicionReason } from "./config";

export type AlertCandidate = {
  reason: SuspicionReason;
  severity: AlertSeverity;
  /** Nullable: cross-user campaign alerts target an IP, not a session. */
  sessionId: string | null;
  /** Nullable: cross-user campaign alerts have no single user. */
  userId: string | null;
  /** Free-form payload surfaced in the UI / email digest. */
  details: Record<string, unknown>;
  /** Idempotency key — same condition → same key forever. */
  dedupKey: string;
};

/** Numeric severity for ordering / threshold filtering. */
export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function meetsThreshold(
  s: AlertSeverity,
  threshold: AlertSeverity,
): boolean {
  return SEVERITY_RANK[s] >= SEVERITY_RANK[threshold];
}

/** Coarse network identifier from an IP for "new subnet" detection.
 *  IPv4: first two octets ("192.168"). IPv6: first four hextets.
 *  Returns `null` for unparseable inputs (treated as "unknown subnet"). */
export function ipToSubnet(ip: string | null): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    // IPv6 — take the first 4 hextets (/64 prefix).
    const parts = trimmed.split(":");
    return parts.slice(0, 4).join(":") || null;
  }
  const parts = trimmed.split(".");
  if (parts.length < 2) return null;
  return `${parts[0]}.${parts[1]}`;
}
