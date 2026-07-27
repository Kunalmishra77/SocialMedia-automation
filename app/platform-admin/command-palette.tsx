'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

/** Cmd/Ctrl+K global search palette for the operator console. */
export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
    else setQ('')
  }, [open])

  if (!open) return null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (term.length < 2) return
    setOpen(false)
    router.push(`/platform-admin/search?q=${encodeURIComponent(term)}`)
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/60 p-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} className="flex items-center gap-2 border-b border-zinc-800 px-4">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients, tickets, operators, audit…"
            className="h-12 flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500">ESC</kbd>
        </form>
        <p className="px-4 py-2.5 text-xs text-zinc-500">Type at least 2 characters and press Enter.</p>
      </div>
    </div>
  )
}
