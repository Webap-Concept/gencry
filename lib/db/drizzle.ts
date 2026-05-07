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
// `max: 5` limita le connection per-istanza serverless. Default postgres-js
// è 10: combinato con Promise.all su molte query (es. admin stats con
// 7 count() in parallelo) saturava il pool e blocca il refresh successivo
// finché Supabase non chiude le connection per idle (minuti). Con max:5
// le query oltre il limite vanno in queue locale invece di lasciare
// appese connection sul pooler condiviso.
// `idle_timeout: 20` chiude le connection inutilizzate dopo 20s, evitando
// che istanze warm tengano connection aperte tra request.
// `connect_timeout: 10` evita che una connect lenta tenga appesa la
// function fino al maxDuration di Vercel.
export const client = postgres(process.env.POSTGRES_URL, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });
