// components/modules/posts/icons/BullishIcon.tsx
//
// Reaction `bullish` (toro). Vedi index.ts per il map REACTION_ICON.
import type { ReactionIconProps } from "./types";

export function BullishIcon({ size = 24, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Bullish"
      className={className}
    >
      <path
        d="M18 30 C 18 26 26 24 50 24 C 74 24 82 26 82 30 L 70 76 C 68 82 60 86 50 86 C 40 86 32 82 30 76 Z"
        fill="#4f8a64"
      />
      <path d="M34 30 Q 14 18 10 6 Q 6 28 26 38 Z" fill="#e8d4a8" />
      <path d="M66 30 Q 86 18 90 6 Q 94 28 74 38 Z" fill="#e8d4a8" />
      <path
        d="M34 50 L 44 54"
        stroke="#f5ecdc"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M66 50 L 56 54"
        stroke="#f5ecdc"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M30 76 C 32 82 40 86 50 86 C 60 86 68 82 70 76 L 68 68 L 32 68 Z"
        fill="#d6a78a"
      />
      <ellipse cx="42" cy="76" rx="2" ry="3" fill="#1a0d09" />
      <ellipse cx="58" cy="76" rx="2" ry="3" fill="#1a0d09" />
    </svg>
  );
}
