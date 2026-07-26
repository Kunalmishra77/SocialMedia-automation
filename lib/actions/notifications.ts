'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser } from '@/lib/authz'

export async function markAllReadAction(): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  await admin
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_read', false)
  revalidatePath('/notifications')
}
