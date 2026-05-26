import { NextResponse } from "next/server";
import { dispatchAchievementEmails } from "@/lib/modules/notifications/email-channel/dispatcher";
import { isAuthorizedCron } from "@/lib/modules/notifications/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await dispatchAchievementEmails();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 207, // 207 multi-status: alcuni errori per-item
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
