"use client";

import { signOut } from "@/app/(login)/actions";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { UserWithProfile } from "@/lib/db/schema";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import type { ClientNotification } from "@/lib/notifications/serializers";
import {
  ChevronDown,
  ExternalLink,
  LogOut,
  Moon,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAdminSlug } from "./admin-slug-context";
import { NotificationBell } from "./notification-bell";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
  });

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("admin-theme", next);
    setTheme(next);
  }

  useEffect(() => {
    const saved = localStorage.getItem("admin-theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
      setTheme("dark");
    }
  }, []);

  return { theme, toggle };
}

export default function AdminHeaderRight({
  user,
  notifications,
  unreadCount,
}: {
  user: UserWithProfile;
  notifications: ClientNotification[];
  unreadCount: number;
}) {
  const t = useTranslations("admin.shell");
  const localeRaw = useLocale();
  const currentLocale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const currentPath = usePathname() ?? "/admin";
  const adminSlug = useAdminSlug();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, toggle } = useTheme();

  function closeMenu() {
    setOpen(false);
  }

  const initials =
    [user.firstName, user.lastName]
      .filter(Boolean)
      .map((n) => n![0].toUpperCase())
      .join("") || "A";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <NotificationBell
        initialNotifications={notifications}
        initialUnreadCount={unreadCount}
      />

      <button
        onClick={toggle}
        aria-label={t("themeToggleAria")}
        className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
        style={{ color: "var(--admin-icon-color)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--admin-hover-bg)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg transition-colors"
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--admin-hover-bg)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: "var(--admin-accent)" }}>
            {initials}
          </div>
          <div className="text-left hidden sm:block">
            <p
              className="text-xs font-semibold leading-none"
              style={{ color: "var(--admin-text)" }}>
              {user.firstName} {user.lastName}
            </p>
            <p
              className="text-[10px] font-medium mt-0.5 uppercase tracking-wide"
              style={{ color: "var(--admin-accent)" }}>
              @{user.username}
            </p>
          </div>
          <ChevronDown
            size={14}
            className={`hidden sm:block transition-transform ${
              open ? "rotate-180" : ""
            }`}
            style={{ color: "var(--admin-text-faint)" }}
          />
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-2 w-60 rounded-xl shadow-lg z-50 overflow-hidden"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <div
              className="px-4 py-3"
              style={{ borderBottom: "1px solid var(--admin-divider)" }}>
              <p
                className="text-xs font-semibold truncate"
                style={{ color: "var(--admin-text)" }}>
                {user.firstName} {user.lastName}
              </p>
              <p
                className="text-[11px] truncate mt-0.5"
                style={{ color: "var(--admin-text-faint)" }}>
                {user.email}
              </p>
            </div>

            {/* Voci personali staff: la verifica a due fattori vive in
                admin (single source per lo staff), le impostazioni
                account stanno sul frontend (sono dell'utente). L'icona
                ExternalLink segnala la transizione di chrome. */}
            <div style={{ borderBottom: "1px solid var(--admin-divider)" }}>
              <Link
                href={`/${adminSlug}/security/mfa-enroll`}
                onClick={closeMenu}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors"
                style={{ color: "var(--admin-text)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--admin-hover-bg)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }>
                <ShieldCheck size={15} />
                <span className="flex-1">{t("menuMfa")}</span>
              </Link>
              <Link
                href="/settings"
                onClick={closeMenu}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors"
                style={{ color: "var(--admin-text)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--admin-hover-bg)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }>
                <SettingsIcon size={15} />
                <span className="flex-1">{t("menuAccount")}</span>
                <ExternalLink
                  size={12}
                  style={{ color: "var(--admin-text-faint)" }}
                />
              </Link>
            </div>

            <div
              className="px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--admin-divider)" }}>
              <LanguageSwitcher
                current={currentLocale}
                currentPath={currentPath}
                className="block w-full text-xs"
              />
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 transition-colors"
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--admin-hover-bg)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }>
                <LogOut size={15} />
                {t("logout")}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
