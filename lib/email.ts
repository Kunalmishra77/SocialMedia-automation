import 'server-only'

import nodemailer from 'nodemailer'

function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

/**
 * Sends an email. Priority: SMTP (nodemailer) → Resend → dev log.
 * Returns true if actually sent.
 */
export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'Socialflow <onboarding@resend.dev>'

  // 1) SMTP (any provider — Gmail, Zoho, your mail server, etc.)
  if (smtpConfigured()) {
    try {
      const port = Number(process.env.SMTP_PORT ?? 587)
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
      await transporter.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html })
      return true
    } catch (err) {
      console.error('[email:smtp] failed:', err)
      // fall through to Resend/log
    }
  }

  // 2) Resend
  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
      })
      return res.ok
    } catch {
      /* fall through */
    }
  }

  // 3) Dev log
  console.log('[email:dev] to=%s subject=%s\n%s', opts.to, opts.subject, opts.html)
  return false
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
