// Barra di stato anteprima — fissa in cima alla preview.
// Mostra: stato pagina, titolo, link all'editor, link alla pagina pubblica (se published).
import Link from "next/link";

interface Props {
  pageId: number;
  pageTitle: string;
  pageStatus: string;
  pageSlug: string;
}

export default function PreviewBar({ pageId, pageTitle, pageStatus, pageSlug }: Props) {
  const isDraft = pageStatus === "draft";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        height: "48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1.25rem",
        background: isDraft ? "#1e293b" : "#14532d",
        color: "#f8fafc",
        fontSize: "0.8125rem",
        fontFamily: "system-ui, sans-serif",
        gap: "1rem",
      }}
    >
      {/* Sinistra: badge stato + titolo */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            padding: "0.2rem 0.6rem",
            borderRadius: "9999px",
            background: isDraft ? "#f59e0b" : "#22c55e",
            color: isDraft ? "#1a1a1a" : "#fff",
            fontWeight: 700,
            fontSize: "0.6875rem",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            flexShrink: 0,
          }}
        >
          {isDraft ? "✏️ Bozza" : "✅ Pubblicata"}
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: 0.85,
          }}
        >
          {pageTitle}
        </span>
      </div>

      {/* Destra: azioni */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
        {/* Torna all'editor */}
        <Link
          href={`/admin/contenuti/${pageId}/edit`}
          style={{
            padding: "0.3rem 0.85rem",
            borderRadius: "6px",
            background: "rgba(255,255,255,0.12)",
            color: "#f8fafc",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: "0.8125rem",
          }}
        >
          ← Editor
        </Link>

        {/* Apri pagina pubblica — solo se pubblicata */}
        {!isDraft && (
          <Link
            href={`/${pageSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "0.3rem 0.85rem",
              borderRadius: "6px",
              background: "#22c55e",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.8125rem",
            }}
          >
            Apri pubblica ↗
          </Link>
        )}
      </div>
    </div>
  );
}
