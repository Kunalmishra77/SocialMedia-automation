# 16 — Advanced AI Features

**Priority:** Phase 4–5 (Pro/Enterprise plan)

## 16.1 AI Assistant (Conversational BI)

An in-app AI chat interface where the workspace owner or admin can ask questions about their data in plain language and receive answers with supporting charts.

**Interface:** Floating chat bubble in bottom-right corner (toggleable). Not a separate page.

**Examples:**
- "How many leads did we close last month?"
- "Which Instagram post generated the most DMs?"
- "What's our average reply time this week?"
- "Show me contacts who haven't been followed up in 3 days"
- "Which campaign had the best reply rate?"

```typescript
// POST /api/ai/assistant
// Auth: must be admin/manager

interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  chart?: ChartSpec   // if the answer includes a chart
  action?: AssistantAction  // if the AI suggests an action
}

interface AssistantAction {
  type: 'create_campaign' | 'view_leads' | 'open_conversation' | 'run_report'
  label: string
  href: string
}

export async function handleAIAssistant(
  workspaceId: string,
  conversationHistory: AssistantMessage[],
  userMessage: string
): Promise<AssistantMessage> {
  
  // Fetch summary metrics for context (not all data)
  const metrics = await fetchMetricsSummary(workspaceId)
  
  const systemPrompt = `
You are an AI assistant embedded in an Instagram automation platform called Agentix.
You help the workspace team understand their data and take actions.

Current workspace metrics summary:
${JSON.stringify(metrics, null, 2)}

Today's date: ${new Date().toISOString().split('T')[0]}

When answering:
1. Be concise — 1-3 sentences for simple questions
2. If the user asks for data you don't have in the summary, say what query you'd need to run and offer to try
3. If the answer would benefit from a chart, include chart_spec in your response
4. Suggest follow-up actions when appropriate
5. If asked to do something (create campaign, send message), say you can't do it directly but provide the deep link

Respond in JSON:
{
  "content": "...",
  "chart_spec": null or { "type": "bar|line|pie", "title": "...", "data": [...] },
  "action": null or { "type": "...", "label": "...", "href": "..." }
}
`

  const messages = [
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage }
  ]
  
  const result = await callAI(messages, {
    model: getModel(null, 'analytics_model'),
    maxTokens: 600,
    temperature: 0.3,
    systemPrompt,
    response_format: { type: 'json_object' }
  })
  
  const parsed = JSON.parse(result)
  return {
    role: 'assistant',
    content: parsed.content,
    chart: parsed.chart_spec,
    action: parsed.action,
  }
}
```

**Metric summary fetched before each call** (keeps context small):
- Total contacts, new this week
- Open/pending/resolved conversation counts
- Campaign stats (last 30 days)
- Lead pipeline by stage
- Revenue closed (last 30 days)
- Active Instagram accounts

---

## 16.2 Predictive Analytics

### Conversation Outcome Prediction

At conversation start, predict likelihood of lead conversion:

```typescript
// Called after 3+ messages exchanged
// Runs in background, doesn't block replies
async function predictConversationOutcome(conversationId: string): Promise<void> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('conversations')
    .select('*, messages(*), contacts(*), leads(*)')
    .eq('id', conversationId).single()
  
  const lastMessages = data.messages.slice(-5)
  const prompt = `
Predict: will this Instagram conversation convert to a sale?
Contact: @${data.contacts.ig_username}, ${data.contacts.ig_followers_count} followers
Messages so far:
${lastMessages.map(m => `${m.sender_type}: ${m.content}`).join('\n')}
Current lead stage: ${data.leads?.[0]?.stage ?? 'none'}

Return JSON: {
  "conversion_probability": 0.0-1.0,
  "confidence": "low|medium|high",
  "reasoning": "...",
  "recommended_action": "..."
}`
  
  const result = await callAI([{ role: 'user', content: prompt }], {
    model: getModel(null, 'classification_model'),
    maxTokens: 200,
    temperature: 0.2,
    response_format: { type: 'json_object' }
  })
  
  const prediction = JSON.parse(result)
  await supabase.from('conversations').update({
    ai_conversion_probability: prediction.conversion_probability,
    ai_prediction_updated_at: new Date().toISOString(),
  }).eq('id', conversationId)
}
```

**Display:** In the conversation header, a probability bar (e.g. "68% conversion likelihood") visible to agents. Color-coded: <30% gray, 30-60% amber, >60% green.

### Best Time to Reply Prediction

```typescript
// Analyze per-contact engagement patterns
// When is this specific contact most likely to respond quickly?
async function predictBestReplyTime(contactId: string): Promise<{ bestHour: number; timezone: string }> {
  const supabase = createAdminClient()
  const messages = await supabase.from('messages')
    .select('created_at, direction')
    .eq('contact_id', contactId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: true })
    .limit(50)
  
  // Count inbound messages by hour
  const hourCounts: Record<number, number> = {}
  for (const msg of messages.data ?? []) {
    const hour = new Date(msg.created_at).getUTCHours()
    hourCounts[hour] = (hourCounts[hour] || 0) + 1
  }
  
  const bestHour = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? '10'
  
  return { bestHour: parseInt(bestHour), timezone: 'UTC' }
}
```

---

## 16.3 Engagement Scoring (per contact)

A composite score (0–100) that combines:

| Factor | Weight | Source |
|--------|--------|--------|
| Message count | 20% | COUNT(messages) |
| Reply speed (contact) | 15% | avg(next_inbound - outbound) |
| Keyword signals | 25% | detectLeadTemperature() |
| Profile quality (followers/bio) | 10% | ig_followers_count |
| Content interactions | 15% | comments, story replies, reactions |
| Time since last contact | 15% | last_user_message_at |

```typescript
// lib/engagement-score.ts
export function computeEngagementScore(contact: IGContact, messages: Message[]): number {
  let score = 0
  
  // Message count (max 20 pts)
  const msgCount = messages.filter(m => m.direction === 'inbound').length
  score += Math.min(msgCount * 2.5, 20)
  
  // Keyword signals (max 25 pts)
  const lastMessages = messages.slice(-5).map(m => m.content).join(' ')
  if (/buy|purchase|interested|price|khareed/i.test(lastMessages)) score += 25
  else if (/know more|tell me|how much/i.test(lastMessages)) score += 15
  
  // Profile quality (max 10 pts)
  const followers = contact.ig_followers_count ?? 0
  if (followers > 10000) score += 10
  else if (followers > 1000) score += 6
  else score += 2
  
  // Recency (max 15 pts — subtract for staleness)
  const lastMsg = contact.last_user_message_at
  if (lastMsg) {
    const hoursAgo = (Date.now() - new Date(lastMsg).getTime()) / 36e5
    if (hoursAgo < 24) score += 15
    else if (hoursAgo < 72) score += 10
    else if (hoursAgo < 168) score += 5
  }
  
  return Math.min(Math.round(score), 100)
}
```

Engagement score is computed and stored on `contacts.engagement_score` (updated by trigger when a new message arrives). Used to:
- Sort contacts list by "most engaged" 
- Power the "Hot Leads" view in CRM
- Inform campaign audience filtering

---

## 16.4 Sentiment Analysis

Real-time sentiment classification on inbound messages:

```typescript
// lib/sentiment.ts
type Sentiment = 'positive' | 'neutral' | 'negative'

// Fast: keyword-based (no API call needed)
export function detectSentimentFast(text: string): Sentiment {
  const NEGATIVE = /angry|angry|unhappy|terrible|horrible|worst|refund|cheated|fraud|disappointed|waste|spam/i
  const POSITIVE = /love|great|amazing|excellent|happy|thank|awesome|brilliant|perfect|wonderful/i
  if (NEGATIVE.test(text)) return 'negative'
  if (POSITIVE.test(text)) return 'positive'
  return 'neutral'
}

// Slow: AI-based (called for ambiguous cases or after 3+ messages)
export async function detectSentimentAI(text: string): Promise<Sentiment> {
  const result = await callAI([{
    role: 'user',
    content: `Classify sentiment: "${text}"\nReturn JSON: {"sentiment": "positive|neutral|negative"}`
  }], { model: 'gpt-4o-mini', maxTokens: 20, temperature: 0 })
  return JSON.parse(result).sentiment
}
```

**Usage:**
- Stored on `messages.sentiment` column
- Aggregated in conversation analytics (sentiment breakdown by day)
- Negative sentiment triggers immediate escalation flag (sets `conversations.escalated = true`)
- Shown in agent inbox as colored dot (green/gray/red) on each message

---

## 16.5 Intent Detection

Before generating an AI reply, classify the user's intent to select the best reply template/flow:

```typescript
// Already in 07-ai-automation.md as categorizeMessage()
// Extended with these categories:
type MessageCategory =
  | 'price_inquiry'
  | 'product_question'
  | 'booking_request'
  | 'complaint'
  | 'compliment'
  | 'order_status'
  | 'refund_request'
  | 'general_inquiry'
  | 'off_topic'
  | 'greeting'
  | 'unsubscribe'
```

**Intent → Action mapping:**
| Intent | Auto-action |
|--------|-------------|
| `complaint` | Immediate escalation to human |
| `refund_request` | Escalation + tag contact with `refund_request` |
| `booking_request` | Trigger booking flow node |
| `unsubscribe` | Tag contact `do_not_contact`, reply with acknowledgment |
| `price_inquiry` | Include pricing KB context in AI reply |

---

## 16.6 AI Content Recommendations

After publishing each post, and weekly as a report:

```typescript
// POST /api/ai/content-recommendations
// Based on top-performing posts in the last 30 days

export async function generateContentRecommendations(workspaceId: string): Promise<string[]> {
  const topPosts = await fetchTopPosts(workspaceId, 30, 5)
  const accountInsights = await fetchAccountInsights(workspaceId)
  
  const prompt = `
Based on these top-performing Instagram posts for this account:
${topPosts.map(p => `- ${p.type} | Engagement: ${p.engagement_rate}% | Caption: "${p.caption_snippet}"`).join('\n')}

Account audience: ${JSON.stringify(accountInsights.demographics)}
Follower growth trend: ${accountInsights.followerGrowth30d > 0 ? 'growing' : 'declining'}

Generate 5 actionable content recommendations. Focus on:
- Which content type to post more of (and why)
- Best days/times to post based on their engagement pattern
- Caption strategy (tone, length, CTA)
- Hashtag strategy
- Story/Reel ratio recommendation

Return JSON: { "recommendations": ["...", ...] }
`
  
  const result = await callAI([{ role: 'user', content: prompt }], {
    model: getModel(null, 'analytics_model'),
    maxTokens: 600, temperature: 0.5,
    response_format: { type: 'json_object' }
  })
  
  const { recommendations } = JSON.parse(result)
  
  // Cache for 12 hours
  await setCacheValue(`ai:content-recs:${workspaceId}`, recommendations, 43200)
  return recommendations
}
```

---

## 16.7 AI-Powered Contact Deduplication

When importing contacts or connecting a new IG account:

```typescript
// Detect potential duplicate contacts:
// Same ig_username but different ig_user_id (account rename)
// Same email in custom_fields
// Very similar name + follower count

async function detectDuplicates(workspaceId: string): Promise<DuplicatePair[]> {
  // Query contacts with same email
  const emailDups = await supabase.rpc('find_duplicate_contacts_by_email', { workspace_id: workspaceId })
  
  // Query contacts with very similar names (levenshtein distance < 2)
  const nameDups = await supabase.rpc('find_duplicate_contacts_by_name', { workspace_id: workspaceId })
  
  // AI disambiguation for uncertain pairs
  // Merge confirmation requires human approval
  return [...emailDups, ...nameDups]
}
```

---

## 16.8 AI Reply Optimization (A/B Learning)

When `ai_reply_ab_test` feature flag is enabled:

1. For each outgoing AI reply, store an alternate version (generated with a different temperature or prompt variant)
2. Track which conversation goes on to have more replies from the contact
3. After 100 samples, determine which prompt variant produces more engagement
4. Auto-select the winning variant

```typescript
interface AIVariantResult {
  variant: 'A' | 'B'
  conversationId: string
  subsequentMessages: number  // how many more messages the contact sent after this reply
}
```

This is a long-horizon A/B test — requires weeks of data. Mark as Phase 6 feature.
