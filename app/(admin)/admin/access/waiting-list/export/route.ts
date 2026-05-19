// app/(admin)/admin/access/waiting-list/export/route.ts
//
// Route handler che restituisce l'intera waiting list come text/csv.
// Header `Content-Disposition: attachment` → il browser scarica il file.
//
// RBAC: stessa guard della pagina (`admin:users`). Senza la check qui,
// chiunque conoscesse l'URL admin completo potrebbe scaricare la lista
// senza passare dalla UI.
//
// CSV minimale: id, email, ip_address, created_at (ISO). Niente delimitatori
// fancy: i campi sono o UUID, o email, o IP, o ISO date — nessuno contiene
// virgole o quote da escapare.

import { db } from "@/lib/db/drizzle";
import { waitingList } from "@/lib/db/schema";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { desc } from "drizzle-orm";
import { getUserPermissions } from "@/lib/rbac/can";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Riusa la guard standard del layout (forza redirect a sign-in se non
  // loggato o senza `admin:access`). Poi check fine-grained sul permesso
  // `admin:users` — la pagina ha la stessa permission, manteniamo la
  // coerenza.
  const user = await requireAdminSectionPage("admin:access");
  if (!user.isAdmin) {
    const perms = await getUserPermissions(user);
    if (!perms.has("admin:users")) {
      return new NextResponse("forbidden", { status: 403 });
    }
  }

  const rows = await db
    .select({
      id: waitingList.id,
      email: waitingList.email,
      ipAddress: waitingList.ipAddress,
      createdAt: waitingList.createdAt,
    })
    .from(waitingList)
    .orderBy(desc(waitingList.createdAt));

  const header = "id,email,ip_address,created_at";
  const body = rows
    .map(
      (r) =>
        `${r.id},${r.email},${r.ipAddress ?? ""},${r.createdAt.toISOString()}`,
    )
    .join("\n");
  const csv = `${header}\n${body}\n`;

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waiting-list-${stamp}.csv"`,
      // No caching: la lista cambia in continuazione.
      "Cache-Control": "no-store",
    },
  });
}
