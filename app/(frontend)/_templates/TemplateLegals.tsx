import Link from "next/link";
import { getAppSettings } from "@/lib/db/settings-queries";
import type { TemplateProps } from "./types";

/**
 * Layout Legals.
 * Pagina "documento legale" staccata dalla nav social: solo header
 * minimale con logo (preso dai settings, link alla home), corpo a
 * larghezza ridotta per la leggibilità, footer pubblico ereditato
 * dal layout (frontend) — utile perché contiene il bottone preferenze
 * cookie, coerente coi documenti privacy.
 *
 * Stile hardcoded qui: per cambiarlo modifica direttamente questo file.
 * Nessun campo custom: usa solo page.title, page.content, page.updatedAt.
 */
export async function TemplateLegals({ page }: TemplateProps) {
  const settings = await getAppSettings();
  const logoUrl = settings.app_logo_url ?? settings.app_logo_variant_url;
  const appName = settings.app_name;

  const updatedLabel = new Date(page.updatedAt).toLocaleDateString("it-IT", {
    dateStyle: "long",
  });

  return (
    <div
      style={{
        fontFamily: "inherit",
        background: "#fff",
        color: "#1a1a1a",
        minHeight: "100vh",
      }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          height: "64px",
          display: "flex",
          alignItems: "center",
        }}>
        <div
          style={{
            maxWidth: "720px",
            width: "100%",
            margin: "0 auto",
            padding: "0 1.5rem",
          }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
            }}
            aria-label={appName}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={appName}
                style={{ height: "32px", width: "auto", display: "block" }}
              />
            ) : (
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>
                {appName}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main
        style={{ maxWidth: "720px", margin: "0 auto", padding: "3rem 1.5rem" }}>
        <article>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#6b7280",
              marginBottom: "0.75rem",
            }}>
            Informativa
          </div>

          <h1
            style={{
              fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              marginBottom: "0.75rem",
            }}>
            {page.title}
          </h1>

          <p
            style={{
              fontSize: "0.875rem",
              color: "#6b7280",
              marginBottom: "2.5rem",
            }}>
            Ultimo aggiornamento: {updatedLabel}
          </p>

          <div
            className="tpl-content"
            dangerouslySetInnerHTML={{ __html: page.content }}
            style={{ fontSize: "1rem", lineHeight: 1.8 }}
          />
        </article>
      </main>
    </div>
  );
}
