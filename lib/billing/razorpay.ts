import 'server-only'

import { createHmac } from 'node:crypto'

// Razorpay (India-first) — plain fetch, no SDK. Falls back to demo when unset.
const BASE = 'https://api.razorpay.com/v1'

export function razorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}
export function razorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? ''
}
function authHeader(): string {
  return 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
}

/** Create a one-time order (amount in INR) for the onboarding payment. */
export async function createOrder(amountInr: number, notes: Record<string, string>): Promise<{ id: string; amount: number } | null> {
  if (!razorpayConfigured()) return null
  try {
    const res = await fetch(`${BASE}/orders`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountInr * 100, currency: 'INR', notes }),
    })
    if (!res.ok) return null
    const d = await res.json()
    return { id: d.id, amount: d.amount }
  } catch {
    return null
  }
}

/** Verify a Checkout success signature (order_id|payment_id vs razorpay_signature). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET ?? ''
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
  return expected === signature
}

/** Verify a Razorpay webhook signature. */
export function verifyWebhook(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  return expected === signature
}

/** Create a recurring subscription (needs a pre-created plan_id). */
export async function createSubscription(planId: string, notes: Record<string, string>): Promise<{ id: string; short_url: string } | null> {
  if (!razorpayConfigured()) return null
  try {
    const res = await fetch(`${BASE}/subscriptions`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId, quantity: 1, total_count: 120, notes }),
    })
    if (!res.ok) return null
    const d = await res.json()
    return { id: d.id, short_url: d.short_url }
  } catch {
    return null
  }
}
