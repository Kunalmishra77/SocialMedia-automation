// Capability-based platform catalog — powers onboarding platform selection,
// per-platform credential setup, guided help, and honest capability transparency.

export type CapabilityStatus = 'now' | 'approval' | 'future' | 'no'

export interface Capability {
  label: string
  status: CapabilityStatus
}

export interface CredentialField {
  name: string // form field name
  label: string
  placeholder?: string
  optional?: boolean
  help: {
    what: string
    where: string
    steps: string[]
    docUrl?: string
  }
}

export interface PlatformDef {
  key: string
  name: string
  accent: string // brand accent color (used within our own system)
  gradient?: string
  tagline: string
  connect: 'oauth' | 'token' | 'oauth+manual'
  connectNote: string
  capabilities: Capability[]
  credentials: CredentialField[] // manual fields (hybrid). OAuth platforms may have none.
}

export const PLATFORMS: PlatformDef[] = [
  {
    key: 'instagram',
    name: 'Instagram',
    accent: '#E1306C',
    gradient: 'linear-gradient(135deg,#f9ce34,#ee2a7b 45%,#6228d7)',
    tagline: 'DMs, comments, follow-gate, publishing',
    connect: 'oauth+manual',
    connectNote: 'Connect with one click after approval (Instagram Business Login). No credentials needed unless you bring your own app.',
    capabilities: [
      { label: 'AI DM chatbot', status: 'now' },
      { label: 'Comment → auto public reply', status: 'now' },
      { label: 'Comment → private DM', status: 'now' },
      { label: 'Auto-like comments', status: 'now' },
      { label: 'Follow-gate (verify follow)', status: 'now' },
      { label: 'Image post publish & schedule', status: 'now' },
      { label: 'Reel / video publish', status: 'future' },
      { label: 'Story publish', status: 'future' },
      { label: 'Post insights & analytics', status: 'future' },
    ],
    credentials: [
      {
        name: 'meta_app_id',
        label: 'Meta App ID (optional — bring your own app)',
        placeholder: '1234567890',
        optional: true,
        help: {
          what: 'The App ID of your own Meta developer app, if you prefer not to use our managed connection.',
          where: 'developers.facebook.com → your app → App settings → Basic',
          steps: [
            'Go to developers.facebook.com and create an app (type: Business)',
            'Add the "Instagram" product → API setup with Instagram login',
            'Copy the App ID from App settings → Basic',
          ],
          docUrl: 'https://developers.facebook.com/docs/instagram-platform',
        },
      },
      {
        name: 'meta_app_secret',
        label: 'Meta App Secret (optional)',
        placeholder: '••••••••',
        optional: true,
        help: {
          what: 'The App Secret paired with your Meta App ID. Stored encrypted.',
          where: 'developers.facebook.com → your app → App settings → Basic → App secret',
          steps: ['Open App settings → Basic', 'Click "Show" next to App secret', 'Copy and paste it here'],
        },
      },
    ],
  },
  {
    key: 'facebook',
    name: 'Facebook',
    accent: '#1877F2',
    tagline: 'Page posts, comments, Messenger, lead forms',
    connect: 'oauth',
    connectNote: 'Facebook Page automation is on our roadmap — connection will open in an upcoming release.',
    capabilities: [
      { label: 'Page post publish/schedule', status: 'future' },
      { label: 'Comment auto-reply', status: 'future' },
      { label: 'Messenger AI chatbot', status: 'future' },
      { label: 'Lead form → CRM', status: 'future' },
    ],
    credentials: [],
  },
  {
    key: 'telegram',
    name: 'Telegram',
    accent: '#229ED9',
    tagline: 'Bot DMs, AI, channels, groups',
    connect: 'token',
    connectNote: 'Create a bot with @BotFather and paste its token — full automation, no app review.',
    capabilities: [
      { label: 'AI bot chat', status: 'now' },
      { label: 'Keyword auto-replies', status: 'now' },
      { label: 'Broadcasts', status: 'now' },
      { label: 'Drip sequences', status: 'now' },
      { label: 'Channel post/schedule', status: 'future' },
      { label: 'Group welcome/moderation', status: 'future' },
    ],
    credentials: [
      {
        name: 'telegram_bot_token',
        label: 'Telegram Bot Token',
        placeholder: '7123456789:AAH...',
        help: {
          what: 'The token that lets us run your Telegram bot.',
          where: 'Telegram app → chat with @BotFather',
          steps: [
            'Open Telegram and search @BotFather',
            'Send /newbot and follow the prompts (name + username)',
            'Copy the token BotFather gives you and paste it here',
          ],
          docUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
        },
      },
    ],
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    accent: '#0A66C2',
    tagline: 'Company page posts + AI content',
    connect: 'oauth',
    connectNote: 'AI content generation works today. Company-Page publishing is on our roadmap. LinkedIn policy forbids DM automation.',
    capabilities: [
      { label: 'AI content generation', status: 'now' },
      { label: 'Company page post/schedule', status: 'future' },
      { label: 'Comment monitoring/reply', status: 'future' },
      { label: 'DM automation', status: 'no' },
    ],
    credentials: [],
  },
]

export function platformByKey(key: string): PlatformDef | undefined {
  return PLATFORMS.find((p) => p.key === key)
}

export const CAP_LABEL: Record<CapabilityStatus, { text: string; cls: string }> = {
  now: { text: 'Available now', cls: 'bg-emerald-500/15 text-emerald-600' },
  approval: { text: 'Needs approval', cls: 'bg-amber-500/15 text-amber-600' },
  future: { text: 'Coming soon', cls: 'bg-sky-500/15 text-sky-600' },
  no: { text: 'Not supported', cls: 'bg-zinc-400/15 text-zinc-500' },
}
