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

const REVIEWED_AT = "2026-05-18";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "stack", label: "Stack" },
  { id: "schema", label: "Schema DB" },
  { id: "pipeline", label: "Pipeline" },
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
              title="UI utente /notifiche live"
              description="Lista paginata con avatar attore + summary tipo-specifico + click-to-context. Mark-as-read on view + bulk mark-all. Realtime push del badge sidebar."
              trigger="Subito dopo lo scaffold (PR-3)"
            />
            <ArchFutureCard
              tier={1}
              title="Badge unread su sidebar nav"
              description="Counter dinamico accanto a 'Notifiche' nella sidebar — server-rendered + Realtime increment client-side."
              trigger="Insieme alla UI /notifiche"
            />
            <ArchFutureCard
              tier={2}
              title="Email digest"
              description="Cron giornaliero/settimanale che aggrega le notifiche unread di un user e invia un'email summary via Resend. Riusare email-channel/dispatcher core."
              trigger="Quando l'engagement sociale produrrà unread > N/day medi"
            />
            <ArchFutureCard
              tier={2}
              title="Cleanup retention cron"
              description="DELETE notifications WHERE created_at < NOW() - modules.notifications.retention_days. Cron daily."
              trigger="Tabella > 1M righe"
            />
            <ArchFutureCard
              tier={2}
              title="Preferenze granulari per tipo"
              description="Tabella notifications_preferences (user_id, type, enabled) per opt-out per tipo. Trigger consulta la prefs e skippa se disabilitata."
              trigger="Richieste utente / feedback social spam"
            />
            <ArchFutureCard
              tier={3}
              title="Group/aggregation"
              description="'3 persone hanno reagito al tuo post' invece di 3 righe separate. Schema unchanged: solo aggregation query lato UI."
              trigger="Volume per-post tale che la lista 1:1 diventa rumorosa"
            />
            <ArchFutureCard
              tier={3}
              title="Push notifications mobile"
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
            <ArchFileLink path="lib/db/migrations/M_notifications_999_uninstall.sql" description="Rollback completo del modulo" />
            <ArchFileLink path="app/(admin)/admin/modules/notifications/page.tsx" description="Overview con 3 health cards" />
            <ArchFileLink path="app/(admin)/admin/modules/notifications/settings/page.tsx" description="Form delle 3 settings (dedup, page size, retention)" />
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
              <strong>SQL ↔ TS</strong>: i 5 event_type sono dichiarati in 3
              posti — trigger plpgsql (M_notifications_001), const{" "}
              <code>NOTIFICATION_TYPES</code> in schema.ts, i18n{" "}
              <code>types.*</code> in notifications.json. Aggiungere un tipo
              richiede sync di tutti e tre.
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
