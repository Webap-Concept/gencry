import { getAssetsByIds } from "@/lib/db/media-queries";
import type { TemplateField } from "@/lib/db/schema";

const MEDIA_FIELD_TYPES = new Set(["image"]);

/**
 * Resolve dei custom fields prima del rendering del template.
 *
 * I template ricevono `Record<string, string>` con URL già pronti, quindi i
 * campi `image` salvati come `media_asset_id` (numero) vanno tradotti in URL
 * pubblici. Se il valore non è un id valido, lo lasciamo intatto — supporta
 * URL esterni o legacy salvati come stringa.
 *
 * Eseguito in-line dal renderer CMS: una sola query bulk per tutta la pagina.
 */
export async function resolveMediaFields(
  rawFields: Record<string, string>,
  templateFields: TemplateField[],
): Promise<Record<string, string>> {
  const mediaKeys = templateFields
    .filter((f) => MEDIA_FIELD_TYPES.has(f.fieldType))
    .map((f) => f.fieldKey);

  if (mediaKeys.length === 0) return rawFields;

  const idsToFetch: number[] = [];
  for (const key of mediaKeys) {
    const value = rawFields[key];
    if (!value) continue;
    const n = Number(value);
    if (Number.isInteger(n) && n > 0 && String(n) === value.trim()) {
      idsToFetch.push(n);
    }
  }

  if (idsToFetch.length === 0) return rawFields;

  const assets = await getAssetsByIds(idsToFetch);

  const resolved: Record<string, string> = { ...rawFields };
  for (const key of mediaKeys) {
    const value = rawFields[key];
    if (!value) continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) continue;
    const asset = assets.get(n);
    if (asset) {
      resolved[key] = asset.publicUrl;
    } else {
      // Asset eliminato dopo il salvataggio — meglio stringa vuota che id
      // numerico orfano nel template.
      resolved[key] = "";
    }
  }

  return resolved;
}
