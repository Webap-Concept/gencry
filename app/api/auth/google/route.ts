// app/api/auth/google/route.ts
// GET /api/auth/google             → redirect verso Google (login/signup)
// GET /api/auth/google?intent=link → collega Google a un account loggato
//
// Il flusso "link" richiede una sessione attiva: chi non è loggato viene
// rimandato a /sign-in. L'intent viaggia in un cookie httpOnly (settato in
// buildGoogleAuthUrl) e viene letto dal callback per scegliere il ramo.

import { buildGoogleAuthUrl } from "@/lib/auth/oauth/google";
import { getSession } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "/";

export async function GET(req: NextRequest) {
  const intent = req.nextUrl.searchParams.get("intent") === "link" ? "link" : "auth";

  if (intent === "link") {
    const session = await getSession();
    if (!session) {
      return NextResponse.redirect(new URL("/sign-in", APP_URL));
    }
  }

  try {
    const url = await buildGoogleAuthUrl(intent);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[auth/google] build url error:", err);
    const dest =
      intent === "link"
        ? "/settings/account?link_error=oauth_init_failed"
        : "/sign-in?error=oauth_init_failed";
    return NextResponse.redirect(new URL(dest, APP_URL));
  }
}
