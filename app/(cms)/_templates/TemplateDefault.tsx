import type { TemplateProps } from "./types";

/**
 * Fallback Template.
 */
export function TemplateDefault({ page }: TemplateProps) {
  return (
    <div
      style={{
        fontFamily: "inherit",
        background: "#fff",
        color: "#1a1a1a",
        minHeight: "100vh",
      }}>
      <main
        style={{ maxWidth: "720px", margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h1
          style={{
            fontSize: "clamp(1.875rem, 5vw, 3rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            marginBottom: "1.5rem",
          }}>
          {page.title}
        </h1>
        <div
          className="tpl-content"
          dangerouslySetInnerHTML={{ __html: page.content }}
          style={{ fontSize: "1.0625rem", lineHeight: 1.8 }}
        />
      </main>
    </div>
  );
}
