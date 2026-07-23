# 00 — Project Setup Guide (Start Here)

> **For AI agents:** Read this file FIRST before any other file. This is the complete setup checklist. After this, read 00-INDEX.md and then work through files 01–26 in order.

---

## Step 1: Credentials You Need Before Starting

Collect all of these before writing a single line of code. The AI will ask you for these values only — nothing else.

### From Supabase (supabase.com)
- Create a new project → get:
  - `NEXT_PUBLIC_SUPABASE_URL` — e.g. `https://abcxyz.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — starts with `eyJ`
  - `SUPABASE_SERVICE_ROLE_KEY` — starts with `eyJ` (never expose to browser)
  - `DATABASE_URL` — postgres connection string (for running migrations directly)

### From Meta Developer Portal (developers.facebook.com)
1. Create a new App → type: **Business**
2. Add products: **Instagram Graph API** + **Webhooks**
3. Add permissions (all required):
   - `instagram_basic`
   - `instagram_manage_messages`
   - `instagram_manage_comments`
   - `instagram_content_publish`
   - `instagram_manage_insights`
   - `pages_messaging`
   - `pages_read_engagement`
   - `leads_retrieval` ← for Meta Lead Ads sync
   - `ads_read` ← for Ad Performance dashboard
4. Get:
   - `INSTAGRAM_APP_ID` — numeric App ID
   - `INSTAGRAM_APP_SECRET` — App Secret
   - `INSTAGRAM_WEBHOOK_SECRET` — any random string you choose (set this in Meta webhook config too)

### From OpenAI (platform.openai.com) — OR OpenRouter (openrouter.ai)
- `OPENAI_API_KEY` — starts with `sk-` — If set, this is used
- `OPENROUTER_API_KEY` — starts with `sk-or-` — fallback if no OpenAI key
- At least ONE of these is required

### From Upstash (upstash.com) — Redis for rate limiting
- Create a Redis database → get:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

### From Resend (resend.com) — Email for invites + reports
- Create account + verify your domain → get:
  - `RESEND_API_KEY` — starts with `re_`

### Generate Yourself
```bash
# CRON_SECRET — any 32-char random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# VAPID keys for push notifications
npx web-push generate-vapid-keys
# → NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
```

### Your App Domain
- `NEXT_PUBLIC_APP_URL` — e.g. `https://insta.agentix.in` (or `http://localhost:3000` for local dev)

---

## Step 2: Create the Next.js Project

```bash
npx create-next-app@latest instagram-automation --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
cd instagram-automation
```

---

## Step 3: Install All Dependencies

Run this single command — installs everything needed across all modules:

```bash
npm install \
  @supabase/supabase-js \
  @supabase/ssr \
  @upstash/ratelimit \
  @upstash/redis \
  @ducanh2912/next-pwa \
  @tanstack/react-table \
  @tanstack/react-virtual \
  @dnd-kit/core \
  @dnd-kit/sortable \
  @dnd-kit/utilities \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-popover \
  @radix-ui/react-select \
  @radix-ui/react-switch \
  @radix-ui/react-tabs \
  @radix-ui/react-tooltip \
  @radix-ui/react-avatar \
  @radix-ui/react-checkbox \
  @radix-ui/react-accordion \
  @radix-ui/react-collapsible \
  @radix-ui/react-label \
  @radix-ui/react-progress \
  @radix-ui/react-radio-group \
  @radix-ui/react-separator \
  @radix-ui/react-slot \
  @radix-ui/react-toast \
  @radix-ui/react-context-menu \
  class-variance-authority \
  clsx \
  tailwind-merge \
  tailwindcss-animate \
  lucide-react \
  zustand \
  swr \
  zod \
  date-fns \
  react-day-picker \
  recharts \
  reactflow \
  react-big-calendar \
  papaparse \
  web-push \
  resend \
  sonner \
  next-themes \
  @react-pdf/renderer \
  openai
```

**Dev dependencies:**
```bash
npm install -D \
  vitest \
  @vitejs/plugin-react \
  @playwright/test \
  @types/web-push \
  @types/papaparse \
  @types/react-big-calendar \
  vitest-coverage-v8
```

**Install shadcn/ui components:**
```bash
npx shadcn@latest init
# Choose: Default style, slate color, CSS variables: yes

# Install all required components:
npx shadcn@latest add button input textarea select switch checkbox radio-group
npx shadcn@latest add dialog sheet popover tooltip dropdown-menu context-menu
npx shadcn@latest add tabs accordion collapsible avatar badge progress skeleton
npx shadcn@latest add table card separator label scroll-area
```

---

## Step 4: Create `.env.local`

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Instagram / Meta
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=

# AI (at least one required)
OPENAI_API_KEY=
OPENROUTER_API_KEY=

# Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Email
RESEND_API_KEY=

# Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

---

## Step 5: Supabase Extensions (Run Once)

In your Supabase dashboard → SQL Editor → run this:

```sql
-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";      -- for knowledge base semantic search
CREATE EXTENSION IF NOT EXISTS "pg_cron";       -- for scheduled jobs
CREATE EXTENSION IF NOT EXISTS "pg_net";        -- for pg_cron to call HTTP routes

-- Set your app URL for pg_cron to call (replace with your actual URL)
ALTER DATABASE postgres SET app.base_url = 'https://insta.agentix.in';
ALTER DATABASE postgres SET app.cron_secret = 'your-cron-secret-here';
```

---

## Step 6: Run Database Migrations

Run each migration file in order (see `supabase/migrations/` folder, created as you build):

```bash
# Using Supabase CLI (recommended for local dev)
npx supabase db push

# OR directly via psql
psql "$DATABASE_URL" -f supabase/migrations/001_initial_schema.sql
# ... run each file in order
```

---

## Step 7: Meta Webhook Configuration

In Meta Developer Portal → your app → Webhooks:
1. Set Callback URL: `https://yourdomain.com/api/webhooks/instagram`
2. Set Verify Token: same value as `INSTAGRAM_WEBHOOK_SECRET`
3. Subscribe to fields:
   - `messages`
   - `messaging_postbacks`
   - `messaging_referrals`
   - `comments`
   - `feed`
   - `story_insights`
   - `leadgen` ← for Meta Lead Ads

---

## Step 8: Generate TypeScript Types (After Each Migration)

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.types.ts
```

---

## Complete `.env.local` Reference (All Variables)

```env
# ── REQUIRED ──────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=
CRON_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RESEND_API_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# ── AI: at least one required ──────────────────────
OPENAI_API_KEY=
OPENROUTER_API_KEY=

# ── OPTIONAL: Meta Ads (Phase 5) ──────────────────
META_ADS_ACCESS_TOKEN=

# ── OPTIONAL: Stripe billing (Phase 6) ────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# ── OPTIONAL: Error tracking ──────────────────────
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# ── OPTIONAL: Product analytics ───────────────────
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# ── DEV/TEST only ─────────────────────────────────
DATABASE_URL=
E2E_ADMIN_EMAIL=
E2E_ADMIN_PASSWORD=
E2E_AGENT_EMAIL=
E2E_AGENT_PASSWORD=
```

---

## What AI Will NOT Ask You (Already Documented)

Everything below is fully specified in files 01–26. AI does NOT need to ask:

- Database schema (all SQL in `04-database-schema.md`)
- API route structure (all routes in `20-api-design.md`)
- Frontend component structure (full tree in `21-frontend-architecture.md`)
- Authentication flow (complete code in `03-multi-tenant.md` + `19-security.md`)
- Instagram OAuth + webhook handler (complete code in `05-instagram-integration.md`)
- AI reply pipeline (complete code in `07-ai-automation.md`)
- Campaign execution logic (complete code in `09-campaign-module.md`)
- All cron job schedules + implementations (complete in `22-background-services.md`)
- Deployment setup (Dockerfile + Coolify steps in `23-devops.md`)
- Test examples (all in `24-testing.md`)
- Build order / sprint plan (complete in `25-roadmap.md`)

---

## Build Order for AI

1. Read `00-SETUP.md` (this file) + `00-INDEX.md`
2. Work through files `01` → `26` in order
3. Each file = one self-contained module
4. After each module: run `npx tsc --noEmit` to verify types
5. Use `25-roadmap.md` to know which phase each file belongs to
