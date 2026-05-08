"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { ackPendingRecoveryCodesAction } from "@/app/(protected)/settings/security/actions";

type Props = {
  codes: string[];
  context: "setup" | "regenerate";
};

// Renderizzato dalla page /admin/security/mfa-enroll/codes. La conferma
// di archiviazione passa da una server action condivisa
// (`ackPendingRecoveryCodesAction`) che cancella il cookie e redirige
// nel posto giusto in base al campo nascosto `context`.
export function AdminMfaRecoveryCodesDisplay({ codes, context }: Props) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const allText = codes.join("\n");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(allText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Browser senza clipboard API: l'utente userà il download
    }
  }

  function downloadTxt() {
    const blob = new Blob([allText + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admin-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className="rounded-xl p-5 space-y-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div>
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}>
          {context === "setup"
            ? "Salva i tuoi recovery codes"
            : "Nuovi recovery codes"}
        </h2>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--admin-text-muted)" }}>
          Permettono di accedere se perdi il telefono. Ogni codice si può usare
          una sola volta. Salvali in un posto sicuro: dopo questa schermata non
          potremo più mostrarteli.
        </p>
      </div>

      <div
        className="rounded-lg p-4"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <ul
          className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm tracking-wider"
          style={{ color: "var(--admin-text)" }}>
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium"
          style={{
            background: "var(--admin-input-bg)",
            border: "1px solid var(--admin-input-border)",
            color: "var(--admin-text)",
          }}>
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" /> Copiati
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copia tutti
            </>
          )}
        </button>
        <button
          type="button"
          onClick={downloadTxt}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium"
          style={{
            background: "var(--admin-input-bg)",
            border: "1px solid var(--admin-input-border)",
            color: "var(--admin-text)",
          }}>
          <Download className="w-3.5 h-3.5" /> Scarica .txt
        </button>
      </div>

      <form action={ackPendingRecoveryCodesAction} className="space-y-4">
        <input type="hidden" name="context" value="admin" />
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4"
            style={{ accentColor: "var(--admin-accent)" }}
          />
          <span className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
            Ho salvato i recovery codes in un posto sicuro.
          </span>
        </label>

        <button
          type="submit"
          disabled={!acknowledged}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--admin-accent)" }}>
          Continua
        </button>
      </form>
    </section>
  );
}
