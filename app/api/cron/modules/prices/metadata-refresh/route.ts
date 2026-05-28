import { isAuthorizedCron } from "@/lib/modules/prices/cron-auth";
import { PRICES_DATA_TAG, PRICES_HEALTH_TAG } from "@/lib/modules/prices/queries";
import { runMetadataRefresh } from "@/lib/modules/prices/services/metadata-refresh";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runMetadataRefresh();
    if (result.ok) {
      // market_cap_rank cambia l'ordinamento di mercato-table e affini;
      // sparkline alimenta le mini-card. Invalidiamo entrambi i tag.
      revalidateTag(PRICES_DATA_TAG, "max");
      revalidateTag(PRICES_HEALTH_TAG, "max");
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
