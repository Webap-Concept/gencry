// components/modules/posts/icons/LikeIcon.tsx
//
// Reaction `like` (diamante azzurro). Render inline come componente
// React per controllo dinamico di size + className. Vedi index.ts per
// il map REACTION_ICON usato dal ReactionPopover.
import type { ReactionIconProps } from "./types";

export function LikeIcon({ size = 24, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Like"
      className={className}
    >
      <path d="M12 38 L 88 38 L 50 88 Z" fill="#3a7bbd" />
      <path d="M28 16 L 72 16 L 88 38 L 12 38 Z" fill="#6fa8d6" />
      <path
        d="M28 16 L 38 38 L 50 88 M 72 16 L 62 38 L 50 88 M 12 38 L 88 38"
        stroke="#2a629a"
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M34 22 L 40 20 L 36 28 Z" fill="#faf4e8" />
    </svg>
  );
}
