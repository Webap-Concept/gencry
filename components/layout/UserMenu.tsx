"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { LogOut, Palette, Settings, User as UserIcon } from "lucide-react";
import { mutate } from "swr";
import { signOut } from "@/app/(login)/actions";
import { Avatar } from "@/components/shared/Avatar";
import type { UserWithProfile } from "@/lib/db/schema";
import { fullName } from "@/lib/utils";

type Variant = "popover" | "sheet";

type UserMenuProps = {
  user: UserWithProfile;
  /** "popover" si apre come dropdown verso l'alto (sidebar desktop).
   *  "sheet" si apre come bottom-sheet (mobile, dall'AppTopBar);
   *  renderizzato in portale a document.body per evitare interferenze
   *  con stacking context e sticky parents.
   */
  variant: Variant;
  trigger?: (open: boolean, toggle: () => void) => React.ReactNode;
};

export function UserMenu({ user, variant, trigger }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("core.userMenu");

  useEffect(() => setMounted(true), []);

  // Chiusura su ESC (entrambe le varianti)
  useEffect(() => {
    if (!open) return;
    function escHandler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", escHandler);
    return () => document.removeEventListener("keydown", escHandler);
  }, [open]);

  // Click outside per il popover (la variante sheet usa l'overlay onClick)
  useEffect(() => {
    if (!open || variant !== "popover") return;
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, variant]);

  // Blocca lo scroll del body quando il bottom-sheet è aperto
  useEffect(() => {
    if (variant !== "sheet" || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, variant]);

  const initial = (user.firstName?.[0] ?? user.email[0] ?? "U").toUpperCase();
  const name = fullName(user);
  const handleLine = user.username ? `@${user.username}` : null;
  // Quando manca il nome non mostriamo "Utente" sopra @username, ma collassiamo
  // la card su una sola riga: handle (se c'è) o email come label primaria.
  const primary = name || handleLine || user.email;
  const secondary = name ? handleLine ?? user.email : null;
  const avatarUser = {
    handle: user.username ?? "",
    name: primary,
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

  const close = () => setOpen(false);
  const toggle = () => setOpen((o) => !o);

  const menuBody = (
    <>
      <MenuItem
        href="/profile"
        icon={<UserIcon size={16} strokeWidth={1.6} />}
        label={t("profile")}
        onClick={close}
      />
      <MenuItem
        href="/settings"
        icon={<Settings size={16} strokeWidth={1.6} />}
        label={t("settings")}
        onClick={close}
      />
      <ThemeToggleItem onAction={close} />
      <div className="my-1 h-px bg-gc-line" />
      <button
        type="button"
        onClick={handleSignOut}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] text-gc-neg hover:bg-gc-bg-3 transition rounded-gc-sm"
      >
        <LogOut size={16} strokeWidth={1.6} />
        <span>{t("signOut")}</span>
      </button>
    </>
  );

  const header = (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-gc-line">
      <Avatar user={avatarUser} size={40} />
      <div className="flex-1 min-w-0">
        <div
          className={`text-[13.5px] font-medium text-gc-fg truncate ${
            primary === handleLine ? "font-mono" : ""
          }`}
        >
          {primary}
        </div>
        {secondary && (
          <div
            className={`text-[11.5px] text-gc-fg-3 truncate ${
              secondary === handleLine ? "font-mono" : ""
            }`}
          >
            {secondary}
          </div>
        )}
      </div>
    </div>
  );

  if (variant === "popover") {
    return (
      <div ref={popoverRef} className="relative">
        {trigger ? (
          trigger(open, toggle)
        ) : (
          <DefaultPopoverTrigger
            user={avatarUser}
            label={primary}
            sub={secondary}
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
            <div className="p-1">{menuBody}</div>
          </div>
        )}
      </div>
    );
  }

  // sheet (mobile) — portale per evitare interferenze con il sticky topbar
  return (
    <>
      {trigger ? (
        trigger(open, toggle)
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={t("openUserMenu")}
          aria-expanded={open}
          className="rounded-full"
        >
          <Avatar user={avatarUser} size={32} />
        </button>
      )}
      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/40 animate-in fade-in"
                onClick={close}
                aria-hidden="true"
              />
              <div
                role="menu"
                className="absolute inset-x-0 bottom-0 max-h-[85dvh] flex flex-col bg-gc-bg-2 border-t border-gc-line rounded-t-2xl pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom"
              >
                <div className="mx-auto w-10 h-1 rounded-full bg-gc-line my-2 shrink-0" />
                <div className="shrink-0">{header}</div>
                <div className="p-2 overflow-y-auto">{menuBody}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
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
  sub: string | null;
  onClick: () => void;
  open: boolean;
}) {
  const labelIsHandle = label.startsWith("@");
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
        <div
          className={`text-[13px] font-medium text-gc-fg truncate ${
            labelIsHandle ? "font-mono" : ""
          }`}
        >
          {label}
        </div>
        {sub && (
          <div
            className={`text-[11.5px] text-gc-fg-3 truncate ${
              sub.startsWith("@") ? "font-mono" : ""
            }`}
          >
            {sub}
          </div>
        )}
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

/**
 * Toggle Sabbia / Bosco. Persiste in localStorage `gc-theme` e applica la
 * classe `.gc-dark` su <html>. Le regole concrete sono in frontend.css
 * scope-ate sotto `.gc-dark .gc-app-shell { ... }`, quindi il tema attiva
 * solo dentro il layout (protected) — landing pubblica, /sign-in e CMS
 * pages restano sempre in sabbia anche per un utente loggato in bosco.
 *
 * Classe `.gc-dark` (non `.dark`) per evitare collisione col tema admin
 * che usa `.dark` su <html> con la propria localStorage key `admin-theme`.
 */
function ThemeToggleItem({ onAction }: { onAction?: () => void }) {
  const [theme, setTheme] = useState<"sabbia" | "bosco">("sabbia");
  const t = useTranslations("core.userMenu");

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("gc-theme") : null;
    if (saved === "bosco") {
      document.documentElement.classList.add("gc-dark");
      setTheme("bosco");
    } else {
      document.documentElement.classList.remove("gc-dark");
      setTheme("sabbia");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "bosco" ? "sabbia" : "bosco";
    document.documentElement.classList.toggle("gc-dark", next === "bosco");
    localStorage.setItem("gc-theme", next);
    setTheme(next);
    onAction?.();
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="menuitem"
      className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] text-gc-fg hover:bg-gc-bg-3 transition rounded-gc-sm"
    >
      <Palette size={16} strokeWidth={1.6} />
      <span className="flex-1 text-left">{t("theme")}</span>
      <span className="text-[11.5px] text-gc-fg-3">
        {theme === "sabbia"
          ? t("themeOption.sand")
          : t("themeOption.forest")}
      </span>
    </button>
  );
}
