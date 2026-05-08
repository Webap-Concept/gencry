// Catch-all: captures any unmatched /admin/* URLs.
// Shows a 404 with the admin layout (sidebar + header) instead of the main site's 404.
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { LayoutDashboard, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: "noindex",
};

export default async function AdminCatchAll() {
  const adminSlug = await getAdminUrlSlug();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 gap-6">
      {/* Icon */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background:
            "color-mix(in srgb, var(--admin-accent) 10%, var(--admin-card-bg))",
          border:
            "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
        }}>
        <SearchX size={28} style={{ color: "var(--admin-accent)" }} />
      </div>

      {/* Text */}
      <div className="space-y-2">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--admin-accent)" }}>
          404 Error
        </p>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--admin-text)" }}>
          Page Not Found
        </h1>
        <p
          className="text-sm max-w-xs mx-auto"
          style={{ color: "var(--admin-text-muted)" }}>
          The section you are looking for does not exist or has been removed
          from the admin area.
        </p>
      </div>

      {/* CTA */}
      <Link
        href={`/${adminSlug}`}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
        style={{
          background: "var(--admin-accent)",
          color: "#fff",
        }}>
        <LayoutDashboard size={15} />
        Back to Dashboard
      </Link>
    </div>
  );
}
