'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'

interface Msg { role: 'user' | 'bot'; text: string }

export function WidgetChat({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'bot', text: `Hi! 👋 Welcome to ${name}. How can I help?` }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const sessionId = useRef<string>('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionId.current = localStorage.getItem('sf_widget_sid') || Math.random().toString(36).slice(2)
    localStorage.setItem('sf_widget_sid', sessionId.current)
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput(''); setMsgs((m) => [...m, { role: 'user', text }]); setBusy(true)
    try {
      const res = await fetch(`/api/widget/${workspaceId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId.current }),
      })
      const d = await res.json()
      setMsgs((m) => [...m, { role: 'bot', text: d.reply ?? "Thanks! We'll be in touch." }])
    } catch {
      setMsgs((m) => [...m, { role: 'bot', text: 'Something went wrong, please try again.' }])
    } finally { setBusy(false) }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-sm font-bold">◐</span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-white/80">We typically reply in minutes</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="rounded-2xl border border-border bg-card px-3 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div></div>}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Type a message…" className="h-10 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none" />
        <button onClick={send} disabled={busy} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground hover:brightness-110"><Send className="h-4 w-4" /></button>
      </div>
    </div>
  )
}
