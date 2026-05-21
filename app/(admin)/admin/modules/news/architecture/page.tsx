import type { Metadata } from "next";
import { NEWS_MODULE } from "@/lib/modules/news/manifest";

export const metadata: Metadata = { title: "News / Architecture" };
export const dynamic = "force-dynamic";

export default function NewsArchitecturePage() {
  return (
    <div
      className="rounded-xl p-6 space-y-6 max-w-4xl"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
          News module — architecture
        </h1>
        <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
          Version <code>{NEWS_MODULE.version}</code>. Live reference document — bump{" "}
          <code>reviewedAt</code> when the module changes.
        </p>
      </header>

      <Section title="Pipeline overview">
        <p>
          The module turns English RSS/Atom feeds into Italian articles published as CMS pages
          (<code>template=&quot;news&quot;</code>). Three crons drive the pipeline:
        </p>
        <ol className="list-decimal list-inside space-y-1.5 mt-2">
          <li>
            <strong>ingestion</strong> (every 15min) — fetch every active source with ETag /
            If-Modified-Since, dedup via <code>original_hash</code> (sha256 of URL + title),
            insert new items as <code>pending_rewrite</code>.
          </li>
          <li>
            <strong>rewrite</strong> (every 5min) — pick N items with{" "}
            <code>FOR UPDATE SKIP LOCKED</code>, fetch the full article body from the source URL
            (fallback to RSS excerpt), call Claude with prompt caching, store the JSON output and
            promote status to <code>review</code>. On permanent error or max attempts, mark{" "}
            <code>failed</code>.
          </li>
          <li>
            <strong>publisher</strong> (every 15min) — pick scheduled items due now, call{" "}
            <code>publishNewsItem</code> which writes <code>pages</code> + SEO sidecar + custom
            fields (hero, excerpt). Skip if hero is missing.
          </li>
        </ol>
      </Section>

      <Section title="Editorial guarantees">
        <ul className="list-disc list-inside space-y-1.5">
          <li>
            Hero images are never extracted from the source: admin uploads them via the media
            picker into the R2 bucket <code>storage</code> under prefix <code>news/</code>.
          </li>
          <li>
            Published articles carry NO public reference to the source (no canonical link, no
            attribution). Source data lives in <code>news_items</code> for internal audit only.
          </li>
          <li>
            The system prompt instructs Claude to rewrite (not translate): reorder paragraphs,
            change syntax, vary lexicon. Source body is wrapped in <code>&lt;source_article&gt;</code>{" "}
            tags with explicit anti-prompt-injection instructions.
          </li>
        </ul>
      </Section>

      <Section title="State machine (news_items.status)">
        <pre className="text-xs p-3 rounded-md whitespace-pre" style={{ background: "var(--admin-page-bg)", color: "var(--admin-text)" }}>
{`pending_rewrite ──(rewriter ok)─► review ──(admin schedule)─► scheduled ──(publisher)─► published
                                       └─(admin reject)──► rejected
pending_rewrite ──(max attempts / permanent error)─► failed
                                       └─(admin regenerate)─► pending_rewrite`}
        </pre>
      </Section>

      <Section title="CMS bridge">
        <p>
          On publish the module writes a row in <code>pages</code> with{" "}
          <code>template=&apos;news&apos;</code>, slug pattern{" "}
          <code>news/&lt;yyyy-mm-dd&gt;-&lt;title-slug&gt;</code>, custom fields encoded as JSON
          (<code>hero_image</code> = media_asset_id, <code>excerpt</code> = string). The template
          id is looked up from <code>page_templates.slug = &apos;news&apos;</code> (seeded by{" "}
          <code>M_news_002_cms_seed.sql</code>).
        </p>
        <p>
          Post-publish edits happen in <code>/admin/content/pages/&lt;id&gt;/edit</code> like any
          other CMS page — the news module is intentionally one-way after publish to avoid
          bidirectional sync bugs. <code>news_items.published_page_id</code> stays as a backlink.
        </p>
      </Section>

      <Section title="Cost tracking">
        <p>
          Each successful rewrite logs <code>ai_model</code>, <code>ai_prompt_version</code>, and
          accumulates <code>ai_cost_cents</code> on the item (model rates hard-coded in{" "}
          <code>rewriter.ts</code>, update when Anthropic pricing changes). The overview dashboard
          surfaces the cumulative total.
        </p>
      </Section>

      <Section title="Capacity profile (modules.news.*)">
        <p>
          The manifest declares a single <code>pipeline</code> capacity profile with 4 presets
          (alpha → scale). Tunables: rewrite/publisher batch sizes, max published per day,
          rewrite max attempts, AI model, max items per fetch. Pick a preset from the capacity
          dashboard, or override values directly in <code>/admin/modules/news/settings</code>.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 text-sm" style={{ color: "var(--admin-text)" }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
        {title}
      </h2>
      <div className="space-y-2 text-[13px] leading-relaxed" style={{ color: "var(--admin-text-muted)" }}>
        {children}
      </div>
    </section>
  );
}
