# 13 — Influencer & Creator Management

**Priority:** Phase 5 (Pro+ plan)

## 13.1 Overview

The Influencer CRM allows brands to manage their entire influencer marketing operation from within the platform — from discovery to contract to payment tracking to performance reporting. This replaces spreadsheets and disconnected tools like Grin, AspireIQ, or TRIBE.

---

## 13.2 Influencer Database

### Influencer Discovery

Brands can add influencers to their database in three ways:
1. **From contacts** — any DM contact can be elevated to an influencer record (link `influencers.contact_id`)
2. **Manual entry** — add by @username; platform fetches IG profile data
3. **CSV import** — bulk import list

```typescript
// POST /api/influencers
// When creating by ig_username, auto-fetch profile:
async function fetchInfluencerProfile(igUsername: string, api: InstagramAPI): Promise<InfluencerProfile> {
  // Search for user by username
  const user = await api.getUserByUsername(igUsername)
  return {
    ig_user_id: user.id,
    ig_username: user.username,
    name: user.name,
    profile_pic: user.profile_pic,
    followers_count: user.followers_count,
    following_count: user.following_count,
    avg_engagement_rate: calculateEngagementRate(user),
    bio: user.biography,
    website: user.website,
  }
}
```

### Influencer List Views

- **Table view** — all influencers with sortable columns
- **Card view** — profile picture, username, followers, engagement rate, status
- **Category filter** — fashion / beauty / tech / fitness / food / lifestyle / etc.
- **Status filter** — prospect / outreached / negotiating / active / past
- **Follower range filter** — nano (1k-10k) / micro (10k-100k) / macro (100k-1M) / mega (1M+)

---

## 13.3 Influencer Profile Page

Full profile for each influencer:

**Stats panel:**
- Follower count + growth trend
- Average engagement rate (likes+comments / followers × 100)
- Average likes per post
- Average comments per post
- Estimated reach per post
- Best performing content type (feed vs reel vs story)

**Rates panel:**
- Rate per post, per reel, per story (manually set)
- Currency

**Content panel:**
- Recent posts (fetched from their public IG media via Graph API)
- Top performing posts

**Collaboration history:**
- All past collaborations with this influencer (from `influencer_collaborations`)
- Total spent, total reach generated

**Contact panel:**
- DM conversation link (if they've messaged the workspace)
- Email, phone
- Notes

---

## 13.4 Collaboration Management

A collaboration is a single brand-influencer campaign execution:

```typescript
interface Collaboration {
  id: string
  workspace_id: string
  influencer_id: string
  name: string           // e.g. "Diwali Collection Campaign 2026"
  type: 'post' | 'reel' | 'story' | 'ugc' | 'live' | 'review' | 'collab_post'
  status: 'planned' | 'briefed' | 'in_progress' | 'delivered' | 'published' | 'completed' | 'cancelled'
  brief: string          // content brief for the influencer
  deliverables: [{
    type: string         // post|reel|story
    due_date: string
    status: 'pending' | 'draft_received' | 'approved' | 'published'
    ig_post_id?: string  // linked after publishing
    notes?: string
  }]
  amount: number
  currency: string
  payment_status: 'pending' | 'partial' | 'paid' | 'overdue'
  payment_due_at: string
  start_date: string
  end_date: string
  
  // Performance (synced from ig_media_insights)
  total_reach: number
  total_impressions: number
  total_engagement: number
  total_clicks: number
  roi: number            // (revenue_attributed - amount) / amount × 100
}
```

### Collaboration Workflow

```
Plan stage: Set collaboration name, type, brief, deliverables, amount, timeline
      ↓
Brief stage: Share brief with influencer (via DM or email)
      ↓
In-progress: Influencer creates content; brand reviews drafts
      ↓
Delivered: Influencer marks deliverables as submitted; brand approves
      ↓
Published: Track which IG posts are linked to this collaboration
      ↓
Completed: Calculate performance metrics; process payment
```

---

## 13.5 Deliverable Tracking

Each collaboration can have multiple deliverables. Each deliverable has:
- Type (feed post / reel / story × N / collab post)
- Due date
- Status
- Draft review (influencer sends draft → brand approves/requests changes)
- Published IG post ID (for performance tracking after publish)

**Draft review flow:**
1. Influencer DMs the draft media → auto-tagged as a draft in the collaboration
2. Brand reviews in the platform
3. Approve → status = `approved` → influencer publishes
4. Request changes → add note → influencer revises

---

## 13.6 Performance Reporting

After collaboration deliverables are published:

```typescript
// Sync from ig_media_insights for each linked ig_post_id
interface CollaborationReport {
  collaboration: Collaboration
  posts: [{
    ig_media_id: string
    permalink: string
    thumbnail: string
    reach: number
    impressions: number
    likes: number
    comments: number
    shares: number
    saves: number
    engagement_rate: number
  }]
  totals: {
    reach: number
    impressions: number
    engagement: number
    earned_media_value: number  // reach × avg CPM for the category
    roi_estimate: number
  }
  comparison_to_influencer_avg: {
    engagement_rate_delta: number
    reach_delta: number
  }
}
```

**Earned Media Value (EMV):** Estimated dollar value of the organic reach generated (reach × industry CPM / 1000). Used to compare influencer ROI to equivalent paid ad spend.

---

## 13.7 Budget Tracking

Workspace-level influencer marketing budget:

```sql
CREATE TABLE public.influencer_budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name         TEXT NOT NULL,    -- e.g. "Q3 2026 Influencer Budget"
  total_budget DECIMAL(12,2),
  currency     VARCHAR(3) DEFAULT 'INR',
  period_start DATE,
  period_end   DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

Budget tracker shows:
- Total allocated budget
- Amount spent (sum of collaboration amounts where payment_status = 'paid')
- Amount committed (planned + in-progress collaborations)
- Remaining budget

---

## 13.8 Contract & Document Management

```sql
CREATE TABLE public.influencer_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  influencer_id    UUID REFERENCES influencers,
  collaboration_id UUID REFERENCES influencer_collaborations,
  name             TEXT NOT NULL,
  type             VARCHAR(30),  -- contract|nda|invoice|brief|receipt
  file_url         TEXT,         -- Supabase Storage URL
  uploaded_by      UUID REFERENCES profiles,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

Contracts can be uploaded as PDF or created from templates. Payment reminders are sent via email when `payment_due_at` is approaching (pg_cron daily check).

---

## 13.9 Influencer Discovery (Future)

Phase 6+ feature: AI-powered influencer discovery within the platform:
- Suggest influencers based on who comments on the workspace's posts
- Score potential influencers by engagement rate + audience overlap
- Compare influencer audience demographics to workspace's target audience
- Estimate campaign ROI before outreach

This requires additional Meta API access (`instagram_manage_insights` + `/[media_id]/insights` on public posts — currently limited by Meta policy for other users' content).
