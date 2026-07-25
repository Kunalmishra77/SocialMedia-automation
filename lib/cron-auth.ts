import { NextRequest } from 'next/server'

/** Throws unless the request carries the internal cron secret. */
export function verifyInternalCronCall(req: NextRequest): void {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    throw new Error('Unauthorized cron call')
  }
}
