// components/modules/posts/icons/index.ts
//
// Barrel + lookup map `REACTION_ICON` keyed per `PostReactionKind`.
// Sostituisce il vecchio map `REACTION_EMOJI` usato dal ReactionPopover.
import type { ComponentType } from "react";
import type { PostReactionKind } from "@/lib/db/schema";
import type { ReactionIconProps } from "./types";
import { LikeIcon } from "./LikeIcon";
import { BullishIcon } from "./BullishIcon";
import { BearishIcon } from "./BearishIcon";
import { ToTheMoonIcon } from "./ToTheMoonIcon";
import { DumpIcon } from "./DumpIcon";

export type { ReactionIconProps } from "./types";
export { LikeIcon, BullishIcon, BearishIcon, ToTheMoonIcon, DumpIcon };

/** Lookup O(1) `kind → componente icona`. Coerente con
 *  `POST_REACTION_KINDS` in lib/db/schema (refactor M_posts_008). */
export const REACTION_ICON: Record<
  PostReactionKind,
  ComponentType<ReactionIconProps>
> = {
  like: LikeIcon,
  bullish: BullishIcon,
  bearish: BearishIcon,
  to_the_moon: ToTheMoonIcon,
  dump: DumpIcon,
};
