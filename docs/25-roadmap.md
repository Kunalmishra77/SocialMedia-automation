# 25 — Development Roadmap

## Phase 1 — Core Foundation (Weeks 1–4)
**Goal:** Working multi-tenant app with Instagram connected, inbound messages visible, AI replies sending.

### Sprint 1 (Week 1–2): Infrastructure + Auth

- [ ] Initialize Next.js 15 project with TypeScript, Tailwind, shadcn/ui
- [ ] Set up Supabase project (create project, install CLI)
- [ ] Run migrations 001–004 (auth, workspaces, workspace_members, ig_accounts)
- [ ] Implement signup flow: `POST /api/auth/signup` → creates workspace + super_admin member
- [ ] Implement login flow: `POST /api/auth/login` → creates workspace_session → sets HttpOnly cookie
- [ ] Implement session validation middleware (`lib/auth.ts`)
- [ ] Dashboard layout: Sidebar + TopBar (with role-aware nav filtering)
- [ ] Multi-workspace switcher in sidebar
- [ ] Settings page: workspace name, logo, timezone
- [ ] Run migrations 005–007 (contacts, conversations, messages, leads)
- [ ] Run migration 008 (RLS policies for all tables)
- [ ] Run migration 009 (DB triggers: lead_temp, assignment notification, contact_last_message)

**Deliverable:** Can sign up, log in, see empty dashboard.

### Sprint 2 (Week 3–4): Instagram Connection + Webhooks

- [ ] Meta Developer App setup: create app, configure scopes, set webhook URL
- [ ] `GET /api/integrations/instagram/connect` → OAuth redirect
- [ ] `GET /api/integrations/instagram/callback` → exchange code for token → save to ig_accounts
- [ ] `GET /api/webhooks/instagram` → webhook verification (challenge response)
- [ ] `POST /api/webhooks/instagram` → HMAC verification + async dispatch
- [ ] `handleIncomingDM()` → create/upsert contact + conversation + message
- [ ] `handleCommentEvent()` → create conversation with channel = 'comment'
- [ ] Basic Inbox UI: ConversationList + ConversationView (read-only)
- [ ] Message bubbles rendering (text, image, sticker types)
- [ ] Contact panel (right side): basic contact info
- [ ] Real-time subscription on messages + conversations (useConversations hook)

**Deliverable:** Instagram connected, DMs appear in inbox in real-time.

---

## Phase 2 — Inbox + AI (Weeks 5–8)
**Goal:** Full inbox management with AI auto-reply and human handoff.

### Sprint 3 (Week 5–6): Message Actions + AI Reply

- [ ] MessageInput with 24h window guard (disable when expired, show expiry timer)
- [ ] Send DM: `POST /api/messages/send` → calls `igApi.sendDM()` → saves outbound message
- [ ] Reply to comment: public reply + private DM option
- [ ] Story reply handler (channel = 'story_reply')
- [ ] Run migrations 010–011 (knowledge_base, vector_documents with pgvector)
- [ ] Knowledge base CRUD UI + semantic ingestion (`POST /api/knowledge-base`)
- [ ] AI auto-reply pipeline: `getAIReply()` with all blocker checks
- [ ] `categorizeMessage()` + `detectReplyLanguage()` utilities
- [ ] `fetchKnowledgeBaseContext()` with pgvector + keyword fallback
- [ ] Workspace AI settings: toggle auto-reply, choose model, write persona
- [ ] Upstash rate limiter (1 AI reply per 30s per contact)

**Deliverable:** AI answers inbound DMs automatically using knowledge base.

### Sprint 4 (Week 7–8): Inbox Management

- [ ] Conversation filters: status, channel, label, assigned, ig_account
- [ ] Conversation actions: resolve, reopen, snooze, assign, label
- [ ] Internal notes (save as `direction = 'internal'` message + @mention notifications)
- [ ] Smart assign: `POST /api/conversations/[id]/smart-assign`
- [ ] Chatbot flow builder (ReactFlow canvas + node types)
- [ ] Flow execution engine: `executeFlowNode()`
- [ ] Escalation: keyword detection → set escalated flag → notify agent
- [ ] Team management: invite flow (team_invites table), accept-invite page
- [ ] `assignmentBasedRLS` functions + policies (migration 017)
- [ ] Run pg_cron migrations (012): SLA check + session cleanup jobs

**Deliverable:** Full inbox with AI, human handoff, flows, team.

---

## Phase 3 — CRM + Campaigns (Weeks 9–12)
**Goal:** Lead pipeline and first campaign sending.

### Sprint 5 (Week 9–10): CRM

- [ ] Contact list: search, filter by tag/stage/source, bulk actions
- [ ] Contact detail: 360 view (conversations, leads, campaigns, timeline)
- [ ] Contact import: CSV upload + field mapping
- [ ] Lead pipeline: Kanban board (dnd-kit) + lead CRUD
- [ ] `autoCreateOrUpdateLead()` — triggered on every inbound DM
- [ ] Lead temperature badge (cold/warm/hot color codes)
- [ ] AI lead scoring: `POST /api/leads/[id]/score`
- [ ] Smart lists (dynamic segments via filter query)
- [ ] Follow-up sequences: table + enrollment + runner cron
- [ ] Run migration for `follow_up_sequences` + `contact_sequences`

**Deliverable:** Full CRM with automatic lead creation and temperature tracking.

### Sprint 6 (Week 11–12): Campaigns

- [ ] Campaign CRUD (name, type, message, audience)
- [ ] Audience builder: contact list / tags / smart segment filter
- [ ] 24h window filtering in audience resolution
- [ ] `campaign_send_queue` table + migration
- [ ] Campaign executor cron (`/api/cron/send-campaigns`) — every 5 minutes
- [ ] Post comment automation (keyword → DM reply + comment like)
- [ ] Campaign analytics: delivery funnel + reply rate
- [ ] Re-engagement campaign type (contact last_user_message_at > N days)
- [ ] Campaign duplication + scheduling

**Deliverable:** Can create and run all 5 campaign types.

---

## Phase 4 — Content + Workflows + Analytics (Weeks 13–18)
**Goal:** Content publishing, automation builder, full analytics.

### Sprint 7 (Week 13–14): Content Studio

- [ ] Content calendar (react-big-calendar with month/week/day views)
- [ ] Post composer: 4-step wizard (media → caption → settings → schedule)
- [ ] Media upload to Supabase Storage + hand-off to Instagram Graph API
- [ ] `publishPost()` implementation: feed, carousel, reel
- [ ] Scheduled post cron integration (send-campaigns handles it)
- [ ] `generateCaption()` AI function with tone/style/CTA params
- [ ] Hashtag groups CRUD
- [ ] Post approval workflow (request-approval, approve, request-changes)
- [ ] Grid preview (3-column IG feed simulation)
- [ ] Media insights sync cron (`/api/cron/sync-media-insights`)

**Deliverable:** Can schedule and publish all content types from the platform.

### Sprint 8 (Week 15–16): Workflow Automation Builder

- [ ] Workflow automations table + sessions table + migration
- [ ] Workflow builder UI (similar structure to flow builder but with triggers + actions)
- [ ] All 14 trigger types wired to event sources
- [ ] All 16 action node types implemented in `executeWorkflowSession()`
- [ ] Condition node + branch node logic
- [ ] Pre-built workflow templates (5 starter templates)
- [ ] Workflow activation + deactivation
- [ ] Run `/api/cron/run-sequences` for workflow-triggered sequences

**Deliverable:** Zapier-like visual automation builder live.

### Sprint 9 (Week 17–18): Analytics

- [ ] Overview dashboard: 12 KPI cards + trend lines
- [ ] Conversation analytics: volume, channel, labels, response time, sentiment
- [ ] Content performance: top posts, by type, hashtag performance, best time
- [ ] Campaign analytics: delivery funnel + A/B comparison
- [ ] CRM analytics: pipeline, temperature, source, conversion funnel
- [ ] AI insights: `generateAnalyticsInsights()` with 6-hour cache
- [ ] Export: CSV for any table, PDF report generation
- [ ] Scheduled reports: weekly/monthly email delivery
- [ ] PWA setup: next-pwa config, manifest.json, service worker
- [ ] Push notification subscription + delivery

**Deliverable:** Full analytics suite + reports + PWA install.

---

## Phase 5 — Advanced Features (Weeks 19–26)
**Goal:** Commerce, Influencers, Ads, Advanced AI.

### Sprint 10 (Week 19–20): Commerce + Influencer CRM

- [ ] Catalog sync: `syncProductCatalog()` + `catalog_products` table
- [ ] Product picker in inbox (search + share via DM)
- [ ] Order tracking: `orders` table + import from Shopify CSV
- [ ] Purchase attribution: link DM conversations to orders
- [ ] Commerce analytics dashboard
- [ ] Influencer database: list + profile + add by @username
- [ ] Collaboration management: CRUD + stage workflow
- [ ] Deliverable tracking + draft review flow
- [ ] Performance report: `CollaborationReport` + EMV calculation
- [ ] Budget tracker + payment tracking

**Deliverable:** Full commerce tracking + influencer marketing CRM.

### Sprint 11 (Week 21–22): Meta Ads Integration

- [ ] Meta Ads Lead Form webhook handler (`handleLeadGenEvent`)
- [ ] Lead form sync polling fallback cron (`/api/cron/sync-ad-leads`)
- [ ] Contact creation from Lead Ads
- [ ] Click-to-DM attribution (referral webhook handling)
- [ ] Ad performance dashboard (Meta Marketing API integration)
- [ ] Creative performance comparison
- [ ] Budget ROI report (organic + paid combined)
- [ ] AI creative recommendations

**Deliverable:** Meta Lead Ads synced to CRM + ad performance visible.

### Sprint 12 (Week 23–24): Advanced AI

- [ ] AI Assistant floating chat UI (ConversationalBI)
- [ ] `handleAIAssistant()` with metrics summary context
- [ ] Conversation outcome prediction (conversion probability in header)
- [ ] Best time to reply prediction (per contact)
- [ ] AI content recommendations (weekly + post-publish)
- [ ] AI contact deduplication detection
- [ ] Sentiment analysis on all inbound messages (fast keyword version + AI fallback)
- [ ] Intent detection → auto-action mapping (complaint → escalate, etc.)

**Deliverable:** AI assistant + predictive analytics live.

### Sprint 13 (Week 25–26): Public API + Security Hardening

- [ ] API keys CRUD (`/api/settings/api-keys`)
- [ ] Public API v1 routes (contacts, conversations, leads, analytics)
- [ ] Outbound webhooks (workspace → customer server)
- [ ] Rate limiting on all API routes (Upstash)
- [ ] DPDP compliance: contact export ZIP, contact deletion cascade
- [ ] Audit log for PII access
- [ ] Security headers (CSP, HSTS, X-Frame-Options)
- [ ] Penetration testing checklist (manual review of OWASP top 10)
- [ ] Full E2E test suite for all critical paths

**Deliverable:** Public API live, security hardened.

---

## Phase 6 — Scale + Multi-Platform (Weeks 27+)
**Goal:** Enterprise features, multi-platform expansion.

- [ ] Stripe billing integration (plan limits enforcement)
- [ ] Multi-workspace support for single users (team agencies)
- [ ] AI reply A/B testing (variant system)
- [ ] Influencer discovery AI (comment-based discovery)
- [ ] WhatsApp channel integration (reuse WhatsApp platform via API)
- [ ] Telegram channel integration
- [ ] Email channel integration
- [ ] White-label (custom domain per workspace)
- [ ] Dedicated Supabase instance per enterprise workspace

---

## Key Milestones

| Milestone | Target Week | Criteria |
|-----------|------------|---------|
| Alpha | Week 4 | Instagram connected, DMs visible |
| Beta | Week 8 | AI replies + full inbox management |
| MVP | Week 12 | CRM + campaigns + team features |
| General Availability | Week 18 | Analytics + content + workflows |
| Pro Launch | Week 24 | Commerce + influencer + ads + advanced AI |
| Enterprise | Week 27+ | Public API + billing + white-label |

---

## Technical Debt Budget

**Acceptable to carry into GA:**
- Grid preview (approximate, not pixel-perfect)
- AI A/B testing (Phase 6)
- PDF report generation (CSV export ships first)
- Push notification analytics (delivery rates)

**Must resolve before GA:**
- All migration scripts tested on a fresh Supabase project
- All RLS policies verified with agent-role user in isolation test
- Webhook idempotency (duplicate message detection via `ig_message_id` UNIQUE)
- Token refresh error alerting (not just silent fail)
