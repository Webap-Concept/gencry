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
export const client = postgres(process.env.POSTGRES_URL, { prepare: false });
export const db = drizzle(client, { schema });
