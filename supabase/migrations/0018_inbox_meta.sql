-- ============================================================
-- 0018_inbox_meta.sql — conversation priority + tags (inbox controls)
-- Internal notes reuse the existing message_type 'internal_note'. Idempotent.
-- ============================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'normal',  -- low|normal|high|urgent
  ADD COLUMN IF NOT EXISTS tags     TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_conversations_priority ON public.conversations(workspace_id, priority);

NOTIFY pgrst, 'reload schema';
