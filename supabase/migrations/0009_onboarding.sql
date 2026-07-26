-- ============================================================
-- 0009_onboarding.sql — client onboarding + subscription + approval lifecycle
-- workspaces.status now flows: onboarding -> pending_approval -> active
--                              (also: suspended, deleted)
-- Idempotent.
-- ============================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS onboarding_token   VARCHAR(64),
  ADD COLUMN IF NOT EXISTS owner_name         TEXT,
  ADD COLUMN IF NOT EXISTS owner_phone        VARCHAR(40),
  ADD COLUMN IF NOT EXISTS company            TEXT,
  ADD COLUMN IF NOT EXISTS selected_plan      TEXT,
  ADD COLUMN IF NOT EXISTS payment_status     VARCHAR(20) DEFAULT 'unpaid',  -- unpaid|demo_paid
  ADD COLUMN IF NOT EXISTS payment_amount     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS onboarding_data    JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS submitted_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by        UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_onboarding_token
  ON public.workspaces(onboarding_token) WHERE onboarding_token IS NOT NULL;

-- Client-provided credentials (hybrid model). App-level encrypted values.
CREATE TABLE IF NOT EXISTS public.client_credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  provider        VARCHAR(30) NOT NULL,   -- meta | openai | telegram | ...
  key_name        VARCHAR(60) NOT NULL,   -- app_id | app_secret | api_key | ...
  value_encrypted TEXT NOT NULL,          -- AES-256-GCM (see lib/crypto.ts)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, provider, key_name)
);
ALTER TABLE public.client_credentials ENABLE ROW LEVEL SECURITY;
-- Service-role only (secrets) — no client policy.

-- Approval / onboarding notifications for platform admins live in platform_audit_log
-- and a lightweight pending flag via workspaces.status = 'pending_approval'.
