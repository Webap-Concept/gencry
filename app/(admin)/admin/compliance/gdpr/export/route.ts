import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { consentRecords, users } from "@/lib/db/schema";
import { can } from "@/lib/rbac/can";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CSV_HEADER = [
  "id",
  "created_at",
  "user_id",
  "user_email",
  "consent_type",
  "action",
  "policy_version",
  "policy_text_hash",
  "ip",
  "ip_strategy",
  "user_agent",
  "locale",
  "source",
] as const;

/**
 * RFC 4180 — escape per CSV: avvolgi in virgolette se contiene virgole,
 * virgolette o newline; raddoppia le virgolette interne.
 */
function csvEscape(value: string | null): string {
  if (value === null || value === undefined) return "";
  const needsQuoting = /[",\r\n]/.test(value);
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Export full del consent ledger come CSV. Riservato ad admin con
 * `admin:gdpr` (o super-admin). Non paginato — un'app standard ha
 * decine/centinaia di record, restano nei limiti di una response Next
 * normale. Quando il volume cresce, valutare streaming via ReadableStream
 * o filtri per range date.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!user.isAdmin && !(await can(user, "admin:gdpr"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await db
    .select({
      id: consentRecords.id,
      createdAt: consentRecords.createdAt,
      userId: consentRecords.userId,
      userEmail: users.email,
      consentType: consentRecords.consentType,
      action: consentRecords.action,
      policyVersion: consentRecords.policyVersion,
      policyTextHash: consentRecords.policyTextHash,
      ip: consentRecords.ip,
      ipStrategy: consentRecords.ipStrategy,
      userAgent: consentRecords.userAgent,
      locale: consentRecords.locale,
      metadata: consentRecords.metadata,
    })
    .from(consentRecords)
    .leftJoin(users, eq(consentRecords.userId, users.id))
    .orderBy(desc(consentRecords.createdAt));

  const lines: string[] = [CSV_HEADER.join(",")];
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const source = typeof meta.source === "string" ? meta.source : "";
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.createdAt.toISOString()),
        csvEscape(r.userId),
        csvEscape(r.userEmail),
        csvEscape(r.consentType),
        csvEscape(r.action),
        csvEscape(r.policyVersion),
        csvEscape(r.policyTextHash),
        csvEscape(r.ip),
        csvEscape(r.ipStrategy),
        csvEscape(r.userAgent),
        csvEscape(r.locale),
        csvEscape(source),
      ].join(","),
    );
  }

  // BOM UTF-8 in apertura → Excel rileva l'encoding correttamente quando
  // un admin apre il CSV con doppio click (default su Windows).
  const body = "﻿" + lines.join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="consent-ledger-${todayStamp()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
