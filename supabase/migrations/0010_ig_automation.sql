-- ============================================================
-- 0010_ig_automation.sql — follow status + IG automation fields. Idempotent.
-- ============================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ig_is_follower BOOLEAN,
  ADD COLUMN IF NOT EXISTS follow_gate_passed BOOLEAN DEFAULT false;

-- Track a pending follow-gate on the conversation (paused until user follows).
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS follow_gate_pending BOOLEAN DEFAULT false;
