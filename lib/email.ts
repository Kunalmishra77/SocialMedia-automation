import 'server-only'

/**
 * Sends an email via Resend if RESEND_API_KEY is set; otherwise logs it (dev).
 * Returns true if actually sent.
 */
export async function sendMail(opts: {
  to: string
  subject: string
  html: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Socialflow <onboarding@resend.dev>'

  if (!apiKey) {
    console.log('[email:dev] to=%s subject=%s\n%s', opts.to, opts.subject, opts.html)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
    })
    return res.ok
  } catch {
    return false
  }
}

export function credentialsEmailHtml(opts: {
  workspaceName: string
  email: string
  password: string
  loginUrl: string
}): string {
  return `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#f9ce34,#ee2a7b 45%,#6228d7);padding:24px;border-radius:12px 12px 0 0">
      <h1 style="color:#fff;margin:0;font-size:20px">Welcome to Socialflow 🎉</h1>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p>Your workspace <b>${opts.workspaceName}</b> is now active. Here are your login details:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#666">Login&nbsp;URL</td><td style="padding:8px"><a href="${opts.loginUrl}">${opts.loginUrl}</a></td></tr>
        <tr><td style="padding:8px;color:#666">Email</td><td style="padding:8px"><b>${opts.email}</b></td></tr>
        <tr><td style="padding:8px;color:#666">Password</td><td style="padding:8px"><b>${opts.password}</b></td></tr>
      </table>
      <p style="color:#888;font-size:13px">Please change your password after your first login.</p>
    </div>
  </div>`
}
