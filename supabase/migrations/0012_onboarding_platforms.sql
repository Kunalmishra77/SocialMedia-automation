-- ============================================================
-- 0012_onboarding_platforms.sql — platforms chosen during onboarding. Idempotent.
-- ============================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS selected_platforms TEXT[] DEFAULT '{}';
