import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="brand-gradient relative hidden flex-col justify-between p-12 text-white lg:flex">
        <Link href="/" className="text-xl font-bold tracking-tight">
          ◐ Socialflow
        </Link>
        <div className="space-y-4">
          <h2 className="text-3xl font-bold leading-tight">
            Run all your social media from one inbox.
          </h2>
          <p className="max-w-md text-white/85">
            Instagram, Facebook, Telegram and more — AI handles the volume, your team handles the
            relationships. DMs, comments, CRM, campaigns and analytics in one place.
          </p>
          <div className="flex flex-wrap gap-2 pt-2 text-xs text-white/80">
            {['Instagram', 'Facebook', 'Telegram', 'LinkedIn', 'YouTube', 'X'].map((c) => (
              <span key={c} className="rounded-full bg-white/15 px-3 py-1">
                {c}
              </span>
            ))}
          </div>
        </div>
        <p className="text-sm text-white/70">© {new Date().getFullYear()} Socialflow</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
