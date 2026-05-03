/**
 * Visual marker for GDPR settings: required vs recommended vs optional vs
 * unused. Helps the operator distinguish what is mandated by the regulation
 * (or by the implementation) from what is just additional protection.
 *
 * Mapping is documented in GdprLegendGuide (the modal opened from the page
 * header). Keep that doc in sync if you add a level here.
 */

export type RequirementLevel = "required" | "recommended" | "optional" | "unused";

const STYLES: Record<
  RequirementLevel,
  { bg: string; fg: string; label: string; tooltip: string }
> = {
  required: {
    label: "Required",
    bg: "bg-red-100",
    fg: "text-red-700",
    tooltip:
      "Mandatory for GDPR compliance — turning this off (or changing it) puts you in a breach posture. See the legend (i icon next to the page title) for the article reference.",
  },
  recommended: {
    label: "Recommended",
    bg: "bg-amber-100",
    fg: "text-amber-800",
    tooltip:
      "Strong best practice (EDPB / Garante guidance). Not strictly required but highly advised; deviating means you should be able to explain why.",
  },
  optional: {
    label: "Optional",
    bg: "bg-slate-200",
    fg: "text-slate-700",
    tooltip:
      "Operational preference — does not affect GDPR compliance either way.",
  },
  unused: {
    label: "Unused",
    bg: "bg-slate-100",
    fg: "text-slate-500",
    tooltip:
      "Persisted for backward compatibility but no consumer reads it in the current code path. Safe to ignore.",
  },
};

export function RequirementBadge({ level }: { level: RequirementLevel }) {
  const s = STYLES[level];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${s.bg} ${s.fg}`}
      style={
        level === "unused" ? { textDecoration: "line-through" } : undefined
      }
      title={s.tooltip}>
      {s.label}
    </span>
  );
}
