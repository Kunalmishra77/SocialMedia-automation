-- ============================================================
-- 0006_influencer_ops.sql
-- Influencers, insights, and operational/support tables. Idempotent.
-- ============================================================

-- ---------- influencers ----------
CREATE TABLE IF NOT EXISTS public.influencers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  contact_id          UUID REFERENCES public.contacts ON DELETE SET NULL,
  ig_username         VARCHAR(255),
  name                TEXT,
  email               VARCHAR(255),
  phone               VARCHAR(50),
  category            TEXT,
  niche               TEXT[],
  location            TEXT,
  followers_count     INTEGER,
  following_count     INTEGER,
  avg_engagement_rate DECIMAL(5,4),
  avg_likes           INTEGER,
  avg_comments        INTEGER,
  profile_pic         TEXT,
  bio                 TEXT,
  website             TEXT,
  rate_per_post       DECIMAL(12,2),
  rate_per_reel       DECIMAL(12,2),
  rate_per_story      DECIMAL(12,2),
  currency            VARCHAR(3) DEFAULT 'INR',
  status              VARCHAR(20) DEFAULT 'prospect',
  notes               TEXT,
  tags                TEXT[] DEFAULT '{}',
  custom_fields       JSONB DEFAULT '{}',
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_influencers_workspace ON public.influencers(workspace_id);

CREATE TABLE IF NOT EXISTS public.influencer_collaborations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  influencer_id  UUID NOT NULL REFERENCES public.influencers ON DELETE CASCADE,
  name           TEXT NOT NULL,
  type           VARCHAR(30),
  status         VARCHAR(20) DEFAULT 'planned',
  brief          TEXT,
  deliverables   JSONB DEFAULT '[]',
  amount         DECIMAL(12,2),
  currency       VARCHAR(3) DEFAULT 'INR',
  payment_status VARCHAR(20) DEFAULT 'pending',
  payment_due_at TIMESTAMPTZ,
  start_date     DATE,
  end_date       DATE,
  ig_post_ids    TEXT[],
  reach          INTEGER,
  impressions    INTEGER,
  engagement     INTEGER,
  conversions    INTEGER,
  roi            DECIMAL(8,2),
  notes          TEXT,
  contract_url   TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- IG insights ----------
CREATE TABLE IF NOT EXISTS public.ig_story_reactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_account_id  UUID REFERENCES public.instagram_accounts,
  story_id       VARCHAR(255),
  reactor_ig_id  VARCHAR(255),
  contact_id     UUID REFERENCES public.contacts,
  reaction_type  VARCHAR(30),
  message        TEXT,
  reaction_emoji TEXT,
  received_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ig_media_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_account_id   UUID REFERENCES public.instagram_accounts,
  ig_media_id     VARCHAR(255),
  media_type      VARCHAR(20),
  permalink       TEXT,
  thumbnail       TEXT,
  caption_snippet TEXT,
  reach           INTEGER DEFAULT 0,
  impressions     INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  saves           INTEGER DEFAULT 0,
  video_views     INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,4),
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  published_at    TIMESTAMPTZ,
  UNIQUE (ig_media_id)
);

CREATE TABLE IF NOT EXISTS public.ig_account_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_account_id   UUID REFERENCES public.instagram_accounts,
  date            DATE NOT NULL,
  followers_count INTEGER,
  followers_gained INTEGER,
  followers_lost  INTEGER,
  reach           INTEGER,
  impressions     INTEGER,
  profile_views   INTEGER,
  website_clicks  INTEGER,
  email_contacts  INTEGER,
  UNIQUE (ig_account_id, date)
);

-- ---------- content helpers ----------
CREATE TABLE IF NOT EXISTS public.hashtag_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  hashtags     TEXT[] DEFAULT '{}',
  description  TEXT,
  use_count    INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.caption_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  content      TEXT NOT NULL,
  post_type    post_type,
  tags         TEXT[] DEFAULT '{}',
  use_count    INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.meta_ads_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  ig_account_id UUID REFERENCES public.instagram_accounts,
  form_id       VARCHAR(255),
  lead_id       VARCHAR(255) UNIQUE,
  campaign_id   VARCHAR(255),
  adset_id      VARCHAR(255),
  ad_id         VARCHAR(255),
  contact_id    UUID REFERENCES public.contacts,
  lead_id_ref   UUID REFERENCES public.leads,
  field_data    JSONB DEFAULT '{}',
  created_time  TIMESTAMPTZ,
  synced_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Operational / support tables ----------
CREATE TABLE IF NOT EXISTS public.team_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  email        VARCHAR(255) NOT NULL,
  role         user_role NOT NULL DEFAULT 'agent',
  token        VARCHAR(64) UNIQUE NOT NULL,
  status       VARCHAR(20) DEFAULT 'pending',
  invited_by   UUID REFERENCES public.profiles,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invites_workspace ON public.team_invites(workspace_id);

CREATE TABLE IF NOT EXISTS public.workspace_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  session_token VARCHAR(64) UNIQUE NOT NULL,
  user_agent    TEXT,
  ip_address    INET,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ws_sessions_expiry ON public.workspace_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  shortcut     VARCHAR(50),
  title        TEXT,
  content      TEXT NOT NULL,
  created_by   UUID REFERENCES public.profiles,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inbox_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_active    BOOLEAN DEFAULT true,
  priority     INTEGER DEFAULT 0,
  conditions   JSONB DEFAULT '{}',
  actions      JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.follow_up_sequences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_active    BOOLEAN DEFAULT true,
  steps        JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contact_sequences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  sequence_id   UUID NOT NULL REFERENCES public.follow_up_sequences ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES public.contacts ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations,
  current_step  INTEGER DEFAULT 0,
  status        VARCHAR(20) DEFAULT 'active',
  next_send_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_seq_due ON public.contact_sequences(status, next_send_at);

CREATE TABLE IF NOT EXISTS public.sla_policies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  first_response_minutes INTEGER DEFAULT 60,
  resolve_minutes INTEGER,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_hours (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL,
  open_time    TIME,
  close_time   TIME,
  is_closed    BOOLEAN DEFAULT false,
  UNIQUE (workspace_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  actor_id     UUID,
  action       VARCHAR(60) NOT NULL,
  entity_type  VARCHAR(40),
  entity_id    UUID,
  metadata     JSONB DEFAULT '{}',
  occurred_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_workspace ON public.activity_log(workspace_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.csat_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations ON DELETE CASCADE,
  contact_id      UUID REFERENCES public.contacts,
  score           SMALLINT,
  comment         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_prefix   VARCHAR(12) NOT NULL,
  key_hash     TEXT NOT NULL,
  scopes       TEXT[] DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_by   UUID REFERENCES public.profiles,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  url          TEXT NOT NULL,
  events       TEXT[] DEFAULT '{}',
  secret       TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id  UUID NOT NULL REFERENCES public.webhook_endpoints ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  event        TEXT NOT NULL,
  payload      JSONB,
  status_code  INTEGER,
  success      BOOLEAN,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_usage_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  metric       VARCHAR(40) NOT NULL,
  quantity     INTEGER DEFAULT 1,
  metadata     JSONB DEFAULT '{}',
  occurred_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_workspace ON public.platform_usage_logs(workspace_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.ig_webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces ON DELETE CASCADE,
  object_type  VARCHAR(40),
  payload      JSONB NOT NULL,
  signature    TEXT,
  status       VARCHAR(20) DEFAULT 'received',
  error        TEXT,
  received_at  TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ig_events_status ON public.ig_webhook_events(status, received_at);

-- ---------- RLS (workspace-member read for user-facing tables) ----------
ALTER TABLE public.influencers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_story_reactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_media_insights         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_account_insights       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtag_groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caption_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_rules               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_sequences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_sequences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csat_responses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_api_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_usage_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_webhook_events         ENABLE ROW LEVEL SECURITY;

-- Member-read policies for the tables the customer UI queries directly.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'influencers','influencer_collaborations','hashtag_groups','caption_templates',
    'quick_replies','inbox_rules','follow_up_sequences','sla_policies','business_hours',
    'ig_media_insights','ig_account_insights','activity_log'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_member ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_member ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id))',
      t, t);
  END LOOP;
END $$;
-- Sensitive tables (team_invites, workspace_sessions, api_keys, webhooks, usage,
-- ig_webhook_events, meta_ads_leads) have NO client policy — service-role only.
