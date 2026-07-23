-- ============================================================
-- 0004_campaigns_content.sql
-- Campaigns, recipients, send queue, content posts, post automations,
-- IG templates, IG comments + RLS. Idempotent.
-- ============================================================

-- ---------- campaigns ----------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_account_id    UUID REFERENCES public.instagram_accounts,
  name             TEXT NOT NULL,
  type             campaign_type NOT NULL,
  status           campaign_status DEFAULT 'draft',
  message_text     TEXT,
  media_url        TEXT,
  media_type       VARCHAR(20),
  template_id      UUID,
  audience_type    VARCHAR(30),
  audience_filter  JSONB DEFAULT '{}',
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  sent_count       INTEGER DEFAULT 0,
  delivered_count  INTEGER DEFAULT 0,
  read_count       INTEGER DEFAULT 0,
  replied_count    INTEGER DEFAULT 0,
  failed_count     INTEGER DEFAULT 0,
  filtered_count   INTEGER DEFAULT 0,
  created_by       UUID REFERENCES public.profiles,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace ON public.campaigns(workspace_id, status);

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- campaign_recipients ----------
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  contact_id      UUID REFERENCES public.contacts,
  ig_user_id      VARCHAR(255),
  status          VARCHAR(20) DEFAULT 'pending',
  ig_message_id   VARCHAR(255),
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  error_message   TEXT,
  conversation_id UUID REFERENCES public.conversations,
  filtered_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_cr_campaign ON public.campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_cr_contact ON public.campaign_recipients(contact_id);

-- ---------- campaign_send_queue (DB-backed queue) ----------
CREATE TABLE IF NOT EXISTS public.campaign_send_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  workspace_id  UUID NOT NULL,
  ig_account_id UUID,
  contact_id    UUID NOT NULL,
  ig_user_id    VARCHAR(255) NOT NULL,
  message       TEXT NOT NULL,
  status        VARCHAR(20) DEFAULT 'pending',
  scheduled_at  TIMESTAMPTZ,
  attempted_at  TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  error_message TEXT,
  retry_count   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_queue_pending ON public.campaign_send_queue(workspace_id, scheduled_at) WHERE status = 'pending';

-- ---------- content_posts ----------
CREATE TABLE IF NOT EXISTS public.content_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_account_id     UUID REFERENCES public.instagram_accounts,
  type              post_type NOT NULL DEFAULT 'feed',
  caption           TEXT,
  first_comment     TEXT,
  hashtags          TEXT[] DEFAULT '{}',
  location_name     TEXT,
  location_id       VARCHAR(255),
  media_urls        TEXT[] DEFAULT '{}',
  media_types       TEXT[] DEFAULT '{}',
  cover_url         TEXT,
  thumbnail_url     TEXT,
  status            VARCHAR(20) DEFAULT 'draft',
  scheduled_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  ig_media_id       VARCHAR(255),
  ig_post_url       TEXT,
  requires_approval BOOLEAN DEFAULT false,
  approved_by       UUID REFERENCES public.profiles,
  approved_at       TIMESTAMPTZ,
  rejected_by       UUID REFERENCES public.profiles,
  rejection_note    TEXT,
  ai_generated      BOOLEAN DEFAULT false,
  ai_prompt         TEXT,
  reach             INTEGER,
  impressions       INTEGER,
  likes             INTEGER,
  comments          INTEGER,
  shares            INTEGER,
  saves             INTEGER,
  engagement_rate   DECIMAL(5,4),
  tags              TEXT[] DEFAULT '{}',
  notes             TEXT,
  created_by        UUID REFERENCES public.profiles,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_workspace ON public.content_posts(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON public.content_posts(workspace_id, scheduled_at) WHERE status = 'scheduled';

DROP TRIGGER IF EXISTS trg_posts_updated_at ON public.content_posts;
CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON public.content_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- post_automations ----------
CREATE TABLE IF NOT EXISTS public.post_automations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_account_id      UUID REFERENCES public.instagram_accounts,
  ig_post_id         VARCHAR(255) NOT NULL,
  ig_post_url        TEXT,
  trigger_type       VARCHAR(20) DEFAULT 'any_comment',
  trigger_keywords   TEXT[] DEFAULT '{}',
  dm_message         TEXT NOT NULL,
  auto_comment_reply TEXT,
  prevent_duplicate  BOOLEAN DEFAULT true,
  is_active          BOOLEAN DEFAULT true,
  campaign_id        UUID REFERENCES public.campaigns,
  trigger_count      INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_auto_workspace ON public.post_automations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_post_auto_post ON public.post_automations(ig_post_id);

-- ---------- ig_templates ----------
CREATE TABLE IF NOT EXISTS public.ig_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT DEFAULT 'MARKETING',
  language         VARCHAR(10) DEFAULT 'en',
  status           TEXT DEFAULT 'pending',
  header_type      VARCHAR(20),
  header_content   TEXT,
  body             TEXT NOT NULL,
  footer           TEXT,
  buttons          JSONB,
  variables        TEXT[] DEFAULT '{}',
  meta_template_id VARCHAR(255),
  rejection_reason TEXT,
  created_by       UUID REFERENCES public.profiles,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- ig_comments ----------
CREATE TABLE IF NOT EXISTS public.ig_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_account_id   UUID REFERENCES public.instagram_accounts,
  ig_comment_id   VARCHAR(255) UNIQUE,
  ig_post_id      VARCHAR(255),
  ig_media_type   VARCHAR(20),
  commenter_ig_id VARCHAR(255),
  commenter_name  TEXT,
  contact_id      UUID REFERENCES public.contacts,
  conversation_id UUID REFERENCES public.conversations,
  text            TEXT,
  timestamp       TIMESTAMPTZ,
  is_hidden       BOOLEAN DEFAULT false,
  replied_at      TIMESTAMPTZ,
  reply_text      TEXT,
  dm_sent         BOOLEAN DEFAULT false,
  dm_message_id   UUID REFERENCES public.messages,
  sentiment       VARCHAR(20),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_workspace ON public.ig_comments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON public.ig_comments(ig_post_id);

-- ---------- RLS (workspace-member read; writes via service-role) ----------
ALTER TABLE public.campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_send_queue  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_automations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_comments          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_member ON public.campaigns;
CREATE POLICY campaigns_member ON public.campaigns FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS cr_member ON public.campaign_recipients;
CREATE POLICY cr_member ON public.campaign_recipients FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS posts_member ON public.content_posts;
CREATE POLICY posts_member ON public.content_posts FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS post_auto_member ON public.post_automations;
CREATE POLICY post_auto_member ON public.post_automations FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS templates_member ON public.ig_templates;
CREATE POLICY templates_member ON public.ig_templates FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS comments_member ON public.ig_comments;
CREATE POLICY comments_member ON public.ig_comments FOR SELECT USING (public.is_workspace_member(workspace_id));
-- send_queue: no client policy (service-role only).
