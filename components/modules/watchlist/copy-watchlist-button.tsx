"use client";
// components/modules/watchlist/copy-watchlist-button.tsx
//
// Bottone "Copia" sulla vista pubblica /w/<u>/<slug>. Duplica la
// watchlist nelle proprie (snapshot) via copyWatchlistAction.
//
//   - Anon → il bottone e' un Link a /sign-in (niente azione gated lato
//     client).
//   - Loggato → apre GcModal di conferma; on success router.push alla
//     nuova watchlist (gratificazione immediata, l'utente la vede subito
//     editabile).
//
// Errore cap_reached → messaggio nella modale, niente redirect.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GcModal,
  GcModalContent,
  GcModalClose,
} from "@/components/ui/gc-modal";
import { copyWatchlistAction } from "@/lib/modules/watchlist/actions";

type Props = {
  sourceId: string;
  /** Name della watchlist source, mostrato nel titolo della modale. */
  sourceName: string;
  /** Coin count della source, per il copy "con N coin". */
  sourceCoinsCount: number;
  isLoggedIn: boolean;
};

export function CopyWatchlistButton({
  sourceId,
  sourceName,
  sourceCoinsCount,
  isLoggedIn,
}: Props) {
  const t = useTranslations("watchlist.copy");
  const tErr = useTranslations("watchlist.errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Anon: link diretto a sign-in. Il `next` riporta qui dopo login.
  if (!isLoggedIn) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/sign-in" prefetch={false}>
          <Copy size={14} aria-hidden />
          {t("signin_to_copy")}
        </Link>
      </Button>
    );
  }

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await copyWatchlistAction(sourceId);
      if (!res.ok) {
        setError(formatErr(res, tErr));
        return;
      }
      setOpen(false);
      router.push(`/watchlist/${res.id}`);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={t("button_aria")}
      >
        <Copy size={14} aria-hidden />
        {t("button")}
      </Button>

      <GcModal open={open} onOpenChange={setOpen}>
        <GcModalContent
          icon={Copy}
          title={t("modal_title", { name: sourceName })}
          description={t("modal_description", { count: sourceCoinsCount })}
          size="sm"
          footer={
            <>
              <GcModalClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                >
                  {t("cancel")}
                </Button>
              </GcModalClose>
              <Button
                type="button"
                size="sm"
                onClick={onConfirm}
                disabled={isPending}
              >
                {t("confirm")}
              </Button>
            </>
          }
        >
          {error ? (
            <p className="text-xs text-gc-danger" role="alert">
              {error}
            </p>
          ) : null}
        </GcModalContent>
      </GcModal>
    </>
  );
}

function formatErr(
  res: { error: string; cap?: number; retryAfter?: number },
  tErr: ReturnType<typeof useTranslations<"watchlist.errors">>,
): string {
  if (res.error === "cap_reached") {
    return tErr("watchlist_cap_reached", { cap: res.cap ?? 5 });
  }
  if (res.error === "rate_limited") {
    return tErr("rate_limited", { seconds: res.retryAfter ?? 60 });
  }
  try {
    return tErr(
      res.error as "not_found" | "forbidden" | "validation" | "generic",
    );
  } catch {
    return tErr("generic");
  }
}
