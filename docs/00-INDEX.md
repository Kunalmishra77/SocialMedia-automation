# Instagram Automation Platform — Master Blueprint Index

> **For AI agents:** Read each file in order before starting work on that section. Every file is self-contained. Files are numbered — work from 01 to 26 in sequence.

**Project:** Instagram Automation Platform (standalone SaaS, separate repo from WhatsApp platform)  
**Stack:** Next.js 15 + Supabase + Tailwind CSS + shadcn/ui + OpenAI/OpenRouter  
**Version:** 2.0 (expanded edition)  
**Date:** 2026-07-10  

---

## File Index

| File | Section | Phase |
|------|---------|-------|
| [01-product-vision.md](01-product-vision.md) | Product goals, constraints, competitors | Pre-dev |
| [02-system-architecture.md](02-system-architecture.md) | High-level architecture, tech stack, deployment model | Pre-dev |
| [03-multi-tenant.md](03-multi-tenant.md) | Workspace, roles, plans, session management | Phase 1 |
| [04-database-schema.md](04-database-schema.md) | All tables, indexes, RLS, triggers, functions | Phase 1 |
| [05-instagram-integration.md](05-instagram-integration.md) | OAuth, webhooks, Graph API, token refresh | Phase 1 |
| [06-inbox-module.md](06-inbox-module.md) | Conversations, messages, real-time, 24h window | Phase 1 |
| [07-ai-automation.md](07-ai-automation.md) | AI reply engine, chatbot flows, KB, escalation | Phase 2 |
| [08-content-studio.md](08-content-studio.md) | Content calendar, scheduling, AI captions, publishing | Phase 2 |
| [09-campaign-module.md](09-campaign-module.md) | All campaign types, execution engine, templates | Phase 3 |
| [10-workflow-automation.md](10-workflow-automation.md) | Visual workflow builder (trigger→condition→action) | Phase 3 |
| [11-crm-leads.md](11-crm-leads.md) | Contacts, leads, pipeline, 360 view, auto-scoring | Phase 4 |
| [12-advanced-analytics.md](12-advanced-analytics.md) | All analytics dashboards, reports, AI insights | Phase 4 |
| [13-influencer-creator.md](13-influencer-creator.md) | Influencer CRM, collaboration, brand partnerships | Phase 5 |
| [14-commerce.md](14-commerce.md) | Instagram Shopping, catalog, orders, purchase tracking | Phase 5 |
| [15-advertising.md](15-advertising.md) | Meta Ads integration, lead ads, ROI reporting | Phase 5 |
| [16-advanced-ai.md](16-advanced-ai.md) | AI assistant, predictive analytics, engagement scoring | Phase 6 |
| [17-collaboration.md](17-collaboration.md) | Team inbox, tasks, approval workflows, internal chat | Phase 3 |
| [18-mobile-pwa.md](18-mobile-pwa.md) | PWA, push notifications, mobile UX | Phase 4 |
| [19-security.md](19-security.md) | Auth, RLS, webhook security, data retention, API keys | Phase 1 |
| [20-api-design.md](20-api-design.md) | Complete API route map, error codes, public API | Phase 1+ |
| [21-frontend-architecture.md](21-frontend-architecture.md) | App structure, modules, state management, realtime | Phase 1+ |
| [22-background-services.md](22-background-services.md) | pg_cron, queues, campaign executor, token refresh | Phase 1+ |
| [23-devops.md](23-devops.md) | Docker, Coolify, env vars, migrations, monitoring | Phase 1 |
| [24-testing.md](24-testing.md) | Unit, integration, E2E test strategy + examples | Phase 1+ |
| [25-roadmap.md](25-roadmap.md) | Phased roadmap with exact tasks per sprint | All |
| [26-future-platforms.md](26-future-platforms.md) | Multi-channel extension: LinkedIn, Telegram, Email, X | Future |
| [27-platform-admin.md](27-platform-admin.md) | Platform super-admin panel: workspaces, billing, impersonation, flags, audit | Add-on |
| [28-multi-channel-automation.md](28-multi-channel-automation.md) | Channel adapter pattern: FB, Telegram, LinkedIn, YouTube, X, TikTok, Pinterest | Add-on |

---

## Quick Reference: Key Design Decisions

1. **Single-conversation-per-contact** per Instagram account — same as WhatsApp platform
2. **24-hour messaging window** strictly enforced at DB + app layer
3. **IGSID** (Instagram User ID) is the primary contact identifier — no phone numbers
4. **Multi-account** — one workspace can connect multiple IG accounts
5. **Agent role isolation** — RLS-enforced, agents see only assigned conversations
6. **DB-backed queues** — no separate MQ; campaigns queue in PostgreSQL
7. **pg_cron for all scheduled work** — token refresh, SLA, sequences, triggers
8. **OpenRouter fallback** — if OpenAI key absent, routes to OpenRouter
9. **Supabase Realtime** — websocket subscriptions for live inbox updates
10. **One migration per feature** — idempotent SQL files, numbered sequentially
