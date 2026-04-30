"use client";

type PillProps = {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
};

export function Pill({ children, active, onClick }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? "true" : undefined}
      className={[
        "rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition border",
        active
          ? "bg-gc-fg text-gc-bg border-gc-fg"
          : "bg-transparent text-gc-fg-2 border-gc-line-2 hover:bg-gc-bg-2",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
