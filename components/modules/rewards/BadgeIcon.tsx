// components/modules/rewards/BadgeIcon.tsx
//
// Icona badge TONDA riusabile — single source of truth per come si vede un
// badge ovunque (profilo, negozio GCC, …). Cerchio col colore `iconBg` +
// icona centrata ~60%, così un'icona trasparente mostra il colore tutt'intorno.
// Presentational puro (niente hook) → usabile sia in RSC sia in client.
import { cn } from "@/lib/utils";

export interface BadgeIconProps {
  iconUrl?: string | null;
  iconBg?: string | null;
  /** Usata per alt + iniziale di fallback se manca l'icona. */
  label: string;
  /** Diametro in px. Default 48. */
  size?: number;
  /** Classi extra sul cerchio (es. hover lift/zoom, margini). */
  className?: string;
}

export function BadgeIcon({
  iconUrl,
  iconBg,
  label,
  size = 48,
  className,
}: BadgeIconProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full ring-2 ring-gc-line shadow-md",
        className,
      )}
      style={{ width: size, height: size, background: iconBg ?? "#888" }}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt={label} className="h-3/5 w-3/5 object-contain" />
      ) : (
        <span
          className="font-bold text-white"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {label.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
