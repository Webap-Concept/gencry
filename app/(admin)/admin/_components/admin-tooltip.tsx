"use client";

import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";

type Side = "top" | "right" | "bottom" | "left";

/**
 * Tooltip wrapper for the admin panel. Built on Radix so we get proper
 * keyboard focus support, collision-aware positioning and no flicker —
 * the things native `title=""` doesn't give. Styled with `--admin-*`
 * tokens so it follows whatever theme the panel is on.
 *
 * The shared `<Tooltip.Provider>` lives in `admin-shell-client.tsx`,
 * so consumers don't need to mount one — just wrap any focusable
 * trigger with this component.
 *
 *   <AdminTooltip label="Vai al profilo utente">
 *     <button>...</button>
 *   </AdminTooltip>
 *
 * The trigger MUST forward refs and accept arbitrary props (Radix uses
 * Slot under the hood). Native elements and `forwardRef` components are
 * fine; if you wrap a custom component, make sure it spreads props down.
 */
export function AdminTooltip({
  label,
  children,
  side = "top",
  sideOffset = 6,
  delayDuration,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: Side;
  sideOffset?: number;
  /** Per-instance override; defaults to the provider value (200ms). */
  delayDuration?: number;
}) {
  return (
    <Tooltip.Root delayDuration={delayDuration}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={sideOffset}
          className="admin-tooltip-content z-50 px-2 py-1 text-[11px] font-medium rounded-md shadow-md select-none"
          style={{
            background: "var(--admin-text)",
            color: "var(--admin-page-bg)",
            maxWidth: 240,
          }}
        >
          {label}
          <Tooltip.Arrow style={{ fill: "var(--admin-text)" }} width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
