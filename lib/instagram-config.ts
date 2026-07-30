import 'server-only'

import { randomBytes } from 'node:crypto'
import { encryptToken, decryptToken } from '@/lib/crypto'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export interface IgAppConfig {
  appId: string
  appSecret: string
  verifyToken: string
  source: 'workspace' | 'env'
}

interface StoredApp { app_id?: string; app_secret_enc?: string; verify_token?: string }

/**
 * Resolve the Instagram app credentials for a workspace. Prefers per-workspace
 * credentials the client saved in their portal; falls back to platform env vars
 * only for backward compatibility. Returns null if neither is configured.
 */
export async function getInstagramApp(admin: Admin, workspaceId: string): Promise<IgAppConfig | null> {
  const { data } = await admin.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle()
  const cfg = (data?.settings as { instagram_app?: StoredApp } | null)?.instagram_app
  if (cfg?.app_id && cfg.app_secret_enc) {
    return { appId: cfg.app_id, appSecret: decryptToken(cfg.app_secret_enc), verifyToken: cfg.verify_token || 'aiagentix_verify', source: 'workspace' }
  }
  if (process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) {
    return { appId: process.env.INSTAGRAM_APP_ID, appSecret: process.env.INSTAGRAM_APP_SECRET, verifyToken: process.env.META_VERIFY_TOKEN ?? 'socialflow_verify', source: 'env' }
  }
  return null
}

/** Public (no-secret) setup info to render in the client portal. */
export async function getInstagramSetup(admin: Admin, workspaceId: string): Promise<{
  configured: boolean; appId: string; verifyToken: string; callbackUrl: string
}> {
  const { data } = await admin.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle()
  const cfg = (data?.settings as { instagram_app?: StoredApp } | null)?.instagram_app ?? {}
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  return {
    configured: !!(cfg.app_id && cfg.app_secret_enc),
    appId: cfg.app_id ?? '',
    verifyToken: cfg.verify_token ?? '',
    callbackUrl: `${base}/api/webhooks/instagram/${workspaceId}`,
  }
}

/** Save/replace the workspace's Instagram app credentials. Generates a stable verify token. */
export async function saveInstagramApp(admin: Admin, workspaceId: string, appId: string, appSecret: string): Promise<{ verifyToken: string }> {
  const { data } = await admin.from('workspaces').select('settings').eq('id', workspaceId).single()
  const settings = (data?.settings ?? {}) as Record<string, unknown>
  const existing = settings.instagram_app as StoredApp | undefined
  const verifyToken = existing?.verify_token || randomBytes(12).toString('hex')
  settings.instagram_app = { app_id: appId, app_secret_enc: encryptToken(appSecret), verify_token: verifyToken }
  await admin.from('workspaces').update({ settings }).eq('id', workspaceId)
  return { verifyToken }
}
