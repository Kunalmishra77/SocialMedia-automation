/**
 * Resolve the app's PUBLIC base URL for a server request.
 *
 * Behind the Coolify/Traefik reverse proxy, `new URL(req.url).origin` is the
 * INTERNAL bind address (http://0.0.0.0:3000), which is useless for redirects the
 * browser must follow or for OAuth redirect_uris. The proxy forwards the real
 * public host in `x-forwarded-host` / `x-forwarded-proto`, so we prefer those.
 * Falls back to NEXT_PUBLIC_APP_URL, then the request origin.
 */
export function publicBase(req: Request): string {
  const xfHost = req.headers.get('x-forwarded-host')
  const host = xfHost || req.headers.get('host') || ''
  const proto = (req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()) || 'https'
  const internal = /^(0\.0\.0\.0|localhost|127\.0\.0\.1|\[::1?\])(:\d+)?$/i.test(host)
  if (host && !internal) return `${proto}://${host}`.replace(/\/$/, '')

  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (env) return env

  try { return new URL(req.url).origin } catch { return '' }
}
