import { getLocale, getTranslations } from "next-intl/server";
import type { TemplateProps } from "./types";

/**
 * Layout Blog.
 * Stile hardcoded qui: per cambiarlo modifica direttamente questo file.
 *
 * Campi custom letti:
 *   - coverImage (image)    — URL immagine hero
 *   - author     (text)     — nome autore
 *   - category   (text)     — categoria / tag
 *   - readTime   (number)   — minuti di lettura stimati
 *   - excerpt    (textarea) — estratto/sommario del post
 */
export async function TemplateBlog({ page, fields }: TemplateProps) {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("public.cms"),
  ]);
  const dateLocale = locale === "en" ? "en-US" : "it-IT";
  return (
    <div
      style={{
        fontFamily: "inherit",
        background: "#fff",
        color: "#1a1a1a",
        minHeight: "100vh",
      }}>
      {fields.coverImage && (
        <div
          style={{
            width: "100%",
            aspectRatio: "16/9",
            overflow: "hidden",
            background: "#e5e7eb",
          }}>
          <img
            src={fields.coverImage}
            alt={page.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

      <main
        style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 1.5rem" }}>
        {(fields.category || fields.readTime) && (
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginBottom: "1rem",
              fontSize: "0.8125rem",
              color: "#6b7280",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
            {fields.category && <span>{fields.category}</span>}
            {fields.readTime && <span>⏱ {fields.readTime} min</span>}
          </div>
        )}

        <h1
          style={{
            fontSize: "clamp(1.875rem, 5vw, 3rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            marginBottom: "1rem",
          }}>
          {page.title}
        </h1>

        {(fields.author || page.publishedAt) && (
          <p
            style={{
              fontSize: "0.875rem",
              color: "#6b7280",
              marginBottom: "1.5rem",
            }}>
            {fields.author && (
              <>
                {t("byAuthor")} <strong>{fields.author}</strong>
              </>
            )}
            {page.publishedAt && (
              <>
                {fields.author ? " — " : ""}
                {new Date(page.publishedAt).toLocaleDateString(dateLocale, {
                  dateStyle: "long",
                })}
              </>
            )}
          </p>
        )}

        {fields.excerpt && (
          <p
            style={{
              fontSize: "1.125rem",
              lineHeight: 1.7,
              color: "#374151",
              borderLeft: "3px solid #6b7280",
              paddingLeft: "1rem",
              marginBottom: "2rem",
              fontStyle: "italic",
            }}>
            {fields.excerpt}
          </p>
        )}

        <div
          className="tpl-content"
          dangerouslySetInnerHTML={{ __html: page.content }}
          style={{ fontSize: "1.0625rem", lineHeight: 1.8 }}
        />
      </main>
    </div>
  );
}
