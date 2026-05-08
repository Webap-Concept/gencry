// Banner enforcement MFA per la pagina admin di enrollment.
// Server component. Usa solo --admin-* tokens — niente palette frontend.

import type { MfaEnforcement } from "@/lib/auth/mfa/policy";
import { AlertTriangle, ShieldCheck } from "lucide-react";

interface AdminMfaPolicyBannerProps {
  enforcement: MfaEnforcement;
  /** True quando il layout admin ha forzato un redirect qui via
   *  `?reason=mfa-required`. Cambia leggermente il copy in blocking. */
  forcedRedirect?: boolean;
}

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function AdminMfaPolicyBanner({
  enforcement,
  forcedRedirect,
}: AdminMfaPolicyBannerProps) {
  if (enforcement.kind === "ok") return null;

  const isBlocking = enforcement.kind === "blocking";
  const Icon = isBlocking ? AlertTriangle : ShieldCheck;
  const palette = isBlocking
    ? {
        bg: "rgba(220, 38, 38, 0.08)",
        border: "rgba(220, 38, 38, 0.3)",
        icon: "#dc2626",
      }
    : {
        bg: "rgba(245, 158, 11, 0.08)",
        border: "rgba(245, 158, 11, 0.3)",
        icon: "#d97706",
      };

  return (
    <div
      role="alert"
      className="rounded-xl p-4 flex items-start gap-3"
      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
      <Icon
        className="w-5 h-5 flex-shrink-0 mt-0.5"
        style={{ color: palette.icon }}
      />
      <div className="flex-1 space-y-1">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}>
          {isBlocking
            ? "Devi attivare l'autenticazione a due fattori per continuare"
            : "Attivazione MFA richiesta"}
        </h3>
        {isBlocking ? (
          <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
            {forcedRedirect
              ? "Le policy di sicurezza richiedono l'MFA per il tuo account staff. Completa il setup qui sotto prima di accedere al pannello."
              : "Le policy di sicurezza richiedono l'MFA per il tuo account staff. Completa il setup qui sotto."}
          </p>
        ) : enforcement.kind === "warning" ? (
          <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
            Hai ancora{" "}
            <strong>
              {enforcement.daysRemaining}{" "}
              {enforcement.daysRemaining === 1 ? "giorno" : "giorni"}
            </strong>{" "}
            per attivare l'MFA. Dopo il {dateFmt.format(enforcement.deadline)}{" "}
            l'accesso al pannello sarà bloccato finché non completi il setup.
          </p>
        ) : null}
      </div>
    </div>
  );
}
