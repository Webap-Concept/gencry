"use client";

import type { Editor } from "@tiptap/react";
import {
  ChevronDown,
  Link2,
  Link2Off,
  Quote,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BLOCKQUOTE_STYLES,
  type BlockquoteStyle,
} from "./blockquote-styled";

// ---------------------------------------------------------------------------
// HeadingMenu — Paragraph / H1…H6 in un singolo dropdown
// ---------------------------------------------------------------------------

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

export function HeadingMenu({ editor }: { editor: Editor | null }) {
  const t = useTranslations("admin.content.pages.editor");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const activeLevel = useMemo<HeadingLevel | null>(() => {
    if (!editor) return null;
    for (const lvl of HEADING_LEVELS) {
      if (editor.isActive("heading", { level: lvl })) return lvl;
    }
    return null;
  }, [editor, editor?.state.selection.from, editor?.state.selection.to]);

  const label = activeLevel ? `H${activeLevel}` : t("toolbarHeadingParagraph");

  function setParagraph() {
    editor?.chain().focus().setParagraph().run();
    setOpen(false);
  }
  function setHeading(level: HeadingLevel) {
    editor?.chain().focus().toggleHeading({ level }).run();
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("toolbarHeading")}
        className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-semibold transition-colors"
        style={{
          color: activeLevel ? "var(--admin-accent)" : "var(--admin-text-muted)",
          background: activeLevel
            ? "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
            : "transparent",
          minWidth: "60px",
        }}
        onMouseEnter={(e) => {
          if (!activeLevel)
            e.currentTarget.style.background = "var(--admin-hover-bg)";
        }}
        onMouseLeave={(e) => {
          if (!activeLevel) e.currentTarget.style.background = "transparent";
        }}>
        <span>{label}</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg overflow-hidden"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            minWidth: "160px",
          }}>
          <MenuItem
            active={!activeLevel}
            onClick={setParagraph}
            label={t("toolbarHeadingParagraph")}
            preview="Aa"
            previewSize="0.875rem"
          />
          {HEADING_LEVELS.map((lvl) => (
            <MenuItem
              key={lvl}
              active={activeLevel === lvl}
              onClick={() => setHeading(lvl)}
              label={t(`toolbarHeadingH${lvl}` as `toolbarHeadingH${HeadingLevel}`)}
              preview={`H${lvl}`}
              previewSize={
                lvl === 1
                  ? "1.5rem"
                  : lvl === 2
                    ? "1.25rem"
                    : lvl === 3
                      ? "1.1rem"
                      : "1rem"
              }
              previewWeight={700}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockquoteMenu — 4 stili
// ---------------------------------------------------------------------------

export function BlockquoteMenu({ editor }: { editor: Editor | null }) {
  const t = useTranslations("admin.content.pages.editor");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const isQuote = editor?.isActive("blockquote") ?? false;
  const activeStyle = (
    isQuote ? editor?.getAttributes("blockquote").style : null
  ) as BlockquoteStyle | null;

  function applyStyle(style: BlockquoteStyle) {
    editor?.chain().focus().setBlockquoteStyle(style).run();
    setOpen(false);
  }
  function removeQuote() {
    if (isQuote) editor?.chain().focus().unsetBlockquote().run();
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("toolbarQuote")}
        className="flex items-center gap-1 px-1.5 py-1.5 rounded transition-colors"
        style={{
          color: isQuote ? "var(--admin-accent)" : "var(--admin-text-muted)",
          background: isQuote
            ? "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
            : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!isQuote)
            e.currentTarget.style.background = "var(--admin-hover-bg)";
        }}
        onMouseLeave={(e) => {
          if (!isQuote) e.currentTarget.style.background = "transparent";
        }}>
        <Quote size={15} />
        <ChevronDown size={11} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg overflow-hidden"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            minWidth: "200px",
          }}>
          {BLOCKQUOTE_STYLES.map((s) => (
            <MenuItem
              key={s}
              active={activeStyle === s || (s === "default" && isQuote && !activeStyle)}
              onClick={() => applyStyle(s)}
              label={t(`toolbarQuote_${s}` as `toolbarQuote_${BlockquoteStyle}`)}
              preview={s === "quoted" ? "“ ”" : "❝"}
              previewSize="1rem"
            />
          ))}
          {isQuote && (
            <>
              <div
                style={{
                  height: 1,
                  background: "var(--admin-divider)",
                  margin: "0.25rem 0",
                }}
              />
              <MenuItem
                onClick={removeQuote}
                label={t("toolbarQuoteRemove")}
                danger
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkMenu — esterno / interno (CMS)
// ---------------------------------------------------------------------------

export type InternalLinkPage = {
  id: number;
  title: string;
  slug: string;
};

export function LinkMenu({
  editor,
  internalPages,
  onOpenInternalPicker,
  onSetExternalLink,
}: {
  editor: Editor | null;
  internalPages: InternalLinkPage[];
  onOpenInternalPicker: () => void;
  onSetExternalLink: () => void;
}) {
  const t = useTranslations("admin.content.pages.editor");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const isLink = editor?.isActive("link") ?? false;
  const hasInternal = internalPages.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("toolbarLink")}
        className="flex items-center gap-1 px-1.5 py-1.5 rounded transition-colors"
        style={{
          color: isLink ? "var(--admin-accent)" : "var(--admin-text-muted)",
          background: isLink
            ? "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
            : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!isLink) e.currentTarget.style.background = "var(--admin-hover-bg)";
        }}
        onMouseLeave={(e) => {
          if (!isLink) e.currentTarget.style.background = "transparent";
        }}>
        <Link2 size={15} />
        <ChevronDown size={11} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg overflow-hidden"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            minWidth: "220px",
          }}>
          <MenuItem
            onClick={() => {
              setOpen(false);
              onSetExternalLink();
            }}
            label={t("toolbarLinkExternal")}
            sublabel={t("toolbarLinkExternalHint")}
          />
          <MenuItem
            onClick={() => {
              setOpen(false);
              if (hasInternal) onOpenInternalPicker();
            }}
            label={t("toolbarLinkInternal")}
            sublabel={
              hasInternal
                ? t("toolbarLinkInternalHint", { count: internalPages.length })
                : t("toolbarLinkInternalEmpty")
            }
            disabled={!hasInternal}
          />
          {isLink && (
            <>
              <div
                style={{
                  height: 1,
                  background: "var(--admin-divider)",
                  margin: "0.25rem 0",
                }}
              />
              <MenuItem
                onClick={() => {
                  setOpen(false);
                  editor?.chain().focus().unsetLink().run();
                }}
                label={t("toolbarLinkRemove")}
                icon={<Link2Off size={13} />}
                danger
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InternalLinkPicker — modal con search + lista pagine pubblicate
// ---------------------------------------------------------------------------

export function InternalLinkPicker({
  open,
  pages,
  onClose,
  onSelect,
}: {
  open: boolean;
  pages: InternalLinkPage[];
  onClose: () => void;
  onSelect: (page: InternalLinkPage) => void;
}) {
  const t = useTranslations("admin.content.pages.editor");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    );
  }, [pages, query]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "5rem 1rem 1rem",
          pointerEvents: "none",
        }}>
        <div
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "14px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            width: "100%",
            maxWidth: "520px",
            maxHeight: "70vh",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
          }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "14px 16px",
              borderBottom: "1px solid var(--admin-card-border)",
            }}>
            <Search size={15} style={{ color: "var(--admin-text-faint)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("linkInternalSearchPlaceholder")}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "0.9rem",
                color: "var(--admin-text)",
              }}
            />
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 26,
                height: 26,
                borderRadius: "6px",
                border: "none",
                background: "transparent",
                color: "var(--admin-text-faint)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label={t("linkInternalCloseAria")}>
              <X size={14} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "2rem 1rem",
                  textAlign: "center",
                  fontSize: "0.875rem",
                  color: "var(--admin-text-faint)",
                }}>
                {t("linkInternalEmpty")}
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p);
                    onClose();
                  }}
                  className="w-full text-left transition-colors"
                  style={{
                    display: "block",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--admin-text)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--admin-hover-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}>
                    {p.title}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontFamily: "monospace",
                      color: "var(--admin-text-faint)",
                      marginTop: "2px",
                    }}>
                    /{p.slug}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Shared MenuItem
// ---------------------------------------------------------------------------

function MenuItem({
  active,
  onClick,
  label,
  sublabel,
  preview,
  previewSize,
  previewWeight,
  icon,
  disabled,
  danger,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
  preview?: string;
  previewSize?: string;
  previewWeight?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left flex items-center gap-2 px-3 py-2 transition-colors"
      style={{
        background: active
          ? "color-mix(in srgb, var(--admin-accent) 12%, transparent)"
          : "transparent",
        color: danger
          ? "#ef4444"
          : active
            ? "var(--admin-accent)"
            : "var(--admin-text)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "none",
        fontSize: "0.875rem",
      }}
      onMouseEnter={(e) => {
        if (disabled || active) return;
        e.currentTarget.style.background = "var(--admin-hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (disabled || active) return;
        e.currentTarget.style.background = "transparent";
      }}>
      {preview && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            fontSize: previewSize ?? "0.875rem",
            fontWeight: previewWeight ?? 500,
            color: "var(--admin-text-faint)",
          }}>
          {preview}
        </span>
      )}
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block" }}>{label}</span>
        {sublabel && (
          <span
            style={{
              display: "block",
              fontSize: "0.7rem",
              color: "var(--admin-text-faint)",
              marginTop: "1px",
            }}>
            {sublabel}
          </span>
        )}
      </span>
    </button>
  );
}
