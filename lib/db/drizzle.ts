import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

// `prepare: false` disabilita la cache di prepared statement di postgres-js.
// Su Supabase usiamo il pooler condiviso in transaction mode (porta 6543),
// dove i prepared statement sono fragili: dopo una migrazione di schema
// possono restare appiccicati ai backend connection di pgbouncer e
// produrre errori tipo "relation does not exist" o
// "prepared statement does not exist". Disattivarli ha un costo trascurabile
// (un round-trip extra di Parse) ma rende il client safe contro queste
// classi di bug.
//
// Singleton-guard via globalThis: in Next.js dev, ogni hot-reload
// re-esegue questo modulo. Senza guard ogni reload aprirebbe un nuovo
// pool postgres-js (default max=10) e quelli vecchi resterebbero con
// connessioni TCP attive sul backend Supabase. Il guard funziona quando
// `globalThis` sopravvive l'HMR — ma Turbopack a volte lo isola tra
// contexts (edge ≠ node, worker diversi) e abbiamo visto sul DSN Sentry
// errori `EMAXCONN 200`: quel limit è facile da toccare con default `max=10`.
//
// Difesa in profondità: in dev forziamo `max: 1`. Anche se il guard
// fallisce e si apre un pool nuovo a ogni HMR, ciascuno costa una sola
// connessione TCP — ci servirebbero 200 reload per saturare Supabase
// invece di 20. Cleanup esplicito: se troviamo un client esistente nel
// global lo riusiamo, altrimenti registriamo un cleanup hook che
// chiude il pool al SIGTERM/exit (utile quando il dev server si killa).
// In prod (`NODE_ENV=production`) NON memorizziamo: ogni serverless
// function ha la sua istanza, già isolata per natura, e il `max=10`
// default è giusto per servire request concorrenti.
//
// idle_timeout 20s: chiude connessioni inattive — Supabase le chiude lato
// server dopo qualche minuto, meglio chiuderle proattivamente.
// max_lifetime 30min: hard cap per evitare connessioni stuck dopo
// failover/restart del pooler (raccomandato dai Supabase docs).
const globalForPg = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
  __pgCleanupRegistered?: boolean;
};

const isDev = process.env.NODE_ENV !== 'production';

export const client =
  globalForPg.__pg ??
  postgres(process.env.POSTGRES_URL, {
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    // Pool sizing: il default postgres-js di 10 è troppo piccolo per il
    // fan-out di un re-render Next 16 con prefetch RSC.
    //   revalidatePath("/") → router invalidation → Next pre-fetch dei
    //   link visibili (sidebar + bottom-nav + tabs) → 10-15 request HTTP
    //   parallele → ogni request render layout protected (5 query) +
    //   page (6 query) = 80+ query parallele. Con max=10 il pool satura,
    //   le request restano in coda 10-15s, browser fa retry → spirale,
    //   stream RSC della Server Action response non chiude mai.
    // 30 dà margine generoso senza avvicinarsi al cap Supabase (200).
    // In dev: cap 1 conn per pool (vedi commento sopra sul singleton).
    max: isDev ? 1 : 30,
  });

if (isDev) {
  globalForPg.__pg = client;
  // Hook di cleanup registrato una volta sola: quando il processo
  // riceve SIGTERM/SIGINT (dev server killato, npm script chiuso), prova
  // a chiudere il pool per liberare le connessioni TCP lato Supabase.
  // `timeout: 0` = non aspetta query in volo, chiude subito.
  if (!globalForPg.__pgCleanupRegistered) {
    globalForPg.__pgCleanupRegistered = true;
    const close = () => {
      void globalForPg.__pg?.end({ timeout: 0 }).catch(() => {});
    };
    process.once('SIGTERM', close);
    process.once('SIGINT', close);
    process.once('beforeExit', close);
  }
}

export const db = drizzle(client, { schema });
