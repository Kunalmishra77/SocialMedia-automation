-- ============================================================
-- 0024_secure_ig_tokens.sql
-- instagram_accounts stores an access_token column. The prior policy
-- (ig_accounts_member) granted SELECT to ANY workspace member via the browser
-- anon key — including the lowest-privilege `agent` role — exposing the token.
-- This table is only ever read server-side through the service-role admin client
-- (RLS is bypassed there), so we remove the client-facing SELECT policy entirely.
-- RLS stays enabled → no anon/authenticated client can read tokens. Idempotent.
-- ============================================================

DROP POLICY IF EXISTS ig_accounts_member ON public.instagram_accounts;

-- (No replacement client policy: reads go through the service role only, matching
--  the newer channel_accounts design in 0007_channels.sql.)
