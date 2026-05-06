// app/(admin)/admin/security/blocked-usernames/_components/blocked-usernames-client.tsx
"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Plus, Search, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  addBlockedUsernameAction,
  bulkImportBlockedUsernamesAction,
  removeBlockedUsernameAction,
} from "@/app/(admin)/admin/settings/actions";

type Entry = { username: string; isPattern: boolean };

export function BlockedUsernamesClient({
  initialEntries,
}: {
  initialEntries: Entry[];
}) {
  const t = useTranslations("admin.security.blockedUsernames");
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [search, setSearch] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [patternMode, setPatternMode] = useState(false);
  const [bulk, setBulk] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isBulkPending, startBulkTransition] = useTransition();

  const usernames = entries.map((e) => e.username);

  const filtered = search
    ? entries.filter((e) => e.username.includes(search.toLowerCase().trim()))
    : entries;

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  function buildEntry(raw: string): string {
    const core = raw.trim().toLowerCase();
    if (!patternMode) return core;
    // Aggiungi asterischi solo se non già presenti
    const hasLeading = core.startsWith("*");
    const hasTrailing = core.endsWith("*");
    if (hasLeading || hasTrailing) return core;
    return `*${core}*`;
  }

  function handleAdd() {
    const username = buildEntry(newUsername);
    if (!username || username === "*" || username === "**") return;
    if (usernames.includes(username)) {
      showToast(t("errorAlreadyInList", { username }), "error");
      return;
    }
    startTransition(async () => {
      const res = await addBlockedUsernameAction(username);
      if ("success" in res) {
        const isPattern = username.startsWith("*") || username.endsWith("*");
        setEntries((prev) => [{ username, isPattern }, ...prev].sort((a, b) => a.username.localeCompare(b.username)));
        setNewUsername("");
        showToast((res as { success: string }).success, "success");
      } else if ("error" in res) {
        showToast((res as { error: string }).error, "error");
      }
    });
  }

  function handleRemove(username: string) {
    startTransition(async () => {
      const res = await removeBlockedUsernameAction(username);
      if ("success" in res) {
        setEntries((prev) => prev.filter((e) => e.username !== username));
        showToast((res as { success: string }).success, "success");
      } else if ("error" in res) {
        showToast((res as { error: string }).error, "error");
      }
    });
  }

  function handleBulk() {
    const lines = bulk
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0 && !usernames.includes(l));
    if (lines.length === 0) {
      showToast(t("errorNoNewUsernames"), "error");
      return;
    }
    startBulkTransition(async () => {
      const res = await bulkImportBlockedUsernamesAction(lines);
      if ("success" in res) {
        const newEntries: Entry[] = lines.map((u) => ({
          username: u,
          isPattern: u.startsWith("*") || u.endsWith("*"),
        }));
        setEntries((prev) => [...prev, ...newEntries].sort((a, b) => a.username.localeCompare(b.username)));
        setBulk("");
        showToast((res as { success: string }).success, "success");
      } else if ("error" in res) {
        showToast((res as { error: string }).error, "error");
      }
    });
  }

  const bulkNewCount = bulk
    .split("\n")
    .filter((l) => l.trim() && !usernames.includes(l.trim().toLowerCase()))
    .length;

  return (
    <>
      <div
        className="rounded-xl shadow-sm p-6 space-y-6"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
      >
        {/* Aggiunta singola */}
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--admin-text)" }}>
            {t("addHeading")}
          </h3>

          {/* Toggle modalità pattern */}
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              role="switch"
              aria-checked={patternMode}
              onClick={() => setPatternMode((v) => !v)}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
              style={{
                background: patternMode ? "var(--admin-accent)" : "var(--admin-input-border)",
              }}
            >
              <span
                className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                style={{ transform: patternMode ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>
            <span className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("patternToggle")}
            </span>
            {patternMode && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{
                  background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
                  color: "var(--admin-accent)",
                  border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
                }}
              >
                {t("patternBadge")}
              </span>
            )}
          </div>

          {patternMode && (
            <p className="text-[11px] mb-2" style={{ color: "var(--admin-text-faint)" }}>
              {t.rich("patternHelp", {
                c: (chunks) => <code>{chunks}</code>,
              })}
            </p>
          )}

          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
              placeholder={patternMode ? t("placeholderPattern") : t("placeholderPlain")}
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
              disabled={isPending || !newUsername.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--admin-accent)" }}
              onMouseEnter={(e) =>
                !isPending && (e.currentTarget.style.background = "var(--admin-accent-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--admin-accent)")
              }
            >
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
            {t.rich("bulkHelp", {
              c: (chunks) => <code>{chunks}</code>,
            })}
          </p>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={5}
            placeholder={"admin\nroot\n*superuser*\nmoderatore\n*spam*"}
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
              onMouseEnter={(e) =>
                !isBulkPending && (e.currentTarget.style.background = "var(--admin-accent-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--admin-accent)")
              }
            >
              {isBulkPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {isBulkPending
                ? t("bulkImporting")
                : t("bulkImportButton", { count: bulkNewCount })}
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
                {t("listCount", { count: entries.length })}
              </span>
            </h3>
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--admin-text-faint)" }}
              />
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
              style={{ border: "1px solid var(--admin-card-border)" }}
            >
              <div className="overflow-y-auto" style={{ maxHeight: "320px" }}>
                {filtered.map((entry, i) => (
                  <div
                    key={entry.username}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                    style={{
                      background:
                        i % 2 === 0
                          ? "var(--admin-card-bg)"
                          : "var(--admin-page-bg)",
                      borderBottom:
                        i < filtered.length - 1
                          ? "1px solid var(--admin-card-border)"
                          : "none",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-xs"
                        style={{ color: "var(--admin-text)" }}
                      >
                        {entry.username}
                      </span>
                      {entry.isPattern && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono leading-none"
                          style={{
                            background: "color-mix(in srgb, var(--admin-accent) 10%, var(--admin-card-bg))",
                            color: "var(--admin-accent)",
                            border: "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
                          }}
                        >
                          {t("patternBadgeRow")}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(entry.username)}
                      disabled={isPending}
                      className="p-1 rounded transition-colors disabled:opacity-40"
                      title={t("removeTooltip")}
                      style={{ color: "var(--admin-text-faint)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--admin-danger, #e53e3e)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--admin-text-faint)")
                      }
                    >
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
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
