import { isAuthorizedCron } from "@/lib/modules/prices/cron-auth";
import { PRICES_DATA_TAG } from "@/lib/modules/prices/queries";
import { runPricesSync } from "@/lib/modules/prices/sync";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPricesSync();
    // Invalida la cache `unstable_cache` dei consumer (card coin,
    // chart, top-coins pool). Senza, il tier router cache mostra il
    // prezzo precedente per fino al revalidate naturale (60s-1h).
    if (result.ok) {
      revalidateTag(PRICES_DATA_TAG, "max");
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
