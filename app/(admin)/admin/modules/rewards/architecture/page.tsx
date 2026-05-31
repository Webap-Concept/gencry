import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rewards / Architecture" };

export default function RewardsArchitecturePage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
          Rewards — Architecture
        </h1>
        <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
          reviewedAt: 2026-06-01 · version: 0.1.0
        </p>
      </header>

      <Section title="Overview">
        <p>
          Il modulo Rewards implementa una <strong>virtual coin economy</strong> per la
          gamification utente. Gli utenti accumulano coin eseguendo azioni (check-in giornaliero,
          post, like ricevuti). Il sistema è pensato per essere esteso con un meccanismo di
          spending (catalogo riscatti) in PR-2.
        </p>
      </Section>

      <Section title="Schema DB">
        <Table
          headers={["Tabella", "Scopo", "Chiave"]}
          rows={[
            ["rewards_rules", "Regole configurabili (amount + daily_cap per event_type)", "event_type PK"],
            ["rewards_ledger", "Libro mastro append-only — mai UPDATE/DELETE", "UNIQUE(user_id, idempotency_key)"],
            ["rewards_balances", "Saldo denormalizzato — aggiornato via trigger", "user_id PK"],
          ]}
        />
      </Section>

      <Section title="Earn Events">
        <Table
          headers={["Event type", "Trigger", "Idempotency key", "Default amount", "Default cap"]}
          rows={[
            ["daily_checkin", "Server Action claimDailyCheckin()", "daily_checkin:YYYY-MM-DD", "10 coins", "—"],
            ["post_created", "posts/actions.ts → createPost (fire-and-forget)", "post_created:<postId>", "5 coins", "3/day"],
            ["like_received", "DB trigger su posts_reactions INSERT", "like_received:<postId>:<reactorId>", "1 coin", "20/day"],
          ]}
        />
        <Note>
          <strong>Anti-self-reward:</strong> il trigger DB esclude le self-reactions
          (v_author_id = NEW.user_id). Il service applicativo non ha questo rischio
          perché daily_checkin e post_created si riferiscono sempre all&apos;utente che compie l&apos;azione.
        </Note>
      </Section>

      <Section title="Flusso earn (applicativo)">
        <Code>{`// posts/actions.ts — createPost
const postResult = await db.transaction(...)

// Fire-and-forget: non blocca la response, errori swallowati
earnReward(user.id, "post_created", \`post_created:\${postId}\`, postId)
  .catch(() => {})

// ─────────────────────────────────────────────────────
// earn-reward.ts
// 1. Legge la regola (amount, daily_cap, enabled) da rewards_rules
// 2. Se daily_cap definito → COUNT delle righe oggi in rewards_ledger
// 3. INSERT … ON CONFLICT (user_id, idempotency_key) DO NOTHING
// 4. Il trigger rewards_ledger_balance_trg aggiorna rewards_balances`}</Code>
      </Section>

      <Section title="Flusso earn (like_received — DB trigger)">
        <Code>{`-- rewards_reaction_insert_trg (AFTER INSERT ON posts_reactions)
-- 1. SELECT author_id FROM posts WHERE id = NEW.post_id
-- 2. Skip se author_id = NEW.user_id (anti-self)
-- 3. SELECT amount, daily_cap, enabled FROM rewards_rules
-- 4. Se daily_cap != NULL → COUNT delle righe like_received oggi per l'autore
-- 5. INSERT INTO rewards_ledger … ON CONFLICT DO NOTHING
-- 6. Il trigger rewards_ledger_balance_trg scatta in cascata`}</Code>
        <Note>
          Il trigger è AFTER INSERT, non AFTER INSERT OR UPDATE. Il service reactions.ts usa
          DELETE + INSERT (per il toggle): il trigger scatta solo sull&apos;INSERT, mai sulla
          rimozione. Questo è corretto: non sottraiamo coin quando un like viene rimosso (V1).
        </Note>
      </Section>

      <Section title="Idempotency">
        <p>
          La colonna <code>idempotency_key</code> con l&apos;indice UNIQUE garantisce che lo stesso
          evento non venga accreditato due volte, anche in caso di retry o race condition.
          La semantica è <em>at-most-once</em> per chiave: un INSERT con chiave già esistente
          restituisce 0 righe (ON CONFLICT DO NOTHING) senza errore.
        </p>
      </Section>

      <Section title="Daily cap">
        <p>
          Il daily cap è implementato in due posti con semantica identica:
        </p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-sm" style={{ color: "var(--admin-text-muted)" }}>
          <li>
            <strong>Service applicativo</strong> (daily_checkin, post_created): COUNT delle righe
            nella finestra UTC del giorno corrente prima dell&apos;INSERT.
          </li>
          <li>
            <strong>Trigger DB</strong> (like_received): stesso COUNT plpgsql, atomico rispetto
            all&apos;INSERT su posts_reactions.
          </li>
        </ul>
        <Note>
          Il cap non è una finestra sliding — è un reset a mezzanotte UTC. Questo è intenzionale:
          semplice da spiegare all&apos;utente (&quot;ogni giorno guadagni al massimo X coin&quot;).
        </Note>
      </Section>

      <Section title="PR roadmap">
        <Table
          headers={["PR", "Scope", "Status"]}
          rows={[
            ["PR-1", "Earn engine: schema + trigger + hook posts + admin", "✅ Done"],
            ["PR-2", "UI saldo utente (widget sidebar + profilo), claimDailyCheckin() dal frontend", "⬜ Pending"],
            ["PR-3", "Spending: catalogo riscatti + redeem flow + admin catalogo", "⬜ Pending"],
            ["PR-4", "GDPR export (ledger + balance come moduli.rewards.* nel JSON)", "⬜ Pending"],
          ]}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-lg p-5 space-y-3"
      style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
    >
      <h2 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
        {title}
      </h2>
      <div className="text-sm space-y-2" style={{ color: "var(--admin-text-muted)" }}>
        {children}
      </div>
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="py-1.5 pr-4 text-left font-semibold"
                style={{ color: "var(--admin-text)", borderBottom: "1px solid var(--admin-card-border)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="py-1.5 pr-4 align-top"
                  style={{
                    color: j === 0 ? "var(--admin-text)" : "var(--admin-text-muted)",
                    borderBottom: "1px solid var(--admin-card-border)",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre
      className="rounded-md p-3 text-xs overflow-x-auto"
      style={{ background: "var(--admin-page-bg)", color: "var(--admin-text-muted)" }}
    >
      {children}
    </pre>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-md px-3 py-2 text-xs"
      style={{ background: "var(--admin-page-bg)", color: "var(--admin-text-muted)" }}
    >
      {children}
    </div>
  );
}
