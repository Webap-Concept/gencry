"use client";

import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { getAdminRelPath } from "@/lib/admin-nav";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import type { Role } from "@/lib/db/schema";
import type { AppSettings } from "@/lib/db/settings-queries";
import { ExternalLink, FileText, Loader2, Save, ShieldCheck, Megaphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveUsersSettings, type ActionState } from "../actions";

type SystemPageInfo = {
  id: number;            // aggiunto per costruire il link corretto
  systemKey: string | null;
  contentVersion: string;
  slug: string;
  title: string;
  updatedAt: Date;
};

type ConsentKey = "terms" | "privacy" | "marketing";

const CONSENT_ICON: Record<ConsentKey, React.ReactNode> = {
  terms: <FileText size={15} />,
  privacy: <ShieldCheck size={15} />,
  marketing: <Megaphone size={15} />,
};

// ---------------------------------------------------------------------------
// External Wrapper (resets on pathname change)
// ---------------------------------------------------------------------------
export function SignUpTab({
  settings,
  roles,
  systemPages,
}: {
  settings: AppSettings;
  roles: Role[];
  systemPages: SystemPageInfo[];
}) {
  const pathname = usePathname();
  return <SignUpTabInner key={pathname} settings={settings} roles={roles} systemPages={systemPages} />;
}

// ---------------------------------------------------------------------------
// Inner Component
// ---------------------------------------------------------------------------
function SignUpTabInner({
  settings,
  roles,
  systemPages,
}: {
  settings: AppSettings;
  roles: Role[];
  systemPages: SystemPageInfo[];
}) {
  return (
    <div className="space-y-5">
      <RegistrationPanel settings={settings} roles={roles} />
      <ConsentVersionsPanel systemPages={systemPages} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registration Panel
// ---------------------------------------------------------------------------
function RegistrationPanel({
  settings,
  roles,
}: {
  settings: AppSettings;
  roles: Role[];
}) {
  const t = useTranslations("admin.settings.signup");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveUsersSettings,
    {},
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const lastTs = useRef<number>(0);
  const [selectedRole, setSelectedRole] = useState(
    settings.default_role || "member",
  );

  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state && state.success)
      setToast({ message: state.success, type: "success" });
    if ("error" in state && state.error)
      setToast({ message: state.error, type: "error" });
  }, [state]);

  const assignableRoles = roles.filter((r) => !r.isAdmin);
  const currentRole = assignableRoles.find((r) => r.name === selectedRole);

  return (
    <>
      <form action={formAction} className="space-y-5">
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "var(--admin-text)" }}>
            {t("registrationCardTitle")}
          </h3>
          <div className="space-y-5 max-w-lg">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("defaultRoleLabel")}
              </label>
              <p
                className="text-[11px] mb-2.5"
                style={{ color: "var(--admin-text-faint)" }}>
                {t("defaultRoleHint")}
              </p>
              {assignableRoles.length === 0 ? (
                <p
                  className="text-sm italic"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {t("noRolesAvailable")}
                </p>
              ) : (
                <select
                  name="default_role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                  style={{
                    background: "var(--admin-page-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}>
                  {assignableRoles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.label}
                    </option>
                  ))}
                </select>
              )}
              {currentRole && (
                <div
                  className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: currentRole.color + "18",
                    border: `1px solid ${currentRole.color}33`,
                  }}>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: currentRole.color }}
                  />
                  <span
                    className="font-medium"
                    style={{ color: currentRole.color }}>
                    {currentRole.label}
                  </span>
                  {currentRole.description && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--admin-text-faint)" }}>
                      &mdash; {currentRole.description}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-4">
                <p
                  className="text-[11px] mb-2"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {t("availableRoles")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {assignableRoles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRole(role.name)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full transition-all"
                      style={{
                        background:
                          selectedRole === role.name
                            ? role.color + "33"
                            : role.color + "18",
                        color: role.color,
                        border: `1px solid ${selectedRole === role.name ? role.color + "88" : role.color + "33"}`,
                        outline:
                          selectedRole === role.name
                            ? `2px solid ${role.color}44`
                            : "none",
                        outlineOffset: "1px",
                      }}>
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: role.color }}
                      />
                      {role.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
        <button
          type="submit"
          disabled={isPending || assignableRoles.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "var(--admin-accent)" }}
          onMouseEnter={(e) =>
            !isPending &&
            (e.currentTarget.style.background = "var(--admin-accent-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "var(--admin-accent)")
          }>
          {isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          {isPending ? t("saving") : t("save")}
        </button>
      </form>
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

// ---------------------------------------------------------------------------
// Consent Versions Panel
// ---------------------------------------------------------------------------
function ConsentVersionsPanel({ systemPages }: { systemPages: SystemPageInfo[] }) {
  const t = useTranslations("admin.settings.signup");
  const adminSlug = useAdminSlug();
  const pagesBase = buildAdminPathFromSlug(adminSlug, getAdminRelPath("content-pages"));
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "it-IT";

  const ordered: ConsentKey[] = ["terms", "privacy", "marketing"];
  const byKey = Object.fromEntries(
    systemPages
      .filter((p) => p.systemKey !== null)
      .map((p) => [p.systemKey!, p]),
  );

  return (
    <div
      className="rounded-xl shadow-sm p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <h3
        className="text-sm font-semibold mb-1"
        style={{ color: "var(--admin-text)" }}>
        {t("consentVersionsTitle")}
      </h3>
      <p
        className="text-[11px] mb-5"
        style={{ color: "var(--admin-text-faint)" }}>
        {t("consentVersionsHint")}
      </p>

      <div className="space-y-3">
        {ordered.map((key) => {
          const page = byKey[key];
          return (
            <div
              key={key}
              className="flex items-start justify-between gap-4 px-4 py-3 rounded-lg"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-card-border)",
              }}>
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {CONSENT_ICON[key]}
                </span>
                <div className="min-w-0">
                  <p
                    className="text-xs font-medium"
                    style={{ color: "var(--admin-text)" }}>
                    {t(`consents.${key}.label`)}
                  </p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--admin-text-faint)" }}>
                    {t(`consents.${key}.description`)}
                  </p>
                  {page && (
                    <p
                      className="text-[11px] mt-1"
                      style={{ color: "var(--admin-text-faint)" }}>
                      {t("consentLastUpdate")}{" "}
                      {new Date(page.updatedAt).toLocaleDateString(dateLocale, {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {page ? (
                  <>
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-semibold"
                      style={{
                        background: "var(--admin-accent)" + "18",
                        color: "var(--admin-accent)",
                        border: "1px solid " + "var(--admin-accent)" + "33",
                      }}>
                      v{page.contentVersion}
                    </span>
                    {/* Link corretto: usa l'id della pagina → /admin/content/pages/{id}/edit */}
                    <a
                      href={`${pagesBase}/${page.id}/edit`}
                      className="inline-flex items-center gap-1 text-[11px] transition-colors"
                      style={{ color: "var(--admin-text-muted)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--admin-accent)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--admin-text-muted)")
                      }>
                      <ExternalLink size={11} />
                      {t("consentEdit")}
                    </a>
                  </>
                ) : (
                  <span
                    className="text-xs italic"
                    style={{ color: "var(--admin-text-faint)" }}>
                    {t("consentPageNotFound")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
