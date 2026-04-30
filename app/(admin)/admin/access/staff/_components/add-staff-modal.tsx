"use client";

import type { RoleRow } from "@/lib/db/roles-queries";
import { Mail, Search, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  addUserToStaff,
  inviteStaffMember,
  searchNonAdminUsers,
  type UserSearchResult,
} from "../actions";

type Tab = "promote" | "invite";

interface AddStaffModalProps {
  adminRoles: RoleRow[];
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Tab A — promote an existing user
// ---------------------------------------------------------------------------
function PromoteTab({
  adminRoles,
  onSuccess,
}: {
  adminRoles: RoleRow[];
  onSuccess: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [roleName, setRoleName] = useState(adminRoles[0]?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

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
        onSuccess();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Si è verificato un errore.");
      }
    });
  }

  const initials = (u: UserSearchResult) =>
    [u.firstName, u.lastName]
      .filter(Boolean)
      .map((n) => n![0].toUpperCase())
      .join("") || u.email[0].toUpperCase();

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* User search / selected chip */}
      {!selected ? (
        <div>
          <label style={labelStyle}>Cerca utente</label>
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--admin-text-faint)",
                pointerEvents: "none",
              }}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Cerca per nome o email..."
              style={inputStyle({ paddingLeft: 30 })}
            />
          </div>
          {(results.length > 0 || (searching && query.length >= 2)) && (
            <ResultsList
              results={results}
              searching={searching}
              onSelect={handleSelect}
              initials={initials}
            />
          )}
        </div>
      ) : (
        <div>
          <label style={labelStyle}>Utente</label>
          <SelectedChip user={selected} onClear={() => setSelected(null)} initials={initials} />
        </div>
      )}

      {/* Role selector */}
      <RoleSelect adminRoles={adminRoles} value={roleName} onChange={setRoleName} />

      {error && <p style={errorStyle}>{error}</p>}

      <div style={footerStyle}>
        <ConfirmButton
          disabled={!selected || saving}
          loading={saving}
          onClick={handleConfirm}
          label="Aggiungi allo Staff"
          icon={<UserPlus size={13} />}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab B — invite by email
// ---------------------------------------------------------------------------
function InviteTab({
  adminRoles,
  onSuccess,
}: {
  adminRoles: RoleRow[];
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [roleName, setRoleName] = useState(adminRoles[0]?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  function handleConfirm() {
    setError(null);
    startSave(async () => {
      const result = await inviteStaffMember(email.trim(), roleName);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(onSuccess, 1800);
      }
    });
  }

  if (success) {
    return (
      <div
        style={{
          padding: "32px 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "color-mix(in srgb, var(--admin-accent) 15%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 12px",
          }}
        >
          <Mail size={22} style={{ color: "var(--admin-accent)" }} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)", margin: "0 0 4px" }}>
          Invito inviato
        </p>
        <p style={{ fontSize: 13, color: "var(--admin-text-faint)", margin: 0 }}>
          L&apos;email con il link di invito è stata inviata a <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px" }}>
      <div>
        <label style={labelStyle}>Email da invitare</label>
        <input
          ref={inputRef}
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder="es. mario.rossi@esempio.it"
          style={inputStyle({})}
        />
        <p style={{ fontSize: 11, color: "var(--admin-text-faint)", marginTop: 5 }}>
          Riceverà un&apos;email con il link per creare l&apos;account Staff.
        </p>
      </div>

      <RoleSelect adminRoles={adminRoles} value={roleName} onChange={setRoleName} />

      {error && <p style={errorStyle}>{error}</p>}

      <div style={footerStyle}>
        <ConfirmButton
          disabled={!email.trim() || saving}
          loading={saving}
          onClick={handleConfirm}
          label="Invia invito"
          icon={<Mail size={13} />}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function RoleSelect({
  adminRoles,
  value,
  onChange,
}: {
  adminRoles: RoleRow[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <label style={labelStyle}>Ruolo</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle({})}
      >
        {adminRoles.map((r) => (
          <option key={r.name} value={r.name}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ResultsList({
  results,
  searching,
  onSelect,
  initials,
}: {
  results: UserSearchResult[];
  searching: boolean;
  onSelect: (u: UserSearchResult) => void;
  initials: (u: UserSearchResult) => string;
}) {
  return (
    <div
      style={{
        marginTop: 4,
        borderRadius: 8,
        border: "1px solid var(--admin-card-border)",
        background: "var(--admin-card-bg)",
        overflow: "hidden",
      }}
    >
      {searching ? (
        <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--admin-text-faint)" }}>
          Ricerca…
        </div>
      ) : (
        results.map((u) => (
          <button
            key={u.id}
            onClick={() => onSelect(u)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "8px 12px",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--admin-divider)",
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-hover-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <UserAvatar user={u} initials={initials(u)} size={28} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text)", lineHeight: 1.2 }}>
                {u.firstName || u.lastName
                  ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                  : u.email}
              </div>
              {(u.firstName || u.lastName) && (
                <div style={{ fontSize: 11, color: "var(--admin-text-faint)" }}>{u.email}</div>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  );
}

function SelectedChip({
  user,
  onClear,
  initials,
}: {
  user: UserSearchResult;
  onClear: () => void;
  initials: (u: UserSearchResult) => string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid color-mix(in srgb, var(--admin-accent) 35%, transparent)",
        background: "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-card-bg))",
      }}
    >
      <UserAvatar user={user} initials={initials(user)} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.firstName || user.lastName
            ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
            : user.email}
        </div>
        <div style={{ fontSize: 11, color: "var(--admin-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.email}
        </div>
      </div>
      <button
        onClick={onClear}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 5, background: "transparent", border: "none", cursor: "pointer", color: "var(--admin-text-faint)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-hover-bg)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        aria-label="Cambia utente"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function UserAvatar({
  user,
  initials,
  size,
}: {
  user: UserSearchResult;
  initials: string;
  size: number;
}) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--admin-accent)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function ConfirmButton({
  disabled,
  loading,
  onClick,
  label,
  icon,
}: {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 16px",
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 8,
        border: "none",
        background: disabled ? "#6b7280" : "var(--admin-accent)",
        color: "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = "brightness(0.88)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
    >
      {loading ? (
        <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "cm-spin 0.6s linear infinite" }} />
      ) : icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--admin-text-muted)",
  marginBottom: 6,
};

const errorStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  color: "#ef4444",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 18,
};

function inputStyle(extra: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    borderRadius: 8,
    border: "1px solid var(--admin-input-border)",
    background: "var(--admin-page-bg)",
    color: "var(--admin-text)",
    outline: "none",
    boxSizing: "border-box",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export default function AddStaffModal({ adminRoles, onClose }: AddStaffModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("promote");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSuccess() {
    router.refresh();
    onClose();
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "promote", label: "Promuovi utente", icon: <UserPlus size={14} /> },
    { id: "invite", label: "Invita per email", icon: <Mail size={14} /> },
  ];

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)", animation: "cm-fade-in 140ms ease" }}
      />

      {/* Dialog */}
      <div style={{ position: "fixed", inset: 0, zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", pointerEvents: "none" }}>
        <div
          role="dialog"
          aria-modal="true"
          style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)", borderRadius: 14, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", width: "100%", maxWidth: 480, pointerEvents: "auto", animation: "cm-slide-up 160ms cubic-bezier(0.16,1,0.3,1)" }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 14px", borderBottom: "1px solid var(--admin-card-border)" }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)", color: "var(--admin-accent)", flexShrink: 0 }}>
              <UserPlus size={17} />
            </span>
            <h2 style={{ flex: 1, fontSize: 15, fontWeight: 600, color: "var(--admin-text)", margin: 0 }}>
              Aggiungi membro Staff
            </h2>
            <button
              onClick={onClose}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--admin-text-faint)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-hover-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              aria-label="Chiudi"
            >
              <X size={15} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--admin-card-border)", padding: "0 20px" }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 4px",
                  marginRight: 20,
                  fontSize: 13,
                  fontWeight: tab === t.id ? 600 : 400,
                  color: tab === t.id ? "var(--admin-accent)" : "var(--admin-text-muted)",
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === t.id ? "2px solid var(--admin-accent)" : "2px solid transparent",
                  cursor: "pointer",
                  transition: "color 120ms, border-color 120ms",
                  marginBottom: -1,
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "promote" ? (
            <PromoteTab adminRoles={adminRoles} onSuccess={handleSuccess} />
          ) : (
            <InviteTab adminRoles={adminRoles} onSuccess={handleSuccess} />
          )}
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
