// app/(admin)/admin/security/blocked-domains/_components/blocked-domains-client.tsx
"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Plus, Search, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  addDisposableDomainAction,
  bulkImportDisposableDomainsAction,
  removeDisposableDomainAction,
} from "@/app/(admin)/admin/settings/actions";

export function BlockedDomainsClient({ initialDomains }: { initialDomains: string[] }) {
  const t = useTranslations("admin.security.blockedDomains");
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const [search, setSearch] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [bulk, setBulk] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isBulkPending, startBulkTransition] = useTransition();

  const filtered = search
    ? domains.filter((d) => d.includes(search.toLowerCase().trim()))
    : domains;

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  function handleAdd() {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (domains.includes(domain)) {
      showToast(t("errorAlreadyInList", { domain }), "error");
      return;
    }
    startTransition(async () => {
      const res = await addDisposableDomainAction(domain);
      if ("success" in res) {
        setDomains((prev) => [domain, ...prev].sort());
        setNewDomain("");
        showToast(res.success, "success");
      } else if ("error" in res) {
        showToast(res.error, "error");
      }
    });
  }

  function handleRemove(domain: string) {
    startTransition(async () => {
      const res = await removeDisposableDomainAction(domain);
      if ("success" in res) {
        setDomains((prev) => prev.filter((d) => d !== domain));
        showToast(res.success, "success");
      } else if ("error" in res) {
        showToast(res.error, "error");
      }
    });
  }

  function handleBulk() {
    const lines = bulk
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0 && !domains.includes(l));
    if (lines.length === 0) {
      showToast(t("errorNoNewDomains"), "error");
      return;
    }
    startBulkTransition(async () => {
      const res = await bulkImportDisposableDomainsAction(lines);
      if ("success" in res) {
        setDomains((prev) => [...prev, ...lines].sort());
        setBulk("");
        showToast(res.success, "success");
      } else if ("error" in res) {
        showToast(res.error, "error");
      }
    });
  }

  return (
    <>
      <div
        className="rounded-xl shadow-sm p-6 space-y-6"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>

        {/* Aggiunta singola */}
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--admin-text)" }}>
            {t("addHeading")}
          </h3>
          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
              placeholder={t("addPlaceholder")}
              className="flex-1 px-3 py-2 text-sm rounded-lg focus:outline-none"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
              }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending || !newDomain.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--admin-accent)" }}
              onMouseEnter={(e) => !isPending && (e.currentTarget.style.background = "var(--admin-accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-accent)")}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t("addButton")}
            </button>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--admin-card-border)" }} />

        {/* Import bulk */}
        <div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--admin-text)" }}>
            {t("bulkHeading")}
          </h3>
          <p className="text-[11px] mb-3" style={{ color: "var(--admin-text-faint)" }}>
            {t("bulkHelp")}
          </p>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={5}
            placeholder={"trashmail.com\nyopmail.com\nguerrilla.com"}
            className="w-full max-w-md px-3 py-2 text-sm rounded-lg focus:outline-none resize-y font-mono"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}
          />
          <div className="mt-2">
            <button
              type="button"
              onClick={handleBulk}
              disabled={isBulkPending || !bulk.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--admin-accent)" }}
              onMouseEnter={(e) => !isBulkPending && (e.currentTarget.style.background = "var(--admin-accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-accent)")}>
              {isBulkPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isBulkPending
                ? t("bulkImporting")
                : t("bulkImportButton", {
                    count: bulk
                      .split("\n")
                      .filter(
                        (l) =>
                          l.trim() &&
                          !domains.includes(l.trim().toLowerCase()),
                      ).length,
                  })}
            </button>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--admin-card-border)" }} />

        {/* Lista */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              {t("listHeading")}{" "}
              <span className="font-normal text-xs" style={{ color: "var(--admin-text-muted)" }}>
                {t("listCount", { count: domains.length })}
              </span>
            </h3>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--admin-text-faint)" }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pl-7 pr-3 py-1.5 text-xs rounded-lg focus:outline-none"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                  width: "160px",
                }}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--admin-text-faint)" }}>
              {search
                ? t("searchEmptyResult", { query: search })
                : t("listEmpty")}
            </p>
          ) : (
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--admin-card-border)" }}>
              <div className="overflow-y-auto" style={{ maxHeight: "320px" }}>
                {filtered.map((domain, i) => (
                  <div
                    key={domain}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                    style={{
                      background: i % 2 === 0 ? "var(--admin-card-bg)" : "var(--admin-page-bg)",
                      borderBottom: i < filtered.length - 1 ? "1px solid var(--admin-card-border)" : "none",
                    }}>
                    <span className="font-mono text-xs" style={{ color: "var(--admin-text)" }}>
                      {domain}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(domain)}
                      disabled={isPending}
                      className="p-1 rounded transition-colors disabled:opacity-40"
                      title={t("removeTooltip")}
                      style={{ color: "var(--admin-text-faint)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--admin-danger, #e53e3e)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--admin-text-faint)")}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <AdminToast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </>
  );
}
