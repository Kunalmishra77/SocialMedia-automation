-- ============================================================
-- 0013_cross_platform.sql — publish one post to multiple platforms. Idempotent.
-- ============================================================

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS target_platforms TEXT[] DEFAULT '{instagram}';
