"use client";

import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Code2,
  Info,
  Layers,
  ShieldCheck,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={14} style={{ color: "var(--admin-accent)" }} />
      <span
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--admin-text-muted)" }}>
        {children}
      </span>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
        style={{ background: "var(--admin-accent)" }}>
        {n}
      </span>
      <span
        className="text-sm leading-relaxed"
        style={{ color: "var(--admin-text-muted)" }}>
        {children}
      </span>
    </li>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="inline-block px-1.5 py-0.5 rounded text-[11px] font-mono"
      style={{
        background: "var(--admin-hover-bg)",
        color: "var(--admin-text)",
        border: "1px solid var(--admin-card-border)",
      }}>
      {children}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function PermissionsInfoCard() {
  const t = useTranslations("admin.access.permissions.info");
  const [open, setOpen] = useState(false);

  const richTags = {
    strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
    c: (chunks: React.ReactNode) => <Pill>{chunks}</Pill>,
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid var(--admin-card-border)",
        background: "var(--admin-card-bg)",
      }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
        style={{
          background: open ? "var(--admin-hover-bg)" : "transparent",
        }}>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background:
              "color-mix(in oklch, var(--admin-accent) 12%, transparent)",
          }}>
          <Info size={14} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div className="flex-1">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--admin-text)" }}>
            {t("triggerTitle")}
          </span>
          <span
            className="block text-xs"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("triggerSubtitle")}
          </span>
        </div>
        <ChevronDown
          size={16}
          className="shrink-0 transition-transform duration-200"
          style={{
            color: "var(--admin-text-faint)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Collapsible Content */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: open ? "1200px" : "0px", opacity: open ? 1 : 0 }}>
        <div
          className="px-5 pb-5 pt-1 grid gap-5"
          style={{ borderTop: "1px solid var(--admin-card-border)" }}>
          {/* How it works */}
          <div className="pt-4">
            <SectionTitle icon={BookOpen}>{t("howItWorksHeading")}</SectionTitle>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("howItWorksIntro")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                {
                  icon: Layers,
                  title: t("layerPermissionsTitle"),
                  desc: t("layerPermissionsDesc"),
                },
                {
                  icon: ShieldCheck,
                  title: t("layerRolesTitle"),
                  desc: t("layerRolesDesc"),
                },
                {
                  icon: User,
                  title: t("layerOverridesTitle"),
                  desc: t("layerOverridesDesc"),
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-lg p-3"
                  style={{
                    background: "var(--admin-hover-bg)",
                    border: "1px solid var(--admin-card-border)",
                  }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon size={13} style={{ color: "var(--admin-accent)" }} />
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "var(--admin-text)" }}>
                      {title}
                    </span>
                  </div>
                  <p
                    className="text-[12px] leading-relaxed"
                    style={{ color: "var(--admin-text-faint)" }}>
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Setup */}
          <div>
            <SectionTitle icon={CheckCircle2}>{t("setupHeading")}</SectionTitle>
            <ol className="space-y-2.5">
              <Step n={1}>{t.rich("setupStep1", richTags)}</Step>
              <Step n={2}>{t.rich("setupStep2", richTags)}</Step>
              <Step n={3}>{t.rich("setupStep3", richTags)}</Step>
              <Step n={4}>{t.rich("setupStep4", richTags)}</Step>
            </ol>
          </div>

          {/* Key Conventions */}
          <div>
            <SectionTitle icon={Layers}>{t("conventionsHeading")}</SectionTitle>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {[
                { key: "admin:access", desc: t("conv_admin_access") },
                { key: "users:view", desc: t("conv_users_view") },
                { key: "users:ban", desc: t("conv_users_ban") },
                { key: "users:delete", desc: t("conv_users_delete") },
                { key: "posts:create", desc: t("conv_posts_create") },
                { key: "posts:publish", desc: t("conv_posts_publish") },
                { key: "posts:delete", desc: t("conv_posts_delete") },
                { key: "comments:delete", desc: t("conv_comments_delete") },
              ].map(({ key, desc }) => (
                <div key={key} className="flex items-center gap-2">
                  <Pill>{key}</Pill>
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--admin-text-faint)" }}>
                    {desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Code Example */}
          <div>
            <SectionTitle icon={Code2}>{t("codeHeading")}</SectionTitle>
            <div
              className="rounded-lg overflow-x-auto"
              style={{
                background: "var(--admin-hover-bg)",
                border: "1px solid var(--admin-card-border)",
              }}>
              <pre
                className="text-[12px] leading-relaxed p-4 font-mono"
                style={{ color: "var(--admin-text-muted)" }}>
                {`// In a Server Component or Server Action
import { can } from "@/lib/rbac/can";
import { getSession } from "@/lib/auth/session";

export default async function PublishButton() {
  const session = await getSession();

  // Check if the user has permission
  const allowed = await can(session.user.id, "posts:publish");

  if (!allowed) {
    return <p>You do not have permission to publish.</p>;
  }

  return <button>Publish</button>;
}

// Or in a Server Action
export async function publishPost(postId: number) {
  const session = await getSession();
  const allowed = await can(session.user.id, "posts:publish");
  if (!allowed) throw new Error("Unauthorized");

  // ... publishing logic
}`}
              </pre>
            </div>
            <p
              className="text-[12px] mt-2"
              style={{ color: "var(--admin-text-faint)" }}>
              {t.rich("codeFootnote", richTags)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
