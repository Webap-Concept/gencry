"use client";

import { useTranslations } from "next-intl";
import {
  Ban,
  CheckCircle2,
  Database,
  FileText,
  Filter,
  FormInput,
  Gauge,
  KeyRound,
  Mail,
  ScrollText,
  SearchCheck,
  ShieldCheck,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";

type Group = "input" | "security" | "db" | "side";

interface Step {
  key:
    | "validation"
    | "registrationsEnabled"
    | "turnstile"
    | "rateLimit"
    | "blacklists"
    | "availability"
    | "consents"
    | "hashPassword"
    | "insertUser"
    | "bloomUpdate"
    | "consentLedger"
    | "sendEmail";
  group: Group;
  icon: LucideIcon;
  /** Optional links to admin sections where this step is configured. */
  links?: Array<{ label: string; href: string }>;
}

const STEPS: Step[] = [
  { key: "validation",           group: "input",    icon: FormInput },
  { key: "registrationsEnabled", group: "input",    icon: ToggleRight, links: [{ label: "/admin/settings/signup", href: "/admin/settings/signup" }] },
  { key: "turnstile",            group: "security", icon: ShieldCheck, links: [{ label: "/admin/services/cloudflare", href: "/admin/services/cloudflare" }] },
  { key: "rateLimit",            group: "security", icon: Gauge,       links: [{ label: "/admin/security/bruteforce", href: "/admin/security/bruteforce" }] },
  { key: "blacklists",           group: "security", icon: Ban,         links: [
    { label: "/admin/security/ip-rules",          href: "/admin/security/ip-rules" },
    { label: "/admin/security/blocked-domains",   href: "/admin/security/blocked-domains" },
    { label: "/admin/security/blocked-usernames", href: "/admin/security/blocked-usernames" },
  ] },
  { key: "availability",         group: "security", icon: SearchCheck },
  { key: "consents",             group: "db",       icon: ScrollText,  links: [{ label: "/admin/compliance/gdpr", href: "/admin/compliance/gdpr" }] },
  { key: "hashPassword",         group: "db",       icon: KeyRound },
  { key: "insertUser",           group: "db",       icon: Database },
  { key: "bloomUpdate",          group: "side",     icon: Filter },
  { key: "consentLedger",        group: "side",     icon: FileText,    links: [{ label: "/admin/compliance/gdpr", href: "/admin/compliance/gdpr" }] },
  { key: "sendEmail",            group: "side",     icon: Mail,        links: [{ label: "/admin/services/resend", href: "/admin/services/resend" }] },
];

// Colore per gruppo — coerenti con la palette admin (semantic, non legati a un brand).
const GROUP_COLOR: Record<Group, string> = {
  input:    "#3b82f6",
  security: "#d97706",
  db:       "#16a34a",
  side:     "#8b5cf6",
};

const EXTERNAL_SERVICES: Array<{
  key: "cloudflare" | "redis" | "supabase" | "resend";
  href: string;
}> = [
  { key: "cloudflare", href: "/admin/services/cloudflare" },
  { key: "redis",      href: "/admin/services/redis" },
  { key: "supabase",   href: "/admin/services/supabase" },
  { key: "resend",     href: "/admin/services/resend" },
];

export function SignupFlowDiagram() {
  const t = useTranslations("admin.settings.signup.flowDiagram");

  // Raggruppa gli step per gruppo, preservando l'ordine cronologico del flusso.
  const groups: Group[] = ["input", "security", "db", "side"];

  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
      <p style={{ margin: "0 0 18px 0", color: "var(--admin-text-muted)" }}>
        {t("intro")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {groups.map((group) => {
          const groupSteps = STEPS.filter((s) => s.group === group);
          const color = GROUP_COLOR[group];

          return (
            <section key={group}>
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color,
                  margin: "0 0 10px 0",
                }}>
                {t(`groups.${group}`)}
              </h3>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}>
                {groupSteps.map((step) => (
                  <StepRow key={step.key} step={step} color={color} t={t} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* External services */}
      <section style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--admin-card-border)" }}>
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--admin-text-muted)",
            margin: "0 0 10px 0",
          }}>
          {t("externalServices.heading")}
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {EXTERNAL_SERVICES.map((svc) => (
            <a
              key={svc.key}
              href={svc.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 999,
                background: "var(--admin-hover-bg)",
                color: "var(--admin-text)",
                border: "1px solid var(--admin-card-border)",
                textDecoration: "none",
              }}>
              <CheckCircle2 size={11} style={{ color: "var(--admin-accent)" }} />
              {t(`externalServices.${svc.key}`)}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function StepRow({
  step,
  color,
  t,
}: {
  step: Step;
  color: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const Icon = step.icon;
  return (
    <li
      style={{
        display: "flex",
        gap: 12,
        padding: "10px 12px",
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-card-border)",
        borderRadius: 10,
        borderLeft: `3px solid ${color}`,
      }}>
      <span
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 8,
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          color,
          paddingTop: 4,
        }}>
        <Icon size={15} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--admin-text)",
          }}>
          {t(`steps.${step.key}.label`)}
        </p>
        <p
          style={{
            margin: "2px 0 0 0",
            fontSize: 12,
            color: "var(--admin-text-muted)",
            lineHeight: 1.5,
          }}>
          {t(`steps.${step.key}.description`)}
        </p>
        {step.links && step.links.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--admin-text-faint)" }}>
              {t("linkLabel")}:
            </span>
            {step.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                style={{
                  fontSize: 11,
                  color: "var(--admin-accent)",
                  textDecoration: "none",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}>
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
