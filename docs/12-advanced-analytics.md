# 12 — Advanced Analytics

## 12.1 Analytics Overview Dashboard

**Route:** `GET /api/analytics/overview?workspaceId=&from=&to=&igAccountId=`

All metrics support date range filtering and per-account filtering.

### KPI Cards

| KPI | Calculation | Trend |
|-----|------------|-------|
| New contacts | COUNT(contacts WHERE created_at IN range) | vs previous period |
| DMs received | COUNT(messages WHERE direction=inbound IN range) | ↑↓ % |
| DMs sent (AI + agent) | COUNT(messages WHERE direction=outbound IN range) | ↑↓ % |
| Bot handle rate | (AI sent / total sent) × 100 | — |
| Avg first response time | AVG(first_replied_at - created_at) per conversation | — |
| Conversations resolved | COUNT(conversations WHERE resolved_at IN range) | — |
| Active 24h windows | COUNT(contacts WHERE last_user_message_at > NOW()-24h) | — |
| Comment automations triggered | SUM(post_automations.trigger_count changes in range) | — |
| Campaign DMs sent | COUNT(campaign_recipients WHERE status=sent AND sent_at IN range) | — |
| Leads created | COUNT(leads WHERE created_at IN range) | — |
| Hot leads | COUNT(leads WHERE temperature=hot AND created_at IN range) | — |
| Lead conversion rate | converted / total leads × 100 | — |

---

## 12.2 Conversation Analytics

```typescript
// GET /api/analytics/conversations?from=&to=
{
  byStatus: { open: N, pending: N, resolved: N, snoozed: N },
  byChannel: { dm: N, comment: N, story_reply: N, story_mention: N },
  dailyVolume: [{ date, inbound, outbound, resolved }],
  responseTimeDistribution: [{ bucket: '0-5min', count: N }, ...],
  topLabels: [{ label, count }],
  peakHours: [{ hour: 0-23, avg_messages: N }],  // when contacts are most active
  sentimentBreakdown: { positive: N, neutral: N, negative: N },
  categoryBreakdown: { sales: N, support: N, booking: N, inquiry: N, ... },
}
```

---

## 12.3 Agent Performance Analytics

```typescript
// GET /api/analytics/agents?from=&to=
[{
  agent_id: string,
  agent_name: string,
  conversations_handled: number,
  messages_sent: number,
  avg_first_response_time_seconds: number,
  avg_resolution_time_seconds: number,
  conversations_resolved: number,
  csat_score: number | null,
  escalations_received: number,
  bot_resumes: number,  // how often they resumed bot
}]
```

**Charts:** Bar chart comparison across agents, line chart for avg response time over time.

---

## 12.4 Content Performance Analytics

```typescript
// GET /api/analytics/content?from=&to=&igAccountId=
{
  // Published posts performance
  topPosts: [{
    ig_media_id, type, caption_snippet, thumbnail,
    reach, impressions, likes, comments, shares, saves,
    engagement_rate, published_at, ig_post_url
  }],
  
  // Post type breakdown
  byType: { feed: {avg_reach, avg_engagement}, reel: {...}, carousel: {...} },
  
  // Best performing hashtags
  topHashtags: [{ hashtag, avg_reach, avg_engagement, post_count }],
  
  // Best day/hour to post
  engagementByDayHour: [{ day: 0-6, hour: 0-23, avg_engagement_rate }],
  
  // Content categories
  topCategories: [{ category, post_count, avg_reach }],
  
  // Follower growth
  followerGrowth: [{ date, followers, gained, lost }],
  
  // Story performance  
  storyViews: [{ date, avg_views, avg_exit_rate }],
}
```

---

## 12.5 Campaign Analytics

```typescript
// GET /api/analytics/campaigns?from=&to=
{
  totalCampaigns: N,
  byType: {
    window_broadcast: { count, avg_send_rate, avg_reply_rate },
    post_comment: { count, avg_trigger_count },
    re_engagement: { count, avg_open_rate },
  },
  deliveryFunnel: { targeted, filtered, sent, delivered, read, replied },
  topCampaigns: [{ name, sent, read_rate, reply_rate }],
  bestSendTimes: [{ hour, avg_read_rate }],
  replyConversionRate: number,  // replied → lead created / total replied
}
```

---

## 12.6 Lead & CRM Analytics

```typescript
// GET /api/analytics/crm?from=&to=
{
  pipelineByStage: [{ stage, count, total_value }],
  temperatureBreakdown: { cold: N, warm: N, hot: N },
  sourceBreakdown: { dm: N, comment: N, story_reply: N, lead_ad: N, ... },
  conversionFunnel: { created, contacted, interested, converted, lost },
  avgTimeToConvert: number,  // days from lead creation to converted stage
  topSources: [{ source, lead_count, conversion_rate }],
  avgLeadScore: number,
  highValueLeads: N,  // leads with value > threshold
  totalPipelineValue: number,
  wonValue: number,
  lostValue: number,
}
```

---

## 12.7 Audience Insights

```typescript
// GET /api/analytics/audience?igAccountId=
{
  demographics: {  // from Meta Insights API
    age: [{ range: '18-24', percentage }],
    gender: { male: %, female: %, other: % },
    country: [{ code, percentage }],
    city: [{ name, percentage }],
  },
  activeHours: [{ day, hour, percentage }],  // when followers are online
  followerGrowth30d: number,
  reachGrowth30d: number,
  profileViews30d: number,
  websiteClicks30d: number,
  contactsWithActiveWindow: N,
}
```

---

## 12.8 Revenue & Conversion Analytics

```typescript
// GET /api/analytics/revenue?from=&to=
{
  totalLeadsCreated: N,
  leadsConverted: N,
  conversionRate: number,
  totalPipelineValue: number,
  closedWonValue: number,
  averageDealSize: number,
  avgTimeToClose: number,
  revenueBySource: [{ source, won_count, won_value }],
  revenueByAgent: [{ agent, won_count, won_value }],
  forecastNextMonth: number,  // based on hot leads in pipeline
  cltv: number,  // Customer Lifetime Value average
}
```

---

## 12.9 AI Insights

**Route:** `POST /api/ai/analytics-insights`

The AI analyzes the workspace's analytics data and surfaces non-obvious insights:

```typescript
interface AIInsight {
  type: 'anomaly' | 'opportunity' | 'recommendation' | 'trend'
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
  metric?: string
  value?: number
  action?: string       // recommended action
  cta_url?: string      // deep link to relevant page
}
```

**Example insights:**
- "🔥 Reply rate dropped 40% on Tuesdays — consider pausing campaigns on that day"
- "⚡ Your Reel posted at 6pm on Friday got 3× more comments than average"
- "💡 23 hot leads haven't been contacted by an agent in > 48 hours"
- "📈 The hashtag #skincareroutine drives 2× more leads than your other hashtags"
- "⚠️ Token for @yourbrand expires in 5 days — refresh in Settings"
- "🎯 Contacts from story mentions have 65% higher conversion rate than DM contacts"

**Implementation:**
```typescript
export async function generateAnalyticsInsights(workspaceId: string): Promise<AIInsight[]> {
  const metrics = await fetchAllMetrics(workspaceId, '30d')
  const prompt = buildInsightsPrompt(metrics)
  const model = getModel(wsSettings, 'analytics_model')
  const result = await callAI([{ role: 'user', content: prompt }], {
    model, maxTokens: 1000, temperature: 0.4,
    response_format: { type: 'json_object' }
  })
  return JSON.parse(result).insights
}
```

Insights are cached for 6 hours (avoid re-computing on every page load).

---

## 12.10 Reports

### Export Formats
- CSV export for any table/chart (`/api/reports/export?type=contacts|leads|campaigns|conversations`)
- Excel (.xlsx) for multi-sheet reports
- PDF reports (generated server-side with puppeteer or @react-pdf/renderer)

### Scheduled Reports
Admins can schedule automatic weekly/monthly report emails to team members.

```sql
CREATE TABLE public.scheduled_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  report_type  TEXT NOT NULL,  -- weekly_summary|monthly_summary|campaign_report
  recipients   TEXT[],         -- email addresses
  schedule     TEXT,           -- cron expression: '0 9 * * 1' = every Monday 9am
  is_active    BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 12.11 Bio Link & UTM Tracking

When a workspace uses a link-in-bio service (Linktree, etc.) or their own website, the platform can track:
- Clicks from Instagram profile link
- UTM-tagged links shared in DMs (tracked via redirect)
- QR code scans (generate workspace-specific QR codes that redirect + log)

```sql
CREATE TABLE public.link_clicks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  link_code    VARCHAR(32),    -- short identifier
  target_url   TEXT,
  source       TEXT,           -- dm|bio|qr|campaign
  campaign_id  UUID REFERENCES campaigns,
  contact_id   UUID REFERENCES contacts,
  ip_address   INET,
  user_agent   TEXT,
  clicked_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Redirect endpoint: GET /api/l/[code] → log + redirect to target_url
```
