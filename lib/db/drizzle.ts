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
// connessioni TCP attive sul backend Supabase. Dopo ~20 reload si tocca
// il limit del pooler condiviso (EMAXCONN 200) e ogni query fallisce.
// In prod (`NODE_ENV=production`) NON memorizziamo: ogni serverless
// function ha la sua istanza, già isolata per natura.
//
// idle_timeout 20s: chiude connessioni inattive — Supabase le chiude lato
// server dopo qualche minuto, meglio chiuderle proattivamente.
// max_lifetime 30min: hard cap per evitare connessioni stuck dopo
// failover/restart del pooler (raccomandato dai Supabase docs).
const globalForPg = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
};

export const client =
  globalForPg.__pg ??
  postgres(process.env.POSTGRES_URL, {
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.__pg = client;
}

export const db = drizzle(client, { schema });
