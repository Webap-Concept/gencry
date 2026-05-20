"use client";

// Client wrapper: AdminButton è "use client" e accetta `icon: LucideIcon`,
// che è una funzione → non serializzabile attraverso il confine RSC →
// Client. Il bottone vive qui dentro così l'import di `Download` e di
// `AdminButton` resta lato client; la pagina server passa solo string.

import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { Download } from "lucide-react";

export function ExportCsvButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a href={href}>
      <AdminButton variant="secondary" icon={Download} size="sm">
        {label}
      </AdminButton>
    </a>
  );
}
