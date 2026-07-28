import { Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * AI-Agentix brand lockup: brain glyph (orange) + "AGENTiX" wordmark
 * (A/i orange, GENT/X navy) with an optional "SocialFlow" product caption.
 * `tone="dark"` renders the navy letters as light for the Platform Console.
 */
export function BrandLogo({
  product = true,
  tone = 'light',
  size = 'md',
  className,
}: {
  product?: boolean
  tone?: 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const ink = tone === 'dark' ? 'text-white' : 'text-foreground'
  const icon = { sm: 'h-5 w-5', md: 'h-6 w-6', lg: 'h-8 w-8' }[size]
  const word = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' }[size]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Brain className={cn(icon, 'shrink-0 text-primary')} strokeWidth={2.2} aria-hidden="true" />
      <div className="leading-none">
        <span className={cn(word, 'font-extrabold tracking-tight')}>
          <span className="text-primary">A</span>
          <span className={ink}>GENT</span>
          <span className="text-primary">i</span>
          <span className={ink}>X</span>
        </span>
        {product && (
          <span className={cn('ml-1.5 text-[11px] font-semibold', tone === 'dark' ? 'text-white/60' : 'text-muted-foreground')}>
            SocialFlow
          </span>
        )}
      </div>
    </div>
  )
}
