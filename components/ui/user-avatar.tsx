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
import { BadgeCheck } from "lucide-react";
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
  /** Mostra il badge azienda verificata sovrapposto in basso a destra. */
  verifiedBusiness?: boolean;
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
  verifiedBusiness = false,
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

  const avatarEl = showImg ? (
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
  ) : (
    <div
      aria-hidden={alt === "" ? true : undefined}
      aria-label={alt || undefined}
      className={`${baseClass} inline-flex items-center justify-center text-white font-medium leading-none`}
      style={{
        ...boxStyle,
        background: colorForSeed(seedFromUser(user)),
        // Font scala col size (~38% del lato, come il vecchio Avatar shared).
        fontSize: Math.max(10, Math.round(size * 0.38)),
        letterSpacing: "0.02em",
      }}
    >
      {initialsFromUser(user)}
    </div>
  );

  if (!verifiedBusiness) return avatarEl;

  // Badge azienda verificata: spunta sovrapposta in basso a destra, con un
  // anello del colore di sfondo per staccare dall'avatar. Dimensione ~36%
  // del lato (min 12px), come X/Instagram.
  const badgeSize = Math.max(12, Math.round(size * 0.36));
  return (
    <span
      className="relative inline-flex"
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      {avatarEl}
      <BadgeCheck
        aria-label="Verified business"
        className="absolute bottom-0 right-0 text-gc-accent"
        style={{
          width: badgeSize,
          height: badgeSize,
          // fill bianco dietro la spunta + anello bg per lo stacco
          background: "var(--gc-bg)",
          borderRadius: "9999px",
          padding: 1,
          transform: "translate(15%, 15%)",
        }}
      />
    </span>
  );
}
