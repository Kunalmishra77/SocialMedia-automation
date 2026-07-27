-- ============================================================
-- 0019_meta_health_cache.sql — cached Meta API health probes
-- Avoids live Graph API calls on every page load; a cron probes on a schedule
-- and the console reads this cache (+ on-demand "Check Now"). Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meta_health_checks (
  channel_account_id UUID PRIMARY KEY REFERENCES public.channel_accounts ON DELETE CASCADE,
  workspace_id       UUID NOT NULL,
  channel            VARCHAR(20) NOT NULL,
  handle             VARCHAR(255),
  ok                 BOOLEAN NOT NULL DEFAULT false,
  status_label       TEXT,
  latency_ms         INTEGER,
  token_state        VARCHAR(12),          -- ok|expiring|expired|unknown
  expires_at         TIMESTAMPTZ,
  app_usage          JSONB DEFAULT '{}',   -- {callCount,cpuTime,totalTime}
  checked_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meta_health_checked ON public.meta_health_checks(checked_at DESC);

ALTER TABLE public.meta_health_checks ENABLE ROW LEVEL SECURITY;
-- Service-role only (platform console).

NOTIFY pgrst, 'reload schema';
