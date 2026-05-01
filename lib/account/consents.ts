// lib/account/consents.ts
//
// Logica per leggere/aggiornare i consensi dell'utente da /settings/privacy.
// I consensi (Termini, Privacy, Marketing) sono pagine di sistema versionate;
// quando l'utente li ha accettati, salviamo data + versione su `users`.
// Per mostrargli ESATTAMENTE il testo accettato (e non quello attuale, che
// può essere cambiato), risolviamo (systemKey, version) → snapshot in
// `page_versions`, oppure → `pages.content` se è ancora la versione corrente.

import "server-only";
import { db } from "@/lib/db/drizzle";
import {
  pages,
  pageVersions,
  type SystemPageKey,
  users,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export type ConsentSnapshot = {
  /** Title della pagina al momento dell'accettazione (o attuale se versione corrente). */
  title: string;
  /** HTML del consenso accettato, da renderizzare con sanitize-html. */
  content: string;
  /** True se l'utente ha accettato la versione che è ANCORA quella attuale. */
  isCurrent: boolean;
  /** Versione corrente sulla pagina di sistema, per banner "è cambiata". */
  currentVersion: string;
};

/**
 * Risolve testo+title della versione che l'utente ha accettato.
 * Ritorna null se:
 * - la pagina di sistema non esiste (mai dovrebbe);
 * - l'utente non ha mai accettato (acceptedVersion = null);
 * - la versione accettata non è né la corrente né uno snapshot storico
 *   (caso teorico: bump senza snapshot, non dovrebbe accadere se i flow
 *   passano da `upsertPage`).
 */
export async function getAcceptedConsent(params: {
  systemKey: SystemPageKey;
  acceptedVersion: string | null;
}): Promise<ConsentSnapshot | null> {
  const { systemKey, acceptedVersion } = params;
  if (!acceptedVersion) return null;

  const [systemPage] = await db
    .select({
      id: pages.id,
      title: pages.title,
      content: pages.content,
      contentVersion: pages.contentVersion,
    })
    .from(pages)
    .where(eq(pages.systemKey, systemKey))
    .limit(1);

  if (!systemPage) return null;

  // Versione accettata == corrente → leggi direttamente da `pages`
  if (systemPage.contentVersion === acceptedVersion) {
    return {
      title: systemPage.title,
      content: systemPage.content,
      isCurrent: true,
      currentVersion: systemPage.contentVersion,
    };
  }

  // Versione storica → query snapshot
  const [snapshot] = await db
    .select({ title: pageVersions.title, content: pageVersions.content })
    .from(pageVersions)
    .where(
      and(
        eq(pageVersions.pageId, systemPage.id),
        eq(pageVersions.contentVersion, acceptedVersion),
      ),
    )
    .limit(1);

  if (!snapshot) return null;

  return {
    title: snapshot.title,
    content: snapshot.content,
    isCurrent: false,
    currentVersion: systemPage.contentVersion,
  };
}

/**
 * Toggle consenso marketing. Pattern: setta acceptedMarketingAt = now() +
 * acceptedMarketingVersion = current marketing page version se enabled,
 * altrimenti azzera entrambi. Niente storia: se domani lo riattiva, si
 * ricomincia da capo (è coerente col fatto che un utente "ritira" il consenso).
 */
export async function setMarketingConsent(params: {
  userId: string;
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, enabled } = params;

  if (enabled) {
    const [marketingPage] = await db
      .select({ contentVersion: pages.contentVersion })
      .from(pages)
      .where(eq(pages.systemKey, "marketing"))
      .limit(1);

    if (!marketingPage) {
      return {
        ok: false,
        error: "Pagina marketing non configurata. Contatta l'assistenza.",
      };
    }

    await db
      .update(users)
      .set({
        acceptedMarketingAt: new Date(),
        acceptedMarketingVersion: marketingPage.contentVersion,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } else {
    await db
      .update(users)
      .set({
        acceptedMarketingAt: null,
        acceptedMarketingVersion: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  return { ok: true };
}
