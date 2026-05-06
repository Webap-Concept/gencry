"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { ExternalLink, Info, Loader2, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveRobotsAction, type RobotsActionState } from "../actions";

function buildDefaultRobots(domain: string): string {
  const sitemapDomain = domain || "http://localhost:3000";
  return `User-agent: *
Allow: /

# Blocca l'area admin
Disallow: /admin/

# Sitemap
Sitemap: ${sitemapDomain}/sitemap.xml`;
}

function buildDefaultHumans(domain: string): string {
  const siteDomain = domain || "http://localhost:3000";
  return `/* TEAM */
Chef: Nome Cognome
Site: ${siteDomain}
Location: Italia

/* SITE */
Last update: ${new Date().toISOString().slice(0, 10)}
Language: Italian
Doctype: HTML5
IDE: VS Code`;
}

const labelStyle = {
  fontSize: "0.65rem",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--admin-text-muted)",
};

const hintStyle = {
  fontSize: "0.75rem",
  color: "var(--admin-text-faint)",
};

const textareaStyle = {
  background: "var(--admin-page-bg)",
  border: "1px solid var(--admin-input-border)",
  color: "var(--admin-text)",
  borderRadius: "0.5rem",
  padding: "0.75rem 1rem",
  fontSize: "0.8125rem",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  lineHeight: "1.6",
  width: "100%",
  outline: "none",
  resize: "vertical" as const,
};

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2.5"
      style={{
        background: "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-card-bg))",
        border: "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
      }}>
      <Info size={13} className="mt-0.5 shrink-0" style={{ color: "var(--admin-accent)" }} />
      <p className="text-xs leading-relaxed" style={{ color: "var(--admin-text-muted)" }}>
        {children}
      </p>
    </div>
  );
}

export default function RobotsEditor({
  initialRobots,
  initialHumans,
  domain,
}: {
  initialRobots: string;
  initialHumans: string;
  domain: string;
}) {
  const t = useTranslations("admin.seo.robots");
  const locale = useLocale();
  const numberLocale = locale === "en" ? "en-US" : "it-IT";
  const [state, action, isPending] = useActionState<RobotsActionState, FormData>(
    saveRobotsAction,
    {},
  );
  const [robots, setRobots] = useState(
    initialRobots || buildDefaultRobots(domain),
  );
  const [humans, setHumans] = useState(initialHumans || buildDefaultHumans(domain));
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state) setToast({ message: state.success, type: "success" });
    if ("error" in state) setToast({ message: state.error, type: "error" });
  }, [state]);

  return (
    <>
      <form action={action} className="space-y-6">
        {/* robots.txt */}
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p style={labelStyle}>{t("robotsLabel")}</p>
              <p style={hintStyle}>
                {t("robotsServedAtBefore")}{" "}
                <code className="font-mono">/robots.txt</code>
              </p>
            </div>
            <a
              href="/robots.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
              style={{ color: "var(--admin-accent)" }}>
              {t("viewLiveLink")} <ExternalLink size={11} />
            </a>
          </div>

          <InfoBox>
            {t.rich("robotsInfo", {
              c: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </InfoBox>

          <textarea
            name="robots_txt"
            value={robots}
            onChange={(e) => setRobots(e.target.value)}
            rows={12}
            spellCheck={false}
            style={textareaStyle}
          />
          <p style={hintStyle}>
            {t("charsCount", { count: robots.length.toLocaleString(numberLocale) })}
          </p>
        </div>

        {/* humans.txt */}
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p style={labelStyle}>{t("humansLabel")}</p>
              <p style={hintStyle}>
                {t("humansServedAtBefore")}{" "}
                <code className="font-mono">/humans.txt</code>
              </p>
            </div>
            <a
              href="/humans.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
              style={{ color: "var(--admin-accent)" }}>
              {t("viewLiveLink")} <ExternalLink size={11} />
            </a>
          </div>

          <InfoBox>
            {t.rich("humansInfo", {
              link: (chunks) => (
                <a
                  href="https://humanstxt.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--admin-accent)", textDecoration: "underline" }}>
                  {chunks}
                </a>
              ),
            })}
          </InfoBox>

          <textarea
            name="humans_txt"
            value={humans}
            onChange={(e) => setHumans(e.target.value)}
            rows={10}
            spellCheck={false}
            style={textareaStyle}
          />
          <p style={hintStyle}>
            {t("charsCount", { count: humans.length.toLocaleString(numberLocale) })}
          </p>
        </div>

        {/* Salva */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--admin-accent)" }}
            onMouseEnter={(e) =>
              !isPending &&
              (e.currentTarget.style.background = "var(--admin-accent-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--admin-accent)")
            }>
            {isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {isPending ? t("savingButton") : t("saveButton")}
          </button>
        </div>
      </form>

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
