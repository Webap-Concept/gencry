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
          reviewedAt: 2026-06-01 · version: 0.3.0
        </p>
      </header>

      <Section title="Overview">
        <p>
          Il modulo Rewards implementa una <strong>virtual coin economy (GCC — Generazione Crypto Coin)</strong>.
          Gli utenti accumulano GCC eseguendo azioni (check-in giornaliero, post, commenti,
          reactions ricevute) e raggiungendo milestone di streak. I GCC sono coin virtuali della
          piattaforma — non criptovalute reali né strumenti finanziari.
        </p>
        <p>
          L&apos;earn engine usa un <strong>ledger append-only</strong> con idempotency key per ogni
          evento, un <strong>saldo denormalizzato</strong> aggiornato via trigger DB, e
          <strong> timezone-safe daily checkin</strong> (data locale del browser, non UTC server).
        </p>
      </Section>

      <Section title="Schema DB">
        <Table
          headers={["Tabella", "Scopo", "Tipo amount", "Chiave"]}
          rows={[
            ["rewards_rules", "Regole configurabili (amount + daily_cap per event_type)", "numeric(10,2)", "event_type PK"],
            ["rewards_ledger", "Libro mastro append-only — mai UPDATE/DELETE", "numeric(10,2)", "UNIQUE(user_id, idempotency_key)"],
            ["rewards_balances", "Saldo denormalizzato — aggiornato via trigger", "numeric(15,2)", "user_id PK"],
          ]}
        />
        <Note>
          M_rewards_003 ha convertito amount da INTEGER a numeric(10,2) per supportare frazioni (es. 0.5 GCC
          per azioni minori). Il saldo è numeric(15,2) per evitare overflow su utenti attivi nel lungo periodo.
        </Note>
      </Section>

      <Section title="Earn Events">
        <Table
          headers={["Event type", "Trigger", "Idempotency key", "Default", "Cap"]}
          rows={[
            ["daily_checkin",  "Client → claimDailyCheckin(localDate)", "daily_checkin:YYYY-MM-DD (locale)", "10 GCC", "—"],
            ["post_created",   "posts/actions.ts createPost (fire-and-forget)", "post_created:<postId>", "5 GCC", "3/day"],
            ["comment_created","posts/actions.ts createComment (fire-and-forget)", "comment_created:<commentId>", "3 GCC", "5/day"],
            ["like_received",  "DB trigger su posts_reactions INSERT", "like_received:<postId>:<reactorId>", "1 GCC", "20/day"],
            ["streak_7",       "earn-reward.ts dopo checkin (streak===7)", "streak_7:YYYY-MM-DD", "50 GCC", "—"],
            ["streak_14",      "earn-reward.ts dopo checkin (streak===14)", "streak_14:YYYY-MM-DD", "120 GCC", "—"],
            ["streak_30",      "earn-reward.ts dopo checkin (streak===30)", "streak_30:YYYY-MM-DD", "300 GCC", "—"],
          ]}
        />
        <Note>
          <strong>Anti-self-reward:</strong> il trigger DB per like_received esclude
          (v_author_id = NEW.user_id). I milestone streak si riattivano se l&apos;utente ricostruisce
          la streak dopo averla interrotta (idempotency key include la data, quindi chiave diversa).
        </Note>
      </Section>

      <Section title="Timezone-safe daily checkin">
        <p>
          Il check-in giornaliero è gestito lato <strong>client</strong>
          (non nel layout RSC) per evitare il bug timezone: un utente UTC+3 alle 01:00 locale
          è ancora nel giorno precedente UTC — con chiave UTC avrebbe ricevuto due check-in
          nello stesso giorno locale.
        </p>
        <Code>{`// CheckinToastLauncher.tsx (client)
const localDate = new Date().toLocaleDateString("en-CA") // "YYYY-MM-DD" ora locale
claimDailyCheckin(localDate) // Server Action

// earn-reward.ts (server)
// Valida: localDate deve essere entro ±1 giorno UTC
// (copre tutti gli offset UTC-14..+14)
// Idempotency key: "daily_checkin:2026-06-01" (data locale)`}</Code>
      </Section>

      <Section title="Streak milestones">
        <p>
          Dopo ogni check-in accreditato con successo, <code>checkAndAwardStreakMilestones()</code>
          controlla se la streak corrente è esattamente 7, 14 o 30. Se sì, inserisce un record
          bonus nel ledger con idempotency key <code>streak_N:YYYY-MM-DD</code>.
        </p>
        <Code>{`// earn-reward.ts — dopo claimDailyCheckin riuscito
const streak = await getCheckinStreak(userId)   // query su ledger ultimi 400 gg
for (const days of [7, 14, 30]) {
  if (streak === days) {
    earnReward(userId, \`streak_\${days}\`, \`streak_\${days}:\${dateKey}\`)
  }
}`}</Code>
        <Note>
          La streak viene calcolata server-side via query (non fidata dal client).
          Il check <code>streak === days</code> (non &gt;=) garantisce che ogni milestone
          scatti una sola volta per streak run. Se l&apos;utente rompe la streak e la ricostruisce,
          la data nella chiave sarà diversa → bonus nuovamente disponibile.
        </Note>
      </Section>

      <Section title="Flusso earn (applicativo)">
        <Code>{`// earnReward() — lib/modules/rewards/earn-reward.ts
// 1. SELECT regola da rewards_rules (amount, daily_cap, enabled)
// 2. Se daily_cap definito: COUNT righe oggi per (userId, eventType)
// 3. INSERT INTO rewards_ledger … ON CONFLICT (user_id, idempotency_key) DO NOTHING
// 4. Trigger rewards_ledger_balance_trg → UPSERT rewards_balances (+amount)
// Errori: swallowati, mai bloccano l'azione utente (fire-and-forget)`}</Code>
      </Section>

      <Section title="Flusso earn (like_received — DB trigger)">
        <Code>{`-- rewards_reaction_insert_trg (AFTER INSERT ON posts_reactions)
-- 1. SELECT author_id FROM posts WHERE id = NEW.post_id
-- 2. Skip se author_id = NEW.user_id (anti-self)
-- 3. SELECT amount, daily_cap, enabled FROM rewards_rules WHERE event_type='like_received'
-- 4. Se daily_cap != NULL: COUNT like_received oggi per l'autore
-- 5. INSERT INTO rewards_ledger … ON CONFLICT DO NOTHING
-- 6. Trigger rewards_ledger_balance_trg scatta in cascata`}</Code>
        <Note>
          Il trigger è AFTER INSERT, non AFTER INSERT OR UPDATE. Il toggle-reaction (DELETE +
          INSERT nel service reactions.ts) attiva il trigger solo sull&apos;INSERT. Non sottraiamo
          coin quando una reaction viene rimossa — V1 intentional.
        </Note>
      </Section>

      <Section title="Idempotency">
        <p>
          La colonna <code>idempotency_key VARCHAR(200)</code> con indice UNIQUE su
          <code>(user_id, idempotency_key)</code> garantisce at-most-once per chiave.
          Le chiavi sono costruite così:
        </p>
        <Table
          headers={["Evento", "Formato chiave", "Garantisce"]}
          rows={[
            ["daily_checkin",   "daily_checkin:YYYY-MM-DD",              "1 accredito per giorno locale"],
            ["post_created",    "post_created:<uuid>",                    "1 accredito per post"],
            ["comment_created", "comment_created:<uuid>",                 "1 accredito per commento"],
            ["like_received",   "like_received:<postId>:<reactorId>",     "1 accredito per coppia post×utente"],
            ["streak_7",        "streak_7:YYYY-MM-DD",                    "1 bonus per giorno (re-earnable)"],
            ["streak_14",       "streak_14:YYYY-MM-DD",                   "1 bonus per giorno (re-earnable)"],
            ["streak_30",       "streak_30:YYYY-MM-DD",                   "1 bonus per giorno (re-earnable)"],
          ]}
        />
      </Section>

      <Section title="UI utente — /mycoins">
        <p>
          La pagina <code>/mycoins</code> mostra:
        </p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-sm" style={{ color: "var(--admin-text-muted)" }}>
          <li>Hero card con saldo GCC corrente + earned questa settimana + streak giorni</li>
          <li>Sezione Streak milestones: progress bar verso il prossimo, checklist 7/14/30 con date di achievement</li>
          <li>Stacked bar &ldquo;Da dove arrivano&rdquo; con percentuali per categoria</li>
          <li>Grid categorie: icona colorata, %, mini progress bar, totale GCC, count eventi · amount/cad</li>
        </ul>
        <Note>
          La config categorie (label, icona, colori) è centralizzata in
          <code>lib/modules/rewards/categories.ts</code> — unica fonte di verità importata
          sia dalla pagina sia da qualsiasi futuro consumer.
        </Note>
      </Section>

      <Section title="Admin — Settings">
        <p>
          La pagina <code>/admin/modules/rewards/settings</code> è divisa in due sezioni:
        </p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-sm" style={{ color: "var(--admin-text-muted)" }}>
          <li><strong>Earn Rules</strong>: daily_checkin, post_created, comment_created, like_received — amount decimale (es. 0.5) + daily cap</li>
          <li><strong>Streak Milestones</strong>: streak_7/14/30 — solo amount + enabled. Nessun daily_cap (inutile: fires once per streak run)</li>
        </ul>
        <Note>
          Le modifiche sono immediate: earnReward() e il trigger DB leggono rewards_rules ad ogni
          invocazione. Non serve redeploy né cache invalidation.
        </Note>
      </Section>

      <Section title="Migrations">
        <Table
          headers={["Migration", "Contenuto"]}
          rows={[
            ["M_rewards_001", "Tabelle + trigger balance + trigger like_received + seed regole base"],
            ["M_rewards_002", "Seed regola comment_created (3 GCC, cap 5/day)"],
            ["M_rewards_003", "ALTER amount → numeric(10,2), balances → numeric(15,2)"],
            ["M_rewards_004", "Seed streak_7/14/30 (50/120/300 GCC, configurabili)"],
          ]}
        />
      </Section>

      <Section title="PR roadmap">
        <Table
          headers={["PR", "Scope", "Status"]}
          rows={[
            ["PR-1", "Earn engine: schema + trigger + hook posts + admin", "✅ Done"],
            ["PR-2", "UI saldo (UserMenu + /mycoins + toast checkin timezone-safe)", "✅ Done"],
            ["PR-3", "formatCoins + /mycoins breakdown + comment_created + categories.ts", "✅ Done"],
            ["PR-4", "Streak milestones 7/14/30 + sezione /mycoins + admin settings", "✅ Done"],
            ["PR-5", "GDPR export (ledger + balance come modules.rewards.* nel JSON)", "⬜ Pending"],
            ["PR-6", "Spending: catalogo riscatti + redeem flow + admin catalogo", "⬜ Pending"],
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
