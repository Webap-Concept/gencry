import { getLocale, getTranslations } from "next-intl/server";
import type { TemplateProps } from "./types";

/**
 * Template Legals (privacy, cookie, terms).
 *
 * Header e footer ereditati dal layout `(cms)`. Corpo a larghezza
 * ridotta per la leggibilità. Theme-aware (token `--gc-*`).
 *
 * Nessun campo custom: usa solo page.title, page.content, page.updatedAt.
 */
export async function TemplateLegals({ page }: TemplateProps) {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("public.cms"),
  ]);

  const dateLocale = locale === "en" ? "en-US" : "it-IT";
  const updatedLabel = new Date(page.updatedAt).toLocaleDateString(dateLocale, {
    dateStyle: "long",
  });

  return (
    <main className="mx-auto max-w-[720px] px-6 py-12">
      <article>
        <div className="text-xs font-semibold uppercase tracking-[0.1em] text-gc-fg-3 mb-3">
          {t("legalsEyebrow")}
        </div>

        <h1 className="text-[clamp(1.5rem,4vw,2.25rem)] font-bold leading-tight text-gc-fg mb-3">
          {page.title}
        </h1>

        <p className="text-sm text-gc-fg-3 mb-10">
          {t("legalsLastUpdate")} {updatedLabel}
        </p>

        <div
          className="tpl-content text-base leading-[1.8] text-gc-fg"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      </article>
    </main>
  );
}
