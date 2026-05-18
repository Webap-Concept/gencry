"use client";
// app/(admin)/admin/modules/posts/reports/_components/strike-toggle.tsx
//
// Pannello reusabile per opzionalmente emettere uno strike all'autore
// di un contenuto (post o commento) contestualmente all'accettazione
// di una segnalazione. Wireup in entrambi i ReviewDialog (post +
// comment). L'effetto è server-side: il toggle on + decision='actioned'
// → la Server Action chiama lib/auth/strikes.issueStrike.
//
// Importante: il toggle è sempre visibile nei dialogs, ma il caller
// passa `issueStrike: decision === 'actioned' && checked` alla
// Server Action così su "Respingi" il toggle viene ignorato.

export function StrikeToggle({
  authorLabel,
  checked,
  onCheckedChange,
  reason,
  onReasonChange,
  reasonOptions,
  reasonLabels,
}: {
  authorLabel: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  reasonOptions: string[];
  reasonLabels: Record<string, string>;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background:
          "color-mix(in srgb, #dc2626 8%, var(--admin-page-bg))",
        border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)",
      }}>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 cursor-pointer accent-red-600"
        />
        <span className="flex-1 text-sm" style={{ color: "var(--admin-text)" }}>
          <span className="font-medium">Emetti strike a {authorLabel}</span>
          <span
            className="block text-xs mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            Effettivo solo selezionando &ldquo;Accetta tutte&rdquo;. Al 3° strike
            attivo l&apos;account viene bloccato automaticamente.
          </span>
        </span>
      </label>
      {checked ? (
        <div className="mt-2 pl-6">
          <label
            className="block text-[11px] uppercase tracking-wider mb-1"
            style={{ color: "var(--admin-text-faint)" }}>
            Motivo strike (opzionale)
          </label>
          <select
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-sm"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-card-border)",
              color: "var(--admin-text)",
            }}>
            <option value="">— Default (moderation) —</option>
            {reasonOptions.map((k) => (
              <option key={k} value={k}>
                {reasonLabels[k] ?? k}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
