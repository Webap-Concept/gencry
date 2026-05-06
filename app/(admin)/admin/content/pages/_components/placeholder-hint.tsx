"use client";

import { PLACEHOLDER_MAP } from "@/lib/utils/content-placeholders";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Pannello collassabile mostrato sopra l'editor Tiptap.
 * Elenca tutti i token disponibili con un pulsante "Copia" per ognuno.
 */
export default function PlaceholderHint({
  onInsert,
}: {
  /** Chiamata quando l'utente vuole inserire un token nell'editor */
  onInsert?: (token: string) => void;
}) {
  const t = useTranslations("admin.content.pages.editor");
  const [open, setOpen] = useState(false);
  const tokens = Object.entries(PLACEHOLDER_MAP);

  return (
    <div
      className="rounded-lg overflow-hidden mb-0"
      style={{
        border: "1px solid var(--admin-card-border)",
        background: "var(--admin-page-bg)",
      }}>
      {/* Intestazione collassabile */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors"
        style={{ color: "var(--admin-text-muted)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.color = "var(--admin-text)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.color = "var(--admin-text-muted)")
        }>
        <span className="flex items-center gap-1.5">
          <HelpCircle size={13} />
          {t("placeholdersTrigger")}
        </span>
        <ChevronDown
          size={13}
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 180ms ease",
          }}
        />
      </button>

      {/* Lista token */}
      {open && (
        <div
          className="px-3 pb-3 pt-1 flex flex-wrap gap-2"
          style={{ borderTop: "1px solid var(--admin-divider)" }}>
          {tokens.map(([key, meta]) => (
            <button
              key={key}
              type="button"
              title={`${t("placeholderTooltip")}\n${meta.description}`}
              onClick={() => onInsert?.(`{${key}}`)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors"
              style={{
                background:
                  "color-mix(in srgb, var(--admin-accent) 10%, var(--admin-card-bg))",
                color: "var(--admin-accent)",
                border:
                  "1px solid color-mix(in srgb, var(--admin-accent) 22%, transparent)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.filter = "brightness(1.15)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
              {`{${key}}`}
              <span
                className="font-sans not-italic ml-1"
                style={{
                  color: "var(--admin-text-faint)",
                  fontSize: "0.7rem",
                }}>
                {meta.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
