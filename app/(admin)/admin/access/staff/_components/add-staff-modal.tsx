"use client";

import type { RoleRow } from "@/lib/db/roles-queries";
import { Loader2, Mail, Search, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  AdminDialog,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";
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
  const t = useTranslations("admin.access.staff.modal");
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
        setError(e instanceof Error ? e.message : t("promoteGenericError"));
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
          <label style={labelStyle}>{t("promoteSearchLabel")}</label>
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
              placeholder={t("promoteSearchPlaceholder")}
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
          <label style={labelStyle}>{t("promoteUserLabel")}</label>
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
          label={t("promoteConfirmButton")}
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
  const t = useTranslations("admin.access.staff.modal");
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
          {t("inviteSentTitle")}
        </p>
        <p style={{ fontSize: 13, color: "var(--admin-text-faint)", margin: 0 }}>
          {t.rich("inviteSentSubtitle", {
            email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px" }}>
      <div>
        <label style={labelStyle}>{t("inviteEmailLabel")}</label>
        <input
          ref={inputRef}
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder={t("inviteEmailPlaceholder")}
          style={inputStyle({})}
        />
        <p style={{ fontSize: 11, color: "var(--admin-text-faint)", marginTop: 5 }}>
          {t("inviteEmailHint")}
        </p>
      </div>

      <RoleSelect adminRoles={adminRoles} value={roleName} onChange={setRoleName} />

      {error && <p style={errorStyle}>{error}</p>}

      <div style={footerStyle}>
        <ConfirmButton
          disabled={!email.trim() || saving}
          loading={saving}
          onClick={handleConfirm}
          label={t("inviteConfirmButton")}
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
  const t = useTranslations("admin.access.staff.modal");
  return (
    <div style={{ marginTop: 14 }}>
      <label style={labelStyle}>{t("promoteRoleLabel")}</label>
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
  const t = useTranslations("admin.access.staff.modal");
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
          {t("promoteSearching")}
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
  const t = useTranslations("admin.access.staff.modal");
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
        aria-label={t("promoteChangeUserAria")}
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
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
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
  const t = useTranslations("admin.access.staff.modal");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("promote");

  function handleSuccess() {
    router.refresh();
    onClose();
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "promote", label: t("tabPromote"), icon: <UserPlus size={14} /> },
    { id: "invite", label: t("tabInvite"), icon: <Mail size={14} /> },
  ];

  return (
    <AdminDialog open onOpenChange={(o) => !o && onClose()}>
      <AdminDialogContent
        icon={UserPlus}
        size="md"
        title={t("title")}
        closeAriaLabel={t("closeAria")}
        className="!p-0"
      >
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--admin-card-border)",
            padding: "0 20px",
            margin: "-16px -20px 0",
          }}>
          {tabs.map((tabDef) => (
            <button
              key={tabDef.id}
              onClick={() => setTab(tabDef.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 4px",
                marginRight: 20,
                fontSize: 13,
                fontWeight: tab === tabDef.id ? 600 : 400,
                color:
                  tab === tabDef.id
                    ? "var(--admin-accent)"
                    : "var(--admin-text-muted)",
                background: "transparent",
                border: "none",
                borderBottom:
                  tab === tabDef.id
                    ? "2px solid var(--admin-accent)"
                    : "2px solid transparent",
                cursor: "pointer",
                transition: "color 120ms, border-color 120ms",
                marginBottom: -1,
              }}>
              {tabDef.icon}
              {tabDef.label}
            </button>
          ))}
        </div>

        {/* Tab content (PromoteTab/InviteTab already include their own
            padding/footer). Negative margin clears AdminDialog's body
            padding so the tabs+content render edge-to-edge as before. */}
        <div style={{ margin: "16px -20px -16px" }}>
          {tab === "promote" ? (
            <PromoteTab adminRoles={adminRoles} onSuccess={handleSuccess} />
          ) : (
            <InviteTab adminRoles={adminRoles} onSuccess={handleSuccess} />
          )}
        </div>
      </AdminDialogContent>
    </AdminDialog>
  );
}
