import { redirect } from 'next/navigation'

/**
 * Self-signup is disabled — the platform is invite-only. Super Admins provision
 * every account; clients are onboarded via a secure link and set their own
 * password. Any visit to /signup is sent to login.
 */
export default function SignupDisabled() {
  redirect('/login')
}
