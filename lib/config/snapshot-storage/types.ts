// lib/config/snapshot-storage/types.ts
//
// Astrazione storage per gli snapshot di configurazione. Il pattern è:
//   1. DB resta sorgente di verità (audit, transazioni, relations)
//   2. Ad ogni admin save, dumpa l'oggetto config a un file JSON nello storage
//   3. Il runtime legge SEMPRE dal file (mai DB) per le query di config "global"
//
// Backend supportati oggi: Cloudflare R2 (default).
// Backend supportabili in futuro senza toccare i caller: AWS S3, Backblaze B2,
// MinIO, ecc. — tutti S3-compatible API. L'astrazione esiste proprio per
// preservare la portabilità white-label: un cliente che non vuole Cloudflare
// può swappare implementazione senza riscrivere lo strato snapshots/.

import "server-only";

/**
 * Storage abstraction. Operazioni minimali per pattern snapshot:
 * - `read`: scarica il body intero (per cold start o quando ETag cambia)
 * - `write`: sovrascrive il file
 * - `head`: solo ETag (per validare la cache locale senza scaricare il body)
 */
export interface SnapshotStorage {
  /**
   * Read full snapshot from storage. Returns null se la chiave non esiste
   * (es. primo run, bootstrap necessario).
   * Throws se il backend è raggiungibile ma fallisce (network, permission).
   */
  read<T>(key: string): Promise<{ data: T; etag: string } | null>;

  /**
   * Write o sovrascrive lo snapshot. Ritorna l'ETag della versione appena
   * scritta — il caller la salva in memoria per il prossimo head check.
   */
  write<T>(key: string, data: T): Promise<{ etag: string }>;

  /**
   * HEAD-style check: ritorna solo l'ETag (no body download).
   * Costa molto meno di `read` — usato ogni N secondi per validare cache.
   * Ritorna null se la chiave non esiste.
   */
  head(key: string): Promise<{ etag: string } | null>;
}

/**
 * Errore tipato per fallback policy del caller. Se il backend è down e il
 * caller può continuare con un fallback (es. read da DB), prende questo e
 * non rilancia.
 */
export class SnapshotStorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SnapshotStorageError";
  }
}
