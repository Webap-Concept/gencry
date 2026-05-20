// app/(admin)/admin/access/waiting-list/page.tsx
//
// Pagina admin readonly per la waiting list della landing pre-lancio.
// Tabella semplice ordinata DESC su created_at + count totale + bottone
// "Esporta CSV" (route handler `./export/route.ts`).
//
// RBAC: `admin:users` (chi gestisce utenti vede anche la lista pre-lancio).
// Il layout di access/ ha già la guard `admin:access` come umbrella.
//
// Niente paginazione: la waiting list ha ordine di grandezza ~migliaia,
// la tabella regge benissimo un singolo SELECT. Quando supereremo
// 10k iscritti aggiungeremo cursor pagination.

import { getAdminPath } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { waitingList } from "@/lib/db/schema";
import { MailPlus } from "lucide-react";
import type { Metadata } from "next";
import { desc, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { ExportCsvButton } from "./_components/export-csv-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.access.waitingList");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

function formatDate(d: Date, locale: string): string {
  return d.toLocaleString(locale === "en" ? "en-US" : "it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function WaitingListPage() {
  const t = await getTranslations("admin.access.waitingList");

  // Singolo SELECT: total via COUNT(*) sulla stessa query (no doppio round trip).
  // Drizzle non ha un helper "select with count" semplice, faccio i due in
  // parallelo per non pagare 2x la latency.
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: waitingList.id,
        email: waitingList.email,
        ipAddress: waitingList.ipAddress,
        createdAt: waitingList.createdAt,
      })
      .from(waitingList)
      .orderBy(desc(waitingList.createdAt)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(waitingList),
  ]);

  const exportHref = `${await getAdminPath("users-waiting-list")}/export`;
  // Locale per il rendering delle date. La page server resolva via cookie
  // di next-intl; in produzione getTranslations è già locale-aware, qui
  // riusiamo 'it' come default per consistenza con il resto dell'admin.
  const locale = "it";

  return (
    <div>
      <AdminSectionHeader
        icon={MailPlus}
        breadcrumbLabel={t("pageTitle")}
        subtitle={t("pageSubtitle")}
        actionSlot={
          rows.length > 0 ? (
            <ExportCsvButton href={exportHref} label={t("exportCsv")} />
          ) : null
        }
      />

      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
      >
        <div
          className="px-4 py-3 text-xs uppercase tracking-wide"
          style={{
            color: "var(--admin-text-faint)",
            borderBottom: "1px solid var(--admin-divider)",
          }}
        >
          {t("totalCount", { count })}
        </div>

        {rows.length === 0 ? (
          <div
            className="px-4 py-10 text-center text-sm"
            style={{ color: "var(--admin-text-muted)" }}
          >
            {t("emptyState")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--admin-divider)",
                  color: "var(--admin-text-faint)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                <th className="text-left px-4 py-2.5 font-medium">
                  {t("colEmail")}
                </th>
                <th className="text-left px-4 py-2.5 font-medium">
                  {t("colIp")}
                </th>
                <th className="text-left px-4 py-2.5 font-medium">
                  {t("colDate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: "1px solid var(--admin-divider)" }}
                >
                  <td
                    className="px-4 py-2.5"
                    style={{ color: "var(--admin-text)" }}
                  >
                    {row.email}
                  </td>
                  <td
                    className="px-4 py-2.5 font-mono text-xs"
                    style={{ color: "var(--admin-text-muted)" }}
                  >
                    {row.ipAddress ?? "—"}
                  </td>
                  <td
                    className="px-4 py-2.5"
                    style={{ color: "var(--admin-text-muted)" }}
                  >
                    {formatDate(row.createdAt, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
