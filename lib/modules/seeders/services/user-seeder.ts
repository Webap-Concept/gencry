// lib/modules/seeders/services/user-seeder.ts
//
// Crea N seed users con profilo completo (username, nome, cognome,
// avatar DiceBear deterministico per seed, bio random). Email pattern
// `seed-{ulid}@seed.<APP_DOMAIN>` (sotto-dominio non raggiungibile,
// account non loggabile: passwordHash = bcrypt di crypto.randomUUID()).
//
// Restituisce gli user object completi (id + email + username) per i
// contributors successivi (posts, blocks, ecc.).
import "server-only";

import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { users, userProfiles } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  FIRST_NAMES_IT,
  LAST_NAMES_IT,
  USERNAME_SUFFIXES,
  BIO_TEMPLATES_IT,
  INTERESTS_POOL,
} from "./content-templates-it";
import { pickRandomMood, type UserMood } from "./mood-types";

export type SeedUser = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  /** Data di iscrizione (createdAt random distribuito negli ultimi
   *  ~90 giorni). Usata dai contributors per evitare di creare post
   *  ANTERIORI alla registrazione del loro autore. */
  createdAt: Date;
  /** Archetype del demo user — guida la selezione dei template dei
   *  post e il bias sul ticker pick. Vedi mood-types.ts. */
  mood: UserMood;
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Genera N seed users + i loro user_profiles. Bulk INSERT (1 query per
 * users, 1 per profiles) per minimizzare round-trip DB.
 *
 * I conflict su username unique sono possibili in run consecutivi:
 * usiamo `onConflictDoNothing` sul username, ma in pratica il random
 * sufix + cognome + numero crash è raro. Se l'admin lancia 2 volte
 * con 100 utenti ognuno, qualche username potrebbe collidere → quel
 * profilo non viene inserito, ma l'utente sì (con email pattern
 * sempre unique grazie a randomUUID).
 */
export async function seedUsers(count: number): Promise<SeedUser[]> {
  if (count <= 0) return [];

  const settings = await getAppSettings();
  const appDomain = settings.app_domain || "gencry.app";
  const seedDomain = `seed.${appDomain.replace(/^https?:\/\//, "")}`;

  // Pre-compute tutto in JS, poi 2 bulk INSERT.
  // Iscrizioni distribuite uniformemente negli ultimi 90 giorni → la
  // colonna "Data di iscrizione" del profilo mostra un range
  // realistico. Acceptance dei termini e completamento onboarding
  // allineati a `createdAt` (atto della registrazione) +1 minuto per
  // simulare il delta normale del flusso.
  const now = new Date();
  const REGISTRATION_WINDOW_DAYS = 90;
  const REGISTRATION_WINDOW_MS = REGISTRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const seedRows: Array<{
    id: string;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    avatarUrl: string;
    bio: string;
    interests: string[];
    createdAt: Date;
    onboardingAt: Date;
    mood: UserMood;
  }> = [];

  // bcrypt hash è costoso (~50ms per round). Per 100 users serebbero
  // 5s. Lo facciamo una sola volta con un seed UUID random e lo
  // condividiamo — tanto il passwordHash è solo per impedire il login,
  // non per security reale (i seed users non loggano mai).
  const sharedPasswordHash = await hash(randomUUID(), 10);

  const usedUsernames = new Set<string>();
  for (let i = 0; i < count; i++) {
    const firstName = pick(FIRST_NAMES_IT);
    const lastName = pick(LAST_NAMES_IT);

    // Username: <first><suffix> con fallback random se collision in
    // questo batch (un secondo batch può collidere con il DB → onConflict).
    let username = `${slug(firstName)}${pick(USERNAME_SUFFIXES)}`;
    let attempt = 0;
    while (usedUsernames.has(username) && attempt < 5) {
      username = `${slug(firstName)}_${Math.floor(Math.random() * 9999)}`;
      attempt += 1;
    }
    usedUsernames.add(username);

    const ulid = randomUUID().replace(/-/g, "").slice(0, 16);
    const email = `seed-${ulid}@${seedDomain}`;
    // DiceBear deterministico per username — stesso avatar a ogni run.
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
      username,
    )}`;

    // Distribuzione iscrizione: uniforme negli ultimi 90 giorni.
    // L'onboarding completion arriva ~1-30 min dopo per realismo.
    const createdAt = new Date(now.getTime() - Math.random() * REGISTRATION_WINDOW_MS);
    const onboardingAt = new Date(
      createdAt.getTime() + (1 + Math.random() * 30) * 60 * 1000,
    );

    seedRows.push({
      id: "", // popolato dopo l'INSERT con il default uuid_generate
      email,
      username,
      firstName,
      lastName,
      avatarUrl,
      bio: pick(BIO_TEMPLATES_IT),
      interests: pickN(INTERESTS_POOL, Math.floor(Math.random() * 4)),
      createdAt,
      onboardingAt,
      mood: pickRandomMood(),
    });
  }

  // INSERT users (bulk) — returning id per linkare i profiles.
  const insertedUsers = await db
    .insert(users)
    .values(
      seedRows.map((r) => ({
        email: r.email,
        passwordHash: sharedPasswordHash,
        role: "member" as const,
        isAdmin: false,
        emailVerified: true,
        acceptedTermsAt: r.createdAt,
        acceptedTermsVersion: "seed-1",
        acceptedPrivacyAt: r.createdAt,
        acceptedPrivacyVersion: "seed-1",
        onboardingCompletedAt: r.onboardingAt,
        createdAt: r.createdAt,
        updatedAt: r.onboardingAt,
      })),
    )
    .returning({ id: users.id, email: users.email });

  // Map email → id (l'INSERT non garantisce ordine?). Usiamo la email
  // unique come join key, sicuro.
  const idByEmail = new Map(insertedUsers.map((u) => [u.email, u.id]));

  // INSERT profiles bulk. createdAt/updatedAt allineati a quello user
  // → la "Data di iscrizione" mostrata sul profilo è coerente.
  const profileRows = seedRows
    .map((r) => ({
      userId: idByEmail.get(r.email)!,
      firstName: r.firstName,
      lastName: r.lastName,
      username: r.username,
      avatarUrl: r.avatarUrl,
      bio: r.bio || null,
      interests: r.interests,
      createdAt: r.createdAt,
      updatedAt: r.onboardingAt,
    }))
    .filter((p) => p.userId);

  if (profileRows.length > 0) {
    // onConflict su username unique → skippa silenziosamente eventuali
    // duplicati (raro, ma se accade preferiamo no-op).
    await db
      .insert(userProfiles)
      .values(profileRows)
      .onConflictDoNothing({ target: userProfiles.username });
  }

  return seedRows
    .map((r) => {
      const id = idByEmail.get(r.email);
      if (!id) return null;
      return {
        id,
        email: r.email,
        username: r.username,
        firstName: r.firstName,
        lastName: r.lastName,
        createdAt: r.createdAt,
        mood: r.mood,
      } satisfies SeedUser;
    })
    .filter((u): u is SeedUser => u !== null);
}

/**
 * Cancella tutti i seed users (e cascading: profiles, posts, media,
 * reactions, comments, bookmarks, blocks, reports, mentions, tickers).
 *
 * Lockdown: WHERE email LIKE 'seed-%@seed.<APP_DOMAIN>'. Impossibile
 * cancellare real users con questo filtro.
 */
export async function cleanupSeedUsers(): Promise<{ deleted: number }> {
  const settings = await getAppSettings();
  const appDomain = settings.app_domain || "gencry.app";
  const seedDomain = `seed.${appDomain.replace(/^https?:\/\//, "")}`;
  const pattern = `seed-%@${seedDomain}`;

  // LIKE pattern via sql tagged template — postgres-js esegue il
  // DELETE con CASCADE su FK (profiles, posts, media, reactions, ecc.)
  const deleted = await db.execute(sql`
    DELETE FROM users WHERE email LIKE ${pattern} RETURNING id
  `);

  const count = Array.isArray(deleted)
    ? deleted.length
    : (deleted as { rows?: unknown[] }).rows?.length ?? 0;
  return { deleted: count };
}

/**
 * Conta i seed users esistenti (per la dashboard admin "ci sono N
 * demo accounts attivi").
 */
export async function countSeedUsers(): Promise<number> {
  const settings = await getAppSettings();
  const appDomain = settings.app_domain || "gencry.app";
  const seedDomain = `seed.${appDomain.replace(/^https?:\/\//, "")}`;
  const pattern = `seed-%@${seedDomain}`;

  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM users WHERE email LIKE ${pattern}
  `);

  if (Array.isArray(rows)) return (rows[0] as { n: number })?.n ?? 0;
  const r = (rows as { rows?: Array<{ n: number }> }).rows?.[0];
  return r?.n ?? 0;
}
