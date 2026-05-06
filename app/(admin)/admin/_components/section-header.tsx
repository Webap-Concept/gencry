// app/(admin)/admin/_components/section-header.tsx
//
// Header standard delle sezioni admin: icona quadrata + h1 con
// "<breadcrumbLabel> / <title>" + sottotitolo, slot opzionali per il
// pulsante azione (es. "+ Nuovo") e per la guida (vedi AdminSectionInfo).
//
// Estratto da pages/page.tsx + templates/page.tsx per poterlo riusare
// anche nelle pagine di edit/new e mantenere il "dove sono nell'admin"
// visibile durante tutta la sessione (prima scompariva entrando in edit).
import type { LucideIcon } from "lucide-react";

export function AdminSectionHeader({
  icon: Icon,
  breadcrumbLabel,
  title,
  subtitle,
  infoSlot,
  actionSlot,
}: {
  icon: LucideIcon;
  breadcrumbLabel: string;
  title: string;
  subtitle?: string;
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
              <span style={{ color: "var(--admin-text-muted)" }}>
                {breadcrumbLabel}
              </span>
              <span style={{ color: "var(--admin-text-faint)" }}> / </span>
              <span>{title}</span>
            </h1>
            {infoSlot}
          </div>
          {subtitle && (
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--admin-text-faint)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actionSlot && <div className="shrink-0">{actionSlot}</div>}
    </div>
  );
}
