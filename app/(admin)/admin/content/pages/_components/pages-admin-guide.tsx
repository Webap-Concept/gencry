// Guide content shown inside the AdminSectionInfo modal on
// /admin/content/pages. Documents the two-tab split (user CMS pages vs
// system pages), what's editable on each, and the slug-lock policy for
// system pages bound to a hardcoded route handler.

import {
  AlertTriangle,
  FileCode,
  Layers,
  Link2,
  Lock,
  PenLine,
  ShieldCheck,
} from "lucide-react";

const sectionStyle: React.CSSProperties = {
  marginTop: 18,
};

const headingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--admin-text, #cdccca)",
  margin: "0 0 8px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  background: "var(--admin-hover-bg, rgba(255,255,255,0.06))",
  padding: "1px 5px",
  borderRadius: 4,
  color: "var(--admin-text, #cdccca)",
};

const calloutStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 8,
  background:
    "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-card-bg))",
  border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
  marginTop: 6,
};

function H({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <h3 style={headingStyle}>
      <Icon size={13} style={{ color: "var(--admin-accent)" }} />
      {children}
    </h3>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code style={codeStyle}>{children}</code>;
}

export function PagesAdminGuide() {
  return (
    <div>
      <p style={{ margin: 0 }}>
        Pages are split into two tabs. <b>Pages</b> hosts the regular CMS
        content the admin creates from scratch — full content editor, templates,
        custom fields. <b>System</b> hosts a fixed set of pages that the
        platform needs for its own routing (auth, error pages, legal docs): they
        can't be deleted and have a stricter editing surface depending on what
        each one represents.
      </p>

      {/* ── System pages: two flavors ──────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Layers}>Two flavors of system pages</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Editorial CMS</b> (<Code>privacy</Code>, <Code>terms</Code>,{" "}
            <Code>cookie</Code>, <Code>marketing</Code>) — served from the CMS
            catch-all router. Content body is editable like a normal page. The
            slug is editable too: renaming <Code>/privacy</Code> to{" "}
            <Code>/privacy-policy</Code> moves the URL and creates an automatic
            301 redirect.
          </li>
          <li>
            <b>Meta-only</b> (everything else: <Code>sign-in</Code>,{" "}
            <Code>verify-email</Code>, <Code>404</Code>, <Code>admin</Code>,
            home, …) — the actual route is served by a hardcoded Next.js page
            handler. The CMS record is just an admin container so you can edit
            the title (used in the page list) and the SEO meta. Content body and
            slug are locked.
          </li>
        </ul>
      </section>

      {/* ── What you can edit ──────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={PenLine}>What you can edit, where</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Title</b> — always editable. It's both the public page title and
            the admin label in the System tab list.
          </li>
          <li>
            <b>Slug</b> — editable only on user pages and on the four editorial
            system pages above. Disabled with a lock icon on the other system
            pages.
          </li>
          <li>
            <b>Content body</b> — full Tiptap editor on user pages and on
            editorial system pages. Hidden on meta-only system pages.
          </li>
          <li>
            <b>Visibility</b> (Public / Private) — in the{" "}
            <Code>Publishing</Code> tab. Private pages redirect unauthenticated
            visitors to <Code>/sign-in</Code>. Default is Public. (Hidden for
            meta-only system pages — their auth gate is enforced by the route
            handler itself.)
          </li>
          <li>
            <b>SEO meta</b> — in the <Code>SEO</Code> tab on every page. Title,
            description, Open Graph, robots, JSON-LD. Stored in the{" "}
            <Code>seo_pages</Code> table keyed on <Code>/{`{slug}`}</Code>.
          </li>
        </ul>
      </section>

      {/* ── Why some slugs are locked ──────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Lock}>Why some slugs are locked</H>
        <p style={{ margin: 0 }}>
          The CMS catch-all (<Code>app/(frontend)/[...slug]/page.tsx</Code>)
          serves any slug the admin creates. But the route <Code>/sign-in</Code>{" "}
          is not served by the CMS — it's served by{" "}
          <Code>app/(login)/sign-in/page.tsx</Code>, a hardcoded handler.
          Renaming the system page from <Code>sign-in</Code> to e.g.{" "}
          <Code>login</Code> would move the admin record but leave the real
          route at <Code>/sign-in</Code>. The handler and the SEO record would
          drift apart, so the form rejects the rename both client-side (disabled
          input) and server-side (action guard).
        </p>
      </section>

      {/* ── Placeholders ───────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Link2}>Placeholders in title and meta</H>
        <p style={{ margin: 0 }}>
          Both the page content and the SEO meta accept a small set of tokens,
          resolved server-side at render time:
        </p>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>
            <Code>{`{appName}`}</Code>, <Code>{`{appDescription}`}</Code>,{" "}
            <Code>{`{appDomain}`}</Code> — from{" "}
            <Code>/admin/settings/general</Code>.
          </li>
          <li>
            <Code>{`{emailFrom}`}</Code> — sender address from email settings.
          </li>
          <li>
            <Code>{`{currentYear}`}</Code> — current year, useful in footer
            copyrights.
          </li>
        </ul>
        <p style={{ margin: "6px 0 0" }}>
          Example: writing <Code>Login | {`{appName}`}</Code> as the SEO title
          renders <Code>Login | AppName</Code>.
        </p>
      </section>

      {/* ── Where the data lives ───────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={FileCode}>Where the data lives</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <Code>pages</Code> table — title, content, slug, visibility,
            isSystem flag, systemKey. Source of truth for both the CMS router
            and <Code>proxy.ts</Code> visibility check.
          </li>
          <li>
            <Code>seo_pages</Code> table — meta tags, keyed by pathname. Written
            by the SEO tab inside this page editor.
          </li>
          <li>
            <Code>SYSTEM_PAGE_KEYS_EDITABLE_SLUG</Code> in{" "}
            <Code>lib/db/schema.ts</Code> — whitelist of systemKey values whose
            slug is editable. Update there if you ever need to promote a
            meta-only page to editorial.
          </li>
        </ul>
      </section>

      {/* ── Common mistakes ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={AlertTriangle}>Common mistakes</H>
        <div style={calloutStyle}>
          <AlertTriangle
            size={14}
            style={{
              color: "var(--admin-accent)",
              marginTop: 2,
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: 12 }}>
            Setting a CMS user page slug to a path already served by a hardcoded
            handler (e.g. <Code>sign-in</Code>) does <b>not</b> override the
            handler — the more specific route wins. The CMS page becomes
            unreachable. Pick a different slug.
          </div>
        </div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          <li>
            Don't try to set a system page as a parent of a user page. The
            parent select already filters them out, but bypassing the UI would
            produce slugs like <Code>/sign-in/something</Code> that the
            catch-all never serves.
          </li>
          <li>
            Don't expect changes to <Code>/admin/seo/&hellip;</Code> for a page
            slug to outrank what you set in this editor's SEO tab — both write
            to the same row in <Code>seo_pages</Code>, last write wins.
          </li>
        </ul>
      </section>

      {/* ── Schema reference ───────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={ShieldCheck}>Schema reference</H>
        <p style={{ margin: 0 }}>
          The full enum of system identifiers is <Code>SYSTEM_PAGE_KEYS</Code>{" "}
          in <Code>lib/db/schema.ts</Code>. Adding a new system page means
          adding the key to that array, adding a row to <Code>pages</Code> via a
          migration with <Code>is_system = true</Code>, and (for meta-only)
          deciding whether the slug should be in the editable whitelist.
        </p>
      </section>
    </div>
  );
}
