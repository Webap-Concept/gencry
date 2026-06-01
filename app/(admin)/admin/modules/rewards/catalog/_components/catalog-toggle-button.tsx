"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleCatalogItemActive } from "../actions";

export function CatalogToggleButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await toggleCatalogItemActive(id, !isActive); router.refresh(); })}
      className="rounded-md px-2.5 py-1 text-xs font-medium"
      style={{
        background: isActive ? "var(--admin-success-bg, #dcfce7)" : "var(--admin-page-bg)",
        color: isActive ? "var(--admin-success-text, #15803d)" : "var(--admin-text-faint)",
        border: "1px solid var(--admin-card-border)",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {isActive ? "Attivo" : "Inattivo"}
    </button>
  );
}
