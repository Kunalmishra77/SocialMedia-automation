'use client'

import { useEffect, useState, useActionState } from 'react'
import {
  Sparkles, MessagesSquare, CalendarClock, Workflow, BarChart3, ShieldCheck,
  Check, CreditCard, Loader2, PartyPopper, ArrowRight,
} from 'lucide-react'
import { PLAN_CATALOG } from '@/lib/plans'
import { submitOnboardingAction, createPaymentOrderAction, confirmRazorpayPaymentAction } from '@/lib/actions/onboarding'

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

const FEATURES = [
  { icon: MessagesSquare, title: 'AI Inbox & Chatbot', desc: 'Auto-reply to DMs and comments with an AI trained on your business.' },
  { icon: Sparkles, title: 'Comment → DM Automation', desc: 'Turn every comment into a conversation, automatically.' },
  { icon: CalendarClock, title: 'Content Scheduling', desc: 'Schedule posts, reels & stories — auto-published on time.' },
  { icon: Workflow, title: 'Workflow Automation', desc: 'Trigger → action flows that run your engagement 24/7.' },
  { icon: BarChart3, title: 'CRM & Analytics', desc: 'Every contact becomes a lead. Track pipeline & performance.' },
  { icon: ShieldCheck, title: 'Secure & Private', desc: 'Your data & accounts are fully isolated and encrypted.' },
]

const CHANNELS = ['Instagram', 'Facebook', 'Telegram', 'LinkedIn', 'YouTube']

type Step = 'welcome' | 'connect' | 'plan' | 'pay' | 'waiting'

export function OnboardingFlow({
  token,
  workspaceName,
  initialStep = 'welcome',
  razorpay = false,
}: {
  token: string
  workspaceName: string
  initialStep?: Step
  razorpay?: boolean
}) {
  const [step, setStep] = useState<Step>(initialStep)
  const [plan, setPlan] = useState('pro')
  const [metaAppId, setMetaAppId] = useState('')
  const [metaAppSecret, setMetaAppSecret] = useState('')
  const [payError, setPayError] = useState('')
  const [rzpBusy, setRzpBusy] = useState(false)
  const selected = PLAN_CATALOG.find((p) => p.key === plan)!

  async function handleRazorpay() {
    setPayError('')
    setRzpBusy(true)
    try {
      const order = await createPaymentOrderAction(token, plan)
      if (order.demo || !order.orderId) {
        setPayError(order.error || 'Payment unavailable, please try the demo option.')
        setRzpBusy(false)
        return
      }
      const ok = await loadRazorpay()
      if (!ok || !window.Razorpay) { setPayError('Could not load payment.'); setRzpBusy(false); return }
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: 'INR',
        name: 'Socialflow',
        description: `${selected.name} plan`,
        order_id: order.orderId,
        handler: async (resp: Record<string, string>) => {
          const fd = new FormData()
          fd.set('token', token)
          fd.set('plan', plan)
          fd.set('razorpay_order_id', resp.razorpay_order_id)
          fd.set('razorpay_payment_id', resp.razorpay_payment_id)
          fd.set('razorpay_signature', resp.razorpay_signature)
          const res = await confirmRazorpayPaymentAction({}, fd)
          if (res.ok) setStep('waiting')
          else setPayError(res.error || 'Verification failed')
        },
        theme: { color: '#e11d48' },
      })
      rzp.open()
    } finally {
      setRzpBusy(false)
    }
  }

  const [state, formAction, pending] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    async (_prev, fd) => {
      const res = await submitOnboardingAction(_prev, fd)
      if (res.ok) setStep('waiting')
      return res
    },
    {},
  )

  const stepIndex = ['welcome', 'connect', 'plan', 'pay', 'waiting'].indexOf(step)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* Progress */}
      {step !== 'waiting' && (
        <div className="mb-8 flex items-center justify-center gap-2">
          {['Welcome', 'Connect', 'Plan', 'Payment'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  i <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < 3 && <div className={`h-0.5 w-8 ${i < stepIndex ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>
      )}

      {/* WELCOME */}
      {step === 'welcome' && (
        <div className="space-y-8">
          <div className="text-center">
            <div className="brand-gradient mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white">
              <Sparkles className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome to Socialflow</h1>
            <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
              The all-in-one AI automation platform for <b>{workspaceName}</b>. Let&apos;s set up your
              account — it takes 2 minutes.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {CHANNELS.map((c) => (
                <span key={c} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{c}</span>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => setStep('connect')}
            className="mx-auto flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-[var(--shadow-md)] transition hover:brightness-110"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* CONNECT (optional creds — hybrid) */}
      {step === 'connect' && (
        <Card title="Connect your accounts" subtitle="Most clients simply connect accounts with one click after login. Advanced users can bring their own Meta app (optional).">
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
              <p className="font-medium text-emerald-700">✓ Recommended: Connect after login</p>
              <p className="text-muted-foreground">After approval, you&apos;ll connect Instagram, Facebook, Telegram etc. securely with one click (OAuth). Nothing needed here.</p>
            </div>
            <details className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Advanced: use my own Meta app (optional)</summary>
              <div className="mt-3 space-y-2">
                <input value={metaAppId} onChange={(e) => setMetaAppId(e.target.value)} placeholder="Meta App ID" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                <input value={metaAppSecret} onChange={(e) => setMetaAppSecret(e.target.value)} placeholder="Meta App Secret" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                <p className="text-xs text-muted-foreground">Encrypted at rest. Leave blank to use the platform&apos;s managed connection.</p>
              </div>
            </details>
          </div>
          <StepNav onBack={() => setStep('welcome')} onNext={() => setStep('plan')} />
        </Card>
      )}

      {/* PLAN */}
      {step === 'plan' && (
        <Card title="Choose your plan" subtitle="Pick the plan that fits. You can change it later.">
          <div className="grid gap-4 sm:grid-cols-3">
            {PLAN_CATALOG.map((p) => (
              <button
                key={p.key}
                onClick={() => setPlan(p.key)}
                className={`relative rounded-xl border p-4 text-left transition ${
                  plan === p.key ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40'
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">POPULAR</span>
                )}
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 text-2xl font-bold">₹{p.price.toLocaleString('en-IN')}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
                <ul className="mt-3 space-y-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
          <StepNav onBack={() => setStep('connect')} onNext={() => setStep('pay')} nextLabel={`Continue with ${selected.name}`} />
        </Card>
      )}

      {/* PAYMENT */}
      {step === 'pay' && (
        <Card title="Payment" subtitle={razorpay ? 'Secure payment via Razorpay. Your request goes to admin for approval after payment.' : 'Demo payment — no real charge. Your request goes to admin for approval after this.'}>
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{selected.name} plan</span>
              <span className="text-2xl font-bold">₹{selected.price.toLocaleString('en-IN')}<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
            </div>
          </div>

          {razorpay ? (
            <div className="space-y-3">
              {payError && <p className="text-sm text-destructive">{payError}</p>}
              <button
                onClick={handleRazorpay}
                disabled={rzpBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-[var(--shadow-md)] transition hover:brightness-110 disabled:opacity-60"
              >
                {rzpBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening…</> : <><CreditCard className="h-4 w-4" /> Pay ₹{selected.price.toLocaleString('en-IN')} securely</>}
              </button>
              <button type="button" onClick={() => setStep('plan')} className="w-full text-sm text-muted-foreground hover:underline">← Back to plans</button>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="plan" value={plan} />
              <input type="hidden" name="meta_app_id" value={metaAppId} />
              <input type="hidden" name="meta_app_secret" value={metaAppSecret} />
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <input defaultValue="4242 4242 4242 4242" className="h-11 flex-1 bg-transparent text-sm outline-none" />
                </div>
                <div className="flex gap-2">
                  <input defaultValue="12/28" className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
                  <input defaultValue="123" className="h-11 w-24 rounded-md border border-input bg-background px-3 text-sm" />
                </div>
              </div>
              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
              <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-[var(--shadow-md)] transition hover:brightness-110 disabled:opacity-60">
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <>Pay ₹{selected.price.toLocaleString('en-IN')} (Demo)</>}
              </button>
              <button type="button" onClick={() => setStep('plan')} className="w-full text-sm text-muted-foreground hover:underline">← Back to plans</button>
            </form>
          )}
        </Card>
      )}

      {/* WAITING (realtime polling) */}
      {step === 'waiting' && <WaitingScreen token={token} />}
    </div>
  )
}

function WaitingScreen({ token }: { token: string }) {
  const [status, setStatus] = useState<'pending' | 'approved'>('pending')
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const res = await fetch(`/api/onboard/${token}/status`, { cache: 'no-store' })
        const data = await res.json()
        if (!active) return
        if (data.status === 'active') {
          setStatus('approved')
          setLoginUrl(data.loginUrl)
        }
      } catch {
        /* keep polling */
      }
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => { active = false; clearInterval(id) }
  }, [token])

  if (status === 'approved') {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
          <PartyPopper className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold">You&apos;re approved! 🎉</h1>
        <p className="mt-2 text-muted-foreground">
          Your workspace is now active. We&apos;ve emailed your login credentials.
        </p>
        <a
          href={loginUrl ?? '/login'}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-[var(--shadow-md)] transition hover:brightness-110"
        >
          Go to login <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Check className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold">Payment successful ✓</h1>
      <p className="mt-2 text-muted-foreground">
        Your application has been sent for approval. This page will update automatically — no need to
        refresh.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Waiting for admin approval…
      </div>
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  )
}

function StepNav({ onBack, onNext, nextLabel = 'Continue' }: { onBack: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:underline">← Back</button>
      <button onClick={onNext} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-sm)] transition hover:brightness-110">
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}
