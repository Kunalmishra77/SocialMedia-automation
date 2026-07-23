# 01 — Product Vision

## 1.1 What We Are Building

An enterprise-grade multi-tenant SaaS platform that turns Instagram into a fully automated business channel. The platform covers every surface Instagram exposes — DMs, story replies, story mentions, post comments, Live events, and Reels interactions — unified into a single inbox with AI automation, CRM, content publishing, campaign management, advertising integration, and deep analytics.

**One-line pitch:** "Run your entire Instagram business from one inbox — AI handles the volume, your team handles the relationships."

---

## 1.2 Problems We Solve

| Problem | Today's reality | Our solution |
|---------|----------------|--------------|
| DMs flood is unmanageable | Businesses receive 500+ DMs/day but can only reply to 10% | AI auto-replies 80%, humans handle the remaining 20% that need it |
| Manual replies to comments | Team manually replies to each post comment | Keyword-triggered auto-DM + auto-comment reply in seconds |
| No CRM for Instagram | Contact info lives nowhere; follow-ups forgotten | Every DM contact becomes a CRM record with lead score, temperature, and pipeline stage |
| Story mentions missed | Story mentions drive conversions but businesses miss them | Story mention inbox, auto-DM on mention |
| No scheduling for Instagram | Manual posting from phone at odd hours | Full content calendar with AI-assisted scheduling and one-click publishing |
| 24h window confusion | Teams don't know when they can message someone | Window countdown in UI; approved templates for re-engagement |
| Campaigns violate Meta policy | Businesses bulk-DM without user consent | Window-compliant campaigns only; policy violation guard at send time |
| Influencer chaos | Spreadsheets for tracking collaborations | Built-in influencer CRM with deliverable tracking and performance reporting |

---

## 1.3 Core Features (by priority)

### Must-Have (Phase 1–3)
- Unified inbox: DMs, story replies, comments, story mentions
- AI auto-reply with knowledge base context
- Team inbox with assignment and role-based access
- Visual chatbot flow builder
- 24h window enforcement with approved template fallback
- Window broadcast campaigns (to contacts with active window)
- Post comment automation (comment → auto-DM)
- CRM: contacts, leads, Kanban pipeline
- Analytics: overview KPIs, agent performance, campaign funnels

### High Value (Phase 4–5)
- Content calendar and scheduled publishing
- AI caption, hashtag, and hook generation
- Story engagement campaigns
- Re-engagement campaigns (Meta-approved templates)
- Workflow automation builder (trigger → condition → action)
- Influencer CRM and campaign tracking
- Instagram Shopping integration
- Meta Ads lead sync

### Future / Enterprise (Phase 6+)
- AI assistant (conversational BI, anomaly alerts)
- Predictive analytics (best send time, churn risk)
- Multi-platform channels (WhatsApp, Telegram, LinkedIn, Email)
- Advanced audience segmentation with ML
- A/B testing on AI reply prompts
- White-label reseller program

---

## 1.4 Target Customers

| Segment | Pain point | Key features they'll pay for |
|---------|-----------|------------------------------|
| D2C brands (10k–500k followers) | DM overflow, missed sales | AI DM handling, campaign broadcasts, CRM |
| Service businesses (salons, coaches) | Booking via DM | Flow builder (booking bot), calendar integration |
| E-commerce stores | Shopping questions, order status | Product catalog, order tracking, AI product Q&A |
| Social media agencies | Managing 10+ client accounts | Multi-workspace, white label, post scheduling |
| Influencer managers | Tracking brand deals | Influencer CRM, deliverable tracking |
| Enterprise brands | Volume + compliance | SLA, audit logs, RBAC, advanced analytics |

---

## 1.5 Key Constraints

### Instagram Platform Constraints
1. **24-hour messaging window** — businesses can only send proactive DMs if the user messaged them within the last 24 hours. Outside this window, only Meta-approved Message Templates can be sent.
2. **No cold outreach** — cannot DM arbitrary Instagram users. Can only message contacts who initiated contact.
3. **Rate limits** — Instagram Graph API limits: ~200 DMs per account per hour (varies by account tier). Campaigns must respect this.
4. **Token expiry** — OAuth access tokens expire in 60 days. Must refresh proactively.
5. **Comment reply API** — can reply to comments publicly or send a private DM (limited to one DM per comment per conversation thread).
6. **Story API limitations** — cannot programmatically create or post stories (Meta restriction as of 2026). Can only *receive* story reply events via webhook.
7. **No follower-list access** — cannot access a business's full follower list via the API.
8. **Carousel/Reels publishing** — requires Instagram Content Publishing API with `content_publish` permission. Available to Instagram Business accounts only.

### Business Constraints
- Must comply with Meta's Platform Policy at all times
- No spam-trigger patterns (repeated identical messages, aggressive automation)
- Workspace data must be strictly isolated (RLS)
- GDPR/DPDP: data deletion requests must be honored within 30 days

---

## 1.6 Competitive Landscape

| Competitor | Strengths | What we do better |
|-----------|-----------|-------------------|
| ManyChat | Mature IG flows, large user base | Better AI (not just keywords), real CRM pipeline |
| Manychat Pro | Comment-to-DM automation | Better analytics, influencer CRM, content calendar |
| Hootsuite | Great scheduling | Much better DM management and AI |
| Sprout Social | Enterprise analytics | More affordable, deeper IG-native automation |
| Agorapulse | Team inbox, scheduling | AI auto-reply, flow builder, lead scoring |
| Freshdesk Social | Customer support | Native IG commerce, influencer CRM |
| Later | Best-in-class scheduling | We add DM + AI + CRM missing in Later |

**Our differentiation:** We are the only platform combining (1) AI-native DM automation, (2) full CRM pipeline, (3) content publishing, and (4) influencer management in one product at a price point accessible to SMBs.

---

## 1.7 Success Metrics

| Metric | Phase 1 target | Phase 3 target |
|--------|----------------|----------------|
| Bot handle rate | > 60% of DMs handled by AI without human | > 80% |
| First response time | < 30 seconds for AI reply | < 5 seconds |
| Comment auto-DM rate | — | > 95% sent within 10 seconds |
| Campaign delivery rate | — | > 90% delivered |
| Lead conversion from DM | — | Tracked and visible |
| MRR per workspace | ₹1,499 avg | ₹2,999 avg |
