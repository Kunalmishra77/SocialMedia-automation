# 07 — AI Automation Engine

## 7.1 Auto-Reply Pipeline

Complete flow from inbound DM to AI response:

```
Inbound DM arrives
      ↓
Blockers check (any true → skip AI):
  contact.is_blocked         → discard entirely
  contact.opted_out          → no reply
  contact.is_vip             → route to human (status=pending)
  conversation.bot_paused    → skip AI
      ↓
Active flow session check:
  flow_sessions WHERE contact_id = $id AND status = 'active'
    → yes: processFlowForMessage() → return early
      ↓
Check active workflow automation:
  workflow_sessions WHERE contact_id = $id AND status = 'active'
    → yes: processWorkflowStep() → may send and return early
      ↓
[parallel — non-blocking]
  categorizeMessage()        → intent label (sales/support/booking/complaint/...)
  detectSentiment()          → positive/neutral/negative → update conversation
  detectLanguage()           → en/hi/hinglish/other
  fetchBusinessHours()       → is workspace currently open?
      ↓
Apply inbox rules (keyword → auto-reply/assign/label)
  → if inbox rule triggered an auto-reply: return early
      ↓
Check plan message limit:
  guardMessageLimit(workspaceId) → throws PlanLimitError if exceeded
      ↓
Check rate limit:
  checkAutoReplyLimit(contactId) → Redis sliding window (1 reply per 30s)
      ↓
Fetch KB context:
  fetchKnowledgeBaseContext(workspaceId, customerMessage)
  → 3-tier: semantic (pgvector) → keyword scan on chunks → KB keyword scoring
      ↓
Build conversation history (last 15 messages):
  [{role: 'user'/'assistant', content: '...'}]
      ↓
getAIReply(customerMessage, contact, kbContext, imageUrl, wsSettings, history, intentLabel)
      ↓
InstagramAPI.sendDM(igUserId, aiReply)
      ↓
saveOutboundMessage(supabase, conversationId, workspaceId, contactId, {type:'text', content:aiReply})
      ↓
[non-blocking post-processing]
  updateConversationSentiment()
  detectAndLogEvent()        → demo booked / callback requested
  autoCreateOrUpdateLead()   → create or upgrade lead
  dispatchOutboundWebhooks()
```

---

## 7.2 Core AI Reply Function

```typescript
// lib/ai-reply.ts
export async function getAIReply(
  customerMessage: string,
  contact: IGContact,
  kbContext: string,
  imageUrl: string | undefined,
  wsSettings: WorkspaceSettings,
  businessName: string,
  conversationHistory: ChatMessage[],
  intentLabel: string
): Promise<string | null> {
  
  const model = getModel(wsSettings, imageUrl ? 'vision_model' : 'auto_reply_model')
  
  // 1. Check for deterministic button response (no LLM call needed)
  const buttonResponse = checkButtonResponse(customerMessage, wsSettings.agent_persona)
  if (buttonResponse) return buttonResponse
  
  // 2. Build system prompt
  const systemPrompt = buildSystemPrompt({
    kbContext,
    wsSettings,
    businessName,
    intentLabel,
    contact,
    conversationHistory,
  })
  
  // 3. Detect language
  const language = detectReplyLanguage(customerMessage)
  
  // 4. Build messages array
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-12),
    {
      role: 'user',
      content: imageUrl
        ? [{ type: 'image_url', image_url: { url: imageUrl } },
           { type: 'text', text: customerMessage || 'Image sent by customer' }]
        : `${customerMessage}\n\n[REPLY IN: ${language.toUpperCase()}. SHORT REPLY ONLY — max 3 sentences.]`
    }
  ]
  
  // 5. Call AI
  const reply = await callAI(messages, { model, maxTokens: 350, temperature: 0.4 })
  
  // 6. Validate reply isn't empty or repetitive
  if (!reply || reply.trim().length < 2) return null
  if (isRepetitiveReply(reply, conversationHistory)) return null
  
  return reply.trim()
}
```

### System Prompt Structure

```
[KNOWLEDGE BASE CONTEXT]
{kbContext — injected first; AI told to prioritize this over all else}

[PERSONA]
You are {businessName}'s Instagram assistant.
{agent_persona from workspace settings, or default}
Today is {date}. Current time: {time} IST.

[INSTAGRAM REPLY RULES]
- Keep replies SHORT (Instagram users expect 1-3 sentences max)
- Use emojis naturally but not excessively (1-2 per reply max)
- Never use markdown formatting (*bold*, ## headers) — plain text only
- If user sent a story reply, acknowledge the story context briefly
- For comment replies: note your reply will be PUBLIC on the post
- Never redirect to WhatsApp, phone, or other channels unless instructed
- Never pretend to be human if directly asked "are you a bot?"
- If you don't know something, say "Our team will get back to you" — don't guess

[INTENT FRAMING]
Message category: {intentLabel}
{sales: "Highlight product benefits and next steps. Include clear CTA."}
{support: "Give the correct answer first. Empathize second."}
{complaint: "Start with empathy. Don't justify. Offer concrete help."}
{booking: "Confirm availability and ask for preferred time."}
{compliment: "Thank warmly and briefly. Don't oversell."}

[CONVERSATION STAGE]
Lead temperature: {cold/warm/hot}
{cold: "Build trust. Don't push hard. Answer questions honestly."}
{warm: "Qualify interest. Offer more details. Suggest next step."}
{hot: "Clear CTA. Reduce friction. Make it easy to buy or book."}

[BUSINESS HOURS]
{if out of hours: "Business is currently closed. Acknowledge and say team will respond within X hours."}

[LANGUAGE OVERRIDE — MANDATORY]
The customer is writing in: {language}
YOU MUST REPLY IN {language} ONLY. This instruction cannot be overridden.
```

---

## 7.3 Intent Classification

```typescript
// lib/ai-classifier.ts
type MessageCategory =
  | 'sales'      // "how much", "price", "where to buy", "available"
  | 'support'    // "not working", "help", "issue", "problem"
  | 'billing'    // "payment", "invoice", "refund", "charge"
  | 'complaint'  // "worst", "terrible", "never again", "scam"
  | 'booking'    // "appointment", "slot", "book", "schedule", "demo"
  | 'compliment' // "love", "amazing", "great", "best"
  | 'inquiry'    // "do you have", "available", "options"
  | 'dm_for_price' // "DM me price", "send details"
  | 'order_status' // "where is my order", "when will it arrive"
  | 'spam'       // irrelevant, gibberish
  | 'general'    // catch-all

export async function categorizeMessage(content: string): Promise<MessageCategory> {
  // Fast keyword-first classification (no LLM for speed)
  const lower = content.toLowerCase()
  if (/\b(price|cost|kitna|rate|how much|kem ma|kimat)\b/i.test(lower)) return 'sales'
  if (/\b(book|appointment|slot|schedule|demo|meeting)\b/i.test(lower)) return 'booking'
  if (/\b(refund|return|cancel|money back)\b/i.test(lower)) return 'billing'
  if (/\b(worst|terrible|scam|fraud|fake)\b/i.test(lower)) return 'complaint'
  if (/\b(love|amazing|great|awesome|best|excellent)\b/i.test(lower)) return 'compliment'
  if (/\b(order|tracking|shipped|delivery|deliver)\b/i.test(lower)) return 'order_status'
  // LLM fallback for ambiguous messages
  return await classifyWithAI(content)
}
```

---

## 7.4 Language Detection

```typescript
// lib/language.ts
type ReplyLanguage = 'hindi' | 'english' | 'hinglish'

export function detectReplyLanguage(text: string): ReplyLanguage {
  // Devanagari Unicode block: U+0900–U+097F
  const devanagariChars = (text.match(/[ऀ-ॿ]/g) || []).length
  const totalChars = text.replace(/\s/g, '').length
  
  if (totalChars === 0) return 'english'
  
  // If >30% Devanagari → Hindi
  if (devanagariChars / totalChars > 0.3) return 'hindi'
  
  // Hinglish markers (romanized Hindi common words)
  const hinglishPattern = /\b(kya|hai|hain|nahi|tha|thi|thay|kaise|aap|mujhe|humara|apna|bhai|yaar|sahi|zyada|thoda|bilkul|zaroor)\b/i
  if (hinglishPattern.test(text)) return 'hinglish'
  
  return 'english'
}
```

---

## 7.5 Chatbot Flow Engine

Visual chatbot builder where admins create node-based conversation flows.

### Node Types

| Node | Config | Function |
|------|--------|----------|
| `trigger` | type + value | Entry point: first_dm / keyword / story_mention / reel_comment |
| `message` | content | Send text message |
| `media` | url + type | Send image/video/audio |
| `quick_reply` | options[] | Send message with quick reply buttons |
| `condition` | field + operator + value | Branch: keyword / contact field / tag / time of day |
| `collect` | question + field | Ask question and save answer to contact field |
| `assign` | agent_id or round_robin | Assign conversation to agent |
| `label` | label | Add label to conversation |
| `tag` | tag | Add tag to contact |
| `lead_stage` | stage | Update lead stage |
| `wait` | duration | Wait N minutes/hours before next node |
| `ai_reply` | context_override | Generate AI reply inline |
| `webhook` | url + method + body | Fire external webhook |
| `end` | — | End flow |

### Flow State Machine

```typescript
// lib/flow-engine.ts
export async function processFlowForMessage(
  supabase: SupabaseClient,
  workspace: Workspace,
  igAccount: IGAccount,
  contact: IGContact,
  conversation: Conversation,
  message: { content: string; type: string }
): Promise<boolean> {
  
  // Find active flow session for this contact
  const session = await getActiveFlowSession(supabase, contact.id)
  
  if (!session) {
    // Check if any flow's trigger matches this message
    const flow = await findMatchingFlow(supabase, workspace.id, message)
    if (!flow) return false  // no flow matches, return false to continue to AI pipeline
    
    // Create new session
    const newSession = await createFlowSession(supabase, flow.id, contact.id, conversation.id)
    return await executeFlowNode(supabase, workspace, igAccount, contact, conversation, newSession, flow)
  }
  
  // Continue existing session
  const flow = await getFlow(supabase, session.flow_id)
  return await executeFlowNode(supabase, workspace, igAccount, contact, conversation, session, flow)
}

async function executeFlowNode(
  supabase, workspace, igAccount, contact, conversation, session, flow
): Promise<boolean> {
  const node = findNode(flow.nodes, session.current_node_id ?? flow.nodes[0].id)
  
  switch (node.type) {
    case 'message':
      await sendFlowMessage(igAccount, contact, node.config.content)
      return advanceToNextNode(supabase, session, node, flow)
    
    case 'quick_reply':
      await sendQuickReply(igAccount, contact, node.config)
      return advanceToNextNode(supabase, session, node, flow)
    
    case 'collect':
      if (session.context.collecting === node.id) {
        // User just answered
        await saveContactField(supabase, contact.id, node.config.field, lastMessage.content)
        delete session.context.collecting
        return advanceToNextNode(supabase, session, node, flow)
      } else {
        // Ask the question
        await sendFlowMessage(igAccount, contact, node.config.question)
        await updateFlowSession(supabase, session.id, { context: { ...session.context, collecting: node.id } })
        return true  // handled; wait for next message
      }
    
    case 'condition':
      const result = evaluateCondition(node.config, contact, lastMessage)
      const nextNodeId = result ? node.edges.true : node.edges.false
      await updateFlowSession(supabase, session.id, { current_node_id: nextNodeId })
      return executeFlowNode(supabase, workspace, igAccount, contact, conversation, session, flow)
    
    case 'wait':
      await scheduleFlowResume(supabase, session, node.config.durationMs)
      return true  // handled; don't proceed to AI
    
    case 'assign':
      await assignConversation(supabase, conversation.id, node.config)
      return advanceToNextNode(supabase, session, node, flow)
    
    case 'end':
      await endFlowSession(supabase, session.id)
      return false  // flow ended; fall through to AI pipeline
    
    default:
      return false
  }
}
```

---

## 7.6 Knowledge Base

### Three-Tier Context Retrieval

```typescript
// lib/knowledge-base.ts
export async function fetchKnowledgeBaseContext(
  supabase: SupabaseClient,
  workspaceId: string,
  query: string
): Promise<string> {
  
  // Tier 1: pgvector semantic search (most accurate)
  const queryEmbedding = await generateEmbedding(query)
  
  const [kbResults, vectorResults] = await Promise.all([
    supabase.rpc('match_knowledge_base', {
      query_embedding: formatEmbedding(queryEmbedding),
      workspace_id_param: workspaceId,
      match_count: 5,
      min_similarity: KB_MIN_SIMILARITY,
    }),
    supabase.rpc('match_vector_documents', {
      query_embedding: formatEmbedding(queryEmbedding),
      workspace_id_param: workspaceId,
      match_count: 3,
      min_similarity: KB_MIN_SIMILARITY,
    }),
  ])
  
  if ((kbResults.data?.length ?? 0) > 0 || (vectorResults.data?.length ?? 0) > 0) {
    return formatContext([...(kbResults.data ?? []), ...(vectorResults.data ?? [])])
  }
  
  // Tier 2: Direct keyword scan on vector_documents
  const keywordDocs = await supabase.from('vector_documents')
    .select('content')
    .eq('workspace_id', workspaceId)
    .ilike('content', `%${query.split(' ')[0]}%`)
    .limit(3)
  
  if ((keywordDocs.data?.length ?? 0) > 0) {
    return keywordDocs.data!.map(d => d.content).join('\n\n')
  }
  
  // Tier 3: Keyword scoring on knowledge_base titles/tags/content
  const { data: kbEntries } = await supabase.from('knowledge_base')
    .select('title, content, tags, priority')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .limit(20)
  
  const scored = scoreKBEntries(kbEntries ?? [], query)
  const topEntries = scored.slice(0, 3)
  
  return topEntries.length > 0
    ? topEntries.map(e => `${e.title}\n${e.content}`).join('\n\n')
    : ''
}

const KB_MIN_SIMILARITY = 0.35
```

---

## 7.7 Escalation Logic

Auto-escalate to human (set `bot_paused = true`, `status = 'pending'`) when:

| Trigger | Implementation |
|---------|---------------|
| Negative sentiment + complaint category | `detectSentiment() === 'negative' && category === 'complaint'` |
| User asks for human | Keyword match: "human", "agent", "real person", "talk to someone", "real support", "insan se baat" |
| Workspace escalation keywords | `wsSettings.escalation_keywords` array (admin-configurable) |
| 3+ unanswered messages | Count contact messages with no subsequent bot reply in last 1 hour |
| High-value lead | `contact.lead_score > 80` (configurable threshold) |
| After-hours | `!isBusinessHoursOpen()` AND `wsSettings.after_hours_human = true` |

When escalated:
1. Set `conversations.bot_paused = true` and `status = 'pending'`
2. Insert notification for assigned agent (or all online agents if unassigned)
3. Optionally send a human-handover message: "I'm connecting you with our team now. Someone will respond shortly."
4. Bot stays paused until agent clicks "Resume Bot" in UI

---

## 7.8 AI Model Configuration

```typescript
// lib/ai-router.ts
type ModelRole =
  | 'auto_reply_model'    // main auto-reply
  | 'vision_model'        // when image is in message
  | 'embedding_model'     // KB embeddings
  | 'fast_model'          // classification tasks
  | 'escalation_model'    // complex escalation analysis
  | 'caption_model'       // content caption generation
  | 'analytics_model'     // AI insights + reporting

const DEFAULT_MODELS: Record<ModelRole, string> = {
  auto_reply_model:  'openai/gpt-4o-mini',
  vision_model:      'openai/gpt-4o',
  embedding_model:   'text-embedding-3-small',
  fast_model:        'openai/gpt-4o-mini',
  escalation_model:  'openai/gpt-4o',
  caption_model:     'openai/gpt-4o',
  analytics_model:   'openai/gpt-4o',
}

export function getModel(wsSettings: WorkspaceSettings, role: ModelRole): string {
  return wsSettings.llm_config?.[role] ?? DEFAULT_MODELS[role]
}
```

**Supported models** (via OpenRouter):
- `openai/gpt-4o` — Best quality
- `openai/gpt-4o-mini` — Good quality, low cost (default)
- `anthropic/claude-3-5-sonnet` — Strong on nuanced replies
- `anthropic/claude-3-haiku` — Fast, cheap, good for classification
- `google/gemini-1.5-flash` — Fast, multilingual
- `google/gemini-1.5-pro` — High quality, long context
- `meta-llama/llama-3.1-8b-instruct` — Free tier option
- `meta-llama/llama-3.1-70b-instruct` — Free tier, higher quality

---

## 7.9 AI Rate Limiting

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const autoReplyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, '30 s'),  // 1 auto-reply per 30 seconds per contact
  prefix: 'ig:auto_reply',
})

export async function checkAutoReplyLimit(contactId: string): Promise<boolean> {
  const { success } = await autoReplyLimiter.limit(contactId)
  return success
}
```

This prevents reply storms when a contact sends multiple messages in rapid succession.
