-- ============================================================
-- 0002_platform_admin.sql
-- Module 27 — Platform super-admin panel tables.
-- Idempotent.
-- ============================================================

-- Platform admins live OUTSIDE workspace membership.
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  role          VARCHAR(30) NOT NULL DEFAULT 'platform_support',
                -- platform_owner | platform_admin | platform_support | platform_billing
  permissions   TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  totp_secret   TEXT,
  totp_enabled  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (user_id)
);

-- Immutable audit trail of every sensitive platform action.
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  admin_email   VARCHAR(255) NOT NULL,
  action        VARCHAR(60) NOT NULL,
  target_type   VARCHAR(40),
  target_id     UUID,
  target_label  TEXT,
  metadata      JSONB DEFAULT '{}',
  ip_address    INET,
  occurred_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_time ON public.platform_audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_target ON public.platform_audit_log(target_type, target_id);

-- Impersonation sessions (used by a later slice).
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  mode          VARCHAR(10) NOT NULL DEFAULT 'read',  -- read | full
  reason        TEXT,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ
);

-- Broadcast announcements (used by a later slice).
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  audience     JSONB NOT NULL DEFAULT '{"scope":"all"}',
  channels     TEXT[] NOT NULL DEFAULT '{in_app}',
  created_by   UUID NOT NULL,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Feature flags (used by a later slice).
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(60) NOT NULL,
  description TEXT,
  default_on  BOOLEAN NOT NULL DEFAULT false,
  rollout_pct SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (key)
);
CREATE TABLE IF NOT EXISTS public.feature_flag_overrides (
  flag_key     VARCHAR(60) NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  enabled      BOOLEAN NOT NULL,
  PRIMARY KEY (flag_key, workspace_id)
);

-- These tables are accessed ONLY via the service-role client from the
-- /platform-admin area (which authenticates platform_admins in app code),
-- so RLS is enabled with no anon/auth policies — the anon key can't touch them.
ALTER TABLE public.platform_admins        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_overrides ENABLE ROW LEVEL SECURITY;
