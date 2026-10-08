-- ============================================================
-- 0025_content_intelligence.sql — Instagram content intelligence.
-- * content_posts.script   — Reel Studio output (hooks, script lines, on-screen
--                            cards, beat sheet) kept with the draft it produced.
-- * profile_audits         — Profile Score history (score per rubric item +
--                            rewrites), so the delta over time is visible.
-- Idempotent.
-- ============================================================

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS script JSONB;

CREATE TABLE IF NOT EXISTS public.profile_audits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  username      TEXT,
  input         JSONB NOT NULL DEFAULT '{}',  -- the profile fields that were scored
  score         INTEGER NOT NULL,
  items         JSONB NOT NULL DEFAULT '[]',  -- [{ id, label, points, max, note }]
  rewrites      JSONB NOT NULL DEFAULT '{}',  -- { name_field: [..], bio: [..], highlights: [..], ... }
  created_by    UUID REFERENCES public.profiles,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profile_audits_ws ON public.profile_audits(workspace_id, created_at DESC);

-- Read/write only through the service-role admin client (server actions), like
-- the other newer tables: RLS on, no client policy.
ALTER TABLE public.profile_audits ENABLE ROW LEVEL SECURITY;
