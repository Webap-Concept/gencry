import type { User } from "@/lib/shared/types";

type AvatarProps = {
  user: User & { avatarUrl?: string | null };
  size?: number;
  /** Mostra un anello sottile attorno (per evidenziare l'utente loggato) */
  ring?: boolean;
};

export function Avatar({ user, size = 36, ring = false }: AvatarProps) {
  const ringStyle = ring
    ? "0 0 0 2px var(--gc-bg), 0 0 0 3px var(--gc-fg)"
    : undefined;

  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="rounded-full object-cover flex-shrink-0 select-none"
        style={{ width: size, height: size, boxShadow: ringStyle }}
      />
    );
  }

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
        boxShadow: ringStyle,
      }}
    >
      {user.avatar}
    </div>
  );
}
