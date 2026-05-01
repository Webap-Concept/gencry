import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import { getDeviceToken } from "@/lib/auth/trusted-device";
import { listMyDevices } from "@/lib/account/devices";
import { DevicesList } from "./_components/devices-list";

export default async function SecuritySettingsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const currentDeviceToken = await getDeviceToken();
  const devices = await listMyDevices(user.id, currentDeviceToken);

  return (
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
  );
}
