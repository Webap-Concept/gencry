/**
 * Visual marker for GDPR settings: required vs recommended vs optional vs
 * unused. Helps the operator distinguish what is mandated by the regulation
 * (or by the implementation) from what is just additional protection.
 *
 * Mapping is documented in GdprLegendGuide (the modal opened from the page
 * header). Keep that doc in sync if you add a level here.
 */

"use client";

import { useTranslations } from "next-intl";

export type RequirementLevel = "required" | "recommended" | "optional" | "unused";

const STYLES: Record<RequirementLevel, { bg: string; fg: string }> = {
  required: { bg: "bg-red-100", fg: "text-red-700" },
  recommended: { bg: "bg-amber-100", fg: "text-amber-800" },
  optional: { bg: "bg-slate-200", fg: "text-slate-700" },
  unused: { bg: "bg-slate-100", fg: "text-slate-500" },
};

export function RequirementBadge({ level }: { level: RequirementLevel }) {
  const t = useTranslations("admin.compliance.gdpr.requirementBadge");
  const s = STYLES[level];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${s.bg} ${s.fg}`}
      style={
        level === "unused" ? { textDecoration: "line-through" } : undefined
      }
      title={t(`${level}Tooltip` as const)}>
      {t(level)}
    </span>
  );
}
