"use client";
// app/(admin)/admin/modules/notifications/templates/_components/templates-form.tsx
//
// Form per editare i 4 template achievement email. Una sezione per
// template con subject (input), body (textarea), footer (input).
// Lista placeholders disponibili sotto ogni sezione come hint.
// Stile coerente con notifications/settings (adminFieldStyle).
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { adminFieldStyle } from "@/app/(admin)/admin/_components/admin-dialog";
import { saveAchievementTemplates, type TemplatesSaveResult } from "../actions";

export type TemplatesInitial = {
  firstLikeSubject: string;
  firstLikeBody: string;
  firstLikeFooter: string;
  viralLikesSubject: string;
  viralLikesBody: string;
  viralLikesFooter: string;
  viralCommentsSubject: string;
  viralCommentsBody: string;
  viralCommentsFooter: string;
  viralRepostsSubject: string;
  viralRepostsBody: string;
  viralRepostsFooter: string;
};

type TemplateSpec = {
  id: "firstLike" | "viralLikes" | "viralComments" | "viralReposts";
  titleKey: string;
  helpKey: string;
  keyPrefix:
    | "modules.notifications.email_achievement_first_like"
    | "modules.notifications.email_achievement_viral_likes"
    | "modules.notifications.email_achievement_viral_comments"
    | "modules.notifications.email_achievement_viral_reposts";
  placeholders: string[];
  initialSubjectKey: keyof TemplatesInitial;
  initialBodyKey: keyof TemplatesInitial;
  initialFooterKey: keyof TemplatesInitial;
};

const TEMPLATES: TemplateSpec[] = [
  {
    id: "firstLike",
    titleKey: "first_like_title",
    helpKey: "first_like_help",
    keyPrefix: "modules.notifications.email_achievement_first_like",
    placeholders: ["{{appName}}", "{{userName}}", "{{actorName}}", "{{postUrl}}", "{{postPreview}}"],
    initialSubjectKey: "firstLikeSubject",
    initialBodyKey: "firstLikeBody",
    initialFooterKey: "firstLikeFooter",
  },
  {
    id: "viralLikes",
    titleKey: "viral_likes_title",
    helpKey: "viral_likes_help",
    keyPrefix: "modules.notifications.email_achievement_viral_likes",
    placeholders: ["{{appName}}", "{{userName}}", "{{totalCount}}", "{{postUrl}}", "{{postPreview}}"],
    initialSubjectKey: "viralLikesSubject",
    initialBodyKey: "viralLikesBody",
    initialFooterKey: "viralLikesFooter",
  },
  {
    id: "viralComments",
    titleKey: "viral_comments_title",
    helpKey: "viral_comments_help",
    keyPrefix: "modules.notifications.email_achievement_viral_comments",
    placeholders: ["{{appName}}", "{{userName}}", "{{totalCount}}", "{{postUrl}}", "{{postPreview}}"],
    initialSubjectKey: "viralCommentsSubject",
    initialBodyKey: "viralCommentsBody",
    initialFooterKey: "viralCommentsFooter",
  },
  {
    id: "viralReposts",
    titleKey: "viral_reposts_title",
    helpKey: "viral_reposts_help",
    keyPrefix: "modules.notifications.email_achievement_viral_reposts",
    placeholders: ["{{appName}}", "{{userName}}", "{{totalCount}}", "{{postUrl}}", "{{postPreview}}"],
    initialSubjectKey: "viralRepostsSubject",
    initialBodyKey: "viralRepostsBody",
    initialFooterKey: "viralRepostsFooter",
  },
];

export function TemplatesForm({ initial }: { initial: TemplatesInitial }) {
  const t = useTranslations("notifications.admin.templates");
  const [state, formAction, pending] = useActionState<
    TemplatesSaveResult | null,
    FormData
  >(saveAchievementTemplates, null);

  return (
    <form action={formAction} className="space-y-5 max-w-3xl">
      <p className="text-sm text-[var(--admin-text-muted)]">
        {t("intro")}
      </p>

      {TEMPLATES.map((tpl) => (
        <section
          key={tpl.id}
          className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 space-y-3"
        >
          <header>
            <h2 className="text-base font-semibold text-[var(--admin-text)]">
              {t(tpl.titleKey)}
            </h2>
            <p className="text-sm text-[var(--admin-text-muted)] mt-0.5">
              {t(tpl.helpKey)}
            </p>
          </header>

          <label className="block">
            <span className="block text-sm font-medium text-[var(--admin-text)] mb-1">
              {t("subject_label")}
            </span>
            <input
              type="text"
              name={`${tpl.keyPrefix}_subject`}
              defaultValue={initial[tpl.initialSubjectKey]}
              placeholder={t("subject_placeholder")}
              style={adminFieldStyle}
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-[var(--admin-text)] mb-1">
              {t("body_label")}
            </span>
            <textarea
              name={`${tpl.keyPrefix}_body`}
              defaultValue={initial[tpl.initialBodyKey]}
              placeholder={t("body_placeholder")}
              rows={6}
              style={{ ...adminFieldStyle, fontFamily: "inherit" }}
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-[var(--admin-text)] mb-1">
              {t("footer_label")}
            </span>
            <input
              type="text"
              name={`${tpl.keyPrefix}_footer`}
              defaultValue={initial[tpl.initialFooterKey]}
              placeholder={t("footer_placeholder")}
              style={adminFieldStyle}
            />
          </label>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-xs text-[var(--admin-text-faint)] mr-1">
              {t("placeholders_label")}:
            </span>
            {tpl.placeholders.map((p) => (
              <code
                key={p}
                className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
                  color: "var(--admin-accent)",
                  border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
                }}
              >
                {p}
              </code>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-[var(--admin-accent)] text-white text-sm font-medium hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("save")}
        </button>
        {state?.ok ? (
          <span className="text-xs text-emerald-600">{t("saved")}</span>
        ) : null}
        {state?.ok === false ? (
          <span className="text-xs text-rose-600">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
