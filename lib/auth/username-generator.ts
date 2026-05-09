// lib/auth/username-generator.ts
//
// Genera uno username automatico derivandolo dal local-part dell'email.
// Usato quando il wizard /onboarding è disabilitato (admin toggle) e dobbiamo
// completare il profilo OAuth senza chiedere nulla all'utente. Lo username
// generato è valido secondo `validateUsernameFormat` (regex, dot rules) e
// passa il controllo blacklist; se occupato si ritenta con un suffisso
// numerico crescente, fallback a un suffisso random a 6 char.

import { isUsernameBlacklisted } from "@/lib/auth/blacklist";
import {
  USERNAME_MAX,
  USERNAME_MIN,
  validateUsernameFormat,
} from "@/lib/auth/username-validator";
import { db } from "@/lib/db/drizzle";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SUFFIX_BUDGET = 4; // riserva per "9999" → base max 46 char
const MAX_NUMERIC_ATTEMPTS = 50;

function sanitizeBase(email: string): string {
  const local = (email.split("@")[0] ?? "").toLowerCase();

  // Caratteri non ammessi → "."  (l'email ammette es. "+", "-", "'")
  let base = local.replace(/[^a-z0-9_.]/g, ".");

  // Collassa "." multipli e taglia leading/trailing dot+underscore
  base = base.replace(/\.{2,}/g, ".").replace(/^[._]+|[._]+$/g, "");

  // Padding se troppo corto (es. email "ab@x.com" → "ab" → "ab0")
  if (base.length < USERNAME_MIN) {
    base = (base || "user").padEnd(USERNAME_MIN, "0");
  }

  // Lascia spazio per il suffisso numerico
  const maxBase = USERNAME_MAX - SUFFIX_BUDGET;
  if (base.length > maxBase) base = base.slice(0, maxBase);

  // Strip di nuovo eventuali "." in coda dopo il taglio
  base = base.replace(/[._]+$/g, "");
  if (base.length < USERNAME_MIN) base = "user".padEnd(USERNAME_MIN, "0");

  return base;
}

async function isAvailable(candidate: string): Promise<boolean> {
  if (!validateUsernameFormat(candidate).ok) return false;
  if (candidate.length < USERNAME_MIN || candidate.length > USERNAME_MAX) {
    return false;
  }
  if (await isUsernameBlacklisted(candidate)) return false;
  const [existing] = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.username, candidate))
    .limit(1);
  return !existing;
}

export async function generateUniqueUsernameFromEmail(
  email: string,
): Promise<string> {
  const base = sanitizeBase(email);

  if (await isAvailable(base)) return base;

  for (let n = 1; n <= MAX_NUMERIC_ATTEMPTS; n++) {
    const candidate = `${base}${n}`;
    if (await isAvailable(candidate)) return candidate;
  }

  // Fallback random — astronomicamente improbabile arrivare qui
  for (let i = 0; i < 5; i++) {
    const random = Math.random().toString(36).slice(2, 8);
    const candidate = `${base}${random}`;
    if (await isAvailable(candidate)) return candidate;
  }

  throw new Error(
    `[username-generator] failed to generate unique username for ${email}`,
  );
}
