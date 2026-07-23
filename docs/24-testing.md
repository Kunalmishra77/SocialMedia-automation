# 24 — Testing Strategy

## 24.1 Test Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit tests | Vitest | Pure functions, utilities, helpers |
| Integration tests | Vitest + Supabase local | API routes with real DB |
| E2E tests | Playwright | Critical user journeys |
| Type checking | `tsc --noEmit` | TypeScript correctness |
| Linting | ESLint (next/core-web-vitals) | Code quality |

---

## 24.2 Unit Tests

### Phone / IGSID Utilities

```typescript
// lib/__tests__/instagram-utils.test.ts
import { describe, it, expect } from 'vitest'
import { isWithin24HourWindow, windowExpiresAt } from '@/lib/instagram-utils'

describe('24-hour window utilities', () => {
  it('returns true when last message was 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    expect(isWithin24HourWindow(oneHourAgo)).toBe(true)
  })

  it('returns false when last message was 25 hours ago', () => {
    const tooOld = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    expect(isWithin24HourWindow(tooOld)).toBe(false)
  })

  it('returns false when last_user_message_at is null', () => {
    expect(isWithin24HourWindow(null)).toBe(false)
  })

  it('windowExpiresAt returns correct future timestamp', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const expiry = windowExpiresAt(twoHoursAgo)
    const expectedExpiry = new Date(Date.now() + 22 * 60 * 60 * 1000)
    expect(Math.abs(new Date(expiry!).getTime() - expectedExpiry.getTime())).toBeLessThan(5000)
  })
})
```

### Lead Temperature Detection

```typescript
// lib/__tests__/lead-auto-create.test.ts
import { detectLeadTemperature } from '@/lib/lead-auto-create'

describe('detectLeadTemperature', () => {
  it('returns hot for buy intent keywords', () => {
    expect(detectLeadTemperature('I want to buy this')).toBe('hot')
    expect(detectLeadTemperature('khareed lena hai')).toBe('hot')
    expect(detectLeadTemperature('what is the price?')).toBe('hot')
  })

  it('returns cold for disinterest keywords', () => {
    expect(detectLeadTemperature('baad mein dekhunga')).toBe('cold')
    expect(detectLeadTemperature('maybe later')).toBe('cold')
  })

  it('returns warm for neutral messages', () => {
    expect(detectLeadTemperature('hello')).toBe('warm')
    expect(detectLeadTemperature('tell me more about this')).toBe('warm')
  })
})
```

### Engagement Score

```typescript
// lib/__tests__/engagement-score.test.ts
import { computeEngagementScore } from '@/lib/engagement-score'
import { describe, it, expect } from 'vitest'

describe('computeEngagementScore', () => {
  it('scores zero for contact with no messages and old last_message', () => {
    const contact = { ig_followers_count: 100, last_user_message_at: null }
    const score = computeEngagementScore(contact as any, [])
    expect(score).toBeLessThan(10)
  })

  it('gives high score for recent hot-keyword message', () => {
    const contact = {
      ig_followers_count: 5000,
      last_user_message_at: new Date().toISOString()
    }
    const messages = [
      { direction: 'inbound', content: 'I want to buy this product' },
      { direction: 'outbound', content: 'Great! Here is the price' },
    ]
    const score = computeEngagementScore(contact as any, messages as any)
    expect(score).toBeGreaterThan(40)
  })
})
```

### Sentiment Detection

```typescript
// lib/__tests__/sentiment.test.ts
import { detectSentimentFast } from '@/lib/sentiment'

describe('detectSentimentFast', () => {
  it.each([
    ['I love this product', 'positive'],
    ['This is terrible and a waste of money', 'negative'],
    ['When will it arrive?', 'neutral'],
    ['Worst experience ever', 'negative'],
    ['Thank you so much!', 'positive'],
  ])('"%s" → %s', (text, expected) => {
    expect(detectSentimentFast(text)).toBe(expected)
  })
})
```

---

## 24.3 Integration Tests

Integration tests use a real local Supabase instance (`npx supabase start`).

### Webhook Handler

```typescript
// app/api/webhooks/__tests__/instagram.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'

function signWebhookPayload(payload: object): { body: string; signature: string } {
  const body = JSON.stringify(payload)
  const signature = 'sha256=' + createHmac('sha256', process.env.INSTAGRAM_WEBHOOK_SECRET!)
    .update(body).digest('hex')
  return { body, signature }
}

describe('POST /api/webhooks/instagram', () => {
  it('rejects requests with invalid signature', async () => {
    const res = await fetch('http://localhost:3000/api/webhooks/instagram', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=fakesignature', 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'instagram', entry: [] }),
    })
    expect(res.status).toBe(403)
  })

  it('returns 200 for valid webhook payload', async () => {
    const payload = { object: 'instagram', entry: [{ id: '123', changes: [] }] }
    const { body, signature } = signWebhookPayload(payload)
    
    const res = await fetch('http://localhost:3000/api/webhooks/instagram', {
      method: 'POST',
      headers: { 'x-hub-signature-256': signature, 'Content-Type': 'application/json' },
      body,
    })
    expect(res.status).toBe(200)
  })

  it('creates contact and conversation on first inbound DM', async () => {
    const supabase = createAdminClient()
    const igUserId = 'test_igsid_' + Date.now()
    
    const payload = {
      object: 'instagram',
      entry: [{
        id: process.env.TEST_IG_PAGE_ID,
        messaging: [{
          sender: { id: igUserId },
          recipient: { id: process.env.TEST_IG_PAGE_ID },
          timestamp: Date.now(),
          message: { mid: 'msg_' + Date.now(), text: 'Hello!' }
        }]
      }]
    }
    
    const { body, signature } = signWebhookPayload(payload)
    await fetch('http://localhost:3000/api/webhooks/instagram', {
      method: 'POST',
      headers: { 'x-hub-signature-256': signature, 'Content-Type': 'application/json' },
      body,
    })
    
    // Wait for async processing
    await new Promise(r => setTimeout(r, 500))
    
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('ig_user_id', igUserId)
      .single()
    
    expect(contact).not.toBeNull()
    
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contact!.id)
      .single()
    
    expect(conversation).not.toBeNull()
  })
})
```

### Auth Flow

```typescript
// app/api/auth/__tests__/login.test.ts
describe('POST /api/auth/login', () => {
  it('rejects invalid credentials', async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'notreal@test.com', password: 'wrong' }),
      headers: { 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(401)
  })

  it('sets session cookie on successful login', async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD }),
      headers: { 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('ws_session_token')
  })
})
```

### Campaign Send (Queue Integration)

```typescript
// app/api/campaigns/__tests__/execute.test.ts
describe('Campaign execution', () => {
  it('populates campaign_send_queue rows for all eligible contacts', async () => {
    const supabase = createAdminClient()
    // Setup: create test campaign + 3 test contacts
    const { data: campaign } = await supabase.from('campaigns').insert({ ... }).select().single()
    
    // Execute campaign
    await executeCampaign(campaign.id, supabase)
    
    const { count } = await supabase
      .from('campaign_send_queue')
      .select('*', { count: 'exact' })
      .eq('campaign_id', campaign.id)
    
    expect(count).toBe(3)  // one per eligible contact
  })
})
```

---

## 24.4 E2E Tests (Playwright)

### Setup

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  baseURL: 'http://localhost:3000',
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
})
```

### Critical Path: Login + View Inbox

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test('user can log in and see the inbox', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', process.env.E2E_USER_EMAIL!)
  await page.fill('input[name="password"]', process.env.E2E_USER_PASSWORD!)
  await page.click('button[type="submit"]')
  
  await expect(page).toHaveURL('/conversations')
  await expect(page.getByText('Inbox')).toBeVisible()
})
```

### Critical Path: Send Message

```typescript
// e2e/messaging.spec.ts
test('agent can send a reply to an open conversation', async ({ page }) => {
  await loginAs(page, 'agent')
  await page.goto('/conversations')
  
  // Click first open conversation
  await page.click('[data-testid="conversation-item"]')
  
  // Type and send message
  const input = page.getByPlaceholder('Type a message...')
  await input.fill('Test reply from Playwright')
  await page.click('[data-testid="send-button"]')
  
  // Message should appear in thread
  await expect(page.getByText('Test reply from Playwright')).toBeVisible()
})
```

### Critical Path: Campaign Creation

```typescript
// e2e/campaigns.spec.ts
test('admin can create and schedule a window broadcast campaign', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.goto('/campaigns')
  await page.click('text=New Campaign')
  
  await page.fill('[name="name"]', 'Test Campaign ' + Date.now())
  await page.selectOption('[name="type"]', 'window_broadcast')
  await page.fill('[name="message"]', 'Hello from test campaign!')
  
  // Set audience: all contacts
  await page.click('text=All Contacts')
  
  // Schedule for tomorrow
  await page.click('text=Schedule')
  await page.fill('[name="scheduledAt"]', tomorrowISO())
  
  await page.click('text=Save Campaign')
  
  await expect(page.getByText('Campaign saved')).toBeVisible()
})
```

### Critical Path: Instagram Connect

```typescript
// e2e/instagram-connect.spec.ts
test('admin can initiate Instagram account connection', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.goto('/settings/instagram')
  
  await page.click('text=Connect Instagram Account')
  
  // Should redirect to Meta OAuth
  await page.waitForURL(/facebook\.com\/dialog\/oauth/, { timeout: 10000 })
  
  // We can't complete OAuth in tests — verify redirect initiated
  expect(page.url()).toContain('client_id=' + process.env.INSTAGRAM_APP_ID)
})
```

### Critical Path: Content Calendar

```typescript
// e2e/content.spec.ts
test('admin can create a scheduled post', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.goto('/content')
  
  await page.click('text=Create Post')
  
  // Step 1: Media (skip upload, use existing)
  await page.click('text=Next')
  
  // Step 2: Caption
  await page.fill('textarea[name="caption"]', '#testpost E2E test post')
  await page.click('text=Next')
  
  // Step 3: Settings (use defaults)
  await page.click('text=Next')
  
  // Step 4: Schedule
  await page.click('text=Schedule')
  await expect(page.getByText('Post scheduled')).toBeVisible()
})
```

---

## 24.5 Test Helpers

```typescript
// e2e/helpers.ts
import { Page } from '@playwright/test'

export async function loginAs(page: Page, role: 'admin' | 'agent' | 'manager') {
  const creds = {
    admin: { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD! },
    agent: { email: process.env.E2E_AGENT_EMAIL!, password: process.env.E2E_AGENT_PASSWORD! },
    manager: { email: process.env.E2E_MANAGER_EMAIL!, password: process.env.E2E_MANAGER_PASSWORD! },
  }
  
  await page.goto('/login')
  await page.fill('input[name="email"]', creds[role].email)
  await page.fill('input[name="password"]', creds[role].password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/conversations')
}

export function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}
```

---

## 24.6 Running Tests

```bash
# Unit + Integration (Vitest)
npm run test              # run once
npm run test:watch        # watch mode
npm run test:coverage     # with coverage report

# Type checking
npm run type-check        # tsc --noEmit

# E2E (Playwright) — requires running app
npm run dev &             # start app first
npx playwright test       # run all E2E
npx playwright test e2e/auth.spec.ts  # specific file
npx playwright show-report           # open HTML report
```

### `package.json` Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "type-check": "tsc --noEmit",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## 24.7 Test Coverage Priorities

**Critical (must have tests):**
- Webhook HMAC signature verification
- 24h window check logic
- Lead temperature detection (keywords + count trigger)
- Role permission check (`requireWorkspacePermission`)
- API key authentication
- Campaign audience filtering (within 24h window)

**Important (should have tests):**
- Login / session creation / session expiry
- Contact deduplication logic
- Caption AI prompt construction
- Flow node execution for key node types
- Engagement score calculation
- Sentiment detection

**Nice to have (E2E):**
- Full login + send message flow
- Campaign creation wizard
- Content post scheduling
- Team invite flow
