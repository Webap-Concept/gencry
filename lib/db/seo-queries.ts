import { db } from "@/lib/db/drizzle";
import {
  seoPages,
  seoPageTranslations,
  type NewSeoPage,
  type SeoPage,
  type SeoPageTranslation,
} from "@/lib/db/schema";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { and, eq } from "drizzle-orm";

/**
 * Lookup di un record SEO con overlay opzionale per locale.
 *
 * Se `locale` è omesso o uguale a DEFAULT_LOCALE → ritorna il record
 * base così come è in `seo_pages`.
 *
 * Se `locale` è non-default e c'è una riga in `seo_page_translations`
 * con (pathname, locale), i 4 campi testuali (title, description,
 * og_title, og_description) vengono sovrascritti dai valori della
 * traduzione. I campi `null` nella traduzione cadono sul base, così
 * l'admin può tradurre solo title senza perdere la description default.
 */
export async function getSeoPage(
  pathname: string,
  locale?: string,
): Promise<SeoPage | undefined> {
  const [row] = await db
    .select()
    .from(seoPages)
    .where(eq(seoPages.pathname, pathname))
    .limit(1);
  if (!row) return undefined;
  if (!locale || locale === DEFAULT_LOCALE) return row;

  const [overlay] = await db
    .select()
    .from(seoPageTranslations)
    .where(
      and(
        eq(seoPageTranslations.pathname, pathname),
        eq(seoPageTranslations.locale, locale),
      ),
    )
    .limit(1);
  if (!overlay) return row;

  return {
    ...row,
    title: overlay.title ?? row.title,
    description: overlay.description ?? row.description,
    ogTitle: overlay.ogTitle ?? row.ogTitle,
    ogDescription: overlay.ogDescription ?? row.ogDescription,
  };
}

export async function getAllSeoPages(): Promise<SeoPage[]> {
  return db.select().from(seoPages).orderBy(seoPages.pathname);
}

/** Carica tutte le traduzioni di una pagina SEO (per il form admin). */
export async function getSeoPageTranslations(
  pathname: string,
): Promise<SeoPageTranslation[]> {
  return db
    .select()
    .from(seoPageTranslations)
    .where(eq(seoPageTranslations.pathname, pathname))
    .orderBy(seoPageTranslations.locale);
}

export async function upsertSeoPage(data: NewSeoPage): Promise<void> {
  await db
    .insert(seoPages)
    .values(data)
    .onConflictDoUpdate({
      target: seoPages.pathname,
      set: {
        label: data.label,
        title: data.title,
        description: data.description,
        ogTitle: data.ogTitle,
        ogDescription: data.ogDescription,
        ogImage: data.ogImage,
        robots: data.robots,
        jsonLdEnabled: data.jsonLdEnabled,
        jsonLdType: data.jsonLdType,
        updatedAt: new Date(),
      },
    });
}

/**
 * Upsert di una traduzione SEO. Se tutti i 4 campi testuali sono
 * null/empty, elimina la riga: niente record vuoti che inquinano la
 * tabella.
 */
export async function upsertSeoPageTranslation(data: {
  pathname: string;
  locale: string;
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
}): Promise<void> {
  const hasData =
    (data.title && data.title.trim()) ||
    (data.description && data.description.trim()) ||
    (data.ogTitle && data.ogTitle.trim()) ||
    (data.ogDescription && data.ogDescription.trim());

  if (!hasData) {
    await db
      .delete(seoPageTranslations)
      .where(
        and(
          eq(seoPageTranslations.pathname, data.pathname),
          eq(seoPageTranslations.locale, data.locale),
        ),
      );
    return;
  }

  await db
    .insert(seoPageTranslations)
    .values({
      pathname: data.pathname,
      locale: data.locale,
      title: data.title?.trim() || null,
      description: data.description?.trim() || null,
      ogTitle: data.ogTitle?.trim() || null,
      ogDescription: data.ogDescription?.trim() || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [seoPageTranslations.pathname, seoPageTranslations.locale],
      set: {
        title: data.title?.trim() || null,
        description: data.description?.trim() || null,
        ogTitle: data.ogTitle?.trim() || null,
        ogDescription: data.ogDescription?.trim() || null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Quando il pathname cambia in modifica: UPDATE diretto invece di
 * DELETE+INSERT, così la FK `ON UPDATE CASCADE` propaga il rename
 * alle traduzioni esistenti senza perderle.
 */
export async function renameSeoPage(
  oldPathname: string,
  data: NewSeoPage,
): Promise<void> {
  await db
    .update(seoPages)
    .set({
      pathname: data.pathname,
      label: data.label,
      title: data.title,
      description: data.description,
      ogTitle: data.ogTitle,
      ogDescription: data.ogDescription,
      ogImage: data.ogImage,
      robots: data.robots,
      jsonLdEnabled: data.jsonLdEnabled,
      jsonLdType: data.jsonLdType,
      updatedAt: new Date(),
    })
    .where(eq(seoPages.pathname, oldPathname));
}

export async function deleteSeoPage(pathname: string): Promise<void> {
  await db.delete(seoPages).where(eq(seoPages.pathname, pathname));
}
