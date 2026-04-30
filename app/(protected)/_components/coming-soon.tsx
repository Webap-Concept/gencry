// Placeholder usato dalle route in costruzione (Esplora, Profilo, Notifiche).
// Vive dentro app/(protected)/_components/ — il prefisso underscore è la
// convenzione Next.js per cartelle private (non routable).

type ComingSoonProps = {
  title: string;
  description: string;
};

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="animate-gc-screen">
      <div className="bg-gc-bg-2 border border-gc-line rounded-gc p-10 text-center">
        <div className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.08em] text-gc-fg-3 mb-3">
          <span className="w-[7px] h-[7px] rounded-full bg-gc-accent animate-gc-pulse" />
          In costruzione
        </div>
        <h1 className="font-display font-normal text-[clamp(32px,4vw,44px)] leading-none tracking-[-0.015em] text-gc-fg">
          {title}
        </h1>
        <p className="text-[14.5px] text-gc-fg-3 mt-3 max-w-[420px] mx-auto">
          {description}
        </p>
      </div>
    </div>
  );
}
