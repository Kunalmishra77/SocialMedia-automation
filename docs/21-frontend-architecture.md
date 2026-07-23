# 21 — Frontend Architecture

## 21.1 App Directory Structure

```
app/
├── (auth)/
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── accept-invite/page.tsx
│   └── reset-password/page.tsx
│
├── (dashboard)/                     — requires workspace session
│   ├── layout.tsx                   — session guard + sidebar + topbar
│   ├── page.tsx                     — dashboard / employee home
│   ├── conversations/
│   │   ├── page.tsx                 — inbox (conversation list + thread)
│   │   └── [id]/page.tsx            — specific conversation
│   ├── contacts/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx            — contact 360 view
│   ├── leads/
│   │   ├── page.tsx                 — kanban board
│   │   └── [id]/page.tsx
│   ├── campaigns/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       ├── page.tsx             — campaign detail
│   │       └── analytics/page.tsx
│   ├── content/
│   │   ├── page.tsx                 — content calendar
│   │   ├── new/page.tsx             — post composer
│   │   └── [id]/page.tsx
│   ├── automation/
│   │   ├── flows/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx        — flow builder (reactflow)
│   │   ├── workflows/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx        — workflow builder
│   │   └── comments/
│   │       └── page.tsx             — post comment automations
│   ├── analytics/
│   │   ├── page.tsx                 — overview dashboard
│   │   ├── conversations/page.tsx
│   │   ├── content/page.tsx
│   │   ├── campaigns/page.tsx
│   │   ├── crm/page.tsx
│   │   └── audience/page.tsx
│   ├── influencers/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── commerce/
│   │   ├── products/page.tsx
│   │   └── orders/page.tsx
│   ├── ads/page.tsx
│   ├── team/page.tsx
│   ├── knowledge-base/page.tsx
│   ├── notifications/page.tsx
│   └── settings/
│       ├── page.tsx                 — workspace settings
│       ├── instagram/page.tsx       — connected IG accounts
│       ├── api-keys/page.tsx
│       ├── billing/page.tsx
│       └── notifications/page.tsx   — per-user notification prefs
│
├── api/                             — all API routes (see 20-api-design.md)
│
├── layout.tsx                       — root layout: fonts, providers
└── globals.css
```

---

## 21.2 Module Structure

Each feature area is a module under `modules/`:

```
modules/
├── auth/
│   ├── components/    — LoginForm, SignupForm, AcceptInviteForm
│   ├── hooks/         — useSession, useAuth
│   └── services/      — workspace.service.ts
│
├── inbox/
│   ├── components/
│   │   ├── ConversationList/       — filterable list with search
│   │   ├── ConversationItem/       — single row in list
│   │   ├── ConversationView/       — message thread + input
│   │   ├── ConversationHeader/     — title, assign, actions
│   │   ├── MessageBubble/          — renders message by type
│   │   ├── MessageInput/           — textarea + media upload + emoji
│   │   ├── ContactPanel/           — right panel: contact info, tags, leads
│   │   ├── InternalNote/           — note bubble (distinct from messages)
│   │   ├── CommentThread/          — public comment + private DM option
│   │   └── WindowExpiryBanner/     — 24h window warning
│   ├── hooks/
│   │   ├── useConversations.ts     — list with realtime subscription
│   │   ├── useMessages.ts          — thread with realtime subscription
│   │   └── useTypingIndicator.ts
│   └── stores/
│       └── conversation.store.ts   — selectedId, filters, unread counts
│
├── contacts/
│   ├── components/
│   │   ├── ContactList/
│   │   ├── ContactCard/
│   │   ├── Contact360View/
│   │   ├── ContactForm/
│   │   ├── ContactImport/          — CSV upload
│   │   ├── SmartListFilter/
│   │   └── ContactTags/
│   └── hooks/
│       └── useContacts.ts
│
├── crm/
│   ├── components/
│   │   ├── KanbanBoard/
│   │   ├── KanbanColumn/
│   │   ├── LeadCard/
│   │   ├── LeadDetail/
│   │   ├── LeadForm/
│   │   ├── TemperatureBadge/
│   │   ├── LeadScore/              — score bar component
│   │   └── SequenceEnrollment/
│   └── hooks/
│       └── useLeads.ts
│
├── campaigns/
│   ├── components/
│   │   ├── CampaignList/
│   │   ├── CampaignForm/           — multi-step wizard
│   │   ├── CampaignDetail/
│   │   ├── CampaignAnalytics/
│   │   ├── AudienceBuilder/        — filter + preview count
│   │   └── MessagePreview/
│   └── hooks/
│       └── useCampaigns.ts
│
├── content/
│   ├── components/
│   │   ├── ContentCalendar/        — react-big-calendar view
│   │   ├── PostComposer/           — 4-step wizard
│   │   ├── MediaUploader/
│   │   ├── CaptionEditor/          — textarea + AI suggest button
│   │   ├── HashtagInput/
│   │   ├── GridPreview/            — 3-column IG grid simulation
│   │   ├── SchedulePicker/
│   │   └── ApprovalStatus/
│   └── hooks/
│       └── useContentPosts.ts
│
├── automation/
│   ├── flows/
│   │   ├── FlowBuilder.tsx         — react-flow canvas
│   │   ├── nodes/                  — custom node types
│   │   └── FlowList/
│   ├── workflows/
│   │   ├── WorkflowBuilder.tsx
│   │   ├── TriggerConfig/
│   │   ├── ActionConfig/
│   │   └── WorkflowList/
│   └── comments/
│       └── CommentAutomationForm/
│
├── analytics/
│   ├── components/
│   │   ├── OverviewDashboard/
│   │   ├── charts/
│   │   │   ├── LineChart/          — recharts wrapper
│   │   │   ├── BarChart/
│   │   │   ├── PieChart/
│   │   │   └── HeatMap/            — for best-time grids
│   │   ├── KPICard/
│   │   ├── DateRangePicker/
│   │   └── AIInsightsPanel/
│   └── hooks/
│       └── useAnalytics.ts
│
├── influencers/
│   ├── components/
│   │   ├── InfluencerList/
│   │   ├── InfluencerProfile/
│   │   ├── CollaborationCard/
│   │   ├── CollaborationTimeline/
│   │   ├── DeliverableTracker/
│   │   ├── PerformanceReport/
│   │   └── BudgetTracker/
│
├── ai-assistant/
│   └── components/
│       └── AIAssistantChat/        — floating chat bubble
│
└── team/
    ├── components/
    │   ├── TeamPage/               — tabs: Members | Invites | Workload
    │   ├── MemberRow/
    │   ├── InviteForm/
    │   ├── PendingInvites/
    │   └── WorkloadTab/
    └── hooks/
        └── useTeam.ts
```

---

## 21.3 Global State Management (Zustand)

```typescript
// store/auth.store.ts
interface AuthStore {
  user: Profile | null
  workspace: Workspace | null
  role: UserRole | null
  permissions: Set<Permission>
  setAuth: (user: Profile, workspace: Workspace, role: UserRole) => void
  clearAuth: () => void
  hasPermission: (p: Permission) => boolean
}

// store/workspace.store.ts
interface WorkspaceStore {
  igAccounts: InstagramAccount[]
  activeAccount: InstagramAccount | null
  plan: WorkspacePlan
  setIgAccounts: (accounts: InstagramAccount[]) => void
  setActiveAccount: (account: InstagramAccount) => void
}

// store/notification.store.ts
interface NotificationStore {
  unreadCount: number
  notifications: Notification[]
  setUnreadCount: (n: number) => void
  markAllRead: () => void
}

// store/conversation.store.ts
interface ConversationStore {
  selectedConversationId: string | null
  filters: ConversationFilters
  setSelected: (id: string | null) => void
  setFilter: (key: keyof ConversationFilters, value: any) => void
}
```

---

## 21.4 Realtime Subscriptions

```typescript
// hooks/useRealtimeSubscriptions.ts
// Initialized once at layout level after auth

export function useRealtimeSubscriptions(workspaceId: string) {
  const supabase = createBrowserClient()
  
  useEffect(() => {
    // Conversation updates (new messages, status changes, assignments)
    const conversationChannel = supabase
      .channel(`workspace:${workspaceId}:conversations`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `workspace_id=eq.${workspaceId}`,
      }, (payload) => {
        // Invalidate SWR cache or update Zustand store
        mutateConversations()
      })
      .subscribe()
    
    // New message notifications
    const messageChannel = supabase
      .channel(`workspace:${workspaceId}:messages`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `workspace_id=eq.${workspaceId}`,
      }, (payload) => {
        if (payload.new.direction === 'inbound') {
          playNotificationSound()
        }
        mutateMessages(payload.new.conversation_id)
      })
      .subscribe()
    
    // Notification count
    const notifChannel = supabase
      .channel(`user:${userId}:notifications`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        incrementUnreadCount()
      })
      .subscribe()
    
    return () => {
      supabase.removeChannel(conversationChannel)
      supabase.removeChannel(messageChannel)
      supabase.removeChannel(notifChannel)
    }
  }, [workspaceId])
}
```

---

## 21.5 Routing & Guards

### Session Guard (Dashboard Layout)

```typescript
// app/(dashboard)/layout.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function DashboardLayout({ children }) {
  const session = await getSession()
  if (!session) redirect('/login')
  
  return (
    <AuthProvider session={session}>
      <WorkspaceProvider>
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
        <AIAssistantChat />
      </WorkspaceProvider>
    </AuthProvider>
  )
}
```

### Page-Level Role Guard

```typescript
// app/(dashboard)/team/page.tsx
import { requireWorkspacePermission } from '@/lib/authz'

export default async function TeamPage() {
  try {
    await requireWorkspacePermission(workspaceId, 'manage_team')
  } catch {
    redirect('/conversations')
  }
  
  return <TeamPageClient />
}
```

---

## 21.6 Data Fetching Strategy

**SWR** for all data fetching (automatic caching, revalidation, mutation):

```typescript
// hooks/useConversations.ts
import useSWR from 'swr'

export function useConversations(filters: ConversationFilters) {
  const key = `/api/conversations?${new URLSearchParams(filters as any)}`
  const { data, error, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 0,  // realtime subscription handles updates
  })
  
  return { conversations: data?.data, meta: data?.meta, error, mutate }
}
```

**Optimistic updates** for message send:
```typescript
async function sendMessage(content: string) {
  const optimistic = { id: 'temp-' + Date.now(), content, direction: 'outbound', created_at: new Date().toISOString() }
  mutateMessages([...messages, optimistic], false)  // update UI immediately
  
  await fetch('/api/messages/send', { method: 'POST', body: JSON.stringify({ conversationId, content }) })
  
  mutateMessages()  // refresh from server
}
```

---

## 21.7 UI Component Library

**Base:** shadcn/ui (Radix primitives + Tailwind)

**Key components used:**
```
Button, Input, Textarea, Select, Switch, Checkbox, RadioGroup
Dialog, Sheet, Popover, Tooltip, DropdownMenu, ContextMenu
Tabs, Accordion, Collapsible
Avatar, Badge, Progress, Skeleton
Toast (Sonner)
Calendar (react-day-picker)
Table, DataTable (TanStack Table)
```

**Charts:** Recharts (LineChart, BarChart, PieChart, AreaChart)

**Flow Builder:** React Flow (reactflow) — same library used in WhatsApp platform

**DnD:** dnd-kit (Kanban board)

**Icons:** Lucide React

**Date handling:** date-fns

**CSV parsing:** PapaParse

---

## 21.8 Performance Optimizations

### Code Splitting
- All module pages are lazy-loaded via Next.js automatic code splitting
- Heavy components (ReactFlow, recharts) loaded only in their respective pages

### Image Optimization
```typescript
// All media from Instagram CDN go through Next.js <Image> with domain whitelist
// next.config.ts:
images: {
  remotePatterns: [
    { hostname: 'cdninstagram.com' },
    { hostname: '*.fbcdn.net' },
    { hostname: '*.supabase.co' },
  ]
}
```

### Font Loading
```typescript
// app/layout.tsx
import { Inter, Geist } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], display: 'swap' })
```

### Virtualisation

Conversation list and contact list use `@tanstack/react-virtual` to avoid DOM overflow on large datasets:
```typescript
// Only render the 20 conversations visible in the scroll window
// Not all 1000+ conversations in DOM
```

---

## 21.9 Theme & Design System

**Color scheme:**
```css
:root {
  --primary: 239 68 68;       /* indigo-600 #6366f1 */
  --background: 248 250 252;  /* slate-50 */
  --foreground: 15 23 42;     /* slate-900 */
  --card: 255 255 255;
  --border: 226 232 240;      /* slate-200 */
  --muted: 100 116 139;       /* slate-500 */
}

.dark {
  --background: 15 23 42;     /* slate-900 */
  --foreground: 248 250 252;  /* slate-50 */
  --card: 30 41 59;           /* slate-800 */
  --border: 51 65 85;         /* slate-700 */
}
```

**Dark mode:** CSS class-based (`class="dark"` on `<html>`), stored in localStorage, defaulting to system preference.

**Brand colors (Instagram):**
```css
--instagram-gradient: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
```
Used only for the Instagram integration badge/icon — not as primary brand color.
