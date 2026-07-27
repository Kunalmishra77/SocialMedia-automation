-- ============================================================
-- 0014_realtime_widget.sql — realtime publication + bookings + widget. Idempotent.
-- ============================================================

-- Add key tables to the Supabase Realtime publication (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='workspaces') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workspaces;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- publication not present (non-Supabase) — ignore
  NULL;
END $$;

-- Bookings / appointments.
CREATE TABLE IF NOT EXISTS public.bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  contact_id    UUID REFERENCES public.contacts ON DELETE SET NULL,
  name          TEXT,
  email         VARCHAR(255),
  phone         VARCHAR(50),
  service       TEXT,
  starts_at     TIMESTAMPTZ,
  status        VARCHAR(20) DEFAULT 'booked',  -- booked|completed|cancelled|no_show
  notes         TEXT,
  source        VARCHAR(30) DEFAULT 'manual',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_ws ON public.bookings(workspace_id, starts_at);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookings_member ON public.bookings;
CREATE POLICY bookings_member ON public.bookings FOR SELECT USING (public.is_workspace_member(workspace_id));

-- Widget settings live in workspaces.settings.widget (JSONB) — no table needed.
