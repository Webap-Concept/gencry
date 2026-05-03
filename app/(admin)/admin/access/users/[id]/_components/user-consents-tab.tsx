import { parseUserAgent } from "@/lib/account/parse-user-agent";
import type { UserConsentRecord } from "@/lib/account/consent-queries";
import { ScrollText } from "lucide-react";

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const cardStyle: React.CSSProperties = {
  background: "var(--admin-card-bg)",
  border: "1px solid var(--admin-card-border)",
};

function deviceLabel(ua: string | null): string {
  if (!ua) return "—";
  const parsed = parseUserAgent(ua);
  if (parsed.deviceType === "unknown") return "Unknown";
  const browser = parsed.browser.startsWith("Browser ")
    ? "Unknown"
    : parsed.browser;
  const os = parsed.os.startsWith("Sistema ") ? "Unknown OS" : parsed.os;
  return `${browser} · ${os}`;
}

function TypeBadge({ type }: { type: UserConsentRecord["consentType"] }) {
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-md"
      style={{
        background: "var(--admin-hover-bg)",
        color: "var(--admin-text-muted)",
      }}>
      {type}
    </span>
  );
}

function ActionBadge({ action }: { action: UserConsentRecord["action"] }) {
  if (action === "granted") {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        granted
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      revoked
    </span>
  );
}

function HashCell({ hash }: { hash: string | null }) {
  if (!hash) {
    return (
      <span style={{ color: "var(--admin-text-faint)" }}>—</span>
    );
  }
  // Mostra primi 8 + ultimi 4 caratteri, full hash nel tooltip nativo.
  const short = `${hash.slice(0, 8)}…${hash.slice(-4)}`;
  return (
    <span
      className="font-mono text-[11px]"
      title={`SHA-256: ${hash}`}
      style={{ color: "var(--admin-text-muted)" }}>
      {short}
    </span>
  );
}

function IpCell({
  ip,
  strategy,
}: {
  ip: string | null;
  strategy: UserConsentRecord["ipStrategy"];
}) {
  if (!ip) return <span style={{ color: "var(--admin-text-faint)" }}>—</span>;
  const tooltip =
    strategy === "hash_only"
      ? "Stored as SHA-256 hash"
      : strategy === "mask_last_octet"
        ? "Last octet masked"
        : "Stored in full";
  return (
    <span className="font-mono text-[11px]" title={tooltip}>
      {ip}
    </span>
  );
}

export function UserConsentsTab({ records }: { records: UserConsentRecord[] }) {
  if (records.length === 0) {
    return (
      <div
        className="rounded-xl shadow-sm p-8 text-center"
        style={cardStyle}>
        <ScrollText
          size={28}
          className="mx-auto mb-3"
          style={{ color: "var(--admin-text-faint)" }}
        />
        <p
          className="text-sm font-medium"
          style={{ color: "var(--admin-text)" }}>
          No consent records
        </p>
        <p
          className="text-[11px] mt-1"
          style={{ color: "var(--admin-text-faint)" }}>
          The user predates the consent ledger, or
          <code className="font-mono mx-1">gdpr.consent_log.enabled</code>
          is off when they signed up.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden"
      style={cardStyle}>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: "var(--admin-text-faint)" }}>
              <th className="text-left font-medium py-2.5 px-3">Type</th>
              <th className="text-left font-medium py-2.5 px-3">Action</th>
              <th className="text-left font-medium py-2.5 px-3">Version</th>
              <th className="text-left font-medium py-2.5 px-3">When</th>
              <th className="text-left font-medium py-2.5 px-3">IP</th>
              <th className="text-left font-medium py-2.5 px-3">Device</th>
              <th className="text-left font-medium py-2.5 px-3">Source</th>
              <th className="text-left font-medium py-2.5 px-3">Policy hash</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const source =
                typeof r.metadata?.source === "string"
                  ? (r.metadata.source as string)
                  : "—";
              return (
                <tr
                  key={r.id}
                  style={{ borderTop: "1px solid var(--admin-card-border)" }}>
                  <td className="py-2 px-3">
                    <TypeBadge type={r.consentType} />
                  </td>
                  <td className="py-2 px-3">
                    <ActionBadge action={r.action} />
                  </td>
                  <td
                    className="py-2 px-3 font-mono"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {r.policyVersion ?? "—"}
                  </td>
                  <td
                    className="py-2 px-3"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {dateTimeFmt.format(r.createdAt)}
                  </td>
                  <td className="py-2 px-3">
                    <IpCell ip={r.ip} strategy={r.ipStrategy} />
                  </td>
                  <td
                    className="py-2 px-3"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {deviceLabel(r.userAgent)}
                  </td>
                  <td
                    className="py-2 px-3"
                    style={{ color: "var(--admin-text-faint)" }}>
                    {source}
                  </td>
                  <td className="py-2 px-3">
                    <HashCell hash={r.policyTextHash} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
