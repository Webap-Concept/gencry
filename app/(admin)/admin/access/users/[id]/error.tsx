"use client";

import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";

export default function UserDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("admin.access.users.detail");

  useEffect(() => {
    console.error("[admin/users/[id]] error:", error);
  }, [error]);

  const isMissingTable =
    error.message?.toLowerCase().includes("user_permissions") ||
    error.message?.toLowerCase().includes("permissions") ||
    error.message?.toLowerCase().includes("does not exist") ||
    error.message?.toLowerCase().includes("relation");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/users"
          className="flex items-center gap-1.5 text-sm"
          style={{ color: "var(--admin-text-muted)" }}>
          <ArrowLeft size={15} />
          {t("errorBreadcrumb")}
        </Link>
      </div>

      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-5 text-center px-4">
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
              ? t("errorRbacMissing")
              : error.message || t("errorFallback")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/users"
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg"
            style={{
              background: "var(--admin-hover-bg)",
              color: "var(--admin-text-muted)",
            }}>
            <ArrowLeft size={14} />
            {t("errorBackButton")}
          </Link>
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white"
            style={{ background: "var(--admin-accent)" }}>
            <RefreshCw size={14} />
            {t("errorTryAgain")}
          </button>
        </div>
      </div>
    </div>
  );
}
