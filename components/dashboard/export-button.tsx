import { Download } from 'lucide-react'

/**
 * A download link that streams a CSV export from /api/export/[type]. Plain anchor
 * (no JS needed) — the route sets Content-Disposition so the browser downloads it.
 */
export function ExportButton({ type, label = 'Export CSV' }: { type: 'contacts' | 'leads' | 'conversations' | 'messages'; label?: string }) {
  return (
    <a
      href={`/api/export/${type}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
      title={`Download all ${type} as a CSV file`}
    >
      <Download className="h-4 w-4" /> {label}
    </a>
  )
}
