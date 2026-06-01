// POST /api/admin/rewards/badge-icon
// Ritorna un presigned PUT URL per caricare l'icona di un catalog item.
// Body: { itemId: string, mimeType: string }
import { requireAdmin } from "@/lib/rbac/guards";
import { signBadgeIconPut } from "@/lib/modules/rewards/storage";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const itemId   = typeof body?.itemId   === "string" ? body.itemId.trim()   : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType.trim() : "";

  if (!itemId || !mimeType) {
    return NextResponse.json({ error: "itemId e mimeType sono richiesti" }, { status: 400 });
  }

  const result = await signBadgeIconPut(itemId, mimeType);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result);
}
