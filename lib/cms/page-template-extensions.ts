// lib/cms/page-template-extensions.ts
//
// Registry generico di estensioni al page editor del CMS core. I moduli
// installati possono registrare:
//
//   - campi custom AGGIUNTIVI (oltre a quelli definiti nel `template_fields`
//     DB) — utile quando il campo segue regole specifiche del modulo
//     (es. select con opzioni autogenerate da un enum interno)
//
//   - uno "slug resolver" che pilota il prefix dell'URL della page in
//     base ai valori dei custom fields (es. modulo news → prefix
//     dalla categoria scelta)
//
// Il core CMS NON conosce nessun modulo. Il registry vive in memoria
// server, popolato al boot via side-effect import da
// `lib/modules/registry.ts`. I caller server passano l'extension
// risolta al client PageEditor come prop serializzabile (niente
// funzioni — solo dati).

export interface ExtensionFieldOption {
  value: string;
  label: string;
}

export interface ExtensionField {
  /** Chiave del customField nel JSON. Es. "category". */
  key: string;
  /** Tipo di rendering. Il page-editor supporta:
   *  - "text"     → input testuale
   *  - "textarea" → textarea multilinea
   *  - "image"    → MediaPickerField (R2 asset)
   *  - "toggle"   → checkbox booleano
   *  - "select"   → dropdown con `options` obbligatorie
   *  - "date"     → input HTML date
   *  - "number"   → input HTML number
   */
  type: "text" | "textarea" | "image" | "toggle" | "select" | "date" | "number";
  label: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  /** Obbligatorio quando type='select'. Ignorato altrimenti. */
  options?: ExtensionFieldOption[];
  /** Posizionamento relativo nel form rispetto ai template_fields del DB.
   *  Stesso campo `sortOrder` di template_fields, ordinamento crescente. */
  sortOrder?: number;
}

/**
 * Specifica del slug resolver dichiarativa (niente funzioni — passabile
 * dal server al client come JSON). Il page-editor legge il `fieldKey`
 * dai customFields locali, lo mappa via `prefixMap` e usa il risultato
 * come prefix URL della page. Se vuoto / non in mappa, usa `fallback`.
 */
export interface SlugResolverSpec {
  fieldKey: string;
  prefixMap: Record<string, string>;
  fallback: string;
}

export interface PageTemplateExtension {
  /** Discriminator: `page_templates.slug` su cui l'extension si applica.
   *  Es. "news" per il modulo News article. */
  templateSlug: string;
  fields: ExtensionField[];
  slugResolver?: SlugResolverSpec;
}

const REGISTRY = new Map<string, PageTemplateExtension>();

export function registerPageTemplateExtension(ext: PageTemplateExtension): void {
  REGISTRY.set(ext.templateSlug, ext);
}

export function getPageTemplateExtension(
  templateSlug: string,
): PageTemplateExtension | undefined {
  return REGISTRY.get(templateSlug);
}

export function getAllPageTemplateExtensions(): PageTemplateExtension[] {
  return Array.from(REGISTRY.values());
}
