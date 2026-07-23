# 04 — Database Schema

All migrations live in `database/migrations/`. Files are numbered `001_*.sql`, `002_*.sql`, etc. Every migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`).

Run migrations via `node scripts/migrate.js` (see `23-devops.md`).

---

## Enums (migration 001)

```sql
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'manager', 'agent');

CREATE TYPE conversation_status AS ENUM (
  'open', 'assigned', 'resolved', 'pending', 'snoozed'
);

CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

CREATE TYPE message_status AS ENUM (
  'queued', 'sent', 'delivered', 'read', 'failed'
);

CREATE TYPE message_type AS ENUM (
  'text', 'image', 'video', 'audio', 'share',
  'story_reply', 'story_mention', 'comment',
  'quick_reply', 'template', 'generic_template',
  'internal_note', 'reaction', 'reel_share', 'location'
);

CREATE TYPE lead_stage AS ENUM (
  'new', 'contacted', 'follow_up', 'interested', 'converted', 'lost'
);

CREATE TYPE campaign_status AS ENUM (
  'draft', 'scheduled', 'running', 'paused', 'completed', 'failed'
);

CREATE TYPE campaign_type AS ENUM (
  'window_broadcast', 'story_engagement', 'post_comment',
  're_engagement', 'segment', 'reel_engagement'
);

CREATE TYPE post_type AS ENUM (
  'feed', 'reel', 'carousel', 'story', 'live'
);
```

---

## Core Tables

### profiles (migration 001)
```sql
CREATE TABLE public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name      TEXT,
  email          TEXT UNIQUE,
  avatar_url     TEXT,
  phone          TEXT,
  timezone       TEXT DEFAULT 'Asia/Kolkata',
  preferences    JSONB DEFAULT '{}',
  last_seen_at   TIMESTAMPTZ,
  is_platform_admin BOOLEAN DEFAULT false,
  expertise_tags TEXT[] DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
-- Trigger: on_auth_user_created (auto-insert from auth.users)
-- Trigger: set_updated_at
```

### workspaces (migration 001)
```sql
CREATE TABLE public.workspaces (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  slug                     TEXT UNIQUE NOT NULL,
  logo_url                 TEXT,
  plan                     TEXT NOT NULL DEFAULT 'free',
  is_active                BOOLEAN DEFAULT true,
  onboarding_complete      BOOLEAN DEFAULT false,
  owner_email              TEXT,
  industry                 TEXT,
  subscription_status      TEXT DEFAULT 'active',
  razorpay_subscription_id TEXT,
  next_billing_date        TIMESTAMPTZ,
  payment_failed_at        TIMESTAMPTZ,
  brand_color              TEXT DEFAULT '#E1306C',
  custom_domain            TEXT,
  plan_limits              JSONB DEFAULT '{}',
  settings                 JSONB DEFAULT '{}',
  -- settings keys used:
  -- agent_persona TEXT
  -- llm_config JSONB
  -- max_sessions INTEGER
  -- google_calendar_refresh_token TEXT
  -- google_calendar_id TEXT
  -- sheets_webhook_url TEXT
  -- retention_months INTEGER
  -- auto_window_warning BOOLEAN
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_workspaces_slug ON workspaces(slug);
```

### workspace_members (migration 001)
```sql
CREATE TABLE public.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'agent',
  is_online    BOOLEAN DEFAULT false,
  max_chats    INTEGER DEFAULT 10,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_wm_user ON workspace_members(user_id);
```

---

### instagram_accounts (migration 002)
```sql
CREATE TABLE public.instagram_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_user_id         VARCHAR(255) NOT NULL,  -- Instagram Business Account ID
  page_id            VARCHAR(255) NOT NULL,  -- Connected Facebook Page ID
  username           VARCHAR(255),
  name               TEXT,
  profile_pic        TEXT,
  followers_count    INTEGER,
  following_count    INTEGER,
  media_count        INTEGER,
  is_verified        BOOLEAN DEFAULT false,
  access_token       TEXT NOT NULL,
  token_expires_at   TIMESTAMPTZ,
  last_token_refresh TIMESTAMPTZ DEFAULT NOW(),
  webhook_verified   BOOLEAN DEFAULT false,
  is_active          BOOLEAN DEFAULT true,
  category           TEXT,               -- e.g. "Beauty, cosmetic & personal care"
  website            TEXT,
  biography          TEXT,
  connected_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, ig_user_id)
);
CREATE INDEX idx_ig_accounts_workspace ON instagram_accounts(workspace_id);
CREATE INDEX idx_ig_accounts_page_id ON instagram_accounts(page_id);
```

---

### contacts (migration 003)
```sql
CREATE TABLE public.contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_user_id            VARCHAR(255),
  ig_username           VARCHAR(255),    -- may change; always fetch fresh
  ig_name               TEXT,
  ig_profile_pic        TEXT,
  ig_followers_count    INTEGER,
  ig_is_verified        BOOLEAN DEFAULT false,
  ig_account_type       VARCHAR(30),     -- personal|business|creator
  
  -- Enriched fields (collected via form, flow, or manual entry)
  email                 VARCHAR(255),
  phone                 VARCHAR(50),
  full_name             TEXT,            -- override for IG display name
  company               TEXT,
  location              TEXT,
  website               TEXT,
  bio                   TEXT,
  
  -- Segmentation
  tags                  TEXT[] DEFAULT '{}',
  custom_fields         JSONB DEFAULT '{}',
  lifecycle_stage       VARCHAR(20) DEFAULT 'lead',
  is_vip                BOOLEAN DEFAULT false,
  is_blocked            BOOLEAN DEFAULT false,
  opted_out             BOOLEAN DEFAULT false,
  
  -- Window tracking (CRITICAL)
  last_user_message_at  TIMESTAMPTZ,  -- updated on every inbound message
  
  -- Source tracking
  source                VARCHAR(50) DEFAULT 'dm',
  -- dm|comment|story_reply|story_mention|reel_comment|import|manual|lead_ad
  source_post_id        VARCHAR(255),
  source_ig_account_id  UUID REFERENCES instagram_accounts,
  
  -- Engagement stats
  total_messages_sent     INTEGER DEFAULT 0,
  total_messages_received INTEGER DEFAULT 0,
  total_comments          INTEGER DEFAULT 0,
  total_story_replies     INTEGER DEFAULT 0,
  
  -- AI enrichment
  lead_score            SMALLINT CHECK (lead_score BETWEEN 0 AND 100),
  buy_signals           TEXT[] DEFAULT '{}',
  best_send_hour        SMALLINT CHECK (best_send_hour BETWEEN 0 AND 23),
  
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE (workspace_id, ig_user_id)
);
CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_ig_user ON contacts(workspace_id, ig_user_id);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX idx_contacts_last_msg ON contacts(workspace_id, last_user_message_at DESC NULLS LAST);
CREATE INDEX idx_contacts_lifecycle ON contacts(workspace_id, lifecycle_stage);
-- FTS index for search
CREATE INDEX idx_contacts_fts ON contacts USING GIN(
  to_tsvector('english', coalesce(full_name,'') || ' ' || coalesce(ig_username,'') || ' ' || coalesce(ig_name,''))
);

-- Trigger: update last_user_message_at on inbound message insert
```

---

### conversations (migration 004)
```sql
CREATE TABLE public.conversations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id         UUID REFERENCES instagram_accounts ON DELETE SET NULL,
  contact_id            UUID REFERENCES contacts ON DELETE SET NULL,
  assigned_agent_id     UUID REFERENCES profiles,
  status                conversation_status DEFAULT 'open',
  
  -- Channel type
  channel               VARCHAR(20) DEFAULT 'dm',
  -- dm|comment|story_reply|story_mention|reel_comment|live

  -- Channel-specific context
  post_id               VARCHAR(255),   -- for comment channel
  post_url              TEXT,           -- for display
  story_id              VARCHAR(255),   -- for story_reply/story_mention
  live_id               VARCHAR(255),   -- for live channel
  
  last_message          TEXT,
  last_message_at       TIMESTAMPTZ,
  last_user_message_at  TIMESTAMPTZ,   -- for 24h window
  unread_count          INTEGER DEFAULT 0,
  
  labels                TEXT[] DEFAULT '{}',
  is_pinned             BOOLEAN DEFAULT false,
  is_starred            BOOLEAN DEFAULT false,
  snoozed_until         TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ,
  bot_paused            BOOLEAN DEFAULT false,
  
  meta                  JSONB DEFAULT '{}',
  
  -- SLA
  first_replied_at      TIMESTAMPTZ,
  sla_first_breach      BOOLEAN DEFAULT false,
  sla_resolve_breach    BOOLEAN DEFAULT false,
  
  sentiment             VARCHAR(20) DEFAULT 'neutral',
  
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE (workspace_id, ig_account_id, contact_id)
  -- One conversation per contact per IG account
);
CREATE INDEX idx_conv_workspace ON conversations(workspace_id, status);
CREATE INDEX idx_conv_agent ON conversations(assigned_agent_id);
CREATE INDEX idx_conv_last_msg ON conversations(workspace_id, last_message_at DESC);
CREATE INDEX idx_conv_contact ON conversations(contact_id);
CREATE INDEX idx_conv_labels ON conversations USING GIN(labels);

-- Triggers:
-- update_conversation_last_message() — AFTER INSERT ON messages
-- trg_conversation_assigned → notify_on_assignment()
```

---

### messages (migration 005)
```sql
CREATE TABLE public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  sender_type     VARCHAR(20) NOT NULL,  -- contact|bot|agent|campaign|system
  sender_id       UUID,
  direction       message_direction NOT NULL,
  type            message_type NOT NULL DEFAULT 'text',
  content         TEXT,
  media_url       TEXT,          -- original IG CDN URL (expires ~24h)
  media_url_local TEXT,          -- our Supabase Storage copy
  media_mime_type TEXT,
  media_size      BIGINT,
  media_filename  TEXT,
  caption         TEXT,
  ig_message_id   VARCHAR(255) UNIQUE,  -- Meta's message ID, dedup key
  status          message_status DEFAULT 'sent',
  is_deleted      BOOLEAN DEFAULT false,
  reply_to_id     UUID REFERENCES messages,
  reactions       JSONB DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  -- metadata keys: story_id, post_id, referral, ig_story_url, reel_url
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_msg_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_msg_workspace ON messages(workspace_id);
CREATE INDEX idx_msg_ig_id ON messages(ig_message_id);

-- Triggers:
-- update_conversation_on_message() — update last_message, unread_count, last_user_message_at
-- update_contact_last_message_at() — update contacts.last_user_message_at on inbound
-- trg_lead_temp_on_message() — update lead temperature by count
-- trg_new_message_notify() — notify assigned agent
```

---

### leads (migration 006)
```sql
CREATE TABLE public.leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  contact_id       UUID REFERENCES contacts ON DELETE SET NULL,
  conversation_id  UUID REFERENCES conversations ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES profiles,
  title            TEXT,
  stage            lead_stage DEFAULT 'new',
  value            DECIMAL(12,2),
  currency         VARCHAR(3) DEFAULT 'INR',
  priority         VARCHAR(10) DEFAULT 'medium',  -- low|medium|high|urgent
  source           VARCHAR(50),
  -- dm|comment|story|reel|lead_ad|manual|import
  notes            TEXT,
  tags             TEXT[] DEFAULT '{}',
  custom_fields    JSONB DEFAULT '{}',
  follow_up_at     TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  temperature      VARCHAR(10) DEFAULT 'cold',  -- cold|warm|hot
  ai_score         INTEGER CHECK (ai_score BETWEEN 0 AND 100),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_leads_workspace ON leads(workspace_id, stage);
CREATE INDEX idx_leads_contact ON leads(contact_id);
CREATE INDEX idx_leads_agent ON leads(assigned_agent_id);
CREATE INDEX idx_leads_temperature ON leads(workspace_id, temperature);
-- Trigger: trg_lead_assigned → notify_on_assignment()
```

---

### campaigns + campaign_recipients (migration 007)
```sql
CREATE TABLE public.campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id   UUID REFERENCES instagram_accounts,
  name            TEXT NOT NULL,
  type            campaign_type NOT NULL,
  status          campaign_status DEFAULT 'draft',
  message_text    TEXT,
  media_url       TEXT,
  media_type      VARCHAR(20),
  template_id     UUID,  -- FK to ig_templates
  audience_type   VARCHAR(30),
  audience_filter JSONB DEFAULT '{}',
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  sent_count       INTEGER DEFAULT 0,
  delivered_count  INTEGER DEFAULT 0,
  read_count       INTEGER DEFAULT 0,
  replied_count    INTEGER DEFAULT 0,
  failed_count     INTEGER DEFAULT 0,
  filtered_count   INTEGER DEFAULT 0,
  created_by       UUID REFERENCES profiles,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.campaign_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts,
  ig_user_id      VARCHAR(255),
  status          VARCHAR(20) DEFAULT 'pending',
  ig_message_id   VARCHAR(255),
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  error_message   TEXT,
  conversation_id UUID REFERENCES conversations,
  filtered_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cr_campaign ON campaign_recipients(campaign_id, status);
CREATE INDEX idx_cr_contact ON campaign_recipients(contact_id);
```

---

### content_posts (migration 008)
```sql
CREATE TABLE public.content_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id   UUID REFERENCES instagram_accounts,
  
  -- Content
  type            post_type NOT NULL DEFAULT 'feed',
  caption         TEXT,
  first_comment   TEXT,      -- auto-post as first comment after publish
  hashtags        TEXT[] DEFAULT '{}',
  location_name   TEXT,
  location_id     VARCHAR(255),
  
  -- Media
  media_urls      TEXT[] DEFAULT '{}',
  media_types     TEXT[] DEFAULT '{}',  -- image|video per item
  cover_url       TEXT,                  -- for Reels thumbnail
  thumbnail_url   TEXT,
  
  -- Scheduling
  status          VARCHAR(20) DEFAULT 'draft',
  -- draft|scheduled|publishing|published|failed|archived
  scheduled_at    TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  ig_media_id     VARCHAR(255),   -- from Meta after publish
  ig_post_url     TEXT,           -- permalink after publish
  
  -- Approval workflow
  requires_approval BOOLEAN DEFAULT false,
  approved_by     UUID REFERENCES profiles,
  approved_at     TIMESTAMPTZ,
  rejected_by     UUID REFERENCES profiles,
  rejection_note  TEXT,
  
  -- AI generation metadata
  ai_generated    BOOLEAN DEFAULT false,
  ai_prompt       TEXT,
  
  -- Performance (synced from Meta Insights)
  reach           INTEGER,
  impressions     INTEGER,
  likes           INTEGER,
  comments        INTEGER,
  shares          INTEGER,
  saves           INTEGER,
  engagement_rate DECIMAL(5,4),
  
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT,
  
  created_by      UUID REFERENCES profiles,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_posts_workspace ON content_posts(workspace_id, status);
CREATE INDEX idx_posts_scheduled ON content_posts(workspace_id, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_posts_ig_account ON content_posts(ig_account_id);
```

---

### post_automations (migration 009)
```sql
CREATE TABLE public.post_automations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id        UUID REFERENCES instagram_accounts,
  ig_post_id           VARCHAR(255) NOT NULL,
  ig_post_url          TEXT,
  trigger_type         VARCHAR(20) DEFAULT 'any_comment',  -- any_comment|keyword
  trigger_keywords     TEXT[] DEFAULT '{}',
  dm_message           TEXT NOT NULL,
  auto_comment_reply   TEXT,     -- optional public reply on the comment
  prevent_duplicate    BOOLEAN DEFAULT true,   -- don't DM same user twice
  is_active            BOOLEAN DEFAULT true,
  campaign_id          UUID REFERENCES campaigns,
  trigger_count        INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_post_auto_workspace ON post_automations(workspace_id);
CREATE INDEX idx_post_auto_post ON post_automations(ig_post_id);
```

---

### ig_templates (migration 010)
```sql
CREATE TABLE public.ig_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT DEFAULT 'MARKETING',
  language         VARCHAR(10) DEFAULT 'en',
  status           TEXT DEFAULT 'pending',  -- pending|approved|rejected
  header_type      VARCHAR(20),             -- text|image|video
  header_content   TEXT,
  body             TEXT NOT NULL,
  footer           TEXT,
  buttons          JSONB,                   -- [{type, title, url|phone}]
  variables        TEXT[] DEFAULT '{}',
  meta_template_id VARCHAR(255),
  rejection_reason TEXT,
  created_by       UUID REFERENCES profiles,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
```

---

### knowledge_base (migration 011)
```sql
CREATE TABLE public.knowledge_base (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  category      TEXT,
  is_active     BOOLEAN DEFAULT true,
  tags          TEXT[] DEFAULT '{}',
  source        VARCHAR(20) DEFAULT 'manual',  -- manual|upload|generated
  source_filename TEXT,
  is_draft      BOOLEAN DEFAULT false,
  priority      INTEGER DEFAULT 0,
  char_count    INTEGER GENERATED ALWAYS AS (length(content)) STORED,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_kb_workspace ON knowledge_base(workspace_id, is_active);
CREATE INDEX idx_kb_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);

CREATE TABLE public.vector_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  file_type     VARCHAR(10),   -- pdf|docx|txt
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vdoc_workspace ON vector_documents(workspace_id);
CREATE INDEX idx_vdoc_embedding ON vector_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
```

---

### notifications (migration 012)
```sql
CREATE TABLE public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  type         TEXT NOT NULL,
  -- conversation_assigned|lead_assigned|new_message|campaign_complete|sla_breach|window_expiring
  title        TEXT NOT NULL,
  body         TEXT,
  data         JSONB DEFAULT '{}',
  is_read      BOOLEAN DEFAULT false,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read, created_at DESC);
-- RLS: user_id = auth.uid()
-- Added to Supabase Realtime publication
```

---

### influencers (migration 013)
```sql
CREATE TABLE public.influencers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  contact_id       UUID REFERENCES contacts ON DELETE SET NULL,
  ig_username      VARCHAR(255),
  name             TEXT,
  email            VARCHAR(255),
  phone            VARCHAR(50),
  category         TEXT,         -- lifestyle|fashion|tech|food|beauty|fitness|etc
  niche            TEXT[],
  location         TEXT,
  followers_count  INTEGER,
  following_count  INTEGER,
  avg_engagement_rate DECIMAL(5,4),
  avg_likes        INTEGER,
  avg_comments     INTEGER,
  profile_pic      TEXT,
  bio              TEXT,
  website          TEXT,
  rate_per_post    DECIMAL(12,2),
  rate_per_reel    DECIMAL(12,2),
  rate_per_story   DECIMAL(12,2),
  currency         VARCHAR(3) DEFAULT 'INR',
  status           VARCHAR(20) DEFAULT 'prospect',
  -- prospect|outreached|negotiating|active|past
  notes            TEXT,
  tags             TEXT[] DEFAULT '{}',
  custom_fields    JSONB DEFAULT '{}',
  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_influencers_workspace ON influencers(workspace_id);
CREATE INDEX idx_influencers_category ON influencers(workspace_id, category);

CREATE TABLE public.influencer_collaborations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  influencer_id    UUID NOT NULL REFERENCES influencers ON DELETE CASCADE,
  name             TEXT NOT NULL,
  type             VARCHAR(30),  -- post|reel|story|ugc|live|review
  status           VARCHAR(20) DEFAULT 'planned',
  -- planned|briefed|in_progress|delivered|published|completed|cancelled
  brief            TEXT,
  deliverables     JSONB DEFAULT '[]',  -- [{type, due_date, status, ig_post_id}]
  amount           DECIMAL(12,2),
  currency         VARCHAR(3) DEFAULT 'INR',
  payment_status   VARCHAR(20) DEFAULT 'pending',
  payment_due_at   TIMESTAMPTZ,
  start_date       DATE,
  end_date         DATE,
  ig_post_ids      TEXT[],         -- published post IDs for tracking
  reach            INTEGER,        -- synced from Meta Insights
  impressions      INTEGER,
  engagement       INTEGER,
  conversions      INTEGER,
  roi              DECIMAL(8,2),
  notes            TEXT,
  contract_url     TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
```

---

### ig_comments (migration 014)
```sql
CREATE TABLE public.ig_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id   UUID REFERENCES instagram_accounts,
  ig_comment_id   VARCHAR(255) UNIQUE,
  ig_post_id      VARCHAR(255),
  ig_media_type   VARCHAR(20),  -- IMAGE|VIDEO|CAROUSEL_ALBUM|REEL
  commenter_ig_id VARCHAR(255),
  commenter_name  TEXT,
  contact_id      UUID REFERENCES contacts,
  conversation_id UUID REFERENCES conversations,
  text            TEXT,
  timestamp       TIMESTAMPTZ,
  is_hidden       BOOLEAN DEFAULT false,
  replied_at      TIMESTAMPTZ,
  reply_text      TEXT,
  dm_sent         BOOLEAN DEFAULT false,
  dm_message_id   UUID REFERENCES messages,
  sentiment       VARCHAR(20),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comments_workspace ON ig_comments(workspace_id);
CREATE INDEX idx_comments_post ON ig_comments(ig_post_id);
```

---

### workflow_automations (migration 015)
```sql
CREATE TABLE public.workflow_automations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_active    BOOLEAN DEFAULT false,
  trigger_type TEXT NOT NULL,
  -- dm_received|comment_received|story_mention|story_reply|
  -- new_follower|reel_comment|lead_created|lead_stage_changed|
  -- contact_tag_added|scheduled|campaign_replied
  trigger_config JSONB DEFAULT '{}',
  nodes        JSONB DEFAULT '[]',
  edges        JSONB DEFAULT '[]',
  run_count    INTEGER DEFAULT 0,
  last_run_at  TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.workflow_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       UUID NOT NULL REFERENCES workflow_automations ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations,
  contact_id        UUID REFERENCES contacts,
  current_node_id   TEXT,
  status            VARCHAR(20) DEFAULT 'active',  -- active|completed|failed|paused
  context           JSONB DEFAULT '{}',
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Additional Tables

```sql
-- business_hours: same as WhatsApp platform
-- sla_policies: same as WhatsApp platform
-- quick_replies: same as WhatsApp platform
-- follow_up_sequences + contact_sequences: same as WhatsApp platform
-- inbox_rules: same as WhatsApp platform (adapted for IG channels)
-- activities: audit log, same schema
-- csat_responses: same schema
-- workspace_sessions: same schema (session management)
-- team_invites: same schema
-- workspace_api_keys: same schema
-- webhook_endpoints + webhook_deliveries: same schema
-- platform_usage_logs: same schema
-- ig_webhook_events: raw webhook event storage (same pattern as WhatsApp)

-- New for Instagram:
CREATE TABLE public.ig_story_reactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id    UUID REFERENCES instagram_accounts,
  story_id         VARCHAR(255),
  reactor_ig_id    VARCHAR(255),
  contact_id       UUID REFERENCES contacts,
  reaction_type    VARCHAR(30),  -- reply|reaction|share
  message          TEXT,
  reaction_emoji   TEXT,
  received_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.ig_media_insights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id    UUID REFERENCES instagram_accounts,
  ig_media_id      VARCHAR(255),
  media_type       VARCHAR(20),
  permalink        TEXT,
  thumbnail        TEXT,
  caption_snippet  TEXT,
  reach            INTEGER DEFAULT 0,
  impressions      INTEGER DEFAULT 0,
  likes            INTEGER DEFAULT 0,
  comments         INTEGER DEFAULT 0,
  shares           INTEGER DEFAULT 0,
  saves            INTEGER DEFAULT 0,
  video_views      INTEGER DEFAULT 0,
  engagement_rate  DECIMAL(5,4),
  synced_at        TIMESTAMPTZ DEFAULT NOW(),
  published_at     TIMESTAMPTZ,
  UNIQUE (ig_media_id)
);

CREATE TABLE public.ig_account_insights (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id      UUID REFERENCES instagram_accounts,
  date               DATE NOT NULL,
  followers_count    INTEGER,
  followers_gained   INTEGER,
  followers_lost     INTEGER,
  reach              INTEGER,
  impressions        INTEGER,
  profile_views      INTEGER,
  website_clicks     INTEGER,
  email_contacts     INTEGER,
  UNIQUE (ig_account_id, date)
);

CREATE TABLE public.hashtag_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  hashtags     TEXT[] DEFAULT '{}',
  description  TEXT,
  use_count    INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.caption_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  content      TEXT NOT NULL,    -- supports {{variable}} placeholders
  post_type    post_type,
  tags         TEXT[] DEFAULT '{}',
  use_count    INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.meta_ads_leads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  ig_account_id  UUID REFERENCES instagram_accounts,
  form_id        VARCHAR(255),
  lead_id        VARCHAR(255) UNIQUE,
  campaign_id    VARCHAR(255),   -- Meta ad campaign
  adset_id       VARCHAR(255),
  ad_id          VARCHAR(255),
  contact_id     UUID REFERENCES contacts,    -- linked contact if created
  lead_id_ref    UUID REFERENCES leads,       -- linked lead if created
  field_data     JSONB DEFAULT '{}',          -- form field answers
  created_time   TIMESTAMPTZ,
  synced_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Key DB Functions (migration 016)

```sql
-- Auth helpers (identical to WhatsApp platform)
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION get_member_role(p_workspace_id uuid)
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION can_view_assigned_row(p_workspace_id uuid, p_assigned_agent_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_workspace_member(p_workspace_id) AND (
    get_member_role(p_workspace_id) IS DISTINCT FROM 'agent'
    OR p_assigned_agent_id = auth.uid()
  )
$$;

-- Lead temperature (identical to WhatsApp platform)
CREATE OR REPLACE FUNCTION classify_temp_by_count(v_count INTEGER)
RETURNS VARCHAR(10) LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v_count >= 8 THEN 'hot' WHEN v_count >= 4 THEN 'warm' ELSE 'cold' END
$$;

CREATE OR REPLACE FUNCTION temperature_rank(temp VARCHAR(10))
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE temp WHEN 'hot' THEN 2 WHEN 'warm' THEN 1 ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION update_lead_temp_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead_id UUID; v_current VARCHAR(10); v_count INTEGER; v_count_temp VARCHAR(10);
BEGIN
  IF NEW.sender_type NOT IN ('contact') THEN RETURN NEW; END IF;
  IF NEW.type = 'internal_note' OR NEW.is_deleted THEN RETURN NEW; END IF;
  SELECT id, temperature INTO v_lead_id, v_current
    FROM leads WHERE conversation_id = NEW.conversation_id LIMIT 1;
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

-- Assignment notifications
CREATE OR REPLACE FUNCTION notify_on_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_agent_id IS NOT NULL
     AND NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    INSERT INTO notifications (workspace_id, user_id, type, title, data)
    VALUES (NEW.workspace_id, NEW.assigned_agent_id,
            TG_ARGV[0], 'New item assigned to you',
            jsonb_build_object('id', NEW.id, 'type', TG_ARGV[0]));
  END IF;
  RETURN NEW;
END;
$$;

-- Update contact last_user_message_at on inbound message
CREATE OR REPLACE FUNCTION update_contact_last_message_at()
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

-- pgvector search functions
CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding vector(1536), workspace_id_param uuid,
  match_count int DEFAULT 5, min_similarity float DEFAULT 0.35
)
RETURNS TABLE(id uuid, title text, content text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT id, title, content, 1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE workspace_id = workspace_id_param AND is_active = true AND is_draft = false
    AND 1 - (embedding <=> query_embedding) > min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

---

## RLS Policies (migration 017)

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
-- ... (all tables)

-- Workspace isolation
CREATE POLICY "workspace_isolation" ON workspaces
  FOR ALL USING (
    id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Assignment-based isolation for conversations
CREATE POLICY "conversations_isolation" ON conversations
  FOR ALL USING (can_view_assigned_row(workspace_id, assigned_agent_id));

-- Same for leads
CREATE POLICY "leads_isolation" ON leads
  FOR ALL USING (can_view_assigned_row(workspace_id, assigned_agent_id));

-- Messages: inherit from conversation
CREATE POLICY "messages_isolation" ON messages
  FOR ALL USING (
    is_workspace_member(workspace_id) AND (
      get_member_role(workspace_id) IS DISTINCT FROM 'agent'
      OR EXISTS (SELECT 1 FROM conversations WHERE id = conversation_id AND assigned_agent_id = auth.uid())
    )
  );

-- Contacts: derived from conversation/lead assignment
CREATE POLICY "contacts_isolation" ON contacts
  FOR ALL USING (
    is_workspace_member(workspace_id) AND (
      get_member_role(workspace_id) IS DISTINCT FROM 'agent'
      OR EXISTS (SELECT 1 FROM conversations WHERE contact_id = contacts.id AND assigned_agent_id = auth.uid())
      OR EXISTS (SELECT 1 FROM leads WHERE contact_id = contacts.id AND assigned_agent_id = auth.uid())
    )
  );

-- Notifications: own rows only
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Service-role-only tables: USING (false)
CREATE POLICY "ig_webhook_events_server_only" ON ig_webhook_events FOR ALL USING (false);
CREATE POLICY "workspace_sessions_server_only" ON workspace_sessions FOR ALL USING (false);
```
