// components/feed/SectionSkeleton.tsx
//
// Skeleton placeholder usato come `<Suspense fallback>` durante il
// caricamento di una sezione della home. Server-friendly (niente
// state né hooks), riutilizzabile fra slot diversi.
//
// Dimensione di default ~120px h: abbastanza da occupare spazio per
// non far "saltare" il layout durante lo streaming, ma non eccessivo.
// Le sezioni con altezza più specifica (es. hero) possono passare la
// loro h custom via prop.

export function SectionSkeleton({
  height = 120,
  /** Mostra 3 righe placeholder testo invece del blocco vuoto. */
  variant = "block",
}: {
  height?: number;
  variant?: "block" | "list";
}) {
  if (variant === "list") {
    return (
      <div className="rounded-gc border border-gc-line bg-gc-bg-2 p-4 space-y-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gc-bg-3 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-1/3 rounded bg-gc-bg-3" />
              <div className="h-2.5 w-1/2 rounded bg-gc-bg-3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="rounded-gc border border-gc-line bg-gc-bg-2 animate-pulse"
      style={{ height }}
    />
  );
}
