"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  codes: string[];
  context: "setup" | "regenerate";
  onAcknowledged: () => void;
};

export function MfaRecoveryCodesDisplay({
  codes,
  context,
  onAcknowledged,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const allText = codes.join("\n");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(allText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Browser senza clipboard API: utente userà il download
    }
  }

  function downloadTxt() {
    const blob = new Blob([allText + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gencrypto-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          {context === "setup"
            ? "Salva i tuoi recovery codes"
            : "Nuovi recovery codes"}
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          Ti permettono di accedere se perdi il telefono. Ogni codice si può
          usare una sola volta. Salvali in un posto sicuro: dopo questa schermata
          non potremo più mostrarteli.
        </p>
      </div>

      <div className="rounded-2xl border border-gc-line bg-gc-bg-2 p-5">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[13.5px] text-gc-fg">
          {codes.map((code) => (
            <li key={code} className="tracking-wider">
              {code}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copyAll}>
          {copied ? (
            <>
              <Check className="size-4" /> Copiati
            </>
          ) : (
            <>
              <Copy className="size-4" /> Copia tutti
            </>
          )}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={downloadTxt}>
          <Download className="size-4" /> Scarica .txt
        </Button>
      </div>

      <label className="flex items-start gap-3 mt-2 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 size-4 rounded border-gc-line accent-brand-primary"
        />
        <span className="text-[13px] text-gc-fg-3">
          Ho salvato i recovery codes in un posto sicuro.
        </span>
      </label>

      <Button
        type="button"
        disabled={!acknowledged}
        onClick={onAcknowledged}
      >
        Continua
      </Button>
    </section>
  );
}
