"use client";
// components/ui/user-avatar.tsx
//
// Avatar utente unificato. Se l'utente ha un avatarUrl valido renderizza
// l'<img>, altrimenti mostra un placeholder colorato con 2 iniziali —
// niente immagine rotta, niente icona generica "?", niente flicker tra
// render (colore deterministico dal seed).
//
// Usage:
//   <UserAvatar user={author} size={40} />
//   <UserAvatar user={{ username: "webapp" }} size={32} ring />
//
// onError fallback: l'avatarUrl può essere valorizzato ma puntare a un
// file che non esiste (es. R2 mancante, link rotto, utente seeder con
// URL fake). Quando il browser fail il load, switchiamo al placeholder
// colorato come se avatarUrl fosse null. Niente flicker su success-path
// perché lo state parte da false e l'img si carica come al solito.
import { useState, type CSSProperties } from "react";
import {
  type AvatarUserLike,
  colorForSeed,
  initialsFromUser,
  seedFromUser,
} from "@/lib/ui/avatar-fallback";

export type UserAvatarProps = {
  user: AvatarUserLike & { avatarUrl?: string | null };
  /** Dimensione in px (lato del quadrato). Default 40. */
  size?: number;
  /** Anello sottile attorno (es. per evidenziare l'utente corrente). */
  ring?: boolean;
  /** Classi extra (es. position assoluta, shadow). */
  className?: string;
  /** Alt text se diverso dal nome derivato; default empty (decorativo). */
  alt?: string;
};

function hasValidAvatar(url: string | null | undefined): url is string {
  if (!url) return false;
  return url.trim().length > 0;
}

export function UserAvatar({
  user,
  size = 40,
  ring = false,
  className,
  alt = "",
}: UserAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const boxStyle: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
  };
  const ringClass = ring ? "ring-2 ring-gc-bg" : "";
  const baseClass = `rounded-full overflow-hidden select-none ${ringClass} ${
    className ?? ""
  }`.trim();

  const showImg = hasValidAvatar(user.avatarUrl) && !imgFailed;

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl ?? undefined}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${baseClass} object-cover`}
        style={boxStyle}
      />
    );
  }

  const initials = initialsFromUser(user);
  const bg = colorForSeed(seedFromUser(user));

  return (
    <div
      aria-hidden={alt === "" ? true : undefined}
      aria-label={alt || undefined}
      className={`${baseClass} inline-flex items-center justify-center text-white font-medium leading-none`}
      style={{
        ...boxStyle,
        background: bg,
        // Font scala col size (~38% del lato, come il vecchio Avatar shared).
        fontSize: Math.max(10, Math.round(size * 0.38)),
        letterSpacing: "0.02em",
      }}
    >
      {initials}
    </div>
  );
}
