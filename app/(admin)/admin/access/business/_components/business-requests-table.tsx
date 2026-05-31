"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ExternalLink, X } from "lucide-react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { PendingBusinessRequest } from "@/lib/account/business-profile";
import {
  approveBusinessRequestAction,
  rejectBusinessRequestAction,
} from "../actions";

export function BusinessRequestsTable({
  requests,
}: {
  requests: PendingBusinessRequest[];
}) {
  const t = useTranslations("admin.access.business");
  const tSectors = useTranslations("core.settings.business.sectors");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [confirmId, setConfirmId] = useState<string | null>(null); // approve
  const [rejectId, setRejectId] = useState<string | null>(null); // reject expanded
  const [rejectNote, setRejectNote] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const sectorLabel = (s: string) => {
    try {
      return tSectors(s as never);
    } catch {
      return s;
    }
  };

  const doApprove = (id: string) => {
    startTransition(async () => {
      const r = await approveBusinessRequestAction(id);
      setConfirmId(null);
      if (r.ok) {
        setToast({ message: t("approvedToast"), type: "success" });
        router.refresh();
      } else {
        setToast({ message: t(`errors.${r.error}`), type: "error" });
      }
    });
  };

  const doReject = (id: string) => {
    startTransition(async () => {
      const r = await rejectBusinessRequestAction(id, rejectNote.trim() || null);
      if (r.ok) {
        setRejectId(null);
        setRejectNote("");
        setToast({ message: t("rejectedToast"), type: "success" });
        router.refresh();
      } else {
        setToast({ message: t(`errors.${r.error}`), type: "error" });
      }
    });
  };

  if (requests.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-10 text-center text-sm"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          color: "var(--admin-text-muted)",
        }}
      >
        {t("emptyState")}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--admin-divider)",
              color: "var(--admin-text-faint)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <th className="text-left px-4 py-2.5 font-medium">{t("colCompany")}</th>
            <th className="text-left px-4 py-2.5 font-medium">{t("colSector")}</th>
            <th className="text-left px-4 py-2.5 font-medium">{t("colVat")}</th>
            <th className="text-left px-4 py-2.5 font-medium">{t("colUser")}</th>
            <th className="text-right px-4 py-2.5 font-medium">{t("colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <Fragment key={req.id}>
              <tr style={{ borderBottom: "1px solid var(--admin-divider)" }}>
                <td className="px-4 py-3" style={{ color: "var(--admin-text)" }}>
                  <div className="font-medium">{req.companyName}</div>
                  <a
                    href={req.companyWebsite}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-xs mt-0.5"
                    style={{ color: "var(--admin-accent)" }}
                  >
                    {req.companyWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    <ExternalLink size={11} />
                  </a>
                  {req.note && (
                    <div className="text-xs mt-1" style={{ color: "var(--admin-text-faint)" }}>
                      {req.note}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--admin-text-muted)" }}>
                  {sectorLabel(req.companySector)}
                </td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--admin-text-muted)" }}>
                  {req.vatNumber}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--admin-text-muted)" }}>
                  {req.username ? `@${req.username}` : "—"}
                  <div className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    {req.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <AdminButton
                      variant="primary"
                      size="sm"
                      icon={Check}
                      disabled={isPending}
                      onClick={() => setConfirmId(req.id)}
                    >
                      {t("approve")}
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      icon={X}
                      disabled={isPending}
                      onClick={() => {
                        setRejectId(rejectId === req.id ? null : req.id);
                        setRejectNote("");
                      }}
                    >
                      {t("reject")}
                    </AdminButton>
                  </div>
                </td>
              </tr>

              {rejectId === req.id && (
                <tr style={{ borderBottom: "1px solid var(--admin-divider)" }}>
                  <td colSpan={5} className="px-4 py-3" style={{ background: "var(--admin-page-bg)" }}>
                    <label
                      className="block text-xs mb-1.5"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      {t("rejectReasonLabel")}
                    </label>
                    <textarea
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder={t("rejectReasonPlaceholder")}
                      className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                      style={{
                        background: "var(--admin-card-bg)",
                        border: "1px solid var(--admin-input-border)",
                        color: "var(--admin-text)",
                      }}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <AdminButton
                        variant="destructive"
                        size="sm"
                        loading={isPending}
                        onClick={() => doReject(req.id)}
                      >
                        {t("confirmReject")}
                      </AdminButton>
                      <AdminButton
                        variant="secondary"
                        size="sm"
                        disabled={isPending}
                        onClick={() => {
                          setRejectId(null);
                          setRejectNote("");
                        }}
                      >
                        {t("cancel")}
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      <ConfirmModal
        open={confirmId !== null}
        title={t("approveConfirmTitle")}
        message={t("approveConfirmMessage")}
        variant="info"
        confirmLabel={t("approve")}
        cancelLabel={t("cancel")}
        loading={isPending}
        onConfirm={() => confirmId && doApprove(confirmId)}
        onCancel={() => setConfirmId(null)}
      />

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
