"use client";
// app/(admin)/admin/modules/posts/_components/posts-r2-settings-form.tsx
//
// Form di configurazione R2 per il modulo Posts. Le 5 chiavi vivono in
// app_settings (mai ENV — vedi feedback_hookable_services). Il
// secret_access_key NON viene MAI inviato al client; la form usa il
// sentinel "********" come placeholder quando è già set, e la save
// action lo lascia intatto se riceve quel valore.
import { useState, useTransition } from "react";
import {
  savePostsR2Settings,
  testPostsR2Connection,
} from "../actions";
import { AdminToast, type ToastType } from "@/app/(admin)/admin/_components/toast";

type Initial = {
  accountId: string;
  accessKeyId: string;
  bucket: string;
  publicBaseUrl: string;
  r2SecretIsSet: boolean;
};

const SECRET_SENTINEL = "********";

export function PostsR2SettingsForm({ initial }: { initial: Initial }) {
  const [accountId, setAccountId] = useState(initial.accountId);
  const [accessKeyId, setAccessKeyId] = useState(initial.accessKeyId);
  const [secret, setSecret] = useState(
    initial.r2SecretIsSet ? SECRET_SENTINEL : "",
  );
  const [bucket, setBucket] = useState(initial.bucket || "social-media");
  const [publicBaseUrl, setPublicBaseUrl] = useState(initial.publicBaseUrl);

  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(
    null,
  );
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();

  const onSave = () => {
    setToast(null);
    startSaving(async () => {
      const res = await savePostsR2Settings({
        accountId,
        accessKeyId,
        secretAccessKey: secret,
        bucket,
        publicBaseUrl,
      });
      if (res.ok) {
        setToast({ type: "success", message: "Impostazioni salvate." });
        if (secret !== SECRET_SENTINEL && secret.length > 0) {
          // Dopo il save, il secret è ora "set": ritorna al sentinel.
          setSecret(SECRET_SENTINEL);
        }
      } else {
        setToast({ type: "error", message: res.error });
      }
    });
  };

  const onTest = () => {
    setToast(null);
    startTesting(async () => {
      const res = await testPostsR2Connection();
      if (res.ok) {
        setToast({
          type: "success",
          message: "Connessione R2 ok — bucket raggiungibile.",
        });
      } else {
        const map: Record<string, string> = {
          missing_config: "Config incompleta: salva prima le 5 chiavi.",
          forbidden:      "Token R2 non valido o senza permessi sul bucket.",
          not_found:      "Bucket non trovato.",
          network:        "Errore di rete contattando R2.",
          timeout:        "Timeout (10s) contattando R2.",
          unknown:        `Errore sconosciuto${res.detail ? ": " + res.detail : ""}.`,
        };
        setToast({ type: "error", message: map[res.reason] ?? "Errore." });
      }
    });
  };

  return (
    <>
      {toast ? (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    <div className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 space-y-4 max-w-[640px]">
      <header>
        <h2 className="text-lg font-semibold text-[var(--admin-text)]">
          Cloudflare R2 — bucket per le immagini dei post
        </h2>
        <p className="text-sm text-[var(--admin-text-muted)] mt-1">
          Pre-req operativo: crea un bucket Cloudflare (consigliato:{" "}
          <code>social-media</code>), un API token con scope{" "}
          <em>Object Read + Write</em> su quel bucket, e collega un custom
          domain per il public base URL (es. <code>https://social.tuodominio.com</code>).
        </p>
      </header>

      <Field
        label="Account ID Cloudflare"
        value={accountId}
        onChange={setAccountId}
        autoComplete="off"
      />
      <Field
        label="Access Key ID"
        value={accessKeyId}
        onChange={setAccessKeyId}
        autoComplete="off"
      />
      <Field
        label="Secret Access Key"
        value={secret}
        onChange={setSecret}
        type="password"
        autoComplete="new-password"
        placeholder={initial.r2SecretIsSet ? SECRET_SENTINEL : ""}
        hint={
          initial.r2SecretIsSet
            ? "Lascia ******** per non cambiarlo. Scrivi un nuovo valore per sostituirlo."
            : undefined
        }
      />
      <Field
        label="Bucket"
        value={bucket}
        onChange={setBucket}
        autoComplete="off"
      />
      <Field
        label="Public base URL"
        value={publicBaseUrl}
        onChange={setPublicBaseUrl}
        autoComplete="off"
        placeholder="https://social.tuodominio.com"
      />

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="px-4 py-1.5 rounded-md bg-[var(--admin-accent)] text-white text-sm font-medium disabled:opacity-50"
        >
          {isSaving ? "Salvataggio…" : "Salva"}
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={isTesting}
          className="px-4 py-1.5 rounded-md border border-[var(--admin-card-border)] text-sm text-[var(--admin-text)] disabled:opacity-50"
        >
          {isTesting ? "Test in corso…" : "Test connessione"}
        </button>
      </div>
    </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password";
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--admin-text-muted)] block mb-1">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full bg-[var(--admin-input-bg)] border border-[var(--admin-card-border)] rounded-md px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--admin-accent)]"
      />
      {hint ? (
        <span className="text-xs text-[var(--admin-text-faint)] block mt-1">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
