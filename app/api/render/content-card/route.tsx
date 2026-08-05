import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

/**
 * Renders a branded 1080×1080 social card as PNG — the fallback visual when
 * AI image generation isn't available. Driven by query params so it can be
 * fetched server-side (by the image engine) or embedded directly.
 *   t = headline, s = subtitle, c = primary hex, c2 = secondary hex,
 *   b = brand name (footer), logo = logo URL
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const headline = (q.get('t') || 'Your brand, on autopilot').slice(0, 140)
  const subtitle = (q.get('s') || '').slice(0, 160)
  const primary = sanitizeHex(q.get('c')) || '#ea6a24'
  const secondary = sanitizeHex(q.get('c2')) || '#16233a'
  const brand = (q.get('b') || '').slice(0, 60)
  const logo = safeImageUrl(q.get('logo'))

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '90px',
          backgroundColor: secondary,
          backgroundImage: `linear-gradient(135deg, ${secondary} 0%, ${primary} 140%)`,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} width={110} height={110} style={{ borderRadius: 20, objectFit: 'cover' }} alt="" />
          ) : (
            <div
              style={{
                width: 22, height: 90, borderRadius: 8, backgroundColor: primary,
                boxShadow: `0 0 40px ${primary}`,
              }}
            />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 74,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.08,
              letterSpacing: '-1.5px',
            }}
          >
            {headline}
          </div>
          {subtitle ? (
            <div style={{ marginTop: 32, fontSize: 36, color: 'rgba(255,255,255,0.82)', lineHeight: 1.3 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#ffffff' }}>{brand}</div>
          <div style={{ height: 8, width: 160, borderRadius: 8, backgroundColor: primary }} />
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, immutable' },
    },
  )
}

/** Only allow #RGB / #RRGGBB to flow into inline styles. */
function sanitizeHex(v: string | null): string | null {
  return v && /^#?[0-9a-fA-F]{3,8}$/.test(v) ? (v.startsWith('#') ? v : `#${v}`) : null
}

/**
 * Only fetch logos from our OWN storage/app origins. This endpoint is public and
 * the image engine fetches this URL server-side, so an arbitrary `logo` value
 * would be an SSRF/image-proxy. Anything off-allowlist is dropped.
 */
function safeImageUrl(v: string | null): string {
  if (!v) return ''
  let u: URL
  try { u = new URL(v) } catch { return '' }
  if (u.protocol !== 'https:') return ''
  const allow = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_APP_URL]
    .map((b) => { try { return b ? new URL(b).host : '' } catch { return '' } })
    .filter(Boolean)
  const host = u.host.toLowerCase()
  const ok = allow.includes(host) || host.endsWith('.supabase.co') || host.endsWith('.supabase.in')
  return ok ? v : ''
}
