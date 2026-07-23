'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getMemberships, generateUniqueSlug } from '@/lib/authz'
import { signupSchema, loginSchema, createWorkspaceSchema } from '@/lib/validators/auth'

export interface ActionState {
  error?: string
}

/**
 * Signup: create a confirmed auth user (so login works immediately in this
 * self-serve SaaS flow), sign them in, then send them to workspace creation.
 */
export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { fullName, email, password } = parsed.data

  const admin = createAdminClient()
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createErr) {
    if (createErr.message.toLowerCase().includes('already')) {
      return { error: 'An account with this email already exists. Please log in.' }
    }
    return { error: createErr.message }
  }

  const supabase = await createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signInErr) return { error: signInErr.message }

  redirect('/workspace/new')
}

/** Login: sign in, then route based on how many workspaces the user has. */
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { email, password } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Invalid email or password' }

  const memberships = await getMemberships(data.user.id)
  if (memberships.length === 0) redirect('/workspace/new')
  redirect('/')
}

/** Create the first workspace and make the creator its super_admin. */
export async function createWorkspaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getUser()
  if (!user) redirect('/login')

  const parsed = createWorkspaceSchema.safeParse({
    name: formData.get('name'),
    industry: formData.get('industry') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { name, industry } = parsed.data

  const admin = createAdminClient()
  const slug = await generateUniqueSlug(name)

  const { data: ws, error: wsErr } = await admin
    .from('workspaces')
    .insert({ name, slug, plan: 'free', owner_email: user.email, industry })
    .select('id')
    .single()
  if (wsErr || !ws) return { error: wsErr?.message ?? 'Could not create workspace' }

  const { error: memErr } = await admin.from('workspace_members').insert({
    workspace_id: ws.id,
    user_id: user.id,
    role: 'super_admin',
  })
  if (memErr) return { error: memErr.message }

  redirect('/')
}

/** Sign out and return to login. */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
