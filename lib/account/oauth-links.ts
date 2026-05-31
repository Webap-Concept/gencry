import "server-only";
// lib/account/oauth-links.ts
//
// Lettura/gestione degli account OAuth collegati a un utente, per la
// sezione "Account collegati" di /settings/account.

import { db } from "@/lib/db/drizzle";
import { oauthAccounts, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export interface LinkedAccount {
  provider: string;
  linkedAt: Date;
}

/** Provider OAuth collegati all'utente (per la UI). */
export async function getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
  const rows = await db
    .select({ provider: oauthAccounts.provider, linkedAt: oauthAccounts.createdAt })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, userId));
  return rows.map((r) => ({ provider: r.provider, linkedAt: r.linkedAt }));
}

export type UnlinkResult =
  | { ok: true }
  | { ok: false; error: "last_method" | "not_linked" };

/**
 * Scollega un provider. Blocca lo scollegamento se lascerebbe l'utente
 * senza alcun metodo di accesso: serve almeno una password OPPURE un
 * altro provider collegato.
 */
export async function unlinkOAuthAccount(
  userId: string,
  provider: string,
): Promise<UnlinkResult> {
  const [links, [u]] = await Promise.all([
    db
      .select({ provider: oauthAccounts.provider })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, userId)),
    db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ]);

  if (!links.some((l) => l.provider === provider)) {
    return { ok: false, error: "not_linked" };
  }

  const hasPassword = u?.passwordHash != null;
  const hasOtherProvider = links.some((l) => l.provider !== provider);
  if (!hasPassword && !hasOtherProvider) {
    return { ok: false, error: "last_method" };
  }

  await db
    .delete(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider)));
  return { ok: true };
}
