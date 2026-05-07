// lib/admin/supabase/management.ts
//
// Client minimo per la Supabase Management API. Usato da:
// - /admin/services/supabase (test connessione + diagnostica)
// - /admin/compliance/gdpr → backup section (verifica live PITR)
// - cron `backup-health-check` (drift detection notturna)
//
// Auth: PAT (Personal Access Token) generato da
//   https://supabase.com/dashboard/account/tokens
// Persistito come app setting `supabase_pat` (mai esposto al client).
// Project ref: identifier del progetto (es. "abcdefghij" dall'URL del
// dashboard), persistito come `supabase_project_ref`.
//
// Endpoint base: https://api.supabase.com/v1/...
// Doc: https://supabase.com/docs/reference/api/introduction

import "server-only";
import { getAppSettings } from "@/lib/db/settings-queries";

const API_BASE = "https://api.supabase.com/v1";
const FETCH_TIMEOUT_MS = 8000;

/** Tier del piano corrente. Solo `pro` / `team` / `enterprise` supportano PITR. */
export type SupabaseTier = "free" | "pro" | "team" | "enterprise" | "unknown";

export interface SupabaseProjectInfo {
  id: string;
  name: string;
  region: string;
  /** Tier normalizzato. Se l'API ritorna una stringa imprevista, → "unknown". */
  tier: SupabaseTier;
  /** Tag stringa originale come arrivato dall'API (per debug UI). */
  rawTier: string;
  createdAt: string;
}

export interface SupabaseCredentials {
  pat: string;
  projectRef: string;
}

/** Esito di un check connessione. Mai throws — tutto in `error`. */
export type ConnectionResult =
  | { ok: true; project: SupabaseProjectInfo }
  | { ok: false; error: SupabaseError; httpStatus?: number };

export type SupabaseError =
  | "credentials_missing"
  | "invalid_token"
  | "forbidden"
  | "project_not_found"
  | "network_error"
  | "unexpected_response";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function timedFetch(
  url: string,
  init: RequestInit,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    "User-Agent": "gencry-admin/1.0",
    Accept: "application/json",
  };
}

function normalizeTier(raw: unknown): SupabaseTier {
  if (typeof raw !== "string") return "unknown";
  const v = raw.toLowerCase().trim();
  if (v === "free") return "free";
  if (v === "pro") return "pro";
  if (v === "team") return "team";
  if (v === "enterprise") return "enterprise";
  return "unknown";
}

/**
 * Recupera credenziali dalle app_settings. Ritorna null se non
 * configurate — il chiamante decide cosa mostrare nella UI.
 */
export async function getSupabaseCredentials(): Promise<SupabaseCredentials | null> {
  const settings = await getAppSettings();
  const pat = settings.supabase_pat?.trim() ?? "";
  const projectRef = settings.supabase_project_ref?.trim() ?? "";
  if (!pat || !projectRef) return null;
  return { pat, projectRef };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Test connessione: chiama `GET /v1/projects/{ref}` e mappa lo status
 * a un esito tipizzato. Usato dal bottone "Verify connection" in
 * /admin/services/supabase e come prerequisito per qualunque check
 * downstream (PITR, backup health, ecc.).
 */
export async function checkProjectConnection(
  creds: SupabaseCredentials,
): Promise<ConnectionResult> {
  if (!creds.pat || !creds.projectRef) {
    return { ok: false, error: "credentials_missing" };
  }

  const url = `${API_BASE}/projects/${creds.projectRef}`;
  const res = await timedFetch(url, { headers: authHeaders(creds.pat) });
  if (!res) return { ok: false, error: "network_error" };

  if (res.status === 401) return { ok: false, error: "invalid_token", httpStatus: 401 };
  if (res.status === 403) return { ok: false, error: "forbidden", httpStatus: 403 };
  if (res.status === 404) return { ok: false, error: "project_not_found", httpStatus: 404 };
  if (!res.ok) return { ok: false, error: "unexpected_response", httpStatus: res.status };

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "unexpected_response", httpStatus: res.status };
  }

  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "unexpected_response" };
  }

  const p = payload as {
    id?: string;
    name?: string;
    region?: string;
    subscription_tier?: string;
    created_at?: string;
  };

  const project: SupabaseProjectInfo = {
    id: String(p.id ?? creds.projectRef),
    name: String(p.name ?? "(unknown)"),
    region: String(p.region ?? "?"),
    tier: normalizeTier(p.subscription_tier),
    rawTier: typeof p.subscription_tier === "string" ? p.subscription_tier : "",
    createdAt: typeof p.created_at === "string" ? p.created_at : "",
  };

  return { ok: true, project };
}

/**
 * Wrapper convenience: legge credenziali dalle settings, fa il check.
 * Usato dalla page admin / da action / da cron senza dover gestire la
 * fetch delle credenziali ogni volta.
 */
export async function checkSupabaseConnection(): Promise<ConnectionResult> {
  const creds = await getSupabaseCredentials();
  if (!creds) return { ok: false, error: "credentials_missing" };
  return checkProjectConnection(creds);
}
