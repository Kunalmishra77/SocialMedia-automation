-- ============================================================
-- 0020_login_attempts.sql — failed/observed login attempts (security center)
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        VARCHAR(255),
  success      BOOLEAN NOT NULL DEFAULT false,
  reason       TEXT,
  ip           VARCHAR(64),
  user_agent   TEXT,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON public.login_attempts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts(email, attempted_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- Service-role only (written by the login action, read by the platform console).

NOTIFY pgrst, 'reload schema';
