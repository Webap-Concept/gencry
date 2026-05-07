// lib/admin/storage/s3-client.ts
//
// Client minimo per S3-compatible storage (AWS S3, Cloudflare R2,
// Backblaze B2, Wasabi, MinIO, DigitalOcean Spaces, Storj, ecc.).
//
// **MONITORING ONLY**: questo client legge metadata (HEAD bucket, LIST
// objects). NON scrive, NON cancella, NON copia. La pipeline di backup
// è ESTERNA all'app — qui verifichiamo solo che esista e sia raggiungibile.
//
// AWS Signature Version 4 implementato manualmente (no AWS SDK) per
// evitare di trascinarsi 500KB di dipendenze per due chiamate. La SigV4
// è documentata pubblicamente:
//   https://docs.aws.amazon.com/general/latest/gr/signing_aws_api_requests.html
//
// Tested against AWS S3 + Cloudflare R2 + MinIO. Per provider
// path-style, l'endpoint deve essere `https://<host>` e il bucket sta
// nel path della request (`/bucket/...`). Per AWS virtual-host nativo,
// l'endpoint può anche essere `https://s3.<region>.amazonaws.com`
// — l'SDK ufficiale lo riscriverebbe in `https://<bucket>.s3...`,
// noi accettiamo entrambi e usiamo path-style ovunque per uniformità
// (funziona su tutti i provider).

import "server-only";

import { createHash, createHmac } from "node:crypto";
import { getAppSettings } from "@/lib/db/settings-queries";

const FETCH_TIMEOUT_MS = 8000;
const SERVICE = "s3";

export interface S3Credentials {
  endpoint: string; // es. "https://s3.amazonaws.com" — NO trailing slash
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Prefix opzionale per filtrare LIST (es. "backup/"). */
  backupPrefix?: string;
}

export type S3Status =
  | "ok"
  | "invalid_credentials"
  | "forbidden"
  | "not_found"
  | "credentials_missing"
  | "endpoint_invalid"
  | "network_error"
  | "unknown";

export interface BucketCheckResult {
  status: S3Status;
  httpStatus?: number;
}

// ─── Credenziali da settings ───────────────────────────────────────────────

export async function getS3Credentials(): Promise<S3Credentials | null> {
  const settings = await getAppSettings();
  const endpoint = settings["s3.endpoint"]?.trim().replace(/\/+$/, "") ?? "";
  const region = settings["s3.region"]?.trim() ?? "";
  const bucket = settings["s3.bucket"]?.trim() ?? "";
  const accessKeyId = settings["s3.access_key_id"]?.trim() ?? "";
  const secretAccessKey = settings["s3.secret_access_key"]?.trim() ?? "";
  const backupPrefix = settings["s3.backup_prefix"]?.trim() ?? "";
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    backupPrefix: backupPrefix || undefined,
  };
}

// ─── SigV4 helpers ─────────────────────────────────────────────────────────

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function isoDate(d: Date): { amzDate: string; dateStamp: string } {
  // YYYYMMDDTHHmmssZ + YYYYMMDD
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const HH = pad(d.getUTCHours());
  const MM = pad(d.getUTCMinutes());
  const SS = pad(d.getUTCSeconds());
  return {
    amzDate: `${yyyy}${mm}${dd}T${HH}${MM}${SS}Z`,
    dateStamp: `${yyyy}${mm}${dd}`,
  };
}

/**
 * URI-encode secondo le regole SigV4 (più stretto di encodeURIComponent
 * standard: '/' va lasciato in encodePath, mentre va encodato in
 * encodeQuery; '~' resta unencoded).
 */
function rfc3986Encode(input: string, encodeSlash: boolean): string {
  return input
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      const isUnreserved =
        (code >= 0x41 && code <= 0x5a) || // A-Z
        (code >= 0x61 && code <= 0x7a) || // a-z
        (code >= 0x30 && code <= 0x39) || // 0-9
        c === "-" ||
        c === "_" ||
        c === "." ||
        c === "~";
      if (isUnreserved) return c;
      if (c === "/" && !encodeSlash) return c;
      return "%" + code.toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
}

/**
 * Costruisce il signature header e ritorna gli header completi pronti
 * per `fetch`. `query` è una mappa key→value (non encoded), il client
 * la encoda in canonical form.
 */
function signRequest(params: {
  method: "HEAD" | "GET";
  endpoint: string;
  path: string; // es. "/bucket-name" o "/bucket-name/"
  query: Record<string, string>;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  body: string;
  now: Date;
}): Record<string, string> {
  const { method, endpoint, path, query, region, accessKeyId, secretAccessKey, body, now } =
    params;
  const url = new URL(endpoint);
  const host = url.host;
  const { amzDate, dateStamp } = isoDate(now);

  const payloadHash = sha256Hex(body);

  // Canonical query (sorted by key)
  const sortedQuery = Object.keys(query)
    .sort()
    .map(
      (k) =>
        `${rfc3986Encode(k, true)}=${rfc3986Encode(query[k] ?? "", true)}`,
    )
    .join("&");

  const canonicalUri = rfc3986Encode(path, false);
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    canonicalUri,
    sortedQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  // Derive signing key
  const kDate = hmac("AWS4" + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Host: host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: authorization,
  };
}

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

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * HEAD bucket — verifica che il bucket esista e che le credenziali
 * abbiano i permessi minimi (`s3:ListBucket` per LIST, `s3:GetBucketLocation`
 * per HEAD). Mappa lo status HTTP a un esito tipizzato.
 *
 * Niente body in HEAD, niente parsing XML — basta lo status code.
 */
export async function checkBucket(
  creds: S3Credentials,
): Promise<BucketCheckResult> {
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(creds.endpoint);
  } catch {
    return { status: "endpoint_invalid" };
  }

  const path = `/${creds.bucket}`;
  const url = `${endpointUrl.origin}${path}`;
  const headers = signRequest({
    method: "HEAD",
    endpoint: creds.endpoint,
    path,
    query: {},
    region: creds.region,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    body: "",
    now: new Date(),
  });

  const res = await timedFetch(url, { method: "HEAD", headers });
  if (!res) return { status: "network_error" };

  if (res.status === 200 || res.status === 204) return { status: "ok", httpStatus: res.status };
  if (res.status === 401) return { status: "invalid_credentials", httpStatus: 401 };
  if (res.status === 403) return { status: "forbidden", httpStatus: 403 };
  if (res.status === 404) return { status: "not_found", httpStatus: 404 };
  return { status: "unknown", httpStatus: res.status };
}

/**
 * Wrapper convenience: legge le credenziali dal DB e le verifica.
 * Ritorna `credentials_missing` se non configurate.
 */
export async function checkS3Bucket(): Promise<BucketCheckResult> {
  const creds = await getS3Credentials();
  if (!creds) return { status: "credentials_missing" };
  return checkBucket(creds);
}
