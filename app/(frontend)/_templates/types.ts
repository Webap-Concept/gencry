import type { Page, PageTemplate, TemplateField } from "@/lib/db/schema";

/**
 * Regole di gerarchia/composizione del template.
 * Lo stile grafico vive direttamente nel componente Template{Slug}.tsx,
 * non più nel DB.
 */
export interface TemplateRules {
  /** Id dei template ammessi come figli di questo template (gerarchia pagine). */
  allowedChildTemplateIds?: number[];
}

export interface TemplateProps {
  page: Page;
  template: (PageTemplate & { fields: TemplateField[] }) | null;
  /** Valori dei campi custom: { fieldKey: value } */
  fields: Record<string, string>;
}

/** Helper: parsa customFields in modo sicuro */
export function parseCustomFields(
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Helper: parsa il JSON `rules` del template in modo sicuro */
export function parseRules(raw: string | null | undefined): TemplateRules {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TemplateRules;
  } catch {
    return {};
  }
}
