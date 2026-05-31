"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  HelpCircle,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/auth/middleware";
import type { DeviceType } from "@/lib/account/parse-user-agent";
import {
  revokeAllOtherDevicesAction,
  revokeDeviceAction,
} from "../actions";

type DeviceVM = {
  id: number;
  label: string;
  deviceType: DeviceType;
  /** ISO string — il client formatta con Intl.DateTimeFormat. */
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
};

export function DevicesList({ devices }: { devices: DeviceVM[] }) {
  const otherCount = devices.filter((d) => !d.isCurrent).length;
  const t = useTranslations("core.settings.security.devices");

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-gc-fg-3">{t("description")}</p>

      {devices.length === 0 ? (
        <div className="rounded-2xl border border-gc-line bg-gc-bg-2 p-6 text-center">
          <p className="text-[13.5px] text-gc-fg-3">{t("empty")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {devices.map((device) => (
            <DeviceRow key={device.id} device={device} />
          ))}
        </ul>
      )}

      {otherCount > 0 && <RevokeAllOthersButton otherCount={otherCount} />}
    </div>
  );
}

function DeviceRow({ device }: { device: DeviceVM }) {
  const router = useRouter();
  const t = useTranslations("core.settings.security.devices");
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const [state, action, pending] = useActionState<ActionState, FormData>(
    revokeDeviceAction,
    {},
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  const Icon = iconForDeviceType(device.deviceType);

  return (
    <li className="rounded-2xl border border-gc-line bg-gc-bg-2 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gc-bg text-gc-fg-3">
          <Icon size={18} strokeWidth={1.7} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-medium text-gc-fg">
              {device.label}
            </span>
            {device.isCurrent && (
              <span className="rounded-full bg-gc-success-bg px-2 py-0.5 text-[11px] font-medium text-gc-success-fg">
                {t("current")}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-gc-fg-3">
            {t("info", {
              date: dateFmt.format(new Date(device.createdAt)),
              time: dateFmt.format(new Date(device.lastUsedAt)),
            })}
          </p>
          {state.error && (
            <p className="mt-2 text-[12.5px] text-gc-neg">{state.error}</p>
          )}
        </div>

        {!device.isCurrent && (
          <form action={action}>
            <input type="hidden" name="deviceId" value={device.id} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("revokePending")}
                </>
              ) : (
                t("revokeIdle")
              )}
            </Button>
          </form>
        )}
      </div>
    </li>
  );
}

function RevokeAllOthersButton({ otherCount }: { otherCount: number }) {
  const router = useRouter();
  const t = useTranslations("core.settings.security.devices");
  const tCommon = useTranslations("core.common");
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    revokeAllOtherDevicesAction,
    {},
  );

  useEffect(() => {
    if (state.success) {
      setConfirming(false);
      router.refresh();
    }
  }, [state.success, router]);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2 border-t border-gc-line pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start text-gc-neg hover:text-gc-neg"
          onClick={() => setConfirming(true)}
        >
          {t("revokeAll")}
        </Button>
        {state.success && (
          <p className="text-[12.5px] text-gc-success-fg">{state.success}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gc-line bg-gc-bg-2 p-4">
      <p className="text-[13px] text-gc-fg">
        {t("revokeAllConfirm", { n: otherCount })}
      </p>
      {state.error && <p className="text-[12.5px] text-gc-neg">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("revokeAllPending")}
              </>
            ) : (
              t("revokeAllConfirmCta")
            )}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          {tCommon("cancel")}
        </Button>
      </div>
    </div>
  );
}

function iconForDeviceType(type: DeviceType) {
  switch (type) {
    case "mobile":
      return Smartphone;
    case "tablet":
      return Tablet;
    case "desktop":
      return Monitor;
    default:
      return HelpCircle;
  }
}
