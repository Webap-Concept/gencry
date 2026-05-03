import "server-only";

import { db } from "@/lib/db/drizzle";
import { consentRecords } from "@/lib/db/schema";
import type {
  ConsentAction,
  ConsentIpStrategy,
  ConsentType,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export type UserConsentRecord = {
  id: string;
  consentType: ConsentType;
  action: ConsentAction;
  policyVersion: string | null;
  policyTextHash: string | null;
  ip: string | null;
  ipStrategy: ConsentIpStrategy;
  userAgent: string | null;
  locale: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

/**
 * Tutti i consent_records di un utente, ordinati dal più recente.
 * Usato dalla scheda admin /admin/access/users/[id] tab "Consents".
 *
 * Nota di scope: nessuna paginazione — un utente reale ha al massimo
 * una manciata di righe (terms+privacy+marketing al signup, eventuali
 * toggle marketing successivi, eventi cookie banner). Quando il banner
 * cookie sarà attivo e con utenti molto longevi, valutare paginazione.
 */
export async function getUserConsentRecords(
  userId: string,
): Promise<UserConsentRecord[]> {
  const rows = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.userId, userId))
    .orderBy(desc(consentRecords.createdAt));

  return rows.map((r) => ({
    id: r.id,
    consentType: r.consentType,
    action: r.action,
    policyVersion: r.policyVersion,
    policyTextHash: r.policyTextHash,
    ip: r.ip,
    ipStrategy: r.ipStrategy,
    userAgent: r.userAgent,
    locale: r.locale,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
  }));
}
