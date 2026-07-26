import { getOnboardingState } from '@/lib/actions/onboarding'
import { OnboardingFlow } from './onboarding-flow'

export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const state = await getOnboardingState(token)

  if (!state.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <div className="max-w-sm text-center">
          <span className="brand-gradient-text text-lg font-bold">◐ Socialflow</span>
          <h1 className="mt-3 text-xl font-bold">Link unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">{state.reason}</p>
        </div>
      </div>
    )
  }

  // Already submitted or active → jump to the live status/waiting screen.
  const initialStep =
    state.status === 'onboarding' ? 'welcome' : ('waiting' as const)

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <div className="border-b border-border/60 bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="brand-gradient-text text-base font-bold">◐ Socialflow</span>
          <span className="text-xs text-muted-foreground">Client onboarding</span>
        </div>
      </div>
      <OnboardingFlow token={token} workspaceName={state.workspaceName ?? 'your brand'} initialStep={initialStep} />
    </div>
  )
}
