-- ============================================================
-- 0007_channels.sql
-- Multi-channel foundation (module 28). Generic channel_accounts +
-- channel columns on conversations/contacts. Idempotent.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM (
    'instagram','facebook','telegram','linkedin','youtube','twitter','tiktok','pinterest'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.channel_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  channel          channel_type NOT NULL,
  external_id      VARCHAR(255) NOT NULL,   -- bot id / page id / ig user id
  handle           VARCHAR(255),            -- @username / bot username
  display_name     TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  webhook_secret   TEXT,
  capabilities     JSONB NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  connected_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_accounts_ws ON public.channel_accounts(workspace_id, channel);
CREATE INDEX IF NOT EXISTS idx_channel_accounts_ext ON public.channel_accounts(channel, external_id);

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS channel_account_id UUID REFERENCES public.channel_accounts ON DELETE SET NULL;
ALTER TABLE public.contacts      ADD COLUMN IF NOT EXISTS channel channel_type NOT NULL DEFAULT 'instagram';

-- channel_accounts hold tokens → service-role only (RLS on, no client policy).
ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;
