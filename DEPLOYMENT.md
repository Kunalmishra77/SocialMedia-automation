# Deployment — Coolify VPS

Socialflow is a standalone Next.js app + Supabase (Postgres). It ships as a Docker
image (`output: standalone`).

## 1. Prerequisites
- A domain pointing at your VPS (needed for OAuth + webhooks over HTTPS).
- The Supabase project (already created). Migrations live in `supabase/migrations`.

## 2. Run database migrations
From your machine (or CI), with `DATABASE_URL` set to the **transaction pooler** URL:
```
npm run db:migrate
```
This applies `0001`–`0007` idempotently.

## 3. Coolify setup
1. New Resource → **Docker (Dockerfile)** → point at this repo/branch.
2. Port: **3000**. Health check path: **/api/health**.
3. Add the environment variables below (Coolify secret store).
4. Deploy. Coolify builds the image and runs `node server.js`.

## 4. Environment variables

**Required**
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>       # server-only, never public
DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-1-<region>.pooler.supabase.com:6543/postgres
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com     # your public URL
CRON_SECRET=<long random string>
```

**AI (optional — enables auto-reply + KB semantic search)**
```
OPENAI_API_KEY=sk-...            # or
OPENROUTER_API_KEY=sk-or-...
AI_MODEL=gpt-4o-mini             # optional
```

**Meta / Instagram + Facebook (optional — enables IG/FB connect)**
```
META_APP_ID=...
META_APP_SECRET=...
META_VERIFY_TOKEN=socialflow_verify
```
In the Meta app dashboard set:
- OAuth redirect: `https://app.yourdomain.com/api/integrations/instagram/callback`
- Webhook callback: `https://app.yourdomain.com/api/webhooks/instagram` (verify token = `META_VERIFY_TOKEN`)

**Email invites (optional)**
```
RESEND_API_KEY=...
```

## 5. Background jobs (pg_cron → HTTP)
Schedule these against your deployed URL (Supabase pg_cron + pg_net, or any scheduler).
All require header `Authorization: Bearer <CRON_SECRET>`.
```
*/5  * * * *   GET /api/cron/send-campaigns     # promote scheduled posts/campaigns
*/30 * * * *   GET /api/cron/check-sla          # SLA breach flags
0    3 * * *   GET /api/cron/refresh-tokens      # refresh IG tokens (daily)
```
Example (Supabase SQL):
```sql
select cron.schedule('check-sla','*/30 * * * *', $$
  select net.http_get(
    url := 'https://app.yourdomain.com/api/cron/check-sla',
    headers := jsonb_build_object('Authorization','Bearer <CRON_SECRET>'))
$$);
```

## 6. First platform admin
After deploy, sign up once, then grant yourself platform-admin:
```
npm run make-admin your@email.com platform_owner
```
Then visit `/platform-admin` to create client workspaces.

## 7. Post-deploy checklist
- [ ] `/api/health` returns `{ status: "ok", db: true }`
- [ ] Sign up + create a workspace
- [ ] Connect a Telegram bot → message it → see it in the inbox
- [ ] (with keys) AI auto-reply fires; IG connect works
