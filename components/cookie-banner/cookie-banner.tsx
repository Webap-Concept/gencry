"use client";

import { Cookie, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  acceptAllCookiesAction,
  rejectAllCookiesAction,
} from "./actions";
import { CookieCustomizeModal } from "./customize-modal";

type Props = {
  /** Link alla cookie policy pubblica, derivato dalla system page `cookie`. */
  policyUrl?: string | null;
};

export function CookieBanner({ policyUrl }: Props) {
  const t = useTranslations("public.cookieBanner");
  const [isPending, startTransition] = useTransition();
  const [showCustomize, setShowCustomize] = useState(false);

  const handleAcceptAll = () =>
    startTransition(() => {
      acceptAllCookiesAction();
    });

  const handleRejectAll = () =>
    startTransition(() => {
      rejectAllCookiesAction();
    });

  return (
    <>
      {/* Banner sticky in basso, non bloccante.
          z-30 per stare sotto modali/dropdown ma sopra il contenuto. */}
      <div
        role="region"
        aria-label={t("ariaLabel")}
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-4 sm:pb-4 pointer-events-none">
        <div
          className="pointer-events-auto mx-auto max-w-5xl rounded-2xl shadow-2xl"
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 40px -10px rgba(0,0,0,0.25)",
          }}>
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "#fef3c7", color: "#b45309" }}
                aria-hidden>
                <Cookie size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                  {t("title")}
                </p>
                <p className="text-xs sm:text-sm mt-0.5" style={{ color: "#4b5563" }}>
                  {t("description")}
                  {policyUrl && (
                    <>
                      {" "}
                      <a
                        href={policyUrl}
                        className="underline"
                        style={{ color: "#b45309" }}>
                        {t("moreInfo")}
                      </a>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowCustomize(true)}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: "#f3f4f6", color: "#374151" }}>
                <Settings2 size={14} />
                {t("customize")}
              </button>
              <button
                type="button"
                onClick={handleRejectAll}
                disabled={isPending}
                className="text-xs sm:text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: "#f3f4f6", color: "#374151" }}>
                {t("rejectAll")}
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                disabled={isPending}
                className="text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ background: "#b45309" }}>
                {t("acceptAll")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCustomize && (
        <CookieCustomizeModal
          policyUrl={policyUrl}
          onClose={() => setShowCustomize(false)}
        />
      )}
    </>
  );
}
