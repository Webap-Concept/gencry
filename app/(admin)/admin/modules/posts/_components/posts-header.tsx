import Link from "next/link";

const TABS = [
  { href: "/admin/modules/posts",          label: "Overview" },
  { href: "/admin/modules/posts/settings", label: "Settings" },
] as const;

export function PostsHeader() {
  return (
    <header>
      <h1 className="text-2xl font-semibold text-[var(--admin-text)]">Posts</h1>
      <p className="text-sm text-[var(--admin-text-muted)] mt-1">
        Modulo social feed — composer, reactions, comments, moderation.
      </p>
      <nav className="mt-4 flex gap-1 border-b border-[var(--admin-card-border)]">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-3 py-2 text-sm text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] border-b-2 border-transparent hover:border-[var(--admin-card-border)]"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
