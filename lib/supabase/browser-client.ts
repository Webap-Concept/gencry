"use client";
// lib/supabase/browser-client.ts
//
// Singleton Supabase JS client per il BROWSER. Usato per Realtime
// (Postgres Changes + Broadcast + Presence). NON usare per query DB —
// quelle vanno via Server Actions / Drizzle (lib/storage/supabase.ts è
// server-only con service_role).
//
// Env richieste (esposte browser-side):
//   - NEXT_PUBLIC_SUPABASE_URL
//   - NEXT_PUBLIC_SUPABASE_ANON_KEY
//
// Se la env anon-key non è settata, ritorniamo null e il caller
// (es. useCommentsLiveSignal) degrada a polling automatico.
//
// Hookable: in V2 potremo sostituire questo file con un client Ably/
// Pusher senza toccare i consumer — la interface RealtimeChannel
// usata altrove è ridotta a `subscribe / on / unsubscribe`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
let resolved = false;

/**
 * Ritorna il client browser Supabase, o `null` se le env non sono
 * configurate. Idempotente: 1 sola istanza per tab.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (resolved) return cached;
  resolved = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Mancanza è caso valido: realtime feature degraded a polling/off.
    cached = null;
    return null;
  }

  cached = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return cached;
}
