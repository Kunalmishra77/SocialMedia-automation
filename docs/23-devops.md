# 23 — DevOps & Deployment

## 23.1 Target Infrastructure

| Component | Service | Notes |
|-----------|---------|-------|
| Next.js App | Coolify (self-hosted) | Same setup as WhatsApp platform |
| Database | Supabase Cloud | Postgres 15, pgvector, pg_cron, pg_net |
| Redis | Upstash | Rate limiting only |
| File Storage | Supabase Storage | Private + public buckets |
| Email | Resend | Transactional (invites, reports, alerts) |
| Push Notifications | Web Push (VAPID) | via web-push npm package |
| CDN/Edge | Vercel Edge (optional) | If hosting on Vercel instead of Coolify |

---

## 23.2 Dockerfile

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (public only)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

**`next.config.ts` must have:**
```typescript
output: 'standalone'
```

---

## 23.3 docker-compose.yml (Local Dev)

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    env_file:
      - .env.local
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    command: npm run dev

  # Supabase is cloud — no local DB container needed
  # Use Supabase CLI for local dev if preferred:
  # npx supabase start
```

---

## 23.4 Coolify Deployment

**New Coolify application setup:**
1. Source: Connect GitHub repo
2. Build pack: Nixpacks (auto-detects Next.js) OR Docker (use Dockerfile above)
3. Build command: `npm ci && npm run build`
4. Start command: `node .next/standalone/server.js`
5. Port: 3000
6. Domain: `insta.agentix.in` (or custom workspace domain)
7. Health check path: `/api/health`

**`app/api/health/route.ts`:**
```typescript
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() })
}
```

---

## 23.5 Environment Variables

### Required (All Environments)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # Never expose to client

# Instagram / Meta
INSTAGRAM_APP_ID=                          # From Meta Developer Portal
INSTAGRAM_APP_SECRET=                      # Secret — never expose to client
INSTAGRAM_WEBHOOK_SECRET=                  # Webhook verify token

# App
NEXT_PUBLIC_APP_URL=https://insta.agentix.in
CRON_SECRET=                               # 32-char random string for cron auth

# AI
OPENAI_API_KEY=sk-...                     # Optional: if not set, uses OpenRouter
OPENROUTER_API_KEY=sk-or-...             # Fallback AI provider

# Redis (rate limiting)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Email
RESEND_API_KEY=re_...

# Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=                        # Never expose to client
```

### Optional

```env
# Meta Ads (only if ads integration enabled)
META_ADS_ACCESS_TOKEN=

# Stripe (for billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Monitoring
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# Analytics (optional)
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

---

## 23.6 Database Migration Strategy

### File Naming Convention

```
supabase/migrations/
├── 001_initial_schema.sql         — profiles, workspaces, workspace_members
├── 002_instagram_accounts.sql     — ig_accounts, contacts, conversations, messages
├── 003_leads_campaigns.sql        — leads, campaigns, campaign_recipients
├── 004_content_flows.sql          — content_posts, chatbot_flows, post_automations
├── 005_knowledge_base.sql         — knowledge_base, vector_documents (requires pgvector)
├── 006_analytics_tables.sql       — ig_media_insights, ig_account_insights
├── 007_influencers.sql            — influencers, collaborations, documents, budgets
├── 008_commerce.sql               — catalog_products, orders, attributions
├── 009_workflow_automations.sql   — workflow_automations, workflow_sessions
├── 010_rls_policies.sql           — all RLS policies (enable + create)
├── 011_triggers.sql               — all DB triggers
├── 012_cron_jobs.sql              — pg_cron schedules
├── 013_team_invites.sql           — team_invites
├── 014_push_subscriptions.sql     — push_subscriptions
├── 015_advanced_tables.sql        — activity_log, audit_log, link_clicks, etc.
├── 016_meta_ads.sql               — meta_ads_leads, campaign_send_queue
└── 017_rls_functions.sql          — can_view_assigned_row, can_view_contact_row, etc.
```

### Running Migrations

**Development (Supabase CLI):**
```bash
supabase db push
```

**Production (direct SQL):**
```bash
# Connect to Supabase via psql
psql "$DATABASE_URL" -f supabase/migrations/001_initial_schema.sql
# Run each migration file in order
```

**Migration script (`scripts/migrate.sh`):**
```bash
#!/bin/bash
for file in supabase/migrations/*.sql; do
  echo "Running $file..."
  psql "$DATABASE_URL" -f "$file" -v ON_ERROR_STOP=1
done
echo "All migrations complete."
```

### Types Regeneration

After each migration, regenerate TypeScript types:
```bash
npx supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > types/database.types.ts
```

---

## 23.7 CI/CD Pipeline

**GitHub Actions (`.github/workflows/deploy.yml`):**

```yaml
name: Deploy to Coolify

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run type-check        # npx tsc --noEmit
      - run: npm run lint              # next lint
      - run: npm test -- --passWithNoTests

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify Deploy
        run: |
          curl -X POST "${{ secrets.COOLIFY_WEBHOOK_URL }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"
```

**Coolify auto-deploys** on the GitHub push trigger (configured in Coolify settings). No custom deploy script needed.

---

## 23.8 Monitoring & Observability

### Error Tracking

```typescript
// Sentry (if SENTRY_DSN is set)
// next.config.ts:
import { withSentryConfig } from '@sentry/nextjs'
export default withSentryConfig(nextConfig, { silent: true })

// app/sentry.server.config.ts:
import * as Sentry from '@sentry/nextjs'
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 })
```

### Logging

```typescript
// lib/logger.ts — structured JSON logging
export const logger = {
  info: (msg: string, data?: object) => console.log(JSON.stringify({ level: 'info', msg, ...data, ts: Date.now() })),
  error: (msg: string, err?: Error, data?: object) => console.error(JSON.stringify({ level: 'error', msg, error: err?.message, stack: err?.stack, ...data, ts: Date.now() })),
  warn: (msg: string, data?: object) => console.warn(JSON.stringify({ level: 'warn', msg, ...data, ts: Date.now() })),
}
```

Coolify captures stdout/stderr and makes logs available in its dashboard.

### Key Metrics to Monitor

| Metric | Alert threshold |
|--------|----------------|
| Webhook processing time | > 4s (Meta expects 200 within 5s) |
| AI reply latency | > 8s |
| Token expiry | < 7 days remaining |
| Campaign queue depth | > 1000 pending |
| Failed cron jobs | Any failure |
| DB connection pool | > 80% usage |
| Redis rate limit hits | > 100/hour for a single workspace |

---

## 23.9 Backup Strategy

**Database:** Supabase handles automated daily backups (Point-In-Time Recovery on Pro plan)

**Supabase Storage:** Files are replicated within Supabase infrastructure. For additional safety, implement daily export to external storage (e.g. R2) using pg_cron + Edge Function — Phase 4+.

**Code:** GitHub repository serves as the source of truth.

---

## 23.10 Scaling Considerations

**App layer (stateless):** Coolify can run multiple replicas behind a load balancer. All state is in Supabase (DB + Storage + Realtime). No server-side sessions or in-memory state.

**Database:** Supabase's built-in connection pooling (PgBouncer) handles concurrent connections. For heavy read traffic, enable Supabase read replicas on Pro plan.

**Realtime:** Supabase Realtime scales to 200 concurrent connections on Pro plan, 10,000 on Enterprise.

**AI calls:** Batching is not needed — each call is already async and non-blocking. If per-workspace AI limits are hit, implement per-workspace request queuing (Upstash Queue).

**Rate limits:**
- Meta API: 1,000 messages/hour/account — enforced by campaign executor's throttling
- OpenAI: rate limit by organization; add retry with exponential backoff (already in `callAI()`)
