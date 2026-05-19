import { GENERATED_TEMPLATE_MAP } from "./index.generated";

/**
 * Slug per cui esiste un componente React in app/(cms)/_templates.
 * "default" è sempre disponibile (TemplateDefault è il fallback hardcoded).
 *
 * Usato dall'admin per segnalare i template DB privi di componente,
 * che a runtime cadrebbero silenziosamente sul TemplateDefault.
 */
export const REGISTERED_TEMPLATE_SLUGS: ReadonlySet<string> = new Set([
  "default",
  ...Object.keys(GENERATED_TEMPLATE_MAP),
]);

export function isTemplateSlugRegistered(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return REGISTERED_TEMPLATE_SLUGS.has(slug);
}
