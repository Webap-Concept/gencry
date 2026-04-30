"use client";

import type { RoleRow } from "@/lib/db/roles-queries";
import { Search, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  addUserToStaff,
  searchNonAdminUsers,
  type UserSearchResult,
} from "../actions";

interface AddStaffModalProps {
  adminRoles: RoleRow[];
  onClose: () => void;
}

export default function AddStaffModal({
  adminRoles,
  onClose,
}: AddStaffModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [roleName, setRoleName] = useState(adminRoles[0]?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 30);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelected(null);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchNonAdminUsers(value);
        setResults(res);
      });
    }, 250);
  }

  function handleSelect(user: UserSearchResult) {
    setSelected(user);
    setQuery("");
    setResults([]);
  }

  function handleConfirm() {
    if (!selected) return;
    setError(null);
    startSave(async () => {
      try {
        await addUserToStaff(selected.id, roleName);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "An error occurred.");
      }
    });
  }

  const initials = (u: UserSearchResult) =>
    [u.firstName, u.lastName]
      .filter(Boolean)
      .map((n) => n![0].toUpperCase())
      .join("") || u.email[0].toUpperCase();

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
          animation: "cm-fade-in 140ms ease",
        }}
      />

      {/* Dialog */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          style={{
            background: "var(--admin-card-bg, #1c1b19)",
            border: "1px solid var(--admin-card-border, #2a2927)",
            borderRadius: "14px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            width: "100%",
            maxWidth: "460px",
            pointerEvents: "auto",
            animation: "cm-slide-up 160ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "18px 20px 14px",
              borderBottom: "1px solid var(--admin-card-border, #2a2927)",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 8,
                background:
                  "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
                color: "var(--admin-accent)",
                flexShrink: 0,
              }}
            >
              <UserPlus size={17} />
            </span>
            <h2
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--admin-text, #cdccca)",
                margin: 0,
              }}
            >
              Add Staff Member
            </h2>
            <button
              onClick={onClose}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--admin-text-faint, #5a5957)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "var(--admin-hover-bg, rgba(255,255,255,0.06))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "16px 20px" }}>
            {/* User search */}
            {!selected ? (
              <div style={{ position: "relative" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--admin-text-muted, #797876)",
                    marginBottom: 6,
                  }}
                >
                  Search user
                </label>
                <div style={{ position: "relative" }}>
                  <Search
                    size={14}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--admin-text-faint, #5a5957)",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    placeholder="Search by name or email..."
                    style={{
                      width: "100%",
                      padding: "8px 10px 8px 30px",
                      fontSize: 13,
                      borderRadius: 8,
                      border: "1px solid var(--admin-input-border, #3a3937)",
                      background: "var(--admin-page-bg, #151413)",
                      color: "var(--admin-text, #cdccca)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Results dropdown */}
                {(results.length > 0 || (searching && query.length >= 2)) && (
                  <div
                    style={{
                      marginTop: 4,
                      borderRadius: 8,
                      border: "1px solid var(--admin-card-border, #2a2927)",
                      background: "var(--admin-card-bg, #1c1b19)",
                      overflow: "hidden",
                    }}
                  >
                    {searching ? (
                      <div
                        style={{
                          padding: "10px 12px",
                          fontSize: 12,
                          color: "var(--admin-text-faint, #5a5957)",
                        }}
                      >
                        Searching…
                      </div>
                    ) : (
                      results.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => handleSelect(u)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            padding: "8px 12px",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            textAlign: "left",
                            borderBottom:
                              "1px solid var(--admin-divider, #232220)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "var(--admin-hover-bg, rgba(255,255,255,0.04))";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          {u.avatarUrl ? (
                            <img
                              src={u.avatarUrl}
                              alt=""
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                objectFit: "cover",
                                flexShrink: 0,
                              }}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "var(--admin-accent, #0e6e77)",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {initials(u)}
                            </div>
                          )}
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: "var(--admin-text, #cdccca)",
                                lineHeight: 1.2,
                              }}
                            >
                              {u.firstName || u.lastName
                                ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                                : u.email}
                            </div>
                            {(u.firstName || u.lastName) && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--admin-text-faint, #5a5957)",
                                }}
                              >
                                {u.email}
                              </div>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Selected user chip */
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--admin-text-muted, #797876)",
                    marginBottom: 6,
                  }}
                >
                  User
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border:
                      "1px solid color-mix(in srgb, var(--admin-accent) 35%, transparent)",
                    background:
                      "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-card-bg))",
                  }}
                >
                  {selected.avatarUrl ? (
                    <img
                      src={selected.avatarUrl}
                      alt=""
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "var(--admin-accent, #0e6e77)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {initials(selected)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--admin-text, #cdccca)",
                        lineHeight: 1.2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selected.firstName || selected.lastName
                        ? `${selected.firstName ?? ""} ${selected.lastName ?? ""}`.trim()
                        : selected.email}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--admin-text-faint, #5a5957)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selected.email}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--admin-text-faint, #5a5957)",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "var(--admin-hover-bg, rgba(255,255,255,0.06))";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                    aria-label="Change user"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Role selector */}
            <div style={{ marginTop: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--admin-text-muted, #797876)",
                  marginBottom: 6,
                }}
              >
                Assign role
              </label>
              <select
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid var(--admin-input-border, #3a3937)",
                  background: "var(--admin-page-bg, #151413)",
                  color: "var(--admin-text, #cdccca)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                {adminRoles.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Error */}
            {error && (
              <p
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#ef4444",
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "4px 20px 18px",
            }}
          >
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 8,
                border: "1px solid var(--admin-card-border, #2a2927)",
                background: "transparent",
                color: "var(--admin-text-muted, #797876)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--admin-text, #cdccca)";
                e.currentTarget.style.borderColor =
                  "var(--admin-input-border, #3a3937)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color =
                  "var(--admin-text-muted, #797876)";
                e.currentTarget.style.borderColor =
                  "var(--admin-card-border, #2a2927)";
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected || saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                background:
                  !selected || saving
                    ? "#6b7280"
                    : "var(--admin-accent, #0e6e77)",
                color: "#fff",
                cursor: !selected || saving ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (selected && !saving)
                  e.currentTarget.style.filter = "brightness(0.88)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "none";
              }}
            >
              {saving ? (
                <span
                  style={{
                    display: "inline-block",
                    width: 13,
                    height: 13,
                    border: "2px solid rgba(255,255,255,0.35)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "cm-spin 0.6s linear infinite",
                  }}
                />
              ) : (
                <UserPlus size={13} />
              )}
              Add to Staff
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cm-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cm-slide-up { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes cm-spin     { to { transform: rotate(360deg) } }
      `}</style>
    </>,
    document.body,
  );
}
