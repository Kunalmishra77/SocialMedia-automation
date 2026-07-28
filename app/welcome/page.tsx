import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Brain, MessagesSquare, Sparkles, Workflow, CalendarClock, BarChart3,
  Users, ShieldCheck, ArrowRight, Check, Zap, Bot,
} from 'lucide-react'
import { getUser } from '@/lib/authz'
import { getActivePlans } from '@/lib/plans-server'
import { BrandLogo } from '@/components/brand-logo'

const PLATFORMS = ['Instagram', 'Facebook', 'Telegram', 'LinkedIn', 'YouTube', 'X']

const FEATURES = [
  { icon: MessagesSquare, title: 'Unified AI Inbox', desc: 'Every DM and comment across all platforms in one place — AI replies instantly, your team takes over anytime.' },
  { icon: Sparkles, title: 'Comment → DM + Follow-gate', desc: 'Turn public comments into private conversations, auto-like, and verify a follow before you deliver.' },
  { icon: Workflow, title: 'Visual Automations', desc: 'Trigger → condition → action flows that run 24/7. Build from scratch or start from a template.' },
  { icon: Bot, title: 'AI Trained on You', desc: 'A knowledge base + persona so the AI answers in your brand voice, accurately — never generic.' },
  { icon: CalendarClock, title: 'Content & Scheduling', desc: 'Draft, AI-write captions, and schedule posts to publish automatically on your calendar.' },
  { icon: Users, title: 'CRM & Leads', desc: 'Every contact becomes a lead. Pipeline, tags, notes and follow-ups — sales built in.' },
  { icon: BarChart3, title: 'Analytics & Reports', desc: 'Know what is working across platforms with clear, trustworthy numbers and CSV exports.' },
  { icon: ShieldCheck, title: 'Secure & Isolated', desc: 'Multi-tenant isolation, encrypted tokens, audit logs. Your data and accounts stay private.' },
]

const STEPS = [
  { n: '1', title: 'Connect your accounts', desc: 'Link Instagram, Telegram and more in a couple of clicks — secure OAuth, no passwords shared.' },
  { n: '2', title: 'Teach the AI', desc: 'Add your knowledge base and brand persona so replies are accurate and on-voice.' },
  { n: '3', title: 'Build automations', desc: 'Comment→DM, keyword flows, welcome sequences, lead capture — activate in minutes.' },
  { n: '4', title: 'Grow on autopilot', desc: 'AI handles the volume, your team handles relationships. Watch leads and conversations roll in.' },
]

export default async function WelcomePage() {
  const user = await getUser()
  if (user) redirect('/')
  const plans = await getActivePlans()

  return (
    <div className="min-h-screen bg-white text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <BrandLogo size="md" />
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Log in</Link>
            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] transition-all hover:brightness-110 hover:shadow-[var(--shadow-md)]">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#fff5ee] via-white to-[#eaf4fe]" />
        <div className="relative mx-auto max-w-4xl px-5 py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Zap className="h-3.5 w-3.5" /> AI Applied, Growth Multiplied
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
            Automate every conversation on <span className="brand-gradient-text">every platform</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            AGENTiX SocialFlow is the AI-powered operating system for social media. Connect Instagram,
            Facebook, Telegram and more — AI handles DMs, comments, leads and content while your team
            focuses on relationships.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-[var(--shadow-md)] transition-all hover:brightness-110 hover:shadow-[var(--shadow-lg)]">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="#features" className="inline-flex items-center gap-2 rounded-lg border border-input bg-white px-6 py-3 text-base font-semibold transition-colors hover:bg-muted">
              See how it works
            </Link>
          </div>
          <div className="mt-10">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Works across</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {PLATFORMS.map((p) => (
                <span key={p} className="rounded-full border border-border bg-white px-3 py-1 text-sm text-muted-foreground">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Everything you need to run social at scale</h2>
          <p className="mt-3 text-muted-foreground">One premium platform — not five disconnected tools.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-[22px] w-[22px]" />
                </div>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-[#fafaf4]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Live in an afternoon</h2>
            <p className="mt-3 text-muted-foreground">From connect to fully-automated in four simple steps.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-border bg-white p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{s.n}</span>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      {plans.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Simple, transparent plans</h2>
            <p className="mt-3 text-muted-foreground">Start where you are, scale as you grow.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {plans.slice(0, 3).map((p) => (
              <div key={p.key} className={`relative rounded-2xl border bg-white p-6 shadow-[var(--shadow-card)] ${p.highlight ? 'border-primary ring-1 ring-primary/20' : 'border-border'}`}>
                {p.highlight && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">Most popular</span>}
                <p className="text-lg font-bold">{p.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                <p className="mt-4 text-3xl font-extrabold">₹{p.price.toLocaleString('en-IN')}<span className="text-base font-normal text-muted-foreground">/mo</span></p>
                <ul className="mt-5 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>
                  ))}
                </ul>
                <Link href="/login" className={`mt-6 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${p.highlight ? 'bg-primary text-primary-foreground hover:brightness-110' : 'border border-input bg-white hover:bg-muted'}`}>
                  Get started
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="brand-gradient relative overflow-hidden rounded-3xl px-8 py-14 text-center text-white shadow-[var(--shadow-lg)]">
          <Brain className="mx-auto mb-4 h-10 w-10" strokeWidth={2.2} />
          <h2 className="text-3xl font-bold">Ready to multiply your growth?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/90">Join brands automating their entire social presence with AGENTiX SocialFlow.</p>
          <Link href="/login" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-primary shadow-lg transition-transform hover:scale-[1.02]">
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 sm:flex-row">
          <BrandLogo size="sm" />
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} AI-Agentix · AI Applied, Growth Multiplied</p>
          <Link href="/login" className="text-sm font-medium text-primary hover:underline">Log in →</Link>
        </div>
      </footer>
    </div>
  )
}
