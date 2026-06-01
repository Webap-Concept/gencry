"use client";
import { useState, useTransition } from "react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { saveRewardsR2Settings, testRewardsR2Connection } from "../actions";

interface R2FormProps {
  initialValues: {
    accessKeyId:     string;
    secretAccessKey: string;
    bucket:          string;
    publicBaseUrl:   string;
  };
}

export function RewardsR2Form({ initialValues }: R2FormProps) {
  const [values, setValues]   = useState(initialValues);
  const [status, setStatus]   = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [testing, startTest]  = useTransition();

  function field(key: keyof typeof values) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setStatus(null);
    };
  }

  const inputCls = "w-full rounded-md border px-2.5 py-1.5 text-sm font-mono";
  const inputStyle = { background: "var(--admin-input-bg)", borderColor: "var(--admin-card-border)", color: "var(--admin-text)" };

  return (
    <div
      className="rounded-lg p-5 space-y-4"
      style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
    >
      <div>
        <h2 className="text-base font-semibold" style={{ color: "var(--admin-text)" }}>
          R2 Storage — Rewards
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          Bucket Cloudflare R2 dedicato al modulo rewards: icone badge e asset GCC.
          Account ID globale in <em>Services → Cloudflare</em>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["accessKeyId", "secretAccessKey", "bucket", "publicBaseUrl"] as const).map((key) => (
          <div key={key}>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--admin-text-muted)" }}>
              {key === "accessKeyId"     ? "Access Key ID"     :
               key === "secretAccessKey" ? "Secret Access Key" :
               key === "bucket"          ? "Bucket name"       : "Public base URL"}
            </label>
            <input
              type={key === "secretAccessKey" ? "password" : "text"}
              className={inputCls} style={inputStyle}
              value={values[key]}
              onChange={field(key)}
              placeholder={key === "publicBaseUrl" ? "https://rewards.example.com" : key === "bucket" ? "rewards" : ""}
            />
          </div>
        ))}
      </div>

      {status && (
        <p className="text-sm" style={{ color: status.type === "success" ? "var(--admin-success-text, #15803d)" : "var(--admin-danger)" }}>
          {status.msg}
        </p>
      )}

      <div className="flex gap-3">
        <AdminButton
          variant="primary"
          size="sm"
          loading={pending}
          onClick={() => startTransition(async () => {
            const r = await saveRewardsR2Settings(values);
            setStatus(r.ok ? { type: "success", msg: "Impostazioni salvate." } : { type: "error", msg: r.error });
          })}
        >
          Salva R2
        </AdminButton>
        <AdminButton
          variant="secondary"
          size="sm"
          loading={testing}
          onClick={() => startTest(async () => {
            const r = await testRewardsR2Connection();
            setStatus(r.ok ? { type: "success", msg: (r as { message: string }).message } : { type: "error", msg: (r as { error: string }).error });
          })}
        >
          Test connessione
        </AdminButton>
      </div>
    </div>
  );
}
