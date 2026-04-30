import type { User } from "@/lib/shared/types";

type AvatarProps = {
  user: User;
  size?: number;
  /** Mostra un anello sottile attorno (per evidenziare l'utente loggato) */
  ring?: boolean;
};

export function Avatar({ user, size = 36, ring = false }: AvatarProps) {
  return (
    <div
      className="inline-flex items-center justify-center rounded-full font-display select-none flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: user.color,
        color: "#fff8ee",
        fontSize: size * 0.38,
        letterSpacing: "0.02em",
        boxShadow: ring
          ? "0 0 0 2px var(--gc-bg), 0 0 0 3px var(--gc-fg)"
          : undefined,
      }}
    >
      {user.avatar}
    </div>
  );
}
