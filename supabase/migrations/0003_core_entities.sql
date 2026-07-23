-- ============================================================
-- 0003_core_entities.sql
-- Instagram accounts, contacts, conversations, messages, leads,
-- notifications + triggers + RLS. Idempotent.
-- ============================================================

-- ---------- instagram_accounts (first channel; module 28 generalizes later) ----------
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_user_id         VARCHAR(255) NOT NULL,
  page_id            VARCHAR(255),
  username           VARCHAR(255),
  name               TEXT,
  profile_pic        TEXT,
  followers_count    INTEGER,
  following_count    INTEGER,
  media_count        INTEGER,
  is_verified        BOOLEAN DEFAULT false,
  access_token       TEXT,
  token_expires_at   TIMESTAMPTZ,
  last_token_refresh TIMESTAMPTZ DEFAULT NOW(),
  webhook_verified   BOOLEAN DEFAULT false,
  is_active          BOOLEAN DEFAULT true,
  category           TEXT,
  website            TEXT,
  biography          TEXT,
  connected_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, ig_user_id)
);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_workspace ON public.instagram_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_page_id ON public.instagram_accounts(page_id);

-- ---------- contacts ----------
CREATE TABLE IF NOT EXISTS public.contacts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_user_id              VARCHAR(255),
  ig_username             VARCHAR(255),
  ig_name                 TEXT,
  ig_profile_pic          TEXT,
  ig_followers_count      INTEGER,
  ig_is_verified          BOOLEAN DEFAULT false,
  ig_account_type         VARCHAR(30),
  email                   VARCHAR(255),
  phone                   VARCHAR(50),
  full_name               TEXT,
  company                 TEXT,
  location                TEXT,
  website                 TEXT,
  bio                     TEXT,
  tags                    TEXT[] DEFAULT '{}',
  custom_fields           JSONB DEFAULT '{}',
  lifecycle_stage         VARCHAR(20) DEFAULT 'lead',
  is_vip                  BOOLEAN DEFAULT false,
  is_blocked              BOOLEAN DEFAULT false,
  opted_out               BOOLEAN DEFAULT false,
  last_user_message_at    TIMESTAMPTZ,
  source                  VARCHAR(50) DEFAULT 'dm',
  source_post_id          VARCHAR(255),
  source_ig_account_id    UUID REFERENCES public.instagram_accounts,
  total_messages_sent     INTEGER DEFAULT 0,
  total_messages_received INTEGER DEFAULT 0,
  total_comments          INTEGER DEFAULT 0,
  total_story_replies     INTEGER DEFAULT 0,
  lead_score              SMALLINT CHECK (lead_score BETWEEN 0 AND 100),
  buy_signals             TEXT[] DEFAULT '{}',
  best_send_hour          SMALLINT CHECK (best_send_hour BETWEEN 0 AND 23),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, ig_user_id)
);
CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON public.contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_ig_user ON public.contacts(workspace_id, ig_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON public.contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_last_msg ON public.contacts(workspace_id, last_user_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle ON public.contacts(workspace_id, lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_fts ON public.contacts USING GIN(
  to_tsvector('english', coalesce(full_name,'') || ' ' || coalesce(ig_username,'') || ' ' || coalesce(ig_name,''))
);

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- conversations ----------
CREATE TABLE IF NOT EXISTS public.conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_account_id        UUID REFERENCES public.instagram_accounts ON DELETE SET NULL,
  contact_id           UUID REFERENCES public.contacts ON DELETE SET NULL,
  assigned_agent_id    UUID REFERENCES public.profiles,
  status               conversation_status DEFAULT 'open',
  channel              VARCHAR(20) DEFAULT 'dm',
  post_id              VARCHAR(255),
  post_url             TEXT,
  story_id             VARCHAR(255),
  live_id              VARCHAR(255),
  last_message         TEXT,
  last_message_at      TIMESTAMPTZ,
  last_user_message_at TIMESTAMPTZ,
  unread_count         INTEGER DEFAULT 0,
  labels               TEXT[] DEFAULT '{}',
  is_pinned            BOOLEAN DEFAULT false,
  is_starred           BOOLEAN DEFAULT false,
  snoozed_until        TIMESTAMPTZ,
  resolved_at          TIMESTAMPTZ,
  bot_paused           BOOLEAN DEFAULT false,
  meta                 JSONB DEFAULT '{}',
  first_replied_at     TIMESTAMPTZ,
  sla_first_breach     BOOLEAN DEFAULT false,
  sla_resolve_breach   BOOLEAN DEFAULT false,
  sentiment            VARCHAR(20) DEFAULT 'neutral',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, ig_account_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_workspace ON public.conversations(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_conv_agent ON public.conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON public.conversations(workspace_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_contact ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conv_labels ON public.conversations USING GIN(labels);

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- messages ----------
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  sender_type     VARCHAR(20) NOT NULL,
  sender_id       UUID,
  direction       message_direction NOT NULL,
  type            message_type NOT NULL DEFAULT 'text',
  content         TEXT,
  media_url       TEXT,
  media_url_local TEXT,
  media_mime_type TEXT,
  media_size      BIGINT,
  media_filename  TEXT,
  caption         TEXT,
  ig_message_id   VARCHAR(255) UNIQUE,
  status          message_status DEFAULT 'sent',
  is_deleted      BOOLEAN DEFAULT false,
  reply_to_id     UUID REFERENCES public.messages,
  reactions       JSONB DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_workspace ON public.messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_msg_ig_id ON public.messages(ig_message_id);

-- ---------- leads ----------
CREATE TABLE IF NOT EXISTS public.leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  contact_id        UUID REFERENCES public.contacts ON DELETE SET NULL,
  conversation_id   UUID REFERENCES public.conversations ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES public.profiles,
  title             TEXT,
  stage             lead_stage DEFAULT 'new',
  value             DECIMAL(12,2),
  currency          VARCHAR(3) DEFAULT 'INR',
  priority          VARCHAR(10) DEFAULT 'medium',
  source            VARCHAR(50),
  notes             TEXT,
  tags              TEXT[] DEFAULT '{}',
  custom_fields     JSONB DEFAULT '{}',
  follow_up_at      TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  temperature       VARCHAR(10) DEFAULT 'cold',
  ai_score          INTEGER CHECK (ai_score BETWEEN 0 AND 100),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_workspace ON public.leads(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_contact ON public.leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_agent ON public.leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON public.leads(workspace_id, temperature);

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- notifications ----------
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  data         JSONB DEFAULT '{}',
  is_read      BOOLEAN DEFAULT false,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- Triggers on messages
-- ============================================================

-- Update conversation aggregate fields on new message.
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE conversations SET
    last_message = LEFT(COALESCE(NEW.content, '[media]'), 500),
    last_message_at = NEW.created_at,
    last_user_message_at = CASE WHEN NEW.direction = 'inbound' THEN NEW.created_at ELSE last_user_message_at END,
    unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_conv_on_message ON public.messages;
CREATE TRIGGER trg_conv_on_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();

-- Update contact.last_user_message_at on inbound message.
CREATE OR REPLACE FUNCTION public.update_contact_last_message_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contact_id UUID;
BEGIN
  IF NEW.direction = 'inbound' THEN
    SELECT contact_id INTO v_contact_id FROM conversations WHERE id = NEW.conversation_id;
    IF v_contact_id IS NOT NULL THEN
      UPDATE contacts SET last_user_message_at = NEW.created_at, updated_at = NOW()
      WHERE id = v_contact_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_contact_last_message ON public.messages;
CREATE TRIGGER trg_contact_last_message AFTER INSERT ON public.messages
  FOR EACH ROW WHEN (NEW.direction = 'inbound') EXECUTE FUNCTION public.update_contact_last_message_at();

-- Lead temperature by inbound message count (never downgrade).
CREATE OR REPLACE FUNCTION public.classify_temp_by_count(v_count INTEGER)
RETURNS VARCHAR(10) LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v_count >= 8 THEN 'hot' WHEN v_count >= 4 THEN 'warm' ELSE 'cold' END
$$;
CREATE OR REPLACE FUNCTION public.temperature_rank(temp VARCHAR(10))
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE temp WHEN 'hot' THEN 2 WHEN 'warm' THEN 1 ELSE 0 END
$$;
CREATE OR REPLACE FUNCTION public.update_lead_temp_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lead_id UUID; v_current VARCHAR(10); v_count INTEGER; v_count_temp VARCHAR(10);
BEGIN
  IF NEW.sender_type NOT IN ('contact') THEN RETURN NEW; END IF;
  IF NEW.type = 'internal_note' OR NEW.is_deleted THEN RETURN NEW; END IF;
  SELECT id, temperature INTO v_lead_id, v_current FROM leads WHERE conversation_id = NEW.conversation_id LIMIT 1;
  IF v_lead_id IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count FROM messages
    WHERE conversation_id = NEW.conversation_id AND sender_type = 'contact'
      AND type != 'internal_note' AND is_deleted = false;
  v_count_temp := classify_temp_by_count(v_count);
  IF temperature_rank(v_count_temp) > temperature_rank(v_current) THEN
    UPDATE leads SET temperature = v_count_temp, updated_at = NOW() WHERE id = v_lead_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_temp_on_message ON public.messages;
CREATE TRIGGER trg_lead_temp_on_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_lead_temp_on_message();

-- Notify assigned agent of new inbound message.
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent UUID;
BEGIN
  SELECT assigned_agent_id INTO v_agent FROM conversations WHERE id = NEW.conversation_id;
  IF v_agent IS NOT NULL THEN
    INSERT INTO notifications (workspace_id, user_id, type, title, body, data)
    VALUES (NEW.workspace_id, v_agent, 'new_message', 'New message',
            LEFT(COALESCE(NEW.content, '[media]'), 100),
            jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message AFTER INSERT ON public.messages
  FOR EACH ROW WHEN (NEW.direction = 'inbound') EXECUTE FUNCTION public.notify_on_new_message();

-- Assignment notifications (conversations + leads).
CREATE OR REPLACE FUNCTION public.notify_on_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_agent_id IS NOT NULL AND NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    INSERT INTO notifications (workspace_id, user_id, type, title, data)
    VALUES (NEW.workspace_id, NEW.assigned_agent_id, TG_ARGV[0], 'New item assigned to you',
            jsonb_build_object('id', NEW.id, 'type', TG_ARGV[0]));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_conversation_assigned ON public.conversations;
CREATE TRIGGER trg_conversation_assigned AFTER UPDATE OF assigned_agent_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment('conversation_assigned');
DROP TRIGGER IF EXISTS trg_lead_assigned ON public.leads;
CREATE TRIGGER trg_lead_assigned AFTER UPDATE OF assigned_agent_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment('lead_assigned');

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ig_accounts_member ON public.instagram_accounts;
CREATE POLICY ig_accounts_member ON public.instagram_accounts
  FOR SELECT USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS contacts_member ON public.contacts;
CREATE POLICY contacts_member ON public.contacts
  FOR SELECT USING (public.is_workspace_member(workspace_id));

-- Conversations & leads honour agent assignment isolation.
DROP POLICY IF EXISTS conversations_assigned ON public.conversations;
CREATE POLICY conversations_assigned ON public.conversations
  FOR SELECT USING (public.can_view_assigned_row(workspace_id, assigned_agent_id));

DROP POLICY IF EXISTS leads_assigned ON public.leads;
CREATE POLICY leads_assigned ON public.leads
  FOR SELECT USING (public.can_view_assigned_row(workspace_id, assigned_agent_id));

DROP POLICY IF EXISTS messages_member ON public.messages;
CREATE POLICY messages_member ON public.messages
  FOR SELECT USING (public.is_workspace_member(workspace_id));

-- Notifications are per-user.
DROP POLICY IF EXISTS notifications_own ON public.notifications;
CREATE POLICY notifications_own ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_own_update ON public.notifications;
CREATE POLICY notifications_own_update ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());
