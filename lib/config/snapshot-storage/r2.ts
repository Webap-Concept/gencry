// lib/config/snapshot-storage/r2.ts
//
// R2 implementation di SnapshotStorage. Usa l'API S3-compatible — lo stesso
// client (@aws-sdk/client-s3) usato da lib/storage/r2-avatars.ts e dal modulo
// prices, quindi nessuna dipendenza nuova.
//
// Bucket dedicato (es. `gencry-config`) per isolamento di security: il token
// R2 per i config snapshot ha permessi solo su questo bucket. Avatar e coin
// images stanno su bucket diversi con token separati.

import "server-only";

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { SnapshotStorage } from "./types";
import { SnapshotStorageError } from "./types";

export interface ConfigR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function createConfigR2Client(cfg: ConfigR2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export class R2SnapshotStorage implements SnapshotStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async read<T>(
    key: string,
  ): Promise<{ data: T; etag: string } | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = await res.Body?.transformToString();
      if (!body) return null;
      const data = JSON.parse(body) as T;
      // ETag arriva quotato (es. `"abc123"`) — normalizziamo per match
      const etag = (res.ETag ?? "").replace(/^"|"$/g, "");
      return { data, etag };
    } catch (err: unknown) {
      // NoSuchKey è atteso al primo run (snapshot non ancora generato).
      const code = (err as { name?: string; Code?: string })?.name
        ?? (err as { Code?: string })?.Code;
      if (code === "NoSuchKey" || code === "NotFound") return null;
      throw new SnapshotStorageError(
        `R2 read failed for key=${key}`,
        err,
      );
    }
  }

  async write<T>(key: string, data: T): Promise<{ etag: string }> {
    try {
      const body = JSON.stringify(data);
      const res = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: "application/json; charset=utf-8",
          // CacheControl: rendiamo evidente che il file è "fresco" — qualunque
          // CDN edge davanti a R2 lo serve con TTL corto, così update si
          // propagano rapidamente. Il pattern interno (ETag check ogni 30s)
          // resta corretto a prescindere.
          CacheControl: "max-age=10, must-revalidate",
        }),
      );
      const etag = (res.ETag ?? "").replace(/^"|"$/g, "");
      return { etag };
    } catch (err) {
      throw new SnapshotStorageError(
        `R2 write failed for key=${key}`,
        err,
      );
    }
  }

  async head(key: string): Promise<{ etag: string } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const etag = (res.ETag ?? "").replace(/^"|"$/g, "");
      return { etag };
    } catch (err: unknown) {
      const code = (err as { name?: string; Code?: string })?.name
        ?? (err as { Code?: string })?.Code;
      if (code === "NoSuchKey" || code === "NotFound") return null;
      throw new SnapshotStorageError(
        `R2 head failed for key=${key}`,
        err,
      );
    }
  }
}
