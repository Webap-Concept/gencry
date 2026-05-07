import type { MfaEnforcement } from "@/lib/auth/mfa/policy";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

interface MfaPolicyBannerProps {
  enforcement: MfaEnforcement;
  /** True quando il layout protetto ha forzato un redirect qui via
   *  `?reason=mfa-required`. Cambia leggermente il copy del banner
   *  blocking. */
  forcedRedirect?: boolean;
}

/**
 * Banner mostrato sopra il MfaSection quando l'admin ha reso obbligatorio
 * l'MFA. Tre stati:
 * - ok: nessun render
 * - warning: countdown nei giorni rimanenti del grace period (giallo)
 * - blocking: deadline scaduta, l'utente DEVE attivare ora (rosso)
 */
export async function MfaPolicyBanner({
  enforcement,
  forcedRedirect,
}: MfaPolicyBannerProps) {
  const t = await getTranslations("public.settings.security.mfaPolicyBanner");

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

  const dateFmt = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      role="alert"
      className="rounded-xl p-5 flex items-start gap-3"
      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
      <Icon
        className="w-5 h-5 flex-shrink-0 mt-0.5"
        style={{ color: palette.icon }}
      />
      <div className="flex-1 space-y-1">
        <h3 className="text-sm font-semibold">
          {isBlocking ? t("blockingTitle") : t("warningTitle")}
        </h3>
        {isBlocking ? (
          <p className="text-sm">
            {forcedRedirect ? t("blockingForcedBody") : t("blockingBody")}
          </p>
        ) : enforcement.kind === "warning" ? (
          <p className="text-sm">
            {t("warningBody", {
              days: enforcement.daysRemaining,
              deadline: dateFmt.format(enforcement.deadline),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
