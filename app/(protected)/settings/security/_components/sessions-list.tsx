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
  revokeAllOtherSessionsAction,
  revokeSessionAction,
} from "../actions";

type SessionVM = {
  id: string;
  label: string;
  deviceType: DeviceType;
  ip: string | null;
  /** ISO. */
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function SessionsList({ sessions }: { sessions: SessionVM[] }) {
  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          Sessioni attive
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          Accessi attivi al tuo account in questo momento. Revocando una
          sessione esci immediatamente da quel dispositivo. La sessione che
          stai usando ora non può essere revocata da qui — per uscire fai
          logout.
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-gc-line bg-gc-bg-2 p-6 text-center">
          <p className="text-[13.5px] text-gc-fg-3">
            Nessuna sessione attiva.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </ul>
      )}

      {otherCount > 0 && <RevokeAllOthersButton otherCount={otherCount} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Riga sessione
// ---------------------------------------------------------------------------

function SessionRow({ session }: { session: SessionVM }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    revokeSessionAction,
    {},
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  const Icon = iconForDeviceType(session.deviceType);

  return (
    <li className="rounded-2xl border border-gc-line bg-gc-bg-2 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gc-bg text-gc-fg-3">
          <Icon size={18} strokeWidth={1.7} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-medium text-gc-fg">
              {session.label}
            </span>
            {session.isCurrent && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                Sessione corrente
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-gc-fg-3">
            {session.ip && <>IP {session.ip} · </>}
            Aperta il {dateFmt.format(new Date(session.createdAt))} · Ultima
            attività{" "}
            <RelativeTime
              iso={session.lastSeenAt}
              fallback={dateFmt.format(new Date(session.lastSeenAt))}
            />
          </p>
          {state.error && (
            <p className="mt-2 text-[12.5px] text-gc-neg">{state.error}</p>
          )}
        </div>

        {!session.isCurrent && (
          <form action={action}>
            <input type="hidden" name="sessionId" value={session.id} />
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
// Bottone "Revoca tutte le altre" con conferma in due step
// ---------------------------------------------------------------------------

function RevokeAllOthersButton({ otherCount }: { otherCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    revokeAllOtherSessionsAction,
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
          Revoca tutte le altre sessioni
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
        Stai per chiudere{" "}
        {otherCount === 1 ? "1 sessione" : `${otherCount} sessioni`}. Su quei
        dispositivi sarà necessario rifare login.
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
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(formatRelative(new Date(iso)));
  }, [iso]);

  return <>{text ?? fallback}</>;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "ora";
  if (diffMin < 60) return diffMin === 1 ? "1 minuto fa" : `${diffMin} minuti fa`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return diffH === 1 ? "1 ora fa" : `${diffH} ore fa`;

  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return diffD === 1 ? "1 giorno fa" : `${diffD} giorni fa`;

  return dateFmt.format(date);
}
