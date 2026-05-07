// lib/admin/dependencies/npm.ts
//
// Fetch metadati di un pacchetto npm dal registry pubblico. Usato dalla
// dashboard /admin/services/dependencies per scoprire l'ultima versione
// stabile, la homepage, il repo, la description.
//
// Niente API key — il registry pubblico è anonimo. Throttling: il
// chiamante (registry.ts) parallelizza con un Promise.all con limite,
// abbiamo ~80 dependency e il registry tollera tranquillamente quel
// volume; le chiamate vengono comunque cachate 6h dal layer superiore.

import "server-only";

const REGISTRY_URL = "https://registry.npmjs.org";
const FETCH_TIMEOUT_MS = 6000;

export interface NpmPackageMeta {
  /** Versione "latest" tag (di solito stable). */
  latest: string | null;
  homepage: string | null;
  description: string | null;
  /** URL "github.com/owner/repo" derivato da repository.url quando
   *  presente nel manifest, normalizzato. Null se il pkg è hostato
   *  altrove (gitlab, bitbucket) o se manca il campo. */
  githubRepo: string | null;
}

interface RegistryPayload {
  "dist-tags"?: Record<string, string>;
  homepage?: string;
  description?: string;
  repository?: { type?: string; url?: string } | string;
}

/** Estrae "owner/repo" da una repository URL npm-style. */
function normalizeGithubUrl(repo: RegistryPayload["repository"]): string | null {
  if (!repo) return null;
  const rawUrl = typeof repo === "string" ? repo : repo.url;
  if (!rawUrl) return null;
  // Pattern accettati: git+https://github.com/owner/repo.git
  //                    git://github.com/owner/repo.git
  //                    https://github.com/owner/repo
  //                    github:owner/repo
  const m =
    rawUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#.*)?$/) ??
    rawUrl.match(/^github:([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

/**
 * Fetch della metadata di un singolo pacchetto. Ritorna null se 404 o
 * timeout. Mai throws — gli errori escono come campi vuoti per non
 * rompere l'aggregazione di N pacchetti.
 */
export async function fetchNpmPackage(
  name: string,
): Promise<NpmPackageMeta | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${REGISTRY_URL}/${encodeURIComponent(name)}`, {
      signal: controller.signal,
      // Il registry serve un payload abbreviato con questo Accept.
      // Pesa 90% di meno (kilobyte invece di megabyte per pacchetti grossi).
      headers: { Accept: "application/vnd.npm.install-v1+json" },
      // Disabilita cache fetch di Next: gestiamo la nostra cache 6h sopra.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RegistryPayload;
    return {
      latest: data["dist-tags"]?.latest ?? null,
      homepage: data.homepage ?? null,
      description: data.description ?? null,
      githubRepo: normalizeGithubUrl(data.repository),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
