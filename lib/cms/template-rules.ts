// lib/cms/template-rules.ts
//
// Type + parser per il campo `pageTemplates.rules` (text JSON in DB).
// Centralizzato qui per evitare JSON.parse sparsi e tipizzazione drift.
//
// Le regole sono applicate dal page-editor (UI/UX) E dalla server action
// `upsertPageAction` (security / data integrity). Niente fiducia nel
// client: tutti i flag sono ri-controllati server-side.
//
// Convenzione: TUTTI i campi sono opzionali. Se un flag manca → false
// (semantica "feature off by default"). Niente migration richiesta per
// aggiungere nuovi flag: page templates vecchi con `rules='{}'` continuano
// a comportarsi come prima.

export interface TemplateRules {
  /**
   * Slug bloccato dopo il primo salvataggio.
   *
   * Pattern: alla creazione (no page.id ancora) lo slug è editabile e
   * normalmente derivato dal titolo. Dopo il primo INSERT, lo slug
   * diventa read-only nell'editor e ignorato lato server se l'utente
   * tenta di cambiarlo bypassando la UI.
   *
   * Use case: pagine "concept stabile" (home news, page categoria, ecc.)
   * dove il rename URL è quasi sempre un errore (rompe link, SEO,
   * bookmark esterni). Più granulare di `pages.is_system` che blocca
   * anche il delete e nasconde la page in sezione "sistema".
   */
  slugLocked?: boolean;

  /**
   * Content bloccato (rich-text disabilitato in editor).
   *
   * Use case: pagine "container" dove il rendering è interamente nel
   * componente Template (es. news home, listing categoria) e l'admin
   * non deve scrivere body. Lo SEO resta editabile.
   *
   * Equivalente concettuale a `pages.content_editable=false` ma a
   * livello template (vale per TUTTE le page con questo template,
   * niente bisogno di settare il flag per-page).
   */
  contentLocked?: boolean;

  /**
   * Solo i template ID elencati possono essere usati come figli di
   * una page con questo template. Vuoto/assente = nessuna restriction
   * (qualsiasi template figlio è ammesso).
   *
   * Es. template "Categoria news" → allowedChildTemplateIds=[<id-articolo>]
   * → l'admin nel page-editor di un articolo figlio vede solo l'articolo
   * tra le opzioni template, niente accidenti tipo "metto un'altra
   * categoria dentro una categoria".
   */
  allowedChildTemplateIds?: number[];
}

/**
 * Parse safe del campo rules. Mai throw: rules malformata → ritorna
 * defaults vuoti (i flag valgono false / array vuoto). Pattern same as
 * page.customFields parser.
 */
export function parseTemplateRules(raw: string | null | undefined): TemplateRules {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: TemplateRules = {};
    if (typeof parsed.slugLocked === "boolean") out.slugLocked = parsed.slugLocked;
    if (typeof parsed.contentLocked === "boolean") out.contentLocked = parsed.contentLocked;
    if (Array.isArray(parsed.allowedChildTemplateIds)) {
      out.allowedChildTemplateIds = parsed.allowedChildTemplateIds
        .map((n: unknown) => Number(n))
        .filter((n: number) => Number.isInteger(n) && n > 0);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Serializza per il save admin. Drop dei campi falsy / vuoti per non
 * lasciare rumore (`'{"slugLocked":false}'` vs `'{}'`).
 */
export function serializeTemplateRules(rules: TemplateRules): string {
  const out: Record<string, unknown> = {};
  if (rules.slugLocked === true) out.slugLocked = true;
  if (rules.contentLocked === true) out.contentLocked = true;
  if (rules.allowedChildTemplateIds && rules.allowedChildTemplateIds.length > 0) {
    out.allowedChildTemplateIds = rules.allowedChildTemplateIds;
  }
  return JSON.stringify(out);
}

/**
 * Helper convenience: ritorna true se la page (edit mode) deve avere
 * lo slug grigio/readonly. False per page nuove (slug ancora libero,
 * il lock scatta solo dopo il primo INSERT).
 */
export function isSlugReadonly(
  rules: TemplateRules,
  isExistingPage: boolean,
): boolean {
  return rules.slugLocked === true && isExistingPage;
}

/**
 * Helper convenience: ritorna true se l'editor di content deve essere
 * nascosto. Vale anche per page nuove (l'admin non deve poter creare
 * content che poi resta bloccato per gli edit successivi).
 */
export function isContentReadonly(rules: TemplateRules): boolean {
  return rules.contentLocked === true;
}
