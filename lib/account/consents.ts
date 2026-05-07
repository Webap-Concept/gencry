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
import { and, eq, inArray, or } from "drizzle-orm";

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
 * Versione batch di `getAcceptedConsent`: risolve in 2 query (invece di
 * 2*N) gli snapshot dei consensi per tutti gli `items` passati.
 *
 * Pattern: prima leggiamo TUTTE le system pages richieste in un'unica
 * SELECT con `IN`, poi se ci sono versioni storiche da risolvere
 * facciamo una seconda SELECT su `pageVersions` con un `OR` di tuple
 * `(pageId == X AND contentVersion == Y)`. Output: lo stesso shape di
 * `getAcceptedConsent` ma indicizzato per systemKey.
 *
 * Usato da `/settings/privacy/page.tsx` che oggi farebbe 6 query (2 per
 * policy x 3 policy). Con questa scende a max 2 query — meno round-trip
 * e meno load sull'event loop di Postgres.
 */
export async function getAcceptedConsents(
  items: Array<{
    systemKey: SystemPageKey;
    acceptedVersion: string | null;
  }>,
): Promise<Record<string, ConsentSnapshot | null>> {
  // Risultato pre-popolato a null per ogni systemKey richiesto, così
  // anche le policy mai accettate (acceptedVersion === null) o assenti
  // dal DB hanno la chiave presente.
  const out: Record<string, ConsentSnapshot | null> = {};
  for (const it of items) out[it.systemKey] = null;

  // Filtriamo le policy che NON ha mai accettato — niente da risolvere
  // per quelle. Se l'array filtrato è vuoto, evitiamo anche la prima query.
  const toResolve = items.filter((it) => it.acceptedVersion !== null);
  if (toResolve.length === 0) return out;

  const wantedKeys = Array.from(new Set(toResolve.map((it) => it.systemKey)));

  const systemPages = await db
    .select({
      id: pages.id,
      systemKey: pages.systemKey,
      title: pages.title,
      content: pages.content,
      contentVersion: pages.contentVersion,
    })
    .from(pages)
    .where(inArray(pages.systemKey, wantedKeys));

  const pageBySystemKey = new Map<string, (typeof systemPages)[number]>();
  for (const p of systemPages) {
    if (p.systemKey) pageBySystemKey.set(p.systemKey, p);
  }

  // Identifichiamo gli item che richiedono uno snapshot storico
  // (versione accettata != versione corrente della pagina).
  type HistoricRequest = {
    systemKey: SystemPageKey;
    pageId: number;
    acceptedVersion: string;
  };
  const historicRequests: HistoricRequest[] = [];

  for (const it of toResolve) {
    const page = pageBySystemKey.get(it.systemKey);
    if (!page) continue; // policy non configurata → out[key] resta null
    if (page.contentVersion === it.acceptedVersion) {
      out[it.systemKey] = {
        title: page.title,
        content: page.content,
        isCurrent: true,
        currentVersion: page.contentVersion,
      };
    } else {
      historicRequests.push({
        systemKey: it.systemKey,
        pageId: page.id,
        acceptedVersion: it.acceptedVersion!,
      });
    }
  }

  // Una sola SELECT su pageVersions con OR di (pageId, contentVersion)
  // per coprire tutte le richieste storiche residue.
  if (historicRequests.length > 0) {
    const conditions = historicRequests.map((r) =>
      and(
        eq(pageVersions.pageId, r.pageId),
        eq(pageVersions.contentVersion, r.acceptedVersion),
      ),
    );
    const snapshots = await db
      .select({
        pageId: pageVersions.pageId,
        contentVersion: pageVersions.contentVersion,
        title: pageVersions.title,
        content: pageVersions.content,
      })
      .from(pageVersions)
      .where(or(...conditions));

    const snapshotByKey = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots) {
      snapshotByKey.set(`${s.pageId}::${s.contentVersion}`, s);
    }

    for (const r of historicRequests) {
      const snap = snapshotByKey.get(`${r.pageId}::${r.acceptedVersion}`);
      if (!snap) continue; // edge case: bump senza snapshot → out[key] resta null
      const page = pageBySystemKey.get(r.systemKey)!;
      out[r.systemKey] = {
        title: snap.title,
        content: snap.content,
        isCurrent: false,
        currentVersion: page.contentVersion,
      };
    }
  }

  return out;
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
