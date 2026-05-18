"use server";
// lib/auth/supabase-realtime-token.ts
//
// Server Action core che genera un JWT HS256 impersonante l'utente
// corrente per autenticare il Supabase Realtime client (channel privati
// gated da RLS auth.uid()).
//
// Generico, NON specifico di un modulo: riusato dai consumer realtime
// di posts (comments) e notifications (push notifiche end-user) e da
// qualunque futuro modulo che voglia subscribe a row-filtered channels.
//
// exp = now + 1h. Il client deve refreshare con margine ≥ 10min
// (caching pattern: vedi components/.../*ThreadCommentsThread.tsx).
//
// SUPABASE_JWT_SECRET è una env (NON setting DB) perché è secret di
// infrastruttura, condiviso col Supabase project e ruotato lato
// dashboard Supabase, non da admin UI.
import { SignJWT } from "jose";
import { getUser } from "@/lib/db/queries";

export type SupabaseRealtimeTokenResult =
  | { ok: true; data: { token: string; expiresAt: number } }
  | { ok: false; error: string };

export async function generateSupabaseRealtimeToken(): Promise<SupabaseRealtimeTokenResult> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: "auth.errors.unauthenticated" };
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return { ok: false, error: "auth.errors.realtime_jwt_missing_secret" };
  }

  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  const token = await new SignJWT({
    sub: user.id,
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));

  return { ok: true, data: { token, expiresAt: exp } };
}
