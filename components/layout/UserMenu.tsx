"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, User as UserIcon } from "lucide-react";
import { mutate } from "swr";
import { signOut } from "@/app/(login)/actions";
import { Avatar } from "@/components/shared/Avatar";
import type { UserWithProfile } from "@/lib/db/schema";
import { fullName } from "@/lib/utils";

type Variant = "popover" | "sheet";

type UserMenuProps = {
  user: UserWithProfile;
  /** "popover" si apre come dropdown verso l'alto (sidebar desktop).
   *  "sheet" si apre come bottom-sheet (mobile, dall'AppTopBar).
   */
  variant: Variant;
  /** Trigger custom: se assente usa l'avatar/dettagli utente come riga. */
  trigger?: (open: boolean, toggle: () => void) => React.ReactNode;
};

export function UserMenu({ user, variant, trigger }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function escHandler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open]);

  // Blocca lo scroll del body quando il bottom-sheet è aperto
  useEffect(() => {
    if (variant !== "sheet") return;
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, variant]);

  const initial = (user.firstName?.[0] ?? user.email[0] ?? "U").toUpperCase();
  const avatarUser = {
    handle: user.username ?? "",
    name: fullName(user),
    avatar: initial,
    color: "#5c5146",
    followers: 0,
    bio: "",
    avatarUrl: user.avatarUrl,
  };

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    mutate("/api/user");
    window.location.href = "/";
  }

  const toggle = () => setOpen((o) => !o);

  const items = (
    <>
      <MenuItem
        href="/profilo"
        icon={<UserIcon size={16} strokeWidth={1.6} />}
        label="Il tuo profilo"
        onClick={() => setOpen(false)}
      />
      <MenuItem
        href="/settings"
        icon={<Settings size={16} strokeWidth={1.6} />}
        label="Impostazioni"
        onClick={() => setOpen(false)}
      />
      <div className="my-1 h-px bg-gc-line" />
      <button
        type="button"
        onClick={handleSignOut}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] text-gc-neg hover:bg-gc-bg-3 transition rounded-gc-sm"
      >
        <LogOut size={16} strokeWidth={1.6} />
        <span>Esci</span>
      </button>
    </>
  );

  const header = (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-gc-line">
      <Avatar user={avatarUser} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium text-gc-fg truncate">
          {fullName(user)}
        </div>
        {user.username ? (
          <div className="text-[11.5px] text-gc-fg-3 font-mono truncate">
            @{user.username}
          </div>
        ) : (
          <div className="text-[11.5px] text-gc-fg-3 truncate">
            {user.email}
          </div>
        )}
      </div>
    </div>
  );

  if (variant === "popover") {
    return (
      <div ref={ref} className="relative">
        {trigger ? (
          trigger(open, toggle)
        ) : (
          <DefaultPopoverTrigger
            user={avatarUser}
            label={fullName(user)}
            sub={user.username ? `@${user.username}` : user.email}
            onClick={toggle}
            open={open}
          />
        )}
        {open && (
          <div
            role="menu"
            className="absolute bottom-full left-0 right-0 mb-2 bg-gc-bg-2 border border-gc-line rounded-gc shadow-lg overflow-hidden z-30"
          >
            {header}
            <div className="p-1">{items}</div>
          </div>
        )}
      </div>
    );
  }

  // sheet
  return (
    <div ref={ref}>
      {trigger ? (
        trigger(open, toggle)
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label="Apri menu utente"
          aria-expanded={open}
          className="rounded-full"
        >
          <Avatar user={avatarUser} size={32} />
        </button>
      )}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="fixed inset-x-0 bottom-0 z-50 bg-gc-bg-2 border-t border-gc-line rounded-t-2xl pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom"
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-gc-line my-2" />
            {header}
            <div className="p-2">{items}</div>
          </div>
        </>
      )}
    </div>
  );
}

function DefaultPopoverTrigger({
  user,
  label,
  sub,
  onClick,
  open,
}: {
  user: { name: string; avatar: string; color: string; avatarUrl?: string | null };
  label: string;
  sub: string;
  onClick: () => void;
  open: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="menu"
      aria-expanded={open}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-gc-sm hover:bg-gc-bg-2 transition text-left"
    >
      <Avatar
        user={{ ...user, handle: "", followers: 0, bio: "" }}
        size={32}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gc-fg truncate">
          {label}
        </div>
        <div className="text-[11.5px] text-gc-fg-3 font-mono truncate">
          {sub}
        </div>
      </div>
    </button>
  );
}

function MenuItem({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      role="menuitem"
      className="flex items-center gap-3 px-3 py-2.5 text-[14px] text-gc-fg hover:bg-gc-bg-3 transition rounded-gc-sm"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
