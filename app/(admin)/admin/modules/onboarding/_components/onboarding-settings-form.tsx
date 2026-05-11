"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Save } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveOnboardingSettingsAction, type ActionState } from "../actions";

export function OnboardingSettingsForm({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveOnboardingSettingsAction,
    {},
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const lastTs = useRef<number>(0);
  const [enabled, setEnabled] = useState(initialEnabled);

  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state && state.success)
      setToast({ message: state.success, type: "success" });
    if ("error" in state && state.error)
      setToast({ message: state.error, type: "error" });
  }, [state]);

  return (
    <>
      <form action={formAction} className="space-y-5">
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "var(--admin-text)" }}>
            Wizard
          </h3>
          <div className="max-w-lg">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}>
              Require onboarding wizard
            </p>
            <p
              className="text-[11px] mt-1 mb-3"
              style={{ color: "var(--admin-text-faint)" }}>
              When enabled, new users are redirected to <code>/onboarding</code>{" "}
              right after signup. Disable to skip the wizard entirely (the gate
              auto-completes the profile, generating an OAuth username from the
              email if missing).
            </p>
            <input
              type="hidden"
              name="modules.onboarding.enabled"
              value={enabled ? "true" : "false"}
            />
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
                enabled ? "bg-green-500" : "bg-gray-200"
              }`}>
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "var(--admin-accent)" }}>
          {isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          {isPending ? "Saving..." : "Save"}
        </button>
      </form>
      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
