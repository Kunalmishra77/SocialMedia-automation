-- ============================================================
-- 0016_plans.sql — DB-backed subscription plan catalog (editable by super admin)
-- Seeded to match lib/plans.ts so runtime behaviour is unchanged until edited.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_plans (
  key        VARCHAR(30) PRIMARY KEY,
  name       TEXT NOT NULL,
  price      NUMERIC(12,2) NOT NULL DEFAULT 0,   -- INR / month
  tagline    TEXT,
  features   JSONB NOT NULL DEFAULT '[]',
  highlight  BOOLEAN NOT NULL DEFAULT false,
  is_active  BOOLEAN NOT NULL DEFAULT true,      -- shown on onboarding when true
  archived   BOOLEAN NOT NULL DEFAULT false,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
-- Read via service-role only (server components/actions); no anon/auth policy.

INSERT INTO public.platform_plans (key, name, price, tagline, features, highlight, sort) VALUES
  ('starter', 'Starter', 999, 'For solo creators getting started',
   '["1 social account","AI auto-reply","Inbox + CRM","5,000 messages/mo"]', false, 1),
  ('pro', 'Pro', 2999, 'For growing brands & teams',
   '["3 social accounts","AI chatbot + comment→DM","Campaigns + content scheduling","Workflow automation","25,000 messages/mo"]', true, 2),
  ('enterprise', 'Enterprise', 7999, 'For agencies & high volume',
   '["10 social accounts","Everything in Pro","Influencer + Commerce + Ads","Priority support","100,000 messages/mo"]', false, 3)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
