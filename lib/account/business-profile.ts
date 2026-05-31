import "server-only";
// lib/account/business-profile.ts
//
// Logica account azienda (v1 — identità visiva).
//   - Utente: submitBusinessUpgradeRequest, getBusinessStatus, revertToPersonal
//   - Admin:  listPendingBusinessRequests, approveBusinessRequest, rejectBusinessRequest
//
// L'upgrade NON è self-service: una richiesta nasce 'pending', un admin la
// approva (→ account_type='business' + campi promossi su user_profiles +
// company_verified_at) o la rifiuta (con motivo). La P.IVA è privata.

import { db } from "@/lib/db/drizzle";
import { businessUpgradeRequests, userProfiles, users } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { isValidSector } from "./business-sectors";

// ── Validazione / normalizzazione ──────────────────────────────────────────

/** Normalizza un URL: prepend https:// se manca lo schema. null se invalido. */
function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** P.IVA / VAT: alfanumerico 8–20 (no checksum: accettiamo anche VAT esteri). */
function normalizeVat(raw: string): string | null {
  const cleaned = raw.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z0-9]{8,20}$/.test(cleaned) ? cleaned : null;
}

// ── Tipi ────────────────────────────────────────────────────────────────────

export interface BusinessRequestInput {
  companyName: string;
  companyWebsite: string;
  companySector: string;
  vatNumber: string;
  note?: string | null;
}

export type SubmitResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "already_business"
        | "pending_exists"
        | "invalid_name"
        | "invalid_sector"
        | "invalid_website"
        | "invalid_vat";
    };

export type BusinessRequestStatus = "pending" | "approved" | "rejected";

export interface BusinessStatus {
  accountType: "personal" | "business";
  verifiedAt: Date | null;
  company: {
    name: string | null;
    website: string | null;
    sector: string | null;
  };
  latestRequest: {
    status: BusinessRequestStatus;
    companyName: string;
    reviewNote: string | null;
    requestedAt: Date;
  } | null;
}

// ── Utente ──────────────────────────────────────────────────────────────────

/**
 * Crea una richiesta di upgrade. Blocca se l'utente è già azienda o ha già
 * una richiesta in attesa. Valida sito + P.IVA + settore.
 */
export async function submitBusinessUpgradeRequest(
  userId: string,
  input: BusinessRequestInput,
): Promise<SubmitResult> {
  const companyName = input.companyName.trim();
  if (companyName.length < 2 || companyName.length > 120) {
    return { ok: false, error: "invalid_name" };
  }
  if (!isValidSector(input.companySector)) {
    return { ok: false, error: "invalid_sector" };
  }
  const website = normalizeWebsite(input.companyWebsite);
  if (!website) return { ok: false, error: "invalid_website" };
  const vat = normalizeVat(input.vatNumber);
  if (!vat) return { ok: false, error: "invalid_vat" };

  const [profile] = await db
    .select({ accountType: userProfiles.accountType })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (profile?.accountType === "business") {
    return { ok: false, error: "already_business" };
  }

  const [pending] = await db
    .select({ id: businessUpgradeRequests.id })
    .from(businessUpgradeRequests)
    .where(
      and(
        eq(businessUpgradeRequests.userId, userId),
        eq(businessUpgradeRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (pending) return { ok: false, error: "pending_exists" };

  await db.insert(businessUpgradeRequests).values({
    userId,
    companyName,
    companyWebsite: website,
    companySector: input.companySector,
    vatNumber: vat,
    note: input.note?.trim() || null,
  });

  return { ok: true };
}

export interface BusinessAdminDetail {
  companyName: string | null;
  companyWebsite: string | null;
  companySector: string | null;
  /** P.IVA — visibile SOLO in admin (mai nel profilo pubblico). */
  vatNumber: string | null;
  verifiedAt: Date | null;
  requestedAt: Date | null;
}

/**
 * Dettaglio business per la scheda utente admin (include la P.IVA privata).
 * Ritorna null se l'utente non è un account azienda.
 */
export async function getBusinessAdminDetail(
  userId: string,
): Promise<BusinessAdminDetail | null> {
  const [profile] = await db
    .select({
      accountType:   userProfiles.accountType,
      companyName:    userProfiles.companyName,
      companyWebsite: userProfiles.companyWebsite,
      companySector:  userProfiles.companySector,
      vatNumber:      userProfiles.companyVatNumber,
      verifiedAt:     userProfiles.companyVerifiedAt,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!profile || profile.accountType !== "business") return null;

  const [req] = await db
    .select({ requestedAt: businessUpgradeRequests.requestedAt })
    .from(businessUpgradeRequests)
    .where(
      and(
        eq(businessUpgradeRequests.userId, userId),
        eq(businessUpgradeRequests.status, "approved"),
      ),
    )
    .orderBy(desc(businessUpgradeRequests.requestedAt))
    .limit(1);

  return {
    companyName:    profile.companyName,
    companyWebsite: profile.companyWebsite,
    companySector:  profile.companySector,
    vatNumber:      profile.vatNumber,
    verifiedAt:     profile.verifiedAt,
    requestedAt:    req?.requestedAt ?? null,
  };
}

/** Stato per la UI di /settings/account (tipo account + ultima richiesta). */
export async function getBusinessStatus(userId: string): Promise<BusinessStatus> {
  const [[profile], [latest]] = await Promise.all([
    db
      .select({
        accountType: userProfiles.accountType,
        verifiedAt:  userProfiles.companyVerifiedAt,
        name:        userProfiles.companyName,
        website:     userProfiles.companyWebsite,
        sector:      userProfiles.companySector,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1),
    db
      .select({
        status:      businessUpgradeRequests.status,
        companyName: businessUpgradeRequests.companyName,
        reviewNote:  businessUpgradeRequests.reviewNote,
        requestedAt: businessUpgradeRequests.requestedAt,
      })
      .from(businessUpgradeRequests)
      .where(eq(businessUpgradeRequests.userId, userId))
      .orderBy(desc(businessUpgradeRequests.requestedAt))
      .limit(1),
  ]);

  return {
    accountType: profile?.accountType === "business" ? "business" : "personal",
    verifiedAt: profile?.verifiedAt ?? null,
    company: {
      name:    profile?.name ?? null,
      website: profile?.website ?? null,
      sector:  profile?.sector ?? null,
    },
    latestRequest: latest
      ? {
          status:      latest.status as BusinessRequestStatus,
          companyName: latest.companyName,
          reviewNote:  latest.reviewNote,
          requestedAt: latest.requestedAt,
        }
      : null,
  };
}

/** Downgrade a profilo personale: azzera tipo + campi azienda (P.IVA inclusa). */
export async function revertToPersonal(userId: string): Promise<void> {
  await db
    .update(userProfiles)
    .set({
      accountType:       "personal",
      companyName:       null,
      companyWebsite:    null,
      companySector:     null,
      companyVatNumber:  null,
      companyVerifiedAt: null,
      updatedAt:         new Date(),
    })
    .where(eq(userProfiles.userId, userId));
}

// ── Admin ───────────────────────────────────────────────────────────────────

export interface PendingBusinessRequest {
  id: string;
  userId: string;
  username: string | null;
  email: string;
  companyName: string;
  companyWebsite: string;
  companySector: string;
  vatNumber: string;
  note: string | null;
  requestedAt: Date;
}

export async function listPendingBusinessRequests(): Promise<PendingBusinessRequest[]> {
  return db
    .select({
      id:             businessUpgradeRequests.id,
      userId:         businessUpgradeRequests.userId,
      username:       userProfiles.username,
      email:          users.email,
      companyName:    businessUpgradeRequests.companyName,
      companyWebsite: businessUpgradeRequests.companyWebsite,
      companySector:  businessUpgradeRequests.companySector,
      vatNumber:      businessUpgradeRequests.vatNumber,
      note:           businessUpgradeRequests.note,
      requestedAt:    businessUpgradeRequests.requestedAt,
    })
    .from(businessUpgradeRequests)
    .innerJoin(users, eq(users.id, businessUpgradeRequests.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, businessUpgradeRequests.userId))
    .where(eq(businessUpgradeRequests.status, "pending"))
    .orderBy(desc(businessUpgradeRequests.requestedAt));
}

/** Dati per la notifica email al richiedente (ritornati su esito ok). */
export interface ReviewRecipient {
  userId: string;
  email: string;
  firstName: string | null;
  locale: string | null;
  companyName: string;
}

export type ReviewResult =
  | { ok: true; recipient: ReviewRecipient }
  | { ok: false; error: "not_found" | "already_reviewed" };

/** Carica email/nome/locale del richiedente (per la mail di esito). */
async function loadRecipient(
  userId: string,
  companyName: string,
): Promise<ReviewRecipient> {
  const [u] = await db
    .select({
      email:     users.email,
      locale:    users.locale,
      firstName: userProfiles.firstName,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return {
    userId,
    email:     u?.email ?? "",
    firstName: u?.firstName ?? null,
    locale:    u?.locale ?? null,
    companyName,
  };
}

/**
 * Approva: promuove i dati su user_profiles + account_type='business' +
 * company_verified_at. Le due scritture sono atomiche (transazione). Il
 * recipient per la mail viene caricato dopo (non richiede atomicità).
 */
export async function approveBusinessRequest(
  requestId: string,
  adminId: string,
): Promise<ReviewResult> {
  const tx = await db.transaction(async (trx) => {
    const [req] = await trx
      .select()
      .from(businessUpgradeRequests)
      .where(eq(businessUpgradeRequests.id, requestId))
      .limit(1);
    if (!req) return { ok: false as const, error: "not_found" as const };
    if (req.status !== "pending") {
      return { ok: false as const, error: "already_reviewed" as const };
    }

    const now = new Date();
    await trx
      .update(businessUpgradeRequests)
      .set({ status: "approved", reviewedBy: adminId, reviewedAt: now })
      .where(eq(businessUpgradeRequests.id, requestId));

    await trx
      .update(userProfiles)
      .set({
        accountType:       "business",
        companyName:       req.companyName,
        companyWebsite:    req.companyWebsite,
        companySector:     req.companySector,
        companyVatNumber:  req.vatNumber,
        companyVerifiedAt: now,
        updatedAt:         now,
      })
      .where(eq(userProfiles.userId, req.userId));

    return { ok: true as const, userId: req.userId, companyName: req.companyName };
  });

  if (!tx.ok) return tx;
  const recipient = await loadRecipient(tx.userId, tx.companyName);
  return { ok: true, recipient };
}

export async function rejectBusinessRequest(
  requestId: string,
  adminId: string,
  reviewNote: string | null,
): Promise<ReviewResult> {
  const [req] = await db
    .select({
      status:      businessUpgradeRequests.status,
      userId:      businessUpgradeRequests.userId,
      companyName: businessUpgradeRequests.companyName,
    })
    .from(businessUpgradeRequests)
    .where(eq(businessUpgradeRequests.id, requestId))
    .limit(1);
  if (!req) return { ok: false, error: "not_found" };
  if (req.status !== "pending") return { ok: false, error: "already_reviewed" };

  await db
    .update(businessUpgradeRequests)
    .set({
      status: "rejected",
      reviewNote: reviewNote?.trim() || null,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    })
    .where(eq(businessUpgradeRequests.id, requestId));

  const recipient = await loadRecipient(req.userId, req.companyName);
  return { ok: true, recipient };
}
