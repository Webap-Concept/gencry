// components/modules/posts/icons/BearishIcon.tsx
//
// Reaction `bearish` (orso). Vedi index.ts per il map REACTION_ICON.
import type { ReactionIconProps } from "./types";

export function BearishIcon({ size = 24, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Bearish"
      className={className}
    >
      <circle cx="24" cy="28" r="11" fill="#c0392b" />
      <circle cx="76" cy="28" r="11" fill="#c0392b" />
      <path
        d="M50 18 C 28 18 14 32 14 54 C 14 74 30 86 50 86 C 70 86 86 74 86 54 C 86 32 72 18 50 18 Z"
        fill="#c0392b"
      />
      <path
        d="M30 48 L42 52"
        stroke="#f5ecdc"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M70 48 L58 52"
        stroke="#f5ecdc"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <ellipse cx="50" cy="68" rx="15" ry="12" fill="#e6a89d" />
      <path
        d="M44 62 Q 50 58 56 62 Q 54 67 50 68 Q 46 67 44 62 Z"
        fill="#1a0d09"
      />
    </svg>
  );
}
