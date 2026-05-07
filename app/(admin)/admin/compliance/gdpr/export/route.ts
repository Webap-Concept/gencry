import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { consentRecords, users } from "@/lib/db/schema";
import { can } from "@/lib/rbac/can";
import { and, desc, eq, lt, or } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
 * Quante righe leggiamo per ogni iterazione del cursor. 1000 è un compromesso
 * tra round-trip DB e memoria per batch (1000 righe ~ 200-400 KB di stringa
 * CSV, contenuto in qualunque connection pool senza pressione GC).
 */
const PAGE_SIZE = 1000;

/** RFC 4180 — escape per CSV. */
function csvEscape(value: string | null | undefined): string {
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

type Cursor = { createdAt: Date; id: string } | null;

type Row = {
  id: string;
  createdAt: Date;
  userId: string | null;
  userEmail: string | null;
  consentType: string;
  action: string;
  policyVersion: string | null;
  policyTextHash: string | null;
  ip: string | null;
  ipStrategy: string | null;
  userAgent: string | null;
  locale: string | null;
  metadata: unknown;
};

/**
 * Una pagina del cursor. Ordine stabile su (created_at DESC, id DESC) — l'id
 * è UUID, quindi univoco anche a parità di timestamp (collisioni teoriche
 * sotto carico). Il cursor è la coppia (createdAt, id) dell'ULTIMA riga
 * ritornata dalla pagina precedente.
 */
async function fetchPage(cursor: Cursor): Promise<Row[]> {
  const where = cursor
    ? // Tuple comparison: (createdAt, id) < (cursor.createdAt, cursor.id)
      // espressa come (createdAt < cur.createdAt) OR (createdAt == cur.createdAt AND id < cur.id)
      or(
        lt(consentRecords.createdAt, cursor.createdAt),
        and(
          eq(consentRecords.createdAt, cursor.createdAt),
          lt(consentRecords.id, cursor.id),
        ),
      )
    : undefined;

  return db
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
    .where(where)
    .orderBy(desc(consentRecords.createdAt), desc(consentRecords.id))
    .limit(PAGE_SIZE);
}

function rowToCsvLine(r: Row): string {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const source = typeof meta.source === "string" ? meta.source : "";
  return [
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
  ].join(",");
}

/**
 * Export full del consent ledger come CSV streamato.
 *
 * Stream con cursor pagination: nessuna SELECT senza LIMIT, nessun array
 * intero in memoria. Reggiamo qualche milione di righe senza timeout né
 * picchi di memoria — l'unico vincolo diventa il throughput della
 * connection e la velocità del client.
 *
 * Riservato ad admin con `admin:gdpr` (o super-admin).
 */
export async function GET() {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!user.isAdmin && !(await can(user, "admin:gdpr"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // BOM UTF-8 → Excel apre il CSV col charset corretto su Windows.
        controller.enqueue(encoder.encode("﻿"));
        controller.enqueue(encoder.encode(CSV_HEADER.join(",") + "\r\n"));

        let cursor: Cursor = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const rows: Row[] = await fetchPage(cursor);
          if (rows.length === 0) break;

          // Costruisci il batch in una sola allocazione di stringa: meno
          // pressure sull'allocatore rispetto a N enqueue separati.
          const chunk = rows.map(rowToCsvLine).join("\r\n") + "\r\n";
          controller.enqueue(encoder.encode(chunk));

          if (rows.length < PAGE_SIZE) break;
          const last = rows[rows.length - 1];
          cursor = { createdAt: last.createdAt, id: last.id };
        }
      } catch (err) {
        // Se il DB fallisce in mezzo, chiudiamo lo stream con error: il
        // browser interrompe il download e l'admin se ne accorge (file
        // troncato/corrotto). Loggiamo per la diagnostica server-side.
        console.error("[gdpr/export] stream error:", err);
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="consent-ledger-${todayStamp()}.csv"`,
      "Cache-Control": "no-store",
      // Hint per i proxy: non bufferizzare lo stream.
      "X-Accel-Buffering": "no",
    },
  });
}
