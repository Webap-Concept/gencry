"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { uploadToR2WithProgress } from "@/lib/client/media-r2-upload";
import { saveCoinIconUrl } from "../actions";

interface CoinIconFormProps {
  /** URL pubblico corrente dell'icona GCC (con eventuale ?v=...), o null. */
  initialIconUrl: string | null;
}

export function CoinIconForm({ initialIconUrl }: CoinIconFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [iconFile, setIconFile]       = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(initialIconUrl);
  const [progress, setProgress]       = useState<number | null>(null);
  const [status, setStatus]           = useState<{ type: "success" | "error"; msg: string } | null>(null);

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
    setStatus(null);
  }

  function handleSave() {
    if (!iconFile) return;
    setStatus(null);
    startTransition(async () => {
      setProgress(0);
      try {
        const res = await fetch("/api/admin/rewards/coin-icon", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ mimeType: iconFile.type }),
        });
        const ticket = await res.json();
        if (!res.ok || ticket.error) throw new Error(ticket.error ?? "Errore ticket upload");
        await uploadToR2WithProgress(iconFile, ticket, { onProgress: setProgress });
        setProgress(100);
        const saved = await saveCoinIconUrl(ticket.publicUrl as string);
        if (!saved.ok) throw new Error(saved.error);
        setIconFile(null);
        setStatus({ type: "success", msg: "Icona GCC salvata." });
        router.refresh();
      } catch (err) {
        setStatus({ type: "error", msg: err instanceof Error ? err.message : "Upload fallito" });
      } finally {
        setProgress(null);
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const saved = await saveCoinIconUrl(null);
      if (saved.ok) {
        setIconFile(null);
        setIconPreview(null);
        setStatus({ type: "success", msg: "Icona rimossa: verrà usata l'icona di default." });
        router.refresh();
      } else {
        setStatus({ type: "error", msg: saved.error });
      }
    });
  }

  return (
    <div
      className="rounded-lg p-5 space-y-4"
      style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
    >
      <div>
        <h2 className="text-base font-semibold" style={{ color: "var(--admin-text)" }}>
          Icona GCC
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          Immagine che rappresenta il Generazione Crypto Coin. Mostrata nella pagina
          <em> MyCoins</em> al posto dell&apos;icona di default. Caricata nel bucket R2 del modulo
          (richiede R2 configurato qui sotto). PNG, JPEG, WebP o SVG.
        </p>
      </div>

      <div className="flex items-center gap-4">
        {/* Preview su sfondo scuro = come appare nell'hero MyCoins */}
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
          style={{ background: "#0e2318" }}
        >
          {iconPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconPreview} alt="Icona GCC" className="w-10 h-10 object-contain" />
          ) : (
            <span className="text-orange-400 text-xs font-bold tracking-wide">GCC</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleSelect}
            className="text-xs"
            style={{ color: "var(--admin-text-muted)" }}
          />
          {progress !== null && progress < 100 && (
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--admin-page-bg)" }}>
              <div className="h-full bg-orange-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>

      {status && (
        <p className="text-sm" style={{ color: status.type === "success" ? "var(--admin-success-text, #15803d)" : "var(--admin-danger)" }}>
          {status.msg}
        </p>
      )}

      <div className="flex gap-3">
        <AdminButton variant="primary" size="sm" loading={pending} disabled={!iconFile} onClick={handleSave}>
          Salva icona
        </AdminButton>
        {initialIconUrl && (
          <AdminButton variant="secondary" size="sm" disabled={pending} onClick={handleRemove}>
            Rimuovi
          </AdminButton>
        )}
      </div>
    </div>
  );
}
