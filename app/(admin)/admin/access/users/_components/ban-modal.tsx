"use client";

import { ShieldBan, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { banUser } from "../actions";

interface BanModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

export default function BanModal({ userId, userName, onClose }: BanModalProps) {
  const t = useTranslations("admin.access.users.banModal");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await banUser(userId, reason.trim() || undefined);
      onClose();
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <ShieldBan size={20} className="text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                {t("title")}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">{userName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">
              {t("reasonLabel")}{" "}
              <span className="text-gray-400 font-normal">{t("reasonOptional")}</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              rows={3}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
            />
          </label>

          <p className="text-xs text-gray-400">{t("info")}</p>
        </div>

        {/* Footer */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
            {t("cancelButton")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={pending}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {pending ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <ShieldBan size={14} /> {t("confirmButton")}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
