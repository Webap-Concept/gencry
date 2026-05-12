"use client";

// components/layout/NotificationsSheet.tsx
//
// Drawer notifiche basato su shadcn Sheet. `side="left"`: lo sheet
// scivola da fuori il viewport verso destra, animato (a11y + animazione
// gestite da Radix). Overlay scuro semitrasparente blocca le interazioni
// col main finché il drawer è aperto.
//
// Mockup: 3 notifiche fittizie. Verrà sostituito dalla vera lista
// server-fetched quando il modulo notifiche arriverà — basta cambiare
// il body del SheetContent, l'API trigger resta identica.

import { Bell, Check, MessageCircle, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type MockNotif = {
  id: string;
  icon: typeof Bell;
  title: string;
  body: string;
  time: string;
  unread?: boolean;
};

const MOCK_NOTIFS: MockNotif[] = [
  {
    id: "n1",
    icon: UserPlus,
    title: "Nuovo follower",
    body: "@marcocoin ha iniziato a seguirti",
    time: "2 min fa",
    unread: true,
  },
  {
    id: "n2",
    icon: MessageCircle,
    title: "Risposta a un tuo post",
    body: "@laura.eth ha risposto al tuo post su ETH 2.0",
    time: "1 h fa",
    unread: true,
  },
  {
    id: "n3",
    icon: Check,
    title: "Previsione risolta",
    body: "BTC > 60k entro 30/05 — vincente (+12%)",
    time: "ieri",
  },
];

export function NotificationsSheet({ children }: { children: ReactNode }) {
  const unreadCount = MOCK_NOTIFS.filter((n) => n.unread).length;

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="left"
        className="w-[360px] sm:max-w-[360px] flex flex-col p-0 bg-gc-bg-2 border-r border-gc-line"
      >
        <SheetHeader className="px-5 py-4 border-b border-gc-line">
          <SheetTitle className="flex items-center gap-2 text-[15px] text-gc-fg">
            <Bell size={16} strokeWidth={1.7} />
            Notifiche
            {unreadCount > 0 && (
              <span className="text-[11px] font-semibold text-gc-accent">
                ({unreadCount})
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Elenco delle notifiche non lette e recenti
          </SheetDescription>
        </SheetHeader>

        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-gc-line">
          {MOCK_NOTIFS.map((n) => {
            const Icon = n.icon;
            return (
              <li
                key={n.id}
                className={[
                  "flex items-start gap-3 px-5 py-3",
                  n.unread ? "bg-gc-bg" : "",
                ].join(" ")}
              >
                <div
                  className={[
                    "shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
                    n.unread
                      ? "bg-gc-accent/15 text-gc-accent"
                      : "bg-gc-bg-3 text-gc-fg-3",
                  ].join(" ")}
                >
                  <Icon size={16} strokeWidth={1.7} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-gc-fg leading-tight">
                    {n.title}
                  </p>
                  <p className="text-[12.5px] text-gc-fg-2 mt-0.5 leading-snug">
                    {n.body}
                  </p>
                  <p className="text-[11px] text-gc-fg-3 mt-1">{n.time}</p>
                </div>
                {n.unread && (
                  <span
                    aria-hidden="true"
                    className="shrink-0 mt-2 w-2 h-2 rounded-full bg-gc-accent"
                  />
                )}
              </li>
            );
          })}
        </ul>

        <div className="shrink-0 px-5 py-3 border-t border-gc-line text-center">
          <button
            type="button"
            className="text-[12.5px] font-medium text-gc-fg-2 hover:text-gc-fg transition"
          >
            Segna tutte come lette
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
