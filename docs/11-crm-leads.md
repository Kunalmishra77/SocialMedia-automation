# 11 — CRM & Lead Management

## 11.1 Contact Model

Instagram contacts are identified by `ig_user_id` (IGSID). Unlike WhatsApp where a phone number is the primary identifier, Instagram contacts may never share a phone number.

### Contact Enrichment Layers

1. **Auto-populated from Meta** — `ig_username`, `ig_name`, `ig_profile_pic`, `ig_followers_count` (fetched on first contact)
2. **Collected via flow/form** — `email`, `phone`, `company`, `location` (user provides during conversation)
3. **AI-enriched** — `lead_score`, `buy_signals`, `best_send_hour` (computed by AI analysis)
4. **Manually added by agent** — `custom_fields`, `notes`, `tags`, `lifecycle_stage`

---

## 11.2 Contact Lifecycle Stages

```typescript
type LifecycleStage = 'lead' | 'prospect' | 'customer' | 'churned'

// Auto-progression rules:
// lead → prospect: when lead.stage moves to 'interested'
// prospect → customer: when lead.stage moves to 'converted'
// customer → churned: when no interaction in 90 days (configurable)
```

---

## 11.3 Contact 360 View

`GET /api/contacts/[id]/360` returns:

```typescript
interface Contact360View {
  contact: IGContact
  conversations: ConversationSummary[]    // all conversations, any channel
  leads: Lead[]                           // all associated leads
  campaigns: CampaignParticipation[]      // campaigns they were part of
  posts: PostInteraction[]                // comments, story reactions
  notes: Note[]
  activities: ActivityEntry[]             // timeline of all actions
  insights: ContactInsights              // AI-computed signals
}
```

---

## 11.4 Lead Pipeline (CRM)

### Pipeline Stages
```typescript
type LeadStage = 'new' | 'contacted' | 'follow_up' | 'interested' | 'converted' | 'lost'
```

### Lead Temperature (3 sources, never downgrade)
1. **Message count trigger** (DB trigger `trg_lead_temp_on_message`): cold < 4 msgs, warm 4–7, hot ≥ 8
2. **Keyword detection** (webhook): "buy", "price", "interested", "khareedna", "demo" → hot; "later", "baad mein" → cold
3. **AI scoring** (`POST /api/leads/[id]/score`): 0–100 score that accounts for conversation context, contact profile, engagement pattern

### Lead Sources
```typescript
type LeadSource =
  | 'dm'           // organic DM
  | 'comment'      // post comment
  | 'story_reply'  // story reply
  | 'story_mention'// story mention
  | 'reel_comment' // Reel comment
  | 'lead_ad'      // Meta Ads lead form
  | 'import'       // CSV import
  | 'manual'       // manually created
  | 'referral'     // from another lead (referral tracking)
```

---

## 11.5 Lead Auto-Creation

On every first inbound DM (and on comment/story reply if configured):

```typescript
// lib/lead-auto-create.ts
export async function autoCreateOrUpdateLead(
  supabase: SupabaseClient,
  workspaceId: string,
  contact: IGContact,
  conversation: Conversation,
  message: { content: string; source: LeadSource }
): Promise<void> {
  
  // Check if lead already exists for this contact
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id, temperature, stage')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contact.id)
    .single()
  
  if (existingLead) {
    // Update temperature if keyword suggests upgrade
    const keywordTemp = detectLeadTemperature(message.content)
    if (temperatureRank(keywordTemp) > temperatureRank(existingLead.temperature)) {
      await supabase.from('leads')
        .update({ temperature: keywordTemp, updated_at: new Date().toISOString() })
        .eq('id', existingLead.id)
    }
    return
  }
  
  // Create new lead
  const keywordTemp = detectLeadTemperature(message.content)
  await supabase.from('leads').insert({
    workspace_id: workspaceId,
    contact_id: contact.id,
    conversation_id: conversation.id,
    title: `${contact.ig_name || contact.ig_username} — Instagram`,
    stage: 'new',
    temperature: keywordTemp || 'cold',
    source: message.source,
  })
}

function detectLeadTemperature(text: string): LeadTemperature {
  const lower = text.toLowerCase()
  const HOT = /\b(buy|purchase|khareed|lena hai|book|demo|order|price|rate|interested|chahiye|want to)\b/i
  const COLD = /\b(not now|baad mein|later|sochna hai|maybe|no thanks|nahi)\b/i
  if (HOT.test(lower)) return 'hot'
  if (COLD.test(lower)) return 'cold'
  return 'warm'
}
```

---

## 11.6 AI Lead Scoring

```typescript
// POST /api/leads/[id]/score
export async function scoreLead(leadId: string): Promise<number> {
  const supabase = createAdminClient()
  const { data: lead } = await supabase
    .from('leads')
    .select('*, contacts(*), conversations(*), messages(*)')
    .eq('id', leadId)
    .single()
  
  // Build scoring prompt
  const lastMessages = lead.conversations?.[0]?.messages?.slice(-10) ?? []
  const prompt = `
Analyze this Instagram lead and score from 0-100:

Contact: @${lead.contacts.ig_username}, ${lead.contacts.ig_followers_count} followers
Lead stage: ${lead.stage}
Temperature: ${lead.temperature}
Recent conversation:
${lastMessages.map(m => `${m.sender_type}: ${m.content}`).join('\n')}

Score 0-100 where:
0-25 = just browsing, low intent
26-50 = some interest, needs nurturing
51-75 = active interest, worth focusing on
76-100 = strong buying intent, ready to convert

Return JSON: {"score": N, "reasoning": "...", "buy_signals": ["...", "..."], "recommended_action": "..."}`

  const model = getModel(wsSettings, 'escalation_model')
  const result = await callAI([{ role: 'user', content: prompt }], {
    model, maxTokens: 200, temperature: 0.3,
    response_format: { type: 'json_object' }
  })
  
  const { score, reasoning, buy_signals, recommended_action } = JSON.parse(result)
  
  await supabase.from('leads').update({ ai_score: score }).eq('id', leadId)
  await supabase.from('contacts').update({
    lead_score: score,
    buy_signals,
  }).eq('id', lead.contact_id)
  
  return score
}
```

---

## 11.7 Contact Lists & Segmentation

```sql
-- contact_lists: named groups
CREATE TABLE public.contact_lists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  color        TEXT DEFAULT '#6366f1',
  contact_count INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- contact_list_members: many-to-many
CREATE TABLE public.contact_list_members (
  list_id    UUID REFERENCES contact_lists ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (list_id, contact_id)
);
```

### Smart Lists (Dynamic Segments)

Smart lists auto-update based on filter criteria. Implemented as saved filter configs:

```typescript
interface SmartListFilter {
  tags?: string[]                  // has all/any of these tags
  lifecycleStage?: LifecycleStage
  leadStage?: LeadStage
  leadTemperature?: LeadTemperature
  hasActiveWindow?: boolean        // last_user_message_at > NOW()-24h
  minLeadScore?: number
  source?: LeadSource[]
  createdAfter?: string
  igFollowersMin?: number
  igFollowersMax?: number
  igAccountId?: string
}
```

`GET /api/contacts?smart_list={encoded_filter}` evaluates the filter at query time — no pre-materialization.

---

## 11.8 Contact Import

`POST /api/contacts/import` — CSV upload with columns:

| Column | Required | Notes |
|--------|---------|-------|
| `ig_username` | Yes (or ig_user_id) | @handle |
| `full_name` | No | Override for IG name |
| `email` | No | |
| `phone` | No | |
| `tags` | No | Comma-separated |
| `lifecycle_stage` | No | lead/prospect/customer |
| `notes` | No | |

Processing:
1. Parse CSV (papaparse)
2. For each row: look up contact by `ig_username` or `ig_user_id`
3. If not found: create new contact; optionally fetch IG profile from API to enrich
4. If found: update fields (upsert on `workspace_id, ig_user_id`)
5. Return: `{ imported: N, updated: N, failed: N, errors: [...] }`

---

## 11.9 Kanban Board

Visual pipeline board with drag-and-drop lead stage management:

```
modules/crm/
├── components/
│   ├── KanbanBoard/       — dnd-kit DnD board
│   ├── KanbanColumn/      — one column per lead_stage
│   ├── LeadCard/          — compact card: contact, value, temp badge, score, tags
│   ├── LeadDetail/        — full-page lead view (opened on click)
│   ├── LeadForm/          — create/edit lead form
│   └── LeadFilters/       — filter bar: agent, temp, score range, tag
```

**Temperature badge colors:**
- cold: `bg-blue-100 text-blue-700`
- warm: `bg-amber-100 text-amber-700`
- hot: `bg-red-100 text-red-700`

**Score bar:** Red → Yellow → Green gradient, 0–100

---

## 11.10 Follow-Up Sequences

Drip message sequences automatically follow up with leads:

```sql
CREATE TABLE public.follow_up_sequences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_active    BOOLEAN DEFAULT true,
  trigger      VARCHAR(30),  -- manual|lead_stage|tag_added
  trigger_value TEXT,
  steps        JSONB DEFAULT '[]'
  -- [{ delay_hours: 24, message: "...", media_url: null }]
);

CREATE TABLE public.contact_sequences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id  UUID REFERENCES follow_up_sequences ON DELETE CASCADE,
  contact_id   UUID REFERENCES contacts ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations,
  current_step INTEGER DEFAULT 0,
  next_send_at TIMESTAMPTZ,
  status       VARCHAR(20) DEFAULT 'active',  -- active|paused|completed|cancelled
  enrolled_at  TIMESTAMPTZ DEFAULT NOW()
);
```

The sequence runner cron (`/api/cron/run-sequences`) processes due `contact_sequences` rows every 30 minutes.

**Auto-cancel sequences:** If a contact replies while enrolled in a sequence, the sequence automatically cancels (bot detected human interest, human should take over or AI can respond).

---

## 11.11 Notes & Timeline

Contact notes stored in `contact_notes` table:
```sql
CREATE TABLE public.contact_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES contacts ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_by   UUID REFERENCES profiles,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

Activity timeline aggregates:
- DMs received/sent
- Comments made
- Lead stage changes
- Notes added
- Tags added/removed
- Campaign interactions
- Sequence enrollments
- Assignment changes
