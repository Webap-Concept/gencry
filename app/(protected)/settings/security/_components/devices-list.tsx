"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function DevicesList({ devices }: { devices: DeviceVM[] }) {
  const otherCount = devices.filter((d) => !d.isCurrent).length;

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-gc-fg">
            Dispositivi fidati
          </h2>
          <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
            Questi dispositivi possono accedere senza dover ricevere ogni volta
            un codice di verifica via email. Revoca quelli che non riconosci o
            che non usi più.
          </p>
        </div>

        {devices.length === 0 ? (
          <div className="rounded-2xl border border-gc-line bg-gc-bg-2 p-6 text-center">
            <p className="text-[13.5px] text-gc-fg-3">
              Nessun dispositivo fidato registrato.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {devices.map((device) => (
              <DeviceRow key={device.id} device={device} />
            ))}
          </ul>
        )}

        {otherCount > 0 && <RevokeAllOthersButton otherCount={otherCount} />}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Riga singola dispositivo
// ---------------------------------------------------------------------------

function DeviceRow({ device }: { device: DeviceVM }) {
  const router = useRouter();
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
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                Questo dispositivo
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-gc-fg-3">
            Aggiunto il {dateFmt.format(new Date(device.createdAt))} · Ultimo
            uso{" "}
            <RelativeTime
              iso={device.lastUsedAt}
              fallback={dateFmt.format(new Date(device.lastUsedAt))}
            />
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
                  Revoca…
                </>
              ) : (
                "Revoca"
              )}
            </Button>
          </form>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Bottone "Revoca tutti gli altri" con conferma in due step
// ---------------------------------------------------------------------------

function RevokeAllOthersButton({ otherCount }: { otherCount: number }) {
  const router = useRouter();
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
          Revoca tutti gli altri dispositivi
        </Button>
        {state.success && (
          <p className="text-[12.5px] text-emerald-700">{state.success}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gc-line bg-gc-bg-2 p-4">
      <p className="text-[13px] text-gc-fg">
        Stai per revocare {otherCount === 1 ? "1 dispositivo" : `${otherCount} dispositivi`}.
        Al prossimo accesso da quei dispositivi sarà richiesto un nuovo codice
        di verifica via email.
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
                Revoca in corso…
              </>
            ) : (
              "Conferma revoca"
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
          Annulla
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function RelativeTime({ iso, fallback }: { iso: string; fallback: string }) {
  // Mounted-only per evitare hydration mismatch (la "differenza" rispetto a now
  // dipende dal momento del render). Sul primo render mostriamo il fallback
  // assoluto, poi sostituiamo client-side con il relativo.
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(formatRelative(new Date(iso)));
  }, [iso]);

  return <>{text ?? fallback}</>;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "pochi secondi fa";
  if (diffMin < 60) return diffMin === 1 ? "1 minuto fa" : `${diffMin} minuti fa`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return diffH === 1 ? "1 ora fa" : `${diffH} ore fa`;

  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return diffD === 1 ? "1 giorno fa" : `${diffD} giorni fa`;

  return dateFmt.format(date);
}
