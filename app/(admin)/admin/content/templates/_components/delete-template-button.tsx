"use client";

import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteTemplateAction } from "../actions";

interface Props {
  id: number;
  name: string;
  pageCount: number;
}

export default function DeleteTemplateButton({ id, name, pageCount }: Props) {
  const t = useTranslations("admin.content.templates.delete");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", String(id));
      await deleteTemplateAction(fd);
      setOpen(false);
    });
  }

  const inUse = pageCount > 0;

  const strongStyle = { color: "var(--admin-text)" };

  const message = inUse ? (
    <>
      {t("bodyInUseBefore")}{" "}
      <strong style={strongStyle}>&quot;{name}&quot;</strong>{" "}
      {t("bodyInUseMiddle")}{" "}
      <strong style={strongStyle}>
        {t("pageCountInline", { count: pageCount })}
      </strong>
      .
      <br />
      <br />
      {t("bodyInUseAfter")}
    </>
  ) : (
    <>
      {t("bodyCleanBefore")}{" "}
      <strong style={strongStyle}>&quot;{name}&quot;</strong>
      {t("bodyCleanAfter")}
    </>
  );

  return (
    <>
      <button
        type="button"
        title={t("buttonTooltip")}
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg transition-colors"
        style={{
          color: "var(--admin-error, #dc2626)",
          border: "1px solid var(--admin-border)",
        }}>
        <Trash2 size={14} />
      </button>

      <ConfirmModal
        open={open}
        title={inUse ? t("titleInUse") : t("titleClean")}
        message={message}
        confirmLabel={t("confirmLabel")}
        cancelLabel={t("cancelLabel")}
        variant={inUse ? "warning" : "danger"}
        loading={isPending}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
