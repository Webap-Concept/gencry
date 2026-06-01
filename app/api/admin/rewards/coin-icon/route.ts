// POST /api/admin/rewards/coin-icon
// Ritorna un presigned PUT URL per caricare l'icona GCC (branding modulo).
// Body: { mimeType: string }
import { requireAdmin } from "@/lib/rbac/guards";
import { signCoinIconPut } from "@/lib/modules/rewards/storage";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType.trim() : "";

  if (!mimeType) {
    return NextResponse.json({ error: "mimeType è richiesto" }, { status: 400 });
  }

  const result = await signCoinIconPut(mimeType);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result);
}
