-- ============================================================
-- 0023_content_plans.sql — automated content planning + Auto-Pilot.
-- A plan generates AI posts on a schedule: manual mode drops them into the
-- approval queue; autopilot mode schedules them straight for publishing.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Content plan',
  platforms     TEXT[] NOT NULL DEFAULT '{instagram}',
  frequency     VARCHAR(10) NOT NULL DEFAULT 'daily',   -- 'daily' | 'weekly'
  days_of_week  INT[] NOT NULL DEFAULT '{}',            -- 0=Sun..6=Sat (weekly only)
  time_of_day   VARCHAR(5) NOT NULL DEFAULT '09:00',    -- HH:MM, 24h, in `timezone`
  timezone      TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  themes        TEXT,                                   -- content themes / instructions
  mode          VARCHAR(10) NOT NULL DEFAULT 'manual',  -- 'manual' | 'autopilot'
  is_active     BOOLEAN NOT NULL DEFAULT true,
  next_run_at   TIMESTAMPTZ,
  last_run_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES public.profiles,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_plans_ws  ON public.content_plans(workspace_id);
CREATE INDEX IF NOT EXISTS idx_content_plans_due ON public.content_plans(next_run_at) WHERE is_active;

DROP TRIGGER IF EXISTS trg_content_plans_updated_at ON public.content_plans;
CREATE TRIGGER trg_content_plans_updated_at BEFORE UPDATE ON public.content_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.content_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_plans_member ON public.content_plans;
CREATE POLICY content_plans_member ON public.content_plans
  FOR SELECT USING (public.is_workspace_member(workspace_id));

-- Link generated posts back to the plan that produced them.
ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.content_plans ON DELETE SET NULL;
