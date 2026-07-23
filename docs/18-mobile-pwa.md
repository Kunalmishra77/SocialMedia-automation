# 18 — Mobile Experience (PWA)

**Priority:** Phase 4 (Pro plan)

## 18.1 PWA Setup

The platform is a Next.js 15 app deployed as a Progressive Web App. Users can install it on their phone's home screen and get near-native experience.

**Package:** `next-pwa` (Ducanh Ho's fork — maintained version)

```bash
npm install @ducanh2912/next-pwa
```

**`next.config.js` (or `next.config.ts`):**
```typescript
import withPWA from '@ducanh2912/next-pwa'

const nextConfig = withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
  },
})({
  // ... rest of Next.js config
})

export default nextConfig
```

**`public/manifest.json`:**
```json
{
  "name": "Agentix — Instagram CRM",
  "short_name": "Agentix",
  "description": "Instagram DM automation and CRM platform",
  "start_url": "/conversations",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#6366f1",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ],
  "categories": ["business", "productivity"],
  "orientation": "portrait-primary"
}
```

**`app/layout.tsx` head tags:**
```typescript
<link rel="manifest" href="/manifest.json" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Agentix" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<meta name="theme-color" content="#6366f1" />
```

---

## 18.2 Push Notifications

Push notifications for mobile users (via Web Push API + Supabase Edge Function delivery):

### Database

```sql
CREATE TABLE public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,   -- public key
  auth         TEXT NOT NULL,   -- auth secret
  device_type  VARCHAR(20),     -- web|android|ios
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### Registration Flow (Frontend)

```typescript
// hooks/usePushNotifications.ts
export function usePushNotifications() {
  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (existing) return  // already subscribed
    
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
    
    // Send subscription to backend
    await fetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  return { subscribe }
}
```

### Sending Notifications (Backend)

```typescript
// lib/push.ts
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:support@agentix.in',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function sendPushToUser(userId: string, notification: {
  title: string
  body: string
  icon?: string
  url?: string
}): Promise<void> {
  const supabase = createAdminClient()
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
  
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: notification.icon ?? '/icons/icon-192.png',
    data: { url: notification.url ?? '/conversations' }
  })
  
  await Promise.allSettled(
    (subscriptions ?? []).map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(() => {
        // Remove invalid/expired subscriptions
        supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      })
    )
  )
}
```

### Service Worker Push Handler (`public/sw.js`)

```javascript
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Agentix', {
      body: data.body,
      icon: data.icon ?? '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: data.data,
      requireInteraction: false,
      tag: 'agentix-notification',  // replace previous if stacked
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/conversations'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      const existing = windowClients.find(c => c.url.includes(self.location.origin))
      if (existing) {
        existing.focus()
        existing.navigate(url)
      } else {
        clients.openWindow(url)
      }
    })
  )
})
```

### When to Send Push Notifications

| Event | Recipient | Title |
|-------|-----------|-------|
| New DM on assigned conversation | Assigned agent | "New message from @{username}" |
| Conversation assigned to you | Assigned agent | "New conversation assigned" |
| Mention in note | Mentioned agent | "@{sender} mentioned you" |
| Hot lead created | Manager(s) | "New hot lead: {contact_name}" |
| Campaign completed | Admin | "Campaign '{name}' completed" |
| Token expiring in 5 days | Admin | "Instagram token needs refresh" |
| SLA breach | Manager(s) | "SLA breach: {contact_name} waiting {N} min" |

---

## 18.3 Offline Support

**Cached resources** (service worker cache-first):
- App shell (HTML/CSS/JS)
- Icons and static assets
- Last loaded conversation list (stale-while-revalidate)

**Not cached** (always network):
- Live message content (real-time)
- API responses (dynamic data)

**Offline detection:**
```typescript
// hooks/useOnlineStatus.ts
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  useEffect(() => {
    window.addEventListener('online', () => setIsOnline(true))
    window.addEventListener('offline', () => setIsOnline(false))
  }, [])
  return isOnline
}

// Shown as: top-of-screen banner "You're offline — messages will sync when reconnected"
```

When offline, the message input is disabled. No draft queueing (would require IndexedDB + sync worker — Phase 6+).

---

## 18.4 Mobile-Responsive Design

### Breakpoints

```typescript
// tailwind.config.ts
screens: {
  xs: '375px',   // small phones
  sm: '640px',   // large phones / landscape
  md: '768px',   // tablets
  lg: '1024px',  // small laptops
  xl: '1280px',  // standard desktop
  '2xl': '1536px'
}
```

### Mobile Inbox Layout

On mobile (<768px), the layout switches to a single-panel view:
- Default: conversation list (`/conversations`)
- Tap on conversation: slides to message thread (full screen)
- Back button returns to list

This is handled by `useMediaQuery('(max-width: 768px)')` hook combined with conditional rendering — NOT a separate mobile route.

```typescript
// modules/inbox/components/InboxLayout/index.tsx
function InboxLayout() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { selectedId } = useConversationStore()
  
  if (isMobile) {
    return selectedId
      ? <ConversationView />
      : <ConversationList />
  }
  
  return (
    <div className="flex h-screen">
      <ConversationList className="w-80 border-r" />
      <ConversationView className="flex-1" />
      <ContactPanel className="w-72 border-l" />
    </div>
  )
}
```

### Bottom Navigation (Mobile)

On phones, replace the left sidebar with a fixed bottom nav:

```typescript
// components/layout/BottomNav/index.tsx — shown only on mobile
const NAV_ITEMS = [
  { icon: MessageSquare, label: 'Inbox', href: '/conversations' },
  { icon: Users, label: 'Contacts', href: '/contacts' },
  { icon: BarChart3, label: 'Analytics', href: '/analytics', role: ['admin', 'manager', 'super_admin'] },
  { icon: Bell, label: 'Alerts', href: '/notifications' },
  { icon: Settings, label: 'Settings', href: '/settings' },
]
```

### Touch Interactions

- Swipe left on conversation card → quick actions (resolve, assign, snooze)
- Long press on message → copy text
- Pull-to-refresh on conversation list
- Double-tap to react to message (future feature)

```typescript
// Swipe-to-action via react-swipeable or custom hook
// Quick actions panel revealed at -80px swipe threshold
```

---

## 18.5 Mobile-Specific Optimizations

### Image Handling
- All user-uploaded images lazy-loaded (`loading="lazy"`)
- Thumbnails served at 300px width on mobile (via Supabase Storage transform)
- Media messages show image thumbnail inline with tap-to-full-screen

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

### Safe Area Insets (notch support)
```css
body {
  padding-bottom: env(safe-area-inset-bottom);
  padding-top: env(safe-area-inset-top);
}
```

### App Install Prompt
```typescript
// hooks/useInstallPrompt.ts
// Capture beforeinstallprompt event
// Show custom "Add to Home Screen" banner after 2 visits
// User can dismiss permanently (stored in localStorage)
```

---

## 18.6 Required Environment Variables for PWA

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=  # VAPID public key (generated once)
VAPID_PRIVATE_KEY=             # VAPID private key (never expose to client)
```

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```
