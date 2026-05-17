// components/modules/posts/icons/DumpIcon.tsx
//
// Reaction `dump` (candela rossa con freccia giù). Vedi index.ts per
// il map REACTION_ICON.
import type { ReactionIconProps } from "./types";

export function DumpIcon({ size = 24, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Dump"
      className={className}
    >
      <rect x="48" y="6" width="4" height="16" rx="1.5" fill="#1a0d09" />
      <rect x="48" y="78" width="4" height="16" rx="1.5" fill="#1a0d09" />
      <rect x="24" y="22" width="52" height="56" rx="7" fill="#c0392b" />
      <path
        d="M24 50 L 76 50 L 76 71 C 76 75 72 78 68 78 L 32 78 C 28 78 24 75 24 71 Z"
        fill="#8a2a1c"
      />
      <path
        d="M50 68 L 34 46 L 42 46 L 42 32 L 58 32 L 58 46 L 66 46 Z"
        fill="#faf4e8"
      />
    </svg>
  );
}
