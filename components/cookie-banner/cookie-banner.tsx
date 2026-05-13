"use client";

import type { BannerServicesByCategory } from "@/lib/db/cookie-services-queries";
import { Cookie, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  acceptAllCookiesAction,
  rejectAllCookiesAction,
} from "./actions";
import { CookieCustomizeModal } from "./customize-modal";

type Props = {
  /** Link alla cookie policy pubblica, derivato dalla system page `cookie`. */
  policyUrl?: string | null;
  /**
   * Servizi `enabled=true` raggruppati per categoria, pre-fetched
   * server-side dal RootLayout (cache 10min, vedi cookie-services-queries).
   * Permette al banner di mostrare la lista tracker sotto ogni categoria
   * senza fare query DB dal client.
   */
  services?: BannerServicesByCategory;
};

export function CookieBanner({ policyUrl, services }: Props) {
  const t = useTranslations("public.cookieBanner");
  const [isPending, startTransition] = useTransition();
  const [showCustomize, setShowCustomize] = useState(false);

  // Le callback sono `async` con `await`: senza, startTransition
  // considera il transition completato sincronicamente e il router
  // resta in stato pending per sempre dopo che la Server Action ritorna,
  // bloccando ogni navigazione successiva (sintomo: tab non cambiano,
  // /admin non si apre fino a hard refresh).
  const handleAcceptAll = () =>
    startTransition(async () => {
      await acceptAllCookiesAction();
    });

  const handleRejectAll = () =>
    startTransition(async () => {
      await rejectAllCookiesAction();
    });

  return (
    <>
      {/* Banner sticky in basso, non bloccante.
          z-30 per stare sotto modali/dropdown ma sopra il contenuto. */}
      <div
        role="region"
        aria-label={t("ariaLabel")}
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-4 sm:pb-4 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-5xl rounded-2xl shadow-2xl bg-gc-modal-bg border border-gc-modal-border">
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gc-warning-bg text-gc-warning-fg"
                aria-hidden>
                <Cookie size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gc-fg">
                  {t("title")}
                </p>
                <p className="text-xs sm:text-sm mt-0.5 text-gc-fg-2">
                  {t("description")}
                  {policyUrl && (
                    <>
                      {" "}
                      <a
                        href={policyUrl}
                        className="underline text-gc-warning-fg">
                        {t("moreInfo")}
                      </a>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCustomize(true)}
                disabled={isPending}>
                <Settings2 size={14} />
                {t("customize")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRejectAll}
                disabled={isPending}>
                {t("rejectAll")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAcceptAll}
                disabled={isPending}>
                {t("acceptAll")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showCustomize && (
        <CookieCustomizeModal
          policyUrl={policyUrl}
          services={services}
          onClose={() => setShowCustomize(false)}
        />
      )}
    </>
  );
}
