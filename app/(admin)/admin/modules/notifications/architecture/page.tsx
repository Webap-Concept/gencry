// app/(admin)/admin/modules/notifications/architecture/page.tsx
//
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ ⚠ MAINTENANCE NOTICE                                              ║
// ║ Source of truth del design del modulo Notifications. Aggiornare    ║
// ║ insieme alle modifiche al schema/trigger/UX. Bump REVIEWED_AT.    ║
// ╚═══════════════════════════════════════════════════════════════════╝
import type { Metadata } from "next";
import {
  AlertTriangle,
  Bell,
  Boxes,
  Database,
  GitBranch,
  Lock,
  Radio,
  Rocket,
} from "lucide-react";
import {
  ArchAnchorNav,
  ArchFileLink,
  ArchFutureCard,
  ArchHookBox,
  ArchMaintenanceFooter,
  ArchSchemaTable,
  ArchSection,
  ArchTechBadge,
} from "@/app/(admin)/admin/_components/architecture/arch-primitives";
import { ArchDiagram } from "@/app/(admin)/admin/_components/architecture/arch-diagram";
import { NOTIFICATIONS_MODULE } from "@/lib/modules/notifications/manifest";

export const metadata: Metadata = { title: "Notifications / Architettura" };

const REVIEWED_AT = "2026-05-26 (achievements V2 + email channel dispatcher)";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "stack", label: "Stack" },
  { id: "schema", label: "Schema DB" },
  { id: "pipeline", label: "Pipeline" },
  { id: "achievements", label: "Achievements" },
  { id: "realtime", label: "Realtime" },
  { id: "future", label: "Future" },
  { id: "files", label: "Files map" },
  { id: "caveats", label: "Caveats" },
];

const PIPELINE_DIAGRAM = `graph TD
  A[User azione: reaction / comment / mention / repost] --> B[posts.* INSERT]
  B --> C[Trigger posts → INSERT in posts_outbox]
  C --> D[Trigger posts_outbox_to_notifications_trg]
  D --> E{Switch event_type}
  E --> F[Risolvi recipient + actor + post_id + comment_id]
  F --> G{Self-notify?}
  G -->|skip| H[mark processed_at]
  G -->|no| I{Dedup window?}
  I -->|hit| H
  I -->|no| J[INSERT notifications]
  J --> H
  J --> K[Supabase Realtime push al client del recipient]
`;

export default function NotificationsArchitecturePage() {
  return (
    <div className="grid grid-cols-[220px_1fr] gap-8">
      <ArchAnchorNav sections={SECTIONS} />

      <main className="space-y-10 max-w-4xl">
        <ArchSection
          id="overview"
          title="Overview"
          icon={Bell}
          intro="Il modulo Notifications consuma gli eventi sociali del posts_outbox e li trasforma in notifiche per l'end-user. Architettura ZERO-LATENCY: niente cron, niente worker — un trigger plpgsql AFTER INSERT su posts_outbox fa il fanout dentro la stessa transazione che ha generato l'evento.">
          <p>
            <strong>Distinto da</strong> <code>lib/notifications/</code> (CORE, intoccabile)
            che gestisce le notifiche admin di sistema (cron failure, secret
            rotation, security alerts, ecc.). Qui parliamo SOLO di notifiche per
            gli end-user del modulo social.
          </p>
          <p>
            <strong>Dipendenze</strong>: <code>posts</code> (FK su <code>posts</code> e{" "}
            <code>posts_comments</code>, consuma <code>posts_outbox</code>).{" "}
            <code>posts</code> NON dipende da <code>notifications</code> — one-way,
            isolation rispettata.
          </p>
        </ArchSection>

        <ArchSection
          id="stack"
          title="Stack"
          icon={Boxes}
          intro="Stack minimale: trigger plpgsql + Supabase Realtime, niente runtime applicativo nel fan-out.">
          <div className="flex flex-wrap gap-2">
            <ArchTechBadge label="Postgres trigger" variant="accent" />
            <ArchTechBadge label="Drizzle ORM" variant="neutral" />
            <ArchTechBadge label="Supabase Realtime" variant="accent" />
            <ArchTechBadge label="Row Level Security" variant="neutral" />
          </div>
        </ArchSection>

        <ArchSection
          id="schema"
          title="Schema DB"
          icon={Database}
          intro="Una sola tabella root + 3 indici (timeline + unread + dedup). Niente sub-tables in V1.">
          <div className="space-y-3 mt-4">
            <ArchSchemaTable
              name="notifications"
              description="Notifiche per gli end-user. Popolata SOLO dal trigger DB. Il client può aggiornare read_at via Server Action."
              columns={[
                { name: "id",         type: "uuid v7",    note: "PK, ordering chronological" },
                { name: "user_id",    type: "uuid",       note: "FK users(id) ON DELETE CASCADE — destinatario" },
                { name: "type",       type: "varchar(64)", note: "match 1:1 con posts_outbox.event_type (5 valori)" },
                { name: "actor_id",   type: "uuid?",      note: "FK users(id) ON DELETE SET NULL — chi ha causato" },
                { name: "post_id",    type: "uuid?",      note: "FK posts(id) ON DELETE CASCADE — contesto principale" },
                { name: "comment_id", type: "uuid?",      note: "FK posts_comments(id) ON DELETE CASCADE — contesto secondario" },
                { name: "payload",    type: "jsonb",      note: "passato 1:1 dal posts_outbox.payload" },
                { name: "read_at",    type: "timestamptz?", note: "NULL = unread; set via markAsRead action" },
                { name: "created_at", type: "timestamptz", note: "default NOW()" },
                { name: "idx 1",      type: "(user_id, created_at DESC)", note: "timeline lista" },
                { name: "idx 2",      type: "(user_id, created_at DESC) WHERE read_at IS NULL", note: "parziale per badge unread count (index-only scan)" },
                { name: "idx 3",      type: "(user_id, type, post_id, actor_id, created_at DESC)", note: "dedup lookup nel trigger" },
              ]}
            />
          </div>
        </ArchSection>

        <ArchSection
          id="pipeline"
          title="Pipeline end-to-end"
          icon={GitBranch}
          intro="Una sola transazione SQL dall'azione utente al fanout su notifications. Niente latenza, niente race.">
          <ArchDiagram id="notif-pipeline" source={PIPELINE_DIAGRAM} caption="Flow zero-latency via trigger chain." />

          <p className="mt-4"><strong>Punti chiave</strong>:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Il trigger <code>notifications_fanout_from_outbox</code> legge la
              dedup window da <code>app_settings.modules.notifications.dedup_window_minutes</code>{" "}
              ad ogni INSERT — modificabile da admin UI senza migration.
            </li>
            <li>
              Skip self-notify: se <code>actor_id == recipient_id</code>{" "}
              (es. mi metto un like da solo) l'evento è marcato processed e
              non genera notifica.
            </li>
            <li>
              Dedup check: stessa <code>(user_id, type, post_id, actor_id)</code>{" "}
              entro la finestra → skip. Evita flood da like tolto e rimesso 5×
              in pochi minuti.
            </li>
            <li>
              Unknown <code>event_type</code> → marca processed e skip (forward-compat:
              nuovi tipi outbox non rompono il trigger).
            </li>
          </ul>
        </ArchSection>

        <ArchSection
          id="achievements"
          title="Achievement push events (V1)"
          icon={Bell}
          intro="Decisione product 2026-05-26: niente email per ogni azione (rumore → utente disabilita), solo email su milestone significativi. Implementazione PUSH (no polling): i trigger DB esistenti rilevano il crossing della soglia inline col counter update.">
          <p>
            <strong>Eventi attivi</strong> (estendibili via <code>app_settings</code> + nuove regole in plpgsql):
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <code>achievement.post_viral_likes</code> — emesso quando il
              post supera la soglia configurabile di reazioni dentro la
              finestra dalla pubblicazione (default 50 in 24h).{" "}
              <em>(M_notifications_002)</em>
            </li>
            <li>
              <code>achievement.post_viral_comments</code> — emesso quando
              il post supera la soglia di commenti dentro la finestra
              (default 10 in 24h). Segnale più "forte" del like.{" "}
              <em>(M_notifications_003)</em>
            </li>
            <li>
              <code>achievement.post_viral_reposts</code> — emesso quando
              il post viene citato N volte dentro la finestra (default 5
              in 24h). Conteggio sul TARGET, non sul quote.{" "}
              <em>(M_notifications_003)</em>
            </li>
          </ul>

          <h3 className="text-sm font-semibold text-[var(--admin-text)] mt-4">
            Flow zero-polling
          </h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Utente mette una reaction → INSERT in <code>posts_reactions</code>
            </li>
            <li>
              Trigger esistente <code>posts_reactions_counter_trg</code>{" "}
              (esteso in <code>M_notifications_002</code>): aggiorna i 5
              counter denormalizzati su <code>posts</code>
            </li>
            <li>
              <strong>Inline check</strong>: legge stato post +{" "}
              <code>achievements_emitted JSONB</code> + soglie da{" "}
              <code>app_settings</code>. Se totale reactions cross la
              soglia E il kind NON è già in <code>achievements_emitted</code>{" "}
              E (per viral) il post è entro la finestra → INSERT in{" "}
              <code>posts_outbox</code> event{" "}
              <code>achievement.*</code> + segna emitted
            </li>
            <li>
              Trigger <code>posts_outbox_to_notifications_trg</code>{" "}
              (esteso): branch <code>achievement.*</code> con recipient =
              autore, actor = NULL (evento di sistema)
            </li>
            <li>
              INSERT in <code>notifications</code> + Supabase Realtime push
              all'autore del post
            </li>
          </ol>

          <h3 className="text-sm font-semibold text-[var(--admin-text)] mt-4">
            Pattern anti-spam
          </h3>
          <p>
            La colonna <code>posts.achievements_emitted JSONB</code> tiene
            traccia dei kind già emessi per ogni post (es.{" "}
            <code>{`{"viral_likes": "2026-05-26T...", "viral_comments": "..."}`}</code>
            ). Il check{" "}
            <code>NOT (achievements_emitted ? &apos;viral_likes&apos;)</code>{" "}
            garantisce 1 sola emissione per kind per post anche se il
            counter oscilla (es. revoca + nuovo like).
          </p>

          <h3 className="text-sm font-semibold text-[var(--admin-text)] mt-4">
            Settings tunabili
          </h3>
          <p className="text-xs text-[var(--admin-text-muted)]">
            9 keys totali sotto il namespace{" "}
            <code>modules.notifications.achievements.*</code> — vedi i 4 preset
            (alpha/beta/growth/scale) nel manifest capacityProfile e nel form
            admin.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs font-mono">
            <li>viral_likes_enabled / _threshold (50) / _window_hours (24)</li>
            <li>viral_comments_enabled / _threshold (10) / _window_hours (24)</li>
            <li>viral_reposts_enabled / _threshold (5) / _window_hours (24)</li>
          </ul>
          <p>
            4 preset alpha/beta/growth/scale dichiarati nel manifest
            <code>capacityProfile</code> &mdash; admin applica un preset
            o tweakka le keys da{" "}
            <code>/admin/modules/notifications/settings</code>.
          </p>

          <h3 className="text-sm font-semibold text-[var(--admin-text)] mt-4">
            Email channel (V3)
          </h3>
          <p>
            Le achievement notifications vengono anche{" "}
            <strong>spedite via email</strong> dall'autore. Pattern{" "}
            module-owned: 4 renderer in{" "}
            <code>lib/modules/notifications/email-channel/renderers/</code>{" "}
            registrati in <code>registry.ts</code> locale. Il dispatcher{" "}
            <code>email-channel/dispatcher.ts</code> gira via cron ogni
            20min (<code>modules-notifications-achievement-email</code>):
            scan <code>notifications.email_sent_at IS NULL</code> + type
            achievement, hydrate recipient/actor/post-preview, render →{" "}
            <code>sendEmail</code> via Resend → mark{" "}
            <code>email_sent_at = NOW()</code>.
          </p>
          <p>
            Settings: <code>email_send_enabled</code> (toggle globale
            safety net, default <code>true</code>),{" "}
            <code>email_grace_seconds</code> (attesa per race col fanout
            trigger, default 30s). Layout email base riusa il core{" "}
            <code>lib/email/layout.ts</code> (header + footer brand).
            User opt-out per-tipo arriverà con PR-4{" "}
            (<code>notifications_preferences</code>).
          </p>

          <h3 className="text-sm font-semibold text-[var(--admin-text)] mt-4">
            Cosa NON c'è (intenzionalmente V3)
          </h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Plain text alternative</strong>: i renderer
              producono già <code>text</code>, ma il wrapper{" "}
              <code>sendEmail</code> di <code>lib/email/resend.ts</code>{" "}
              non lo trasporta ancora. Da abilitare per accessibility audit.
            </li>
            <li>
              <strong>first_comment / first_repost</strong>: intenzionalmente
              skippati — il "primo commento" è più rumoroso del primo like
              (utenti che commentano sempre). Riaprire se diventa necessario.
            </li>
            <li>
              <strong>User opt-in preferences per tipo</strong>: PR-4
              tabella <code>notifications_preferences</code>.
            </li>
          </ul>
        </ArchSection>

        <ArchSection
          id="realtime"
          title="Realtime push al client"
          icon={Radio}
          intro="Il client UI subscribe a Supabase Postgres Changes su notifications filtrato per user_id = current.">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Publication <code>supabase_realtime</code> include la tabella{" "}
              <code>notifications</code> (aggiunta dalla migration init).
            </li>
            <li>
              RLS attiva: il client riceve SOLO le proprie righe (policy{" "}
              <code>auth.uid() = user_id</code>). Niente filtraggio client-side
              da fare.
            </li>
            <li>
              Hook futuro <code>useUnreadNotificationsCount()</code> (PR-3) subscribe +
              fa optimistic increment sul badge sidebar quando arriva un push.
            </li>
          </ul>

          <ArchHookBox
            title="useUnreadNotificationsCount()"
            description="Hook React per il badge unread sulla sidebar. V1 server query + polling 60s fallback; V2 subscribe via Supabase Postgres Changes + optimistic increment. Stesso pattern di useFeedLiveSignal del modulo posts."
            filePath="lib/modules/notifications/client/useUnreadNotificationsCount.ts (futuro)"
          />
        </ArchSection>

        <ArchSection
          id="future"
          title="Future optimizations"
          icon={Rocket}
          intro="Backlog tier-ato. Tier 1 = pianificato a breve; Tier 2 = quando i numeri lo richiedono; Tier 3 = polish.">
          <div className="grid sm:grid-cols-2 gap-3">
            <ArchFutureCard
              tier={1}
              title="PR-3b · Cleanup retention cron"
              description="DELETE notifications WHERE created_at < NOW() - modules.notifications.retention_days. Cron daily. ~30 min implementation."
              trigger="Quando la tabella inizia a crescere significativamente"
            />
            <ArchFutureCard
              tier={2}
              title="Email channel per mention / reply direct"
              description="Estensione del dispatcher achievement-email per spedire anche le mention dirette + reply al tuo post (PR-3c.2). Pattern già pronto — basta aggiungere i renderer relativi + estendere ACHIEVEMENT_EMAILABLE_TYPES."
              trigger="Quando il bisogno emerge da utenti reali (oggi le mention vivono solo in-app)"
            />
            <ArchFutureCard
              tier={2}
              title="PR-4 · Preferenze granulari per tipo"
              description="Tabella notifications_preferences (user_id, type, enabled) per opt-out per tipo. Il trigger consulta la prefs e skippa se disabilitata. UI in /settings/notifications."
              trigger="Richieste utente / feedback spam"
            />
            <ArchFutureCard
              tier={3}
              title="first_comment / first_repost"
              description="V2 ha intenzionalmente skippato i 'first_*' per commenti e repost. Riaprire se in produzione si dimostra utile (oggi: rumore percepito)."
              trigger="Se dopo l'apertura pubblica utenti chiedono il primo commento"
            />
            <ArchFutureCard
              tier={2}
              title="Weekly digest opt-in"
              description="Email settimanale di riassunto 'cosa hai perso' (3 mention, 12 reaction, ...). Default OFF, l'utente lo attiva da /settings/notifications. Cron weekly."
              trigger="Dopo metriche di engagement reale"
            />
            <ArchFutureCard
              tier={3}
              title="PR-5 · Group/aggregation UI"
              description="'3 persone hanno reagito al tuo post' invece di 3 righe separate. Schema unchanged: solo aggregation query lato UI."
              trigger="Volume per-post tale che la lista 1:1 diventa rumorosa"
            />
            <ArchFutureCard
              tier={3}
              title="PR-6 · Push notifications mobile"
              description="FCM / web push. Richiede service worker e gestione token per device."
              trigger="App mobile / PWA"
            />
          </div>
        </ArchSection>

        <ArchSection
          id="files"
          title="Files map — dove cercare cosa"
          icon={Boxes}
          intro="Tutto sotto lib/modules/notifications/ + app/(admin)/admin/modules/notifications/ per module isolation.">
          <div className="space-y-2">
            <ArchFileLink path="lib/modules/notifications/manifest.ts" description="Slug, label, permissions, navChildren" />
            <ArchFileLink path="lib/modules/notifications/queries.ts" description="getMyNotifications + getUnreadCount + getNotificationsHealth" />
            <ArchFileLink path="lib/modules/notifications/actions.ts" description="markNotificationAsRead + markAllNotificationsAsRead" />
            <ArchFileLink path="lib/modules/notifications/messages/{it,en}/notifications.json" description="i18n del modulo" />
            <ArchFileLink path="lib/db/migrations/M_notifications_001_init.sql" description="Tabella + 3 indici + trigger fanout + RLS + publication + settings + permission" />
            <ArchFileLink path="lib/db/migrations/M_notifications_002_achievements.sql" description="Achievement V1: colonna posts.achievements_emitted + estensione trigger reactions counter + branch achievement.* nel fanout" />
            <ArchFileLink path="lib/db/migrations/M_notifications_003_viral_engagement.sql" description="Achievement V2: estende posts_comments_counter_trg + posts_repost_counter_trg con check viral_comments / viral_reposts. Fanout esteso con i 2 nuovi event types." />
            <ArchFileLink path="lib/db/migrations/M_notifications_004_first_like_actor.sql" description="(superseded da M_006) first_like includeva actor_id; fanout leggeva da payload." />
            <ArchFileLink path="lib/db/migrations/M_notifications_005_email_sent_at.sql" description="Colonna notifications.email_sent_at + partial index per il cron scan delle pending achievement emails." />
            <ArchFileLink path="lib/db/migrations/M_notifications_006_drop_first_like.sql" description="Rimuove achievement.first_like end-to-end (rumoroso). Resta solo viral_* (likes/comments/reposts). Pulisce notifiche storiche + settings + outbox pending." />
            <ArchFileLink path="lib/modules/notifications/email-channel/" description="Dispatcher email del modulo (V3): types, registry, dispatcher, recipient hydration. 3 renderer in renderers/ uno per ogni achievement viral_* type." />
            <ArchFileLink path="app/api/cron/modules/notifications/achievement-email/route.ts" description="Cron endpoint invocato ogni 20 min: chiama dispatchAchievementEmails() + ritorna metriche di run." />
            <ArchFileLink path="lib/db/migrations/M_notifications_999_uninstall.sql" description="Rollback completo del modulo" />
            <ArchFileLink path="lib/modules/notifications/notification-targets.ts" description="Mappa (type, payload) → href + summaryKey i18n + templateValues. Source of truth per UI + email digest futuro" />
            <ArchFileLink path="app/(admin)/admin/modules/notifications/page.tsx" description="Overview: module status + 3 health cards (chrome dal layout)" />
            <ArchFileLink path="app/(admin)/admin/modules/notifications/settings/page.tsx" description="Form delle 7 settings (3 legacy + 4 achievement)" />
          </div>
        </ArchSection>

        <ArchSection
          id="caveats"
          title="Caveats e pitfall noti"
          icon={AlertTriangle}
          intro="Cose da tenere a mente.">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Trigger sync vs async</strong>: il trigger è{" "}
              <code>AFTER INSERT</code> in stessa transazione → la INSERT in
              posts_outbox attende il fanout. Per volumi alti (es. mention storm
              con 100+ mention) può rallentare la write-path. Mitigation futura:
              spostare il fanout in un cron async se p99 del trigger &gt; 50ms.
            </li>
            <li>
              <strong>SQL ↔ TS</strong>: i 12 event_type (5 social + 3
              moderation + 4 achievement) sono dichiarati in 3+ posti —
              trigger plpgsql (M_notifications_001/002/003), const{" "}
              <code>NOTIFICATION_TYPES</code> in schema.ts, i18n{" "}
              <code>types.*</code> in notifications.json,{" "}
              <code>notification-targets.ts</code>. Aggiungere un tipo
              richiede sync di tutti.
            </li>
            <li>
              <strong>RLS sull'INSERT</strong>: il trigger gira come{" "}
              <code>SECURITY INVOKER</code> di default — Supabase Postgres
              esegue le funzioni con i privilegi del chiamante. Per il pattern{" "}
              <em>service-role-only INSERT</em> serve eventualmente marcare la
              function <code>SECURITY DEFINER</code> o concedere INSERT sulla
              table al service role esplicitamente. Verificare alla prima
              integrazione live.
            </li>
            <li>
              <strong>Dedup setting lookup</strong>: il trigger fa 1 SELECT su{" "}
              <code>app_settings</code> per riga. PK lookup = trascurabile in
              pratica, ma se scaliamo a milioni di eventi/h vale la pena
              caching in-memory plpgsql (GUC) o pass via param NEW.payload.
            </li>
            <li>
              <strong>Achievement settings lookup (M_notifications_002/003)</strong>:
              ciascun counter trigger fa 3-4 SELECT su <code>app_settings</code>{" "}
              ad ogni insert per leggere le soglie achievement. Stesso caveat:
              trascurabile a scala alpha/beta (~10 SELECT/sec totali), ma a
              scaling alto valutare GUC caching o materializzare le keys in
              un'unica row snapshot. Considerato che reactions/commenti/repost
              vengono inseriti dagli stessi utenti in stream, ~10 settings
              lookup per request ≈ stesso costo dell'ex-query{" "}
              <code>SELECT * FROM app_settings</code> (audit egress
              2026-05-25). Re-misurare se p99 degrada.
            </li>
            <li>
              <strong>Achievement self-notify</strong>: gli eventi{" "}
              <code>achievement.*</code> hanno <code>actor_id = NULL</code>{" "}
              (è il sistema che notifica l'autore del proprio achievement).
              Il check <code>v_recipient_id = v_actor_id</code> non scatta
              perché NULL compara con qualsiasi UUID come "non uguale" via{" "}
              <code>=</code> in plpgsql (e i due NULL non scattano il check
              perché v_recipient_id è UUID valid).
            </li>
          </ul>
        </ArchSection>

        <ArchMaintenanceFooter
          reviewedAt={REVIEWED_AT}
          moduleVersion={NOTIFICATIONS_MODULE.version}
          moduleSlug={NOTIFICATIONS_MODULE.slug}
        />
      </main>
    </div>
  );
}
