-- =============================================================================
-- Module: Notifications (social end-user) — 001 init
-- =============================================================================
-- Scopo: notifiche per gli end-user del modulo social. Distinto dal sistema
-- core `admin_notifications` (notifiche di sistema per gli admin).
--
-- Architettura zero-latency: trigger plpgsql AFTER INSERT su `posts_outbox`
-- fa fanout su `notifications`. Niente cron, niente consumer applicativo:
--   1. posts_reactions/comments/mentions/repost INSERT
--   2. trigger posts esistente (M_posts_002/008) → INSERT in posts_outbox
--   3. trigger NUOVO `posts_outbox_to_notifications_trg` → fanout su
--      `notifications` con dedup check + skip self-notify
--   4. client UI subscribe via Supabase Realtime su notifications:user_id=me
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 1) Tabella notifications ─────────────────────────────────────────────
-- Lista delle notifiche per gli end-user. Root del modulo (no prefix).
-- user_id    = destinatario (chi vede la notifica)
-- actor_id   = chi ha causato l'evento (es. chi ha messo la reaction)
-- type       = match 1:1 con posts_outbox.event_type
-- post_id    = contesto principale (es. il post al quale hanno reagito)
-- comment_id = contesto secondario (per eventi comment-related)
-- payload    = jsonb passato 1:1 dall'outbox (es. reaction kind)
-- read_at    = NULL = unread; settato a NOW() su mark-as-read

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"         uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  "user_id"    uuid          NOT NULL REFERENCES "users"("id")          ON DELETE CASCADE,
  "type"       varchar(64)   NOT NULL,
  "actor_id"   uuid          REFERENCES "users"("id")                   ON DELETE SET NULL,
  "post_id"    uuid          REFERENCES "posts"("id")                   ON DELETE CASCADE,
  "comment_id" uuid          REFERENCES "posts_comments"("id")          ON DELETE CASCADE,
  "payload"    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  "read_at"    timestamptz,
  "created_at" timestamptz   NOT NULL DEFAULT NOW()
);

-- Indice lista cronologica per user (default ordering nella UI)
CREATE INDEX IF NOT EXISTS "idx_notifications_user_recent"
  ON "notifications" ("user_id", "created_at" DESC);

-- Indice parziale unread (badge counter sidebar): solo le righe non lette.
-- Molto compatto, copre il pattern `WHERE user_id=? AND read_at IS NULL`.
CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread"
  ON "notifications" ("user_id", "created_at" DESC)
  WHERE "read_at" IS NULL;

-- Indice per dedup lookup nel trigger: cerca (user, type, post, actor)
-- nelle ultime N minuti. Composito coerente con la WHERE del trigger.
CREATE INDEX IF NOT EXISTS "idx_notifications_dedup"
  ON "notifications" ("user_id", "type", "post_id", "actor_id", "created_at" DESC);


-- ── 2) Trigger plpgsql: posts_outbox → notifications fanout ──────────────
-- Consumer ZERO-LATENCY del posts_outbox. Sostituisce un eventuale cron
-- worker — Vercel non ha worker permanenti a cui subscribare via Realtime,
-- mentre un trigger DB esegue dentro la stessa transazione dell'INSERT
-- dell'evento, quindi la notifica è disponibile prima ancora che il
-- caller veda la response.
--
-- Dedup check incluso: legge la finestra (default 60min) da app_settings
-- modules.notifications.dedup_window_minutes — modificabile da admin senza
-- migration. Sub-query su PK = costo trascurabile per trigger row-level.
--
-- Skip self-notify: se actor == recipient (es. ti dai un like da solo),
-- l'evento viene marcato processed senza creare notifica.
--
-- Unknown event_type → marca processed e skip (forward-compat: se domani
-- aggiungiamo nuovi tipi outbox, non rompiamo questo trigger).

CREATE OR REPLACE FUNCTION notifications_fanout_from_outbox()
RETURNS trigger AS $$
DECLARE
  v_recipient_id  uuid;
  v_actor_id      uuid;
  v_post_id       uuid;
  v_comment_id    uuid;
  v_dedup_minutes int;
BEGIN
  -- Settings lookup. COALESCE a 60 se la chiave manca o non è int.
  SELECT NULLIF(value, '')::int INTO v_dedup_minutes
  FROM app_settings
  WHERE key = 'modules.notifications.dedup_window_minutes';
  v_dedup_minutes := COALESCE(v_dedup_minutes, 60);

  -- Estrai recipient/actor/context dal payload per tipo evento.
  CASE NEW.event_type
    WHEN 'post.reaction.added' THEN
      v_post_id  := (NEW.payload->>'post_id')::uuid;
      v_actor_id := (NEW.payload->>'actor_id')::uuid;
      SELECT author_id INTO v_recipient_id FROM posts WHERE id = v_post_id;

    WHEN 'post.comment.created' THEN
      v_post_id    := (NEW.payload->>'post_id')::uuid;
      v_comment_id := (NEW.payload->>'comment_id')::uuid;
      v_actor_id   := (NEW.payload->>'actor_id')::uuid;
      SELECT author_id INTO v_recipient_id FROM posts WHERE id = v_post_id;

    WHEN 'post.comment.reaction.added' THEN
      v_comment_id := (NEW.payload->>'comment_id')::uuid;
      v_post_id    := (NEW.payload->>'post_id')::uuid;
      v_actor_id   := (NEW.payload->>'actor_id')::uuid;
      SELECT author_id INTO v_recipient_id FROM posts_comments WHERE id = v_comment_id;

    WHEN 'post.mention' THEN
      v_post_id       := (NEW.payload->>'post_id')::uuid;
      v_recipient_id  := (NEW.payload->>'mentioned_user_id')::uuid;
      -- actor = autore del post che ha menzionato
      SELECT author_id INTO v_actor_id FROM posts WHERE id = v_post_id;

    WHEN 'post.repost.created' THEN
      -- Notifico l'autore del TARGET (chi è stato quotato), non del nuovo post
      v_post_id  := (NEW.payload->>'target_post_id')::uuid;
      v_actor_id := (NEW.payload->>'actor_id')::uuid;
      SELECT author_id INTO v_recipient_id FROM posts WHERE id = v_post_id;

    ELSE
      -- Tipo non gestito (forward-compat): marca processed e skip.
      UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
      RETURN NEW;
  END CASE;

  -- Skip se non ho un destinatario valido o se actor == destinatario.
  IF v_recipient_id IS NULL OR v_recipient_id = v_actor_id THEN
    UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Dedup check entro la finestra. IS NOT DISTINCT FROM gestisce NULL.
  PERFORM 1 FROM notifications
  WHERE user_id    = v_recipient_id
    AND type       = NEW.event_type
    AND post_id    IS NOT DISTINCT FROM v_post_id
    AND actor_id   IS NOT DISTINCT FROM v_actor_id
    AND created_at > NOW() - (v_dedup_minutes || ' minutes')::interval
  LIMIT 1;
  IF FOUND THEN
    UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Fanout effettivo.
  INSERT INTO notifications (user_id, type, actor_id, post_id, comment_id, payload)
  VALUES (v_recipient_id, NEW.event_type, v_actor_id, v_post_id, v_comment_id, NEW.payload);

  UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_outbox_to_notifications_trg ON posts_outbox;
CREATE TRIGGER posts_outbox_to_notifications_trg
  AFTER INSERT ON posts_outbox
  FOR EACH ROW EXECUTE FUNCTION notifications_fanout_from_outbox();


-- ── 3) Row Level Security ────────────────────────────────────────────────
-- Pattern conservativo: l'utente legge/aggiorna SOLO le proprie notifiche.
-- INSERT solo via service role (cioè dal trigger SQL sopra). DELETE: solo
-- service role per ora (UI non espone delete; cleanup eventuale via cron).

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON "notifications";
CREATE POLICY "notifications_select_own"
  ON "notifications"
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON "notifications";
CREATE POLICY "notifications_update_own"
  ON "notifications"
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── 4) Supabase Realtime (publication) ───────────────────────────────────
-- Aggiungi la tabella alla publication 'supabase_realtime' così il client
-- può subscribare ai Postgres Changes. RLS è ENFORCED anche su realtime
-- → un client subscribed riceve solo le sue notifiche (auth.uid match).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    EXCEPTION WHEN duplicate_object THEN
      -- già presente, idempotent
      NULL;
    END;
  END IF;
END$$;


-- ── 5) Settings di default ───────────────────────────────────────────────

INSERT INTO app_settings (key, value)
VALUES
  ('modules.notifications.dedup_window_minutes', '60'),
  ('modules.notifications.list_page_size', '30'),
  ('modules.notifications.retention_days', '180')
ON CONFLICT (key) DO NOTHING;


-- ── 6) Permission RBAC ───────────────────────────────────────────────────
-- Permission base del modulo. Auto-grantato ad admin via permissions-seed
-- al boot (legge INSTALLED_MODULES). Niente extra-permission per ora
-- (no moderation/admin-side delete in V1).

INSERT INTO "permissions" ("key", "label", "group", "is_system") VALUES
  ('modules:notifications', 'Access Notifications module', 'Modules', true)
ON CONFLICT ("key") DO NOTHING;

-- Auto-grant al ruolo admin
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name = 'admin' AND p.key = 'modules:notifications'
ON CONFLICT DO NOTHING;
