import { ExternalLink } from "lucide-react";
import type { WidgetSetupGuide as WidgetSetupGuideData } from "@/lib/admin/dashboard/types";

/**
 * Presentational, stateless guide renderer. Server-component-compatible
 * (no hooks, no client-only deps) so it can be embedded both inside the
 * customize modal and inline in a widget body when its config is missing.
 *
 * The caller is responsible for reading the i18n object (e.g. via
 * `t.raw(key)`) and passing the result here.
 */
export default function WidgetSetupGuide({
  guide,
}: {
  guide: WidgetSetupGuideData;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontSize: 12,
        lineHeight: 1.55,
        color: "var(--admin-text-muted)",
      }}
    >
      <p style={{ margin: 0 }}>{guide.intro}</p>

      {guide.env && guide.env.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: "8px 10px",
            listStyle: "none",
            background: "var(--admin-page-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {guide.env.map((entry) => (
            <li key={entry.name} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <code
                style={{
                  fontSize: 11,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  color: "var(--admin-text)",
                  background: "var(--admin-hover-bg)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  alignSelf: "flex-start",
                }}
              >
                {entry.name}
              </code>
              <span style={{ fontSize: 11, color: "var(--admin-text-faint)" }}>
                {entry.hint}
              </span>
            </li>
          ))}
        </ul>
      )}

      {guide.docsUrl && (
        <a
          href={guide.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            color: "var(--admin-accent)",
            textDecoration: "none",
            alignSelf: "flex-start",
          }}
        >
          {guide.docsUrl.replace(/^https?:\/\//, "")}
          <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}
