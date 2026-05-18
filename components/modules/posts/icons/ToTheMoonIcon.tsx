// components/modules/posts/icons/ToTheMoonIcon.tsx
//
// Reaction `to_the_moon` (razzo). Vedi index.ts per il map REACTION_ICON.
import type { ReactionIconProps } from "./types";

export function ToTheMoonIcon({ size = 24, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="To the moon"
      className={className}
    >
      <path
        d="M40 76 Q 45 88 50 98 Q 55 88 60 76 Q 56 80 50 84 Q 44 80 40 76 Z"
        fill="#fdb45e"
      />
      <path d="M44 76 Q 47 84 50 92 Q 53 84 56 76 Z" fill="#fa8b1e" />
      <path d="M34 50 Q 14 62 22 76 L 40 70 Z" fill="#87bce0" />
      <path d="M66 50 Q 86 62 78 76 L 60 70 Z" fill="#87bce0" />
      <path
        d="M50 4 C 60 6 66 16 67 30 C 68 42 68 50 66 56 C 64 64 60 70 60 76 L 40 76 C 40 70 36 64 34 56 C 32 50 32 42 33 30 C 34 16 40 6 50 4 Z"
        fill="#d9d4cb"
      />
      <path
        d="M50 4 C 58 6 62 12 63 16 L 37 16 C 38 12 42 6 50 4 Z"
        fill="#5e5d57"
      />
      <circle cx="50" cy="40" r="10" fill="#c0392b" />
    </svg>
  );
}
