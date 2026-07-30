-- ============================================================
-- 0022_ai_content.sql — AI content generation + approval workflow.
-- Extends content_posts with per-platform AI variants and provenance.
-- Reuses the existing approval columns (requires_approval, approved_by/at,
-- rejected_by, rejection_note, ai_generated, ai_prompt) already on the table.
-- The brand profile lives in workspaces.settings.brand_profile (JSONB) — no
-- column needed. Idempotent.
-- ============================================================

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS brief           TEXT,               -- the topic / idea the client entered
  ADD COLUMN IF NOT EXISTS platform_variants JSONB DEFAULT '{}', -- { instagram: {caption, hashtags, cta, first_comment}, linkedin: {...}, ... }
  ADD COLUMN IF NOT EXISTS image_prompt    TEXT,               -- prompt used for the AI/template visual
  ADD COLUMN IF NOT EXISTS image_source    VARCHAR(20),        -- 'ai' | 'template' | 'upload' | null
  ADD COLUMN IF NOT EXISTS ai_model        TEXT;               -- model that generated the copy

-- Approval-queue lookups: posts awaiting review for a workspace.
CREATE INDEX IF NOT EXISTS idx_posts_approval
  ON public.content_posts(workspace_id, status)
  WHERE status = 'pending_approval';
