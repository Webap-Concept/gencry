// app/(admin)/admin/_components/architecture/arch-primitives.tsx
//
// Componenti riusabili per le pagine /admin/modules/<slug>/architecture.
// Tutti server-renderable: niente "use client" così la pagina può
// restare RSC (solo l'<ArchDiagram> client-side ha JS).
//
// Naming: prefisso `Arch*` per evitare collisioni con il resto admin.
import { CalendarClock, GitCommit } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────
// ArchSection — wrapper con id (per anchor nav) + titolo + icona
// ─────────────────────────────────────────────────────────────────────

export function ArchSection({
  id,
  title,
  icon: Icon,
  intro,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl p-5 sm:p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <header className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <Icon size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--admin-text)" }}>
          {title}
        </h2>
      </header>
      {intro ? (
        <div
          className="mb-4 text-sm leading-relaxed"
          style={{ color: "var(--admin-text-muted)" }}>
          {intro}
        </div>
      ) : null}
      <div
        className="text-sm leading-relaxed space-y-3"
        style={{ color: "var(--admin-text-muted)" }}>
        {children}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ArchTechBadge — pill colorata per lo stack tecnologico
// ─────────────────────────────────────────────────────────────────────

export function ArchTechBadge({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: "neutral" | "accent" | "warn";
}) {
  const palette = {
    neutral: {
      bg: "color-mix(in srgb, var(--admin-text-faint) 10%, transparent)",
      fg: "var(--admin-text)",
      bd: "var(--admin-card-border)",
    },
    accent: {
      bg: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
      fg: "var(--admin-accent)",
      bd: "color-mix(in srgb, var(--admin-accent) 30%, transparent)",
    },
    warn: {
      bg: "color-mix(in srgb, var(--gc-warning-fg) 12%, transparent)",
      fg: "var(--gc-warning-fg)",
      bd: "color-mix(in srgb, var(--gc-warning-fg) 30%, transparent)",
    },
  }[variant];

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
      }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ArchFileLink — link clickable a file del codebase (markdown style)
// ─────────────────────────────────────────────────────────────────────

export function ArchFileLink({
  path,
  label,
  description,
}: {
  /** Percorso relativo dal root del repo, es. `lib/modules/posts/lib/parsing.ts` */
  path: string;
  /** Label visibile. Default = ultima parte del path. */
  label?: string;
  /** Descrizione breve di cosa fa il file. */
  description?: string;
}) {
  // Usiamo un link relativo: in dev VSCode lo apre, su Vercel apre 404
  // (innocuo, queste pagine sono admin-only e ci interessa il dev mode).
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg"
      style={{
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <code
        className="text-xs px-1.5 py-0.5 rounded font-mono shrink-0"
        style={{
          background: "color-mix(in srgb, var(--admin-accent) 10%, transparent)",
          color: "var(--admin-accent)",
        }}>
        {label ?? path.split("/").pop()}
      </code>
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-mono break-all"
          style={{ color: "var(--admin-text-faint)" }}>
          {path}
        </p>
        {description ? (
          <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ArchSchemaTable — tabella per documentare una entity del DB
// ─────────────────────────────────────────────────────────────────────

export function ArchSchemaTable({
  name,
  description,
  columns,
}: {
  name: string;
  description?: string;
  columns: Array<{ name: string; type: string; note?: string }>;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--admin-card-border)" }}>
      <div
        className="px-3 py-2 text-xs font-mono"
        style={{
          background:
            "color-mix(in srgb, var(--admin-accent) 8%, transparent)",
          borderBottom: "1px solid var(--admin-card-border)",
          color: "var(--admin-text)",
        }}>
        <span className="font-semibold">{name}</span>
        {description ? (
          <span style={{ color: "var(--admin-text-faint)" }}> · {description}</span>
        ) : null}
      </div>
      <div className="text-xs">
        {columns.map((col, i) => (
          <div
            key={col.name}
            className="flex items-start gap-3 px-3 py-1.5"
            style={{
              borderTop:
                i === 0 ? "none" : "1px solid var(--admin-card-border)",
            }}>
            <code
              className="font-mono shrink-0 min-w-[140px]"
              style={{ color: "var(--admin-text)" }}>
              {col.name}
            </code>
            <code
              className="font-mono shrink-0 min-w-[120px]"
              style={{ color: "var(--admin-accent)" }}>
              {col.type}
            </code>
            {col.note ? (
              <span
                className="flex-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {col.note}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ArchFutureCard — card per le future optimizations
// ─────────────────────────────────────────────────────────────────────

export function ArchFutureCard({
  tier,
  title,
  description,
  trigger,
}: {
  /** Quanto urgente: 1 = "appena serve", 2 = "se cresciamo", 3 = "polish". */
  tier: 1 | 2 | 3;
  title: string;
  description: string;
  /** Condizione che dovrebbe far scattare l'ottimizzazione. */
  trigger?: string;
}) {
  const tierColors = {
    1: { fg: "var(--gc-pos)", label: "Tier 1" },
    2: { fg: "var(--admin-accent)", label: "Tier 2" },
    3: { fg: "var(--admin-text-faint)", label: "Tier 3" },
  }[tier];

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
          style={{
            color: tierColors.fg,
            background: `color-mix(in srgb, ${tierColors.fg} 12%, transparent)`,
          }}>
          {tierColors.label}
        </span>
        <p
          className="text-sm font-medium"
          style={{ color: "var(--admin-text)" }}>
          {title}
        </p>
      </div>
      <p
        className="text-xs leading-relaxed"
        style={{ color: "var(--admin-text-muted)" }}>
        {description}
      </p>
      {trigger ? (
        <p
          className="text-xs mt-1.5"
          style={{ color: "var(--admin-text-faint)" }}>
          <strong style={{ color: tierColors.fg }}>Trigger:</strong> {trigger}
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ArchAnchorNav — sticky side nav con i link alle sezioni
// ─────────────────────────────────────────────────────────────────────

export function ArchAnchorNav({
  sections,
}: {
  sections: Array<{ id: string; label: string }>;
}) {
  return (
    <nav
      aria-label="Sezioni architettura"
      className="hidden lg:block sticky top-6 self-start text-xs"
      style={{ color: "var(--admin-text-faint)" }}>
      <p
        className="text-[10px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: "var(--admin-text-faint)" }}>
        Sezioni
      </p>
      <ul className="space-y-1">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block px-2 py-1 rounded hover:opacity-100 transition-opacity opacity-80"
              style={{ color: "var(--admin-text-muted)" }}>
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ArchMaintenanceFooter — banner "ultima revisione" in fondo alla pagina
// ─────────────────────────────────────────────────────────────────────
//
// Mostra la data dell'ultima revisione manuale della pagina + la
// versione del modulo. Se la pagina è più vecchia di STALE_AFTER_DAYS
// la striscia diventa arancione come affordance visiva ("questa doc
// potrebbe essere out-of-sync col codice").
//
// IMPORTANTE: la `reviewedAt` è hardcoded nel TSX di proposito — NON
// usare `new Date()` o `mtime` del file. Vogliamo che resti la data
// dell'ultima revisione *intenzionale*, non quella dell'ultimo commit
// che ha toccato la pagina per ritocchi cosmetici. Bump-ala a mano
// quando rivedi davvero il contenuto vs il codice.
//
// Memory di riferimento: feedback_architecture_docs_maintenance.

const STALE_AFTER_DAYS = 30;

export function ArchMaintenanceFooter({
  reviewedAt,
  moduleVersion,
  moduleSlug,
}: {
  /** ISO date 'YYYY-MM-DD' — quando hai rivisto manualmente la pagina. */
  reviewedAt: string;
  /** Versione dal manifest del modulo. */
  moduleVersion: string;
  /** Slug del modulo (es. "posts"), usato per link al manifest. */
  moduleSlug: string;
}) {
  const reviewedDate = new Date(reviewedAt);
  const ageDays = Math.floor(
    (Date.now() - reviewedDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const stale = ageDays > STALE_AFTER_DAYS;

  const palette = stale
    ? {
        bg: "color-mix(in srgb, var(--gc-warning-fg) 8%, transparent)",
        fg: "var(--gc-warning-fg)",
        bd: "color-mix(in srgb, var(--gc-warning-fg) 25%, transparent)",
      }
    : {
        bg: "color-mix(in srgb, var(--admin-text-faint) 6%, transparent)",
        fg: "var(--admin-text-faint)",
        bd: "var(--admin-card-border)",
      };

  return (
    <footer
      className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.bd}`,
        color: palette.fg,
      }}>
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock size={13} />
        <strong>Ultima revisione:</strong> {reviewedAt}
        {stale ? (
          <span style={{ marginLeft: 6 }}>
            ({ageDays}g fa — verifica drift col codice)
          </span>
        ) : (
          <span style={{ marginLeft: 6 }}>({ageDays}g fa)</span>
        )}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <GitCommit size={13} />
        <strong>Modulo:</strong>{" "}
        <code style={{ fontFamily: "ui-monospace, monospace" }}>
          {moduleSlug}@{moduleVersion}
        </code>
      </span>
      <span className="flex-1 text-right" style={{ minWidth: 200 }}>
        Bumpa <code>reviewedAt</code> ogni volta che rivedi la pagina vs il codice.
      </span>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ArchHookBox — box dedicato per "dove intervenire" / hook stabili
// ─────────────────────────────────────────────────────────────────────

export function ArchHookBox({
  title,
  description,
  filePath,
  contract,
}: {
  title: string;
  description: string;
  filePath: string;
  contract?: string;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background:
          "color-mix(in srgb, var(--admin-accent) 6%, transparent)",
        border:
          "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
      }}>
      <p
        className="text-sm font-semibold mb-1"
        style={{ color: "var(--admin-text)" }}>
        {title}
      </p>
      <p
        className="text-xs mb-2"
        style={{ color: "var(--admin-text-muted)" }}>
        {description}
      </p>
      <code
        className="text-xs font-mono block break-all"
        style={{ color: "var(--admin-accent)" }}>
        {filePath}
      </code>
      {contract ? (
        <p
          className="text-xs mt-2 italic"
          style={{ color: "var(--admin-text-faint)" }}>
          Contract: {contract}
        </p>
      ) : null}
    </div>
  );
}
