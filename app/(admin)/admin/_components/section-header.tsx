// app/(admin)/admin/_components/section-header.tsx
//
// Componente UNICO per l'header di tutte le pagine admin del CORE.
// Rispetto al pattern legacy (SettingsHeader/ServicesHeader con dispatch
// by pathname) ogni page.tsx passa esplicitamente icon/breadcrumb/title:
// più verboso ma trasparente, niente magia, un colpo d'occhio basta a
// capire cosa renderizza una page.
//
// **NON USARE NEI MODULI** (vedi project_modular_architecture.md):
// ogni modulo deve avere il suo header locale (es. PricesHeader) per
// preservare l'indipendenza del core white-label.
//
// `title` è opzionale: se omesso mostra solo `breadcrumbLabel` (pagina
// "root" della section, es. /admin/settings → "Settings").
import type { LucideIcon } from "lucide-react";

export function AdminSectionHeader({
  icon: Icon,
  breadcrumbLabel,
  title,
  subtitle,
  subtitleSlot,
  infoSlot,
  actionSlot,
}: {
  icon: LucideIcon;
  breadcrumbLabel: string;
  title?: string;
  /** Sottotitolo come stringa semplice. Mutuamente esclusivo con `subtitleSlot`. */
  subtitle?: string;
  /** Sottotitolo come JSX (per quando serve markup inline tipo `<code>`). */
  subtitleSlot?: React.ReactNode;
  infoSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
          style={{
            background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <Icon size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1
              className="text-lg font-bold"
              style={{ color: "var(--admin-text)" }}>
              {title ? (
                <>
                  <span style={{ color: "var(--admin-text-muted)" }}>
                    {breadcrumbLabel}
                  </span>
                  <span style={{ color: "var(--admin-text-faint)" }}> / </span>
                  <span>{title}</span>
                </>
              ) : (
                breadcrumbLabel
              )}
            </h1>
            {infoSlot}
          </div>
          {(subtitleSlot || subtitle) && (
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--admin-text-faint)" }}>
              {subtitleSlot ?? subtitle}
            </p>
          )}
        </div>
      </div>
      {actionSlot && <div className="shrink-0">{actionSlot}</div>}
    </div>
  );
}
