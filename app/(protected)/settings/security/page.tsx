import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import { getDeviceToken } from "@/lib/auth/trusted-device";
import { getSession } from "@/lib/auth/session";
import { listActiveSessions } from "@/lib/auth/sessions";
import { listMyDevices } from "@/lib/account/devices";
import { parseUserAgent } from "@/lib/account/parse-user-agent";
import { DevicesList } from "./_components/devices-list";
import { SessionsList } from "./_components/sessions-list";

export default async function SecuritySettingsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const session = await getSession();
  const currentSessionId = session?.sessionId ?? null;
  const currentDeviceToken = await getDeviceToken();

  const [sessionsRaw, devices] = await Promise.all([
    listActiveSessions({ userId: user.id, currentSessionId }),
    listMyDevices(user.id, currentDeviceToken),
  ]);

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

  return (
    <div className="space-y-12">
      <SessionsList sessions={sessions} />

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
    </div>
  );
}
