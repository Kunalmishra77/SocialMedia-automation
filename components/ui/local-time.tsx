'use client'

import { useEffect, useState } from 'react'

/**
 * Render a timestamp in the viewer's local timezone. Server components format in
 * UTC (the container's TZ); this hydrates to the user's actual local time so
 * scheduled times read correctly (e.g. IST, not UTC).
 */
export function LocalTime({ iso, prefix = '' }: { iso: string; prefix?: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const d = new Date(iso)
    if (!Number.isNaN(d.getTime())) {
      setText(d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))
    }
  }, [iso])
  // Before hydration, show a neutral placeholder to avoid a UTC flash.
  return <span suppressHydrationWarning>{prefix}{text || '…'}</span>
}
