// Sfondo decorativo: griglia cream a quadretti che sfuma ai bordi via
// maschera radiale. Va montato dentro un parent `relative overflow-hidden`
// (di solito un wrapper a tutta pagina). Le classi sono pensate per il
// tema GC (cream + verde brand) — usa var(--gc-line) come tinta della
// griglia.

export function GridBackdrop({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(var(--gc-line) 1px, transparent 1px), linear-gradient(90deg, var(--gc-line) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        backgroundPosition: "-1px -1px",
        maskImage:
          "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 80%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 80%)",
      }}
    />
  );
}
