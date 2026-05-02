"use client";

import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Code2,
  Database,
  Globe,
  LogIn,
  Mail,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { usePathname } from "next/navigation";

type SectionMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
};

const SECTIONS: Record<string, SectionMeta> = {
  general: {
    label: "General",
    description: "Name, logo, and main information of the application.",
    icon: Globe,
  },
  "operation-mode": {
    label: "Operation Mode",
    description: "Manage the platform's behavior settings.",
    icon: SlidersHorizontal,
  },
  signup: {
    label: "SignUp",
    description: "Configure user registration options.",
    icon: LogIn,
  },
  resend: {
    label: "Resend",
    description: "Configure credentials and sender for outgoing emails.",
    icon: Send,
  },
  email: {
    label: "Email",
    description: "Customize email templates sent by the system.",
    icon: Mail,
  },
  snippets: {
    label: "Snippets",
    description: "Manage snippets and textual content of the application.",
    icon: Code2,
  },
  redis: {
    label: "Redis",
    description: "Configure Redis cache connection and options.",
    icon: Database,
  },
  cloudflare: {
    label: "Cloudflare",
    description: "Configure Cloudflare Turnstile for bot protection on sign-in and sign-up.",
    icon: Shield,
  },
  cron: {
    label: "Cron Jobs",
    description: "Inspect, monitor, enable or disable Supabase pg_cron jobs.",
    icon: Clock,
  },
};

const DEFAULT: SectionMeta = {
  label: "",
  description: "Configurations for the app",
  icon: Settings,
};

export function SettingsHeader() {
  const pathname = usePathname();
  const segment = pathname.split("/").pop() ?? "";
  const section = SECTIONS[segment] ?? DEFAULT;
  const Icon = section.icon;

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background:
            "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
          border:
            "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
        }}>
        <Icon size={18} style={{ color: "var(--admin-accent)" }} />
      </div>
      <div>
        <h2
          className="text-lg font-bold"
          style={{ color: "var(--admin-text)" }}>
          {section.label ? (
            <>
              <span style={{ color: "var(--admin-text-muted)" }}>Settings</span>
              <span style={{ color: "var(--admin-text-faint)" }}> / </span>
              <span>{section.label}</span>
            </>
          ) : (
            "Settings"
          )}
        </h2>
        <p
          className="text-sm mt-0.5"
          style={{ color: "var(--admin-text-faint)" }}>
          {section.description}
        </p>
      </div>
    </div>
  );
}
