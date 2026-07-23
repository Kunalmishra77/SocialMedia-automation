# 08 — Content Studio (Content Calendar & Publishing)

**Priority:** Phase 2 (Starter plan+)

## 8.1 Overview

The Content Studio is the publishing arm of the platform. Users can create, schedule, and publish Instagram posts (feed images, carousels, Reels, and where supported, Stories) directly from the platform. Combined with an AI-powered caption generator and a visual calendar, it eliminates the need for Hootsuite, Later, or Buffer for Instagram-native businesses.

---

## 8.2 Supported Content Types

| Type | Instagram API | Media requirements |
|------|--------------|-------------------|
| Feed image (single) | `POST /{ig_user_id}/media` + `/media_publish` | JPEG/PNG, max 8 MB |
| Carousel (2-10 images/videos) | `POST /{ig_user_id}/media?media_type=CAROUSEL` | Each item max 8 MB |
| Reel | `POST /{ig_user_id}/media?media_type=REELS` | MP4, 3–90 seconds, max 1 GB |
| Video post | `POST /{ig_user_id}/media?media_type=VIDEO` | MP4 |
| Story* | Limited via API — can publish single-image and video stories with `media_type=STORIES` | — |

*Stories via API requires the `instagram_content_publish` permission scope and is available for Business accounts only.

---

## 8.3 Content Calendar

### Calendar View
```
modules/content-studio/
├── components/
│   ├── ContentCalendar/        — monthly/weekly/list view
│   ├── DraftPost/              — draft post card
│   ├── ScheduledPost/          — scheduled post with countdown
│   ├── PublishedPost/          — published post with performance data
│   ├── PostComposer/           — full editor modal
│   ├── MediaUploader/          — drag-and-drop + Supabase Storage
│   ├── CaptionEditor/          — TipTap rich editor (plain text output)
│   ├── HashtagSelector/        — saved groups + suggestions
│   ├── PostPreview/            — Instagram-style preview (feed/reel/story)
│   ├── BestTimeSelector/       — AI-powered best time picker
│   ├── ApprovalBadge/          — shows approval status
│   └── FirstCommentEditor/     — auto-first-comment
├── hooks/
│   ├── useContentCalendar.ts
│   ├── usePostComposer.ts
│   └── usePostInsights.ts
└── services/
    └── content.service.ts
```

### Calendar Views
- **Monthly view** — grid with post thumbnails on scheduled dates
- **Weekly view** — time-slotted week view (see gaps in posting schedule)
- **List view** — all drafts, scheduled, and recent published posts in a table
- **Feed preview** — shows how the scheduled posts will look in your Instagram grid

---

## 8.4 Post Composer

The PostComposer modal handles creating and editing all post types.

### Step 1: Media
- Drag-and-drop or file picker (supports multiple for carousel)
- Upload to Supabase Storage → get public URL → send to Meta
- Video: progress bar during upload + server-side processing check
- Thumbnail picker for Reels (frame selector or custom upload)

### Step 2: Caption
- TipTap editor with plain text mode (emojis via picker)
- AI caption generation button (see 8.7)
- Character counter (Instagram max: 2,200)
- Variable insertion: `{{business_name}}`, `{{product_name}}`, `{{offer}}`
- Caption template library (load from `caption_templates` table)
- Hashtag insertion: saved hashtag groups, or AI suggestions
- First comment field (for hashtags — best practice to put hashtags in first comment)

### Step 3: Settings
- Account selector (which IG account to publish to)
- Location tag
- Collaborator tags (Instagram collab posts — add another IG user as co-author)
- Product tags (Instagram Shopping — tag catalog products)
- Accessibility alt-text for images
- Audience restriction (age/location — for business accounts only)

### Step 4: Schedule
- Publish now
- Schedule: date + time picker
- AI best time recommendation (based on past post analytics and audience insights)
- Approval requirement toggle

---

## 8.5 Publishing Flow

```typescript
// lib/content-publisher.ts
export async function schedulePost(postId: string): Promise<void> {
  const supabase = createAdminClient()
  const post = await supabase.from('content_posts').select('*').eq('id', postId).single()
  
  // Validation
  if (!post.media_urls?.length) throw new Error('No media attached')
  if (!post.ig_account_id) throw new Error('No Instagram account selected')
  if (post.requires_approval && !post.approved_at) throw new Error('Post requires approval before scheduling')
  
  // Update status to scheduled
  await supabase.from('content_posts').update({ status: 'scheduled' }).eq('id', postId)
  
  // Insert into time_trigger_queue for execution at scheduled_at
  await supabase.from('time_trigger_queue').insert({
    workspace_id: post.workspace_id,
    trigger_at: post.scheduled_at,
    action_type: 'publish_post',
    action_data: { post_id: postId },
    status: 'pending',
  })
}

export async function publishPost(postId: string): Promise<void> {
  const supabase = createAdminClient()
  const post = await supabase.from('content_posts').select('*,instagram_accounts(*)').eq('id', postId).single()
  const account = post.instagram_accounts
  const api = new InstagramAPI(account.access_token, account.ig_user_id)
  
  await supabase.from('content_posts').update({ status: 'publishing' }).eq('id', postId)
  
  let igMediaId: string
  
  try {
    switch (post.type) {
      case 'feed':
        igMediaId = await api.publishImage(account.ig_user_id, post.media_urls[0], post.caption ?? '')
        break
      
      case 'carousel':
        // Step 1: Create container for each image
        const containers = await Promise.all(post.media_urls.map(url =>
          api.createMediaContainer(account.ig_user_id, { image_url: url, is_carousel_item: true })
        ))
        // Step 2: Create carousel container
        const carouselContainer = await api.createCarouselContainer(
          account.ig_user_id,
          containers.map(c => c.id),
          post.caption ?? ''
        )
        // Step 3: Publish carousel
        igMediaId = await api.publishContainer(account.ig_user_id, carouselContainer.id)
        break
      
      case 'reel':
        // Step 1: Upload video to Meta
        const videoContainer = await api.createReelContainer(account.ig_user_id, {
          video_url: post.media_urls[0],
          caption: post.caption ?? '',
          cover_url: post.cover_url,
        })
        // Step 2: Wait for video processing (poll STATUS endpoint)
        await api.waitForContainer(videoContainer.id, { maxWaitMs: 60_000 })
        // Step 3: Publish
        igMediaId = await api.publishContainer(account.ig_user_id, videoContainer.id)
        break
    }
    
    // Fetch permalink
    const mediaInfo = await api.getMediaInfo(igMediaId, 'permalink')
    
    await supabase.from('content_posts').update({
      status: 'published',
      ig_media_id: igMediaId,
      ig_post_url: mediaInfo.permalink,
      published_at: new Date().toISOString(),
    }).eq('id', postId)
    
    // Post first comment if configured
    if (post.first_comment) {
      setTimeout(() => api.addComment(igMediaId, post.first_comment!).catch(() => {}), 3_000)
    }
    
    // Enable post automation if configured
    if (post.automation_on_publish) {
      await enablePostAutomation(supabase, post, igMediaId)
    }
    
  } catch (err) {
    await supabase.from('content_posts').update({
      status: 'failed',
      notes: String(err),
    }).eq('id', postId)
    throw err
  }
}
```

---

## 8.6 Approval Workflow

For teams where content must be reviewed before publishing:

```
Creator drafts post → sets requires_approval = true → submits for approval
      ↓
Notification sent to all manager+admin users: "Post ready for review"
      ↓
Reviewer opens PostComposer in "review mode"
  → sees post preview + caption + hashtags + schedule
  → can leave comments via approval_comments
  → Approve: set approved_by + approved_at, mark status = scheduled
  → Reject: set rejected_by + rejection_note, mark status = draft, notify creator
      ↓
On approval: post proceeds to scheduling flow
```

DB columns on `content_posts`:
- `requires_approval BOOLEAN`
- `approved_by UUID REFERENCES profiles`
- `approved_at TIMESTAMPTZ`
- `rejected_by UUID REFERENCES profiles`
- `rejection_note TEXT`

---

## 8.7 AI Caption Generation

```typescript
// POST /api/ai/generate-caption
// Body: { workspaceId, postType, mediaDescription, tone, goal, language, includeHashtags, includeCTA }
// Returns: { caption, hashtags, firstComment }

export async function generateCaption(opts: CaptionOptions): Promise<CaptionResult> {
  const model = getModel(wsSettings, 'caption_model')
  
  const prompt = `You are an expert Instagram content writer for ${opts.businessName} (${opts.industry}).

Generate a ${opts.postType} caption for Instagram with the following:
- Post about: ${opts.mediaDescription}
- Tone: ${opts.tone} (${TONE_DESCRIPTIONS[opts.tone]})
- Goal: ${opts.goal} (${GOAL_DESCRIPTIONS[opts.goal]})
- Language: ${opts.language}
- Include CTA: ${opts.includeCTA}

Return JSON:
{
  "caption": "...",       // Main caption (under 2200 chars, no hashtags)
  "hook": "...",          // First line only (the hook — most important)
  "cta": "...",           // Call-to-action line
  "hashtags": [...],      // Array of 15-20 relevant hashtags
  "first_comment": "...", // Hashtags for first comment (optional)
  "alt_text": "..."       // Image accessibility description
}`

  const result = await callAI([{ role: 'user', content: prompt }], {
    model, maxTokens: 800, temperature: 0.7,
    response_format: { type: 'json_object' }
  })
  
  return JSON.parse(result)
}
```

**Caption tone options:** Professional, Casual, Funny, Inspirational, Educational, Promotional, Storytelling, Behind-the-scenes

**Caption goal options:** Engagement (likes/comments), Brand awareness, Sales/conversion, Traffic to website, Lead generation, Community building

---

## 8.8 AI Hook Generator

The "hook" is the first line of an Instagram caption — the most critical part (shown before "more"):

```typescript
// POST /api/ai/generate-hooks
// Returns 5 alternative hooks for the same post

const HOOK_TYPES = [
  'question',    // "Did you know that...?"
  'bold_claim',  // "This changed everything for us."
  'number',      // "5 reasons why..."
  'story',       // "Two years ago, we almost gave up."
  'controversy', // "Unpopular opinion: [something surprising]"
]
```

---

## 8.9 AI Best Posting Time

Based on account's historical insights:

```typescript
// POST /api/ai/best-post-time
// Returns: { recommendedTimes: [{dayOfWeek, hour, engagementScore}] }

export async function getBestPostTimes(igAccountId: string): Promise<BestTimeResult[]> {
  // Fetch historical post performance from ig_media_insights
  // Group by day_of_week + hour_of_day
  // Calculate avg engagement_rate per slot
  // Return top 3 slots sorted by engagement_rate DESC
  
  const insights = await supabase
    .from('ig_media_insights')
    .select('published_at, engagement_rate, reach')
    .eq('ig_account_id', igAccountId)
    .not('engagement_rate', 'is', null)
    .order('published_at', { ascending: false })
    .limit(100)
  
  return analyzePostTimes(insights.data ?? [])
}
```

---

## 8.10 Hashtag Management

### Saved Hashtag Groups
```sql
-- hashtag_groups table
{ id, workspace_id, name, hashtags: TEXT[], description, use_count }
```

### AI Hashtag Suggestions
```typescript
// POST /api/ai/suggest-hashtags
// Body: { caption, postType, industry, niche }
// Returns: { hashtags: string[], volumes: Record<string, 'high'|'medium'|'low'> }
```

Groups can be applied to any post. Mix-and-match: "Core Brand Tags" + "Product Tags" + "Campaign Tags".

### Hashtag Performance (future)
Track which hashtag groups lead to higher reach/engagement by correlating `content_posts.hashtags` with `ig_media_insights`. Surface in Analytics.

---

## 8.11 Content Grid Preview

Visual grid showing how upcoming scheduled posts will look in the Instagram profile grid (3-column layout). Allows reordering by drag-and-drop to maintain an aesthetically consistent feed.

```typescript
// Shows alternating or matching color pattern
// Preview pulls thumbnails from scheduled posts + recent published posts
// Drag-and-drop reorders scheduled_at times to maintain grid pattern
```

---

## 8.12 Bulk Scheduling

Upload a CSV with columns: `caption, media_url, scheduled_at, first_comment, hashtag_group` to schedule multiple posts at once.

```typescript
// POST /api/content/bulk-schedule
// Body: multipart/form-data with CSV file
// Returns: { created: N, failed: N, errors: [...] }
```

---

## 8.13 Performance Insights Sync

After publishing, the platform periodically syncs post-level insights from Meta:

```sql
-- ig_media_insights table auto-populated by sync cron
-- Synced at 24h, 72h, and 7d after publish (engagement stabilizes)
```

```typescript
// app/api/cron/sync-media-insights/route.ts
// Find posts published 24h-7d ago with stale insights
// Call GET /{media_id}/insights?metric=reach,impressions,likes,comments,shares,saved
// Update ig_media_insights table
```
