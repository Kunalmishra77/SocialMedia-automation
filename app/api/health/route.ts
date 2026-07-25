import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  let db = false
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('workspaces').select('id', { count: 'exact', head: true })
    db = !error
  } catch {
    db = false
  }
  return NextResponse.json({ status: 'ok', db, time: new Date().toISOString() })
}
