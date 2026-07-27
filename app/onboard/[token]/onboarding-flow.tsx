'use client'

import { useEffect, useState, useActionState } from 'react'
import {
  Sparkles, MessagesSquare, CalendarClock, Workflow, BarChart3, ShieldCheck,
  Check, CreditCard, Loader2, PartyPopper, ArrowRight, HelpCircle, ChevronDown,
} from 'lucide-react'
import { PLAN_CATALOG, type PlanOption } from '@/lib/plans'
import { PLATFORMS, platformByKey, CAP_LABEL } from '@/lib/platforms'
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
  { icon: MessagesSquare, title: 'AI Inbox & Chatbot', desc: 'Auto-reply to DMs and comments with AI trained on your business.' },
  { icon: Sparkles, title: 'Comment → DM + Follow-gate', desc: 'Turn comments into conversations, gated by a follow.' },
  { icon: CalendarClock, title: 'Publish & Schedule', desc: 'Posts, reels & content auto-published on your schedule.' },
  { icon: Workflow, title: 'Automation Workflows', desc: 'Trigger → action flows that run 24/7.' },
  { icon: BarChart3, title: 'CRM & Analytics', desc: 'Every contact becomes a lead. Track pipeline & performance.' },
  { icon: ShieldCheck, title: 'Secure & Isolated', desc: 'Your data & accounts are encrypted and private.' },
]

type Step = 'welcome' | 'platforms' | 'setup' | 'plan' | 'pay' | 'waiting'
const ORDER: Step[] = ['welcome', 'platforms', 'setup', 'plan', 'pay']

export function OnboardingFlow({
  token, workspaceName, initialStep = 'welcome', razorpay = false, plans = PLAN_CATALOG,
}: {
  token: string; workspaceName: string; initialStep?: Step; razorpay?: boolean; plans?: PlanOption[]
}) {
  const [step, setStep] = useState<Step>(initialStep)
  const [platforms, setPlatforms] = useState<string[]>(['instagram'])
  const [creds, setCreds] = useState<Record<string, string>>({})
  const defaultPlan = plans.find((p) => p.highlight)?.key ?? plans[0]?.key ?? 'pro'
  const [plan, setPlan] = useState(defaultPlan)
  const [payError, setPayError] = useState('')
  const [rzpBusy, setRzpBusy] = useState(false)
  const selected = (plans.find((p) => p.key === plan) ?? plans[0])!
  const chosen = PLATFORMS.filter((p) => platforms.includes(p.key))

  const [state, formAction, pending] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    async (_prev, fd) => {
      fd.set('platforms', platforms.join(','))
      fd.set('credentials', JSON.stringify(creds))
      const res = await submitOnboardingAction(_prev, fd)
      if (res.ok) setStep('waiting')
      return res
    },
    {},
  )

  function toggle(key: string) {
    setPlatforms((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]))
  }

  async function handleRazorpay() {
    setPayError(''); setRzpBusy(true)
    try {
      const order = await createPaymentOrderAction(token, plan)
      if (order.demo || !order.orderId) { setPayError(order.error || 'Payment unavailable.'); return }
      if (!(await loadRazorpay()) || !window.Razorpay) { setPayError('Could not load payment.'); return }
      const rzp = new window.Razorpay({
        key: order.keyId, amount: order.amount, currency: 'INR', name: 'Socialflow',
        description: `${selected.name} plan`, order_id: order.orderId, theme: { color: '#e11d48' },
        handler: async (resp: Record<string, string>) => {
          const fd = new FormData()
          fd.set('token', token); fd.set('plan', plan)
          fd.set('platforms', platforms.join(',')); fd.set('credentials', JSON.stringify(creds))
          fd.set('razorpay_order_id', resp.razorpay_order_id)
          fd.set('razorpay_payment_id', resp.razorpay_payment_id)
          fd.set('razorpay_signature', resp.razorpay_signature)
          const res = await confirmRazorpayPaymentAction({}, fd)
          if (res.ok) setStep('waiting'); else setPayError(res.error || 'Verification failed')
        },
      })
      rzp.open()
    } finally { setRzpBusy(false) }
  }

  const stepIndex = ORDER.indexOf(step)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {step !== 'waiting' && (
        <div className="mb-8 flex items-center justify-center gap-1.5">
          {['Welcome', 'Platforms', 'Setup', 'Plan', 'Pay'].map((label, i) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${i <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < 4 && <div className={`h-0.5 w-6 ${i < stepIndex ? 'bg-primary' : 'bg-muted'}`} />}
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
              The all-in-one AI automation platform for <b>{workspaceName}</b>. Automate DMs, comments,
              content and leads across every channel — set up in minutes.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </div>
              )
            })}
          </div>
          <div className="flex justify-center">
            <NextBtn onClick={() => setStep('platforms')}>Get started</NextBtn>
          </div>
        </div>
      )}

      {/* SELECT PLATFORMS */}
      {step === 'platforms' && (
        <Card title="Which platforms do you want to automate?" subtitle="Select one or more. We'll only ask for what each one needs.">
          <div className="grid gap-3 sm:grid-cols-2">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p.key)
              return (
                <button key={p.key} onClick={() => toggle(p.key)} className={`relative rounded-xl border p-4 text-left transition ${on ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40'}`}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: p.gradient ?? p.accent }}>
                      {p.name.charAt(0)}
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.tagline}</p>
                    </div>
                    {on && <Check className="h-5 w-5 text-primary" />}
                  </div>
                </button>
              )
            })}
          </div>
          <StepNav onBack={() => setStep('welcome')} onNext={() => platforms.length && setStep('setup')} nextLabel={`Continue (${platforms.length})`} disabled={platforms.length === 0} />
        </Card>
      )}

      {/* PER-PLATFORM SETUP */}
      {step === 'setup' && (
        <Card title="Set up your platforms" subtitle="Most connections happen with one click after approval. Provide anything below only if needed.">
          <div className="space-y-4">
            {chosen.map((p) => (
              <div key={p.key} className="rounded-xl border border-border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.accent }} />
                  <p className="font-semibold">{p.name}</p>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">{p.connectNote}</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {p.capabilities.map((c) => (
                    <span key={c.label} className={`rounded-full px-2 py-0.5 text-[11px] ${CAP_LABEL[c.status].cls}`} title={CAP_LABEL[c.status].text}>
                      {c.label}
                    </span>
                  ))}
                </div>
                {p.credentials.map((f) => (
                  <div key={f.name} className="mb-2">
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                      <Guide field={f} />
                    </div>
                    <input
                      value={creds[f.name] ?? ''}
                      onChange={(e) => setCreds((c) => ({ ...c, [f.name]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                ))}
                {p.credentials.length === 0 && (
                  <p className="rounded-md bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700">✓ No credentials needed — connect with one click after approval.</p>
                )}
              </div>
            ))}
          </div>
          <StepNav onBack={() => setStep('platforms')} onNext={() => setStep('plan')} />
        </Card>
      )}

      {/* PLAN */}
      {step === 'plan' && (
        <Card title="Choose your plan" subtitle="Pick the plan that fits. You can change it later.">
          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((p) => (
              <button key={p.key} onClick={() => setPlan(p.key)} className={`relative rounded-xl border p-4 text-left transition ${plan === p.key ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40'}`}>
                {p.highlight && <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">POPULAR</span>}
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 text-2xl font-bold">₹{p.price.toLocaleString('en-IN')}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
                <ul className="mt-3 space-y-1">
                  {p.features.map((f) => <li key={f} className="flex items-start gap-1.5 text-xs"><Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> {f}</li>)}
                </ul>
              </button>
            ))}
          </div>
          <StepNav onBack={() => setStep('setup')} onNext={() => setStep('pay')} nextLabel={`Continue with ${selected.name}`} />
        </Card>
      )}

      {/* PAYMENT */}
      {step === 'pay' && (
        <Card title="Payment" subtitle={razorpay ? 'Secure payment via Razorpay. Sent for admin approval after payment.' : 'Demo payment — no real charge. Sent for admin approval after this.'}>
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-muted-foreground">{selected.name} plan</span>
                <p className="text-xs text-muted-foreground">{platforms.length} platform{platforms.length > 1 ? 's' : ''}: {platforms.join(', ')}</p>
              </div>
              <span className="text-2xl font-bold">₹{selected.price.toLocaleString('en-IN')}<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
            </div>
          </div>
          {razorpay ? (
            <div className="space-y-3">
              {payError && <p className="text-sm text-destructive">{payError}</p>}
              <button onClick={handleRazorpay} disabled={rzpBusy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-[var(--shadow-md)] transition hover:brightness-110 disabled:opacity-60">
                {rzpBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening…</> : <><CreditCard className="h-4 w-4" /> Pay ₹{selected.price.toLocaleString('en-IN')} securely</>}
              </button>
              <button onClick={() => setStep('plan')} className="w-full text-sm text-muted-foreground hover:underline">← Back to plans</button>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="plan" value={plan} />
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

      {step === 'waiting' && <WaitingScreen token={token} />}
    </div>
  )
}

function Guide({ field }: { field: { help: { what: string; where: string; steps: string[]; docUrl?: string } } }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs text-primary hover:underline">
        <HelpCircle className="h-3 w-3" /> How do I get this?
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-border bg-card p-3 text-xs shadow-[var(--shadow-pop)]">
          <p className="font-medium">{field.help.what}</p>
          <p className="mt-1 text-muted-foreground">Where: {field.help.where}</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-muted-foreground">
            {field.help.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {field.help.docUrl && <a href={field.help.docUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-primary hover:underline">Official docs →</a>}
        </div>
      )}
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
        const d = await res.json()
        if (active && d.status === 'active') { setStatus('approved'); setLoginUrl(d.loginUrl) }
      } catch { /* keep polling */ }
    }
    poll(); const id = setInterval(poll, 3000)
    return () => { active = false; clearInterval(id) }
  }, [token])

  if (status === 'approved') {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600"><PartyPopper className="h-8 w-8" /></div>
        <h1 className="text-2xl font-bold">You&apos;re approved! 🎉</h1>
        <p className="mt-2 text-muted-foreground">Your workspace is active. We&apos;ve emailed your login credentials.</p>
        <a href={loginUrl ?? '/login'} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-[var(--shadow-md)] transition hover:brightness-110">Go to login <ArrowRight className="h-4 w-4" /></a>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Check className="h-8 w-8" /></div>
      <h1 className="text-2xl font-bold">Payment successful ✓</h1>
      <p className="mt-2 text-muted-foreground">Your application was sent for approval. This page updates automatically — no need to refresh.</p>
      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for admin approval…</div>
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
function NextBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-[var(--shadow-md)] transition hover:brightness-110">{children} <ArrowRight className="h-4 w-4" /></button>
}
function StepNav({ onBack, onNext, nextLabel = 'Continue', disabled = false }: { onBack: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:underline">← Back</button>
      <button onClick={onNext} disabled={disabled} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-sm)] transition hover:brightness-110 disabled:opacity-50">{nextLabel} <ArrowRight className="h-4 w-4" /></button>
    </div>
  )
}
