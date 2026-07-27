-- ============================================================
-- 0015_support_settings.sql — support tickets + platform settings
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  subject      TEXT NOT NULL,
  category     VARCHAR(30) NOT NULL DEFAULT 'general',   -- general|billing|technical|api|integration
  priority     VARCHAR(10) NOT NULL DEFAULT 'normal',    -- low|normal|high|urgent
  status       VARCHAR(20) NOT NULL DEFAULT 'open',      -- open|in_progress|waiting_client|escalated|resolved|closed
  assigned_to  UUID,                                     -- platform admin user id
  created_by   UUID,                                     -- client user id
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_ws     ON public.support_tickets(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.support_tickets ON DELETE CASCADE,
  author_type VARCHAR(10) NOT NULL,   -- client|admin
  author_id   UUID,
  author_name TEXT,
  body        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,  -- internal admin note (hidden from client)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.support_ticket_messages(ticket_id, created_at);

ALTER TABLE public.support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Clients read their own workspace's tickets (writes go through server actions / service role).
DROP POLICY IF EXISTS support_tickets_member ON public.support_tickets;
CREATE POLICY support_tickets_member ON public.support_tickets
  FOR SELECT USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS ticket_messages_member ON public.support_ticket_messages;
CREATE POLICY ticket_messages_member ON public.support_ticket_messages
  FOR SELECT USING (
    NOT is_internal AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND public.is_workspace_member(t.workspace_id)
    )
  );

-- Platform-level key/value settings (service-role only — like other platform_* tables).
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        VARCHAR(60) PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
