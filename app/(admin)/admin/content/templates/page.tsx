import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { isTemplateSlugRegistered } from "@/app/(frontend)/_templates/registered-slugs";
import { getAdminPath } from "@/lib/admin-paths";
import { getAllTemplatesWithPageCount } from "@/lib/db/template-queries";
import { AlertTriangle, Copy, PanelTop, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import DeleteTemplateButton from "./_components/delete-template-button";
import { duplicateTemplateAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.content.templates");
  return { title: t("metaTitle") };
}
export const dynamic = "force-dynamic";

export default async function TemplatePage() {
  const t = await getTranslations("admin.content.templates");
  const templates = await getAllTemplatesWithPageCount();
  const templatesBase = await getAdminPath("content-templates");

  return (
    <div className="">
      <AdminSectionHeader
        icon={PanelTop}
        breadcrumbLabel={t("breadcrumbContent")}
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
        actionSlot={
          <Link
            href={`${templatesBase}/new`}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "var(--admin-accent)" }}>
            <Plus size={16} />
            <span className="hidden sm:inline">{t("newButtonFull")}</span>
            <span className="sm:hidden">{t("newButtonShort")}</span>
          </Link>
        }
      />

      {templates.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-border)",
          }}>
          <PanelTop
            size={40}
            style={{ color: "var(--admin-text-faint)" }}
            className="mb-4"
          />
          <p className="font-semibold" style={{ color: "var(--admin-text)" }}>
            {t("emptyTitle")}
          </p>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("emptySubtitle")}
          </p>
          <Link
            href={`${templatesBase}/new`}
            className="mt-6 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "var(--admin-accent)" }}>
            {t("emptyCreateButton")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="rounded-xl overflow-hidden"
              style={{
                background: "var(--admin-card-bg)",
                border: "1px solid var(--admin-border)",
              }}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className="font-semibold text-sm truncate"
                      style={{ color: "var(--admin-text)" }}>
                      {tpl.name}
                      {tpl.isSystem && (
                        <span
                          className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            background: "var(--admin-accent-light)",
                            color: "var(--admin-accent)",
                          }}>
                          {t("cardSystemBadge")}
                        </span>
                      )}
                      {!isTemplateSlugRegistered(tpl.slug) && (
                        <span
                          title={t("cardFallbackTooltip")}
                          className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            background:
                              "color-mix(in srgb, #f59e0b 14%, transparent)",
                            color: "#b45309",
                          }}>
                          <AlertTriangle size={10} />
                          {t("cardFallbackBadge")}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p
                        className="text-xs"
                        style={{ color: "var(--admin-text-muted)" }}>
                        {t("cardFieldsCount", { count: tpl.fields.length })}
                      </p>
                      {tpl.pageCount > 0 && (
                        <>
                          <span
                            style={{
                              color: "var(--admin-text-faint)",
                              fontSize: "10px",
                            }}>
                            ·
                          </span>
                          <p
                            className="text-xs"
                            style={{ color: "var(--admin-text-muted)" }}>
                            {t("cardPagesCount", { count: tpl.pageCount })}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {tpl.description && (
                  <p
                    className="text-xs mt-2 line-clamp-2"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {tpl.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-4">
                  <Link
                    href={`${templatesBase}/${tpl.id}`}
                    className="flex-1 text-center text-xs font-medium py-1.5 rounded-lg transition-colors"
                    style={{
                      background: "var(--admin-input-bg)",
                      color: "var(--admin-text)",
                      border: "1px solid var(--admin-input-border)",
                    }}>
                    {t("cardEditButton")}
                  </Link>

                  <form action={duplicateTemplateAction}>
                    <input type="hidden" name="id" value={tpl.id} />
                    <button
                      type="submit"
                      title={t("cardDuplicateTooltip")}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{
                        color: "var(--admin-text-muted)",
                        border: "1px solid var(--admin-border)",
                      }}>
                      <Copy size={14} />
                    </button>
                  </form>

                  {!tpl.isSystem && (
                    <DeleteTemplateButton
                      id={tpl.id}
                      name={tpl.name}
                      pageCount={tpl.pageCount}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
