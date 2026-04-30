"use client";

// Saluto in cima al feed con badge "live", titolo grande in serif italic
// e due statistiche di sintesi a destra.

function getSalute(): string {
  const hr = new Date().getHours();
  if (hr < 6) return "Buonanotte";
  if (hr < 12) return "Buongiorno";
  if (hr < 18) return "Ciao";
  return "Buonasera";
}

function Stat({
  value,
  label,
  positive,
}: {
  value: string;
  label: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-gc-bg-2 border border-gc-line rounded-gc px-[18px] py-3 min-w-[120px]">
      <div
        className={`font-mono text-[22px] font-medium tabular-nums ${
          positive ? "text-gc-pos" : "text-gc-fg"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-gc-fg-3 uppercase tracking-[0.06em] mt-0.5">
        {label}
      </div>
    </div>
  );
}

export function HeroGreeting() {
  return (
    <section className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11.5px] uppercase tracking-[0.08em] text-gc-fg-3 mb-2.5">
            <span className="w-[7px] h-[7px] rounded-full bg-gc-green animate-gc-pulse" />
            Mercati aperti · live
          </div>
          {/* suppressHydrationWarning: il saluto dipende dall'ora locale del
              client, può differire dal render server (UTC). Comportamento
              voluto, niente errori in console. */}
          <h1 className="font-display font-normal text-[clamp(36px,5vw,52px)] leading-none tracking-[-0.015em] text-gc-fg">
            <span suppressHydrationWarning>{getSalute()}</span>,{" "}
            <em className="italic text-gc-accent">tu</em>.
          </h1>
          <p className="text-[14.5px] text-gc-fg-3 mt-2 max-w-[460px]">
            Ecco cosa sta succedendo nelle tue watchlist e nelle persone che
            segui.
          </p>
        </div>
        <div className="flex gap-3">
          <Stat value="+2.4%" label="Le tue coin oggi" positive />
          <Stat value="7" label="Nuove attività" />
        </div>
      </div>
    </section>
  );
}
