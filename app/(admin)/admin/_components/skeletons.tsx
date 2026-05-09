// app/(admin)/admin/_components/skeletons.tsx
//
// Skeleton riusabili per i loading.tsx delle sezioni admin.
// Tutti i blocchi sono div neutri animati con `animate-pulse`, colorati
// solo via token `--admin-*` per restare coerenti con il theming admin
// (light/dark) e non introdurre CSS frontend (vedi
// feedback_admin_no_frontend_css.md).
//
// Pensati per stare dentro un loading.tsx: niente "use client", niente
// state — Next li renderizza come Suspense fallback dei segment figli.

function Block({
  className,
  tone = "soft",
}: {
  className?: string;
  /** soft = hover-bg, faint = divider (più tenue, per text secondario) */
  tone?: "soft" | "faint";
}) {
  return (
    <div
      className={`animate-pulse rounded ${className ?? ""}`}
      style={{
        background:
          tone === "faint" ? "var(--admin-divider)" : "var(--admin-hover-bg)",
      }}
    />
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div
        className="w-9 h-9 shrink-0 rounded-xl animate-pulse"
        style={{ background: "var(--admin-hover-bg)" }}
      />
      <div className="space-y-2 pt-1">
        <Block className="h-4 w-40" />
        <Block className="h-3 w-64" tone="faint" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="rounded-xl shadow-sm p-4 space-y-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div
            className="w-8 h-8 rounded-full animate-pulse shrink-0"
            style={{ background: "var(--admin-hover-bg)" }}
          />
          <div className="flex-1 space-y-1.5">
            <Block className="h-3 w-1/3" />
            <Block className="h-2.5 w-1/2" tone="faint" />
          </div>
          <Block className="h-5 w-16 rounded-full" />
          <Block className="h-5 w-14 rounded-full" />
          <Block className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div
      className="rounded-xl shadow-sm p-6 space-y-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Block className="h-3 w-32" tone="faint" />
          <Block className="h-9 w-full" />
        </div>
      ))}
      <div className="flex justify-end pt-2">
        <Block className="h-9 w-28" />
      </div>
    </div>
  );
}
