"use client";

// Form di login admin. Volutamente NON importa nulla da `@/components/ui/*`
// e niente classi Tailwind `gc-*` o `brand-*` o `text-gray-*`: l'admin
// deve dipendere solo da `admin.css` (token `--admin-*`) e dal CSS
// globale, mai dal CSS frontend. Vedi memoria
// `feedback_admin_no_frontend_css`.

import { ActionState } from "@/lib/auth/middleware";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { adminSignIn } from "./actions";

export function AdminLogin() {
  const t = useTranslations("admin.signIn");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    adminSignIn,
    { error: "" },
  );

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div
          className="rounded-2xl p-8 shadow-sm"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div className="mb-8">
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--admin-accent)" }}>
              {t("eyebrow")}
            </p>
            <h1
              className="text-2xl font-semibold"
              style={{ color: "var(--admin-text)" }}>
              {t("title")}
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("subtitle")}
            </p>
          </div>

          <form className="space-y-5" action={formAction}>
            <Field
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={50}
              label={t("emailLabel")}
              placeholder={t("emailPlaceholder")}
            />

            <Field
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={30}
              label={t("passwordLabel")}
              placeholder={t("passwordPlaceholder")}
            />

            {state?.error && (
              <div
                className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
                style={{
                  background: "var(--admin-destructive-bg)",
                  color: "var(--admin-destructive)",
                  border: "1px solid var(--admin-destructive-border)",
                }}>
                <X className="h-4 w-4 shrink-0" />
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold h-10 px-4 py-2.5 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "var(--admin-accent)" }}
              onMouseEnter={(e) => {
                if (!pending)
                  e.currentTarget.style.background =
                    "var(--admin-accent-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--admin-accent)";
              }}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" /> {t("submitPending")}
                </>
              ) : (
                t("submit")
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

function Field({ id, label, ...inputProps }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--admin-text-muted)" }}>
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className="flex h-10 w-full min-w-0 rounded-full px-4 py-2.5 text-sm outline-none transition-colors disabled:pointer-events-none disabled:opacity-50"
        style={{
          background: "var(--admin-input-bg)",
          color: "var(--admin-text)",
          border: "1px solid var(--admin-input-border)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--admin-accent)";
          e.currentTarget.style.boxShadow =
            "0 0 0 2px color-mix(in srgb, var(--admin-accent) 25%, transparent)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--admin-input-border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </div>
  );
}
