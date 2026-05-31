import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MonitorSmartphone, ShieldCheck } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import {
  SettingsAccordionItem,
  settingsAccordionClass,
} from "../_components/settings-accordion";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { getUser } from "@/lib/db/queries";
import { getDeviceToken } from "@/lib/auth/trusted-device";
import { getSession } from "@/lib/auth/session";
import { listActiveSessions } from "@/lib/auth/sessions";
import { getMfaPolicy, mfaEnforcement } from "@/lib/auth/mfa/policy";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { listMyDevices } from "@/lib/account/devices";
import { parseUserAgent } from "@/lib/account/parse-user-agent";
import { DevicesList } from "./_components/devices-list";
import { MfaPolicyBanner } from "./_components/mfa-policy-banner";
import { MfaSection } from "./_components/mfa-section";
import { SessionsList } from "./_components/sessions-list";

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const session = await getSession();
  const currentSessionId = session?.sessionId ?? null;
  const currentDeviceToken = await getDeviceToken();

  const [sessionsRaw, devices, mfaState, policy, params] = await Promise.all([
    listActiveSessions({ userId: user.id, currentSessionId }),
    listMyDevices(user.id, currentDeviceToken),
    getMfaState(user.id),
    getMfaPolicy(),
    searchParams,
  ]);

  const enforcement = mfaEnforcement(user, policy, mfaState);
  const forcedRedirect = params.reason === "mfa-required";

  // Staff (isAdmin) gestisce il proprio MFA dentro l'admin, non sul
  // frontend. Se la policy richiede l'MFA per loro (warning o blocking)
  // e non sono enrolled, li mandiamo a /<adminSlug>/security/mfa-enroll
  // dove c'è la UI dedicata. L'utente atterrato qui per errore (es.
  // bookmark) viene riportato nel posto giusto.
  if (user.isAdmin === true && enforcement.kind !== "ok") {
    const slug = await getAdminUrlSlug();
    redirect(`/${slug}/security/mfa-enroll?reason=mfa-required`);
  }

  const sessions = sessionsRaw.map((s) => ({
    id: s.id,
    label: parseUserAgent(s.userAgent).label,
    deviceType: parseUserAgent(s.userAgent).deviceType,
    ip: s.ip,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    isCurrent: s.isCurrent,
  }));

  const t = await getTranslations("core.settings.security");

  return (
    <div className="space-y-12">
      <MfaPolicyBanner
        enforcement={enforcement}
        forcedRedirect={forcedRedirect}
      />

      <MfaSection initialState={mfaState} />

      <Accordion type="multiple" className={settingsAccordionClass}>
        <SettingsAccordionItem
          value="sessions"
          icon={MonitorSmartphone}
          title={t("sessions.title")}
          subLabel={t("sessions.subLabel", { count: sessions.length })}
        >
          <SessionsList sessions={sessions} />
        </SettingsAccordionItem>

        <SettingsAccordionItem
          value="devices"
          icon={ShieldCheck}
          title={t("devices.title")}
          subLabel={t("devices.subLabel", { count: devices.length })}
        >
          <DevicesList
            devices={devices.map((d) => ({
              id: d.id,
              label: d.parsed.label,
              deviceType: d.parsed.deviceType,
              createdAt: d.createdAt.toISOString(),
              lastUsedAt: d.lastUsedAt.toISOString(),
              isCurrent: d.isCurrent,
            }))}
          />
        </SettingsAccordionItem>
      </Accordion>
    </div>
  );
}
