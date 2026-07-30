import 'server-only'

/**
 * Extract plain text from an uploaded document (PDF, Excel, CSV, DOCX, TXT/MD).
 * Heavy parsers are dynamically imported so they only load when actually used
 * (and are declared in serverExternalPackages so Turbopack doesn't bundle them).
 */
export async function extractText(file: File): Promise<{ text: string; fileType: string; error?: string }> {
  const name = (file.name || 'document').toLowerCase()
  const ext = name.split('.').pop() || ''
  const buf = Buffer.from(await file.arrayBuffer())

  try {
    if (ext === 'pdf' || file.type === 'application/pdf') {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: buf })
      const res = await parser.getText()
      return { text: res.text ?? '', fileType: 'pdf' }
    }

    if (ext === 'xlsx' || ext === 'xls' || file.type.includes('spreadsheet') || file.type.includes('excel')) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'buffer' })
      const parts = wb.SheetNames.map((n) => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n])
        return csv.trim() ? `# Sheet: ${n}\n${csv}` : ''
      }).filter(Boolean)
      return { text: parts.join('\n\n'), fileType: ext === 'xls' ? 'xls' : 'xlsx' }
    }

    if (ext === 'docx' || file.type.includes('word') || file.type.includes('officedocument.wordprocessing')) {
      const mammoth = await import('mammoth')
      const res = await mammoth.extractRawText({ buffer: buf })
      return { text: res.value ?? '', fileType: 'docx' }
    }

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt' || ext === 'md' || file.type.startsWith('text/')) {
      return { text: buf.toString('utf-8'), fileType: ext || 'txt' }
    }

    // Last resort: try to read as UTF-8 text.
    const asText = buf.toString('utf-8')
    if (asText && !asText.includes('�')) return { text: asText, fileType: ext || 'txt' }
    return { text: '', fileType: ext, error: `Unsupported file type “.${ext}”. Use PDF, Excel, CSV, DOCX, TXT or MD.` }
  } catch (e) {
    return { text: '', fileType: ext, error: `Could not read the file: ${e instanceof Error ? e.message : 'parse error'}` }
  }
}
