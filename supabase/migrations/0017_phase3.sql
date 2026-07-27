-- ============================================================
-- 0017_phase3.sql — scheduled announcements + ticket first-response (SLA)
-- Idempotent.
-- ============================================================

ALTER TABLE public.platform_announcements
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_announcements_scheduled
  ON public.platform_announcements(scheduled_for)
  WHERE published_at IS NULL AND scheduled_for IS NOT NULL;

NOTIFY pgrst, 'reload schema';
