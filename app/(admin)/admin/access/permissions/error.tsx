// app/(admin)/admin/permissions/error.tsx
"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function PermissionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("admin.access.permissions");

  useEffect(() => {
    console.error("[admin/permissions] error:", error);
  }, [error]);

  const isMissingTable =
    error.message?.toLowerCase().includes("permissions") ||
    error.message?.toLowerCase().includes("does not exist") ||
    error.message?.toLowerCase().includes("relation");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-4">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ background: "#fef2f2" }}>
        <AlertTriangle size={22} style={{ color: "#dc2626" }} />
      </div>

      <div className="space-y-1.5">
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--admin-text)" }}>
          {t("errorLoadingTitle")}
        </h2>
        <p
          className="text-sm max-w-sm"
          style={{ color: "var(--admin-text-muted)" }}>
          {isMissingTable
            ? t("errorMissingTables")
            : error.message || t("errorFallback")}
        </p>
      </div>

      {isMissingTable && (
        <div
          className="w-full max-w-lg rounded-xl p-4 text-left"
          style={{
            background: "var(--admin-hover-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <p
            className="text-xs font-semibold mb-2"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("errorSqlSection")}
          </p>
          <pre
            className="text-[11px] overflow-x-auto"
            style={{
              color: "var(--admin-text-faint)",
              fontFamily: "monospace",
            }}>
            {`-- Permission catalog
CREATE TABLE IF NOT EXISTS "permissions" (
  "id" serial PRIMARY KEY,
  "key" varchar(100) NOT NULL UNIQUE,
  "label" varchar(150) NOT NULL,
  "description" text,
  "group" varchar(100) NOT NULL DEFAULT 'General',
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Role → Permission matrix
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_id" integer NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "permission_id" integer NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
  PRIMARY KEY ("role_id", "permission_id")
);

-- Individual user overrides
CREATE TABLE IF NOT EXISTS "user_permissions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission_id" integer NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
  "granted" boolean NOT NULL DEFAULT true,
  "granted_by" integer REFERENCES "users"("id"),
  "reason" text,
  "expires_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON "role_permissions"("role_id");
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON "user_permissions"("user_id");`}
          </pre>
        </div>
      )}

      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white"
        style={{ background: "var(--admin-accent)" }}>
        <RefreshCw size={14} />
        {t("errorTryAgain")}
      </button>
    </div>
  );
}
