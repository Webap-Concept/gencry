// app/(admin)/admin/security/ip-rules/_components/ip-rules-client.tsx
// TODO: implementare tabella whitelist/blacklist IP con aggiunta e rimozione
"use client";

import { ListFilter } from "lucide-react";
import { useTranslations } from "next-intl";

export function IpRulesClient() {
  const t = useTranslations("admin.security.ipRules");
  return (
    <div
      className="rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-center"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-border)",
        minHeight: "240px",
      }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-1"
        style={{
          background: "color-mix(in srgb, var(--admin-accent) 10%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
        }}
      >
        <ListFilter size={22} style={{ color: "var(--admin-accent)" }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
        {t("placeholderTitle")}
      </p>
      <p className="text-sm max-w-sm" style={{ color: "var(--admin-text-faint)" }}>
        {t("placeholderBody")}
      </p>
    </div>
  );
}
