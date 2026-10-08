/**
 * Final Instagram caption assembly. Instagram caps a post/reel at 5 hashtags
 * (announced by @creators on 18 Dec 2025) and rejects captions over the cap, so
 * every publish path goes through here: inline body tags count toward the cap,
 * appended tags are de-duplicated against them, and the total never exceeds 5.
 */

export const IG_MAX_HASHTAGS = 5
export const IG_MAX_CAPTION = 2200

const TAG_RE = /(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]+)/gu

/** Hashtags written inline in a caption body, in order (without '#'). */
export function inlineHashtags(body: string): string[] {
  return Array.from(body.matchAll(TAG_RE), (m) => m[2])
}

/** Strip '#', split on whitespace/commas, drop empties, de-dupe case-insensitively. */
export function cleanHashtags(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\s,]+/)
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    const tag = String(t).trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/**
 * Body + tags → the caption Instagram receives. Removes inline tags past the
 * cap (keeping the first ones, which carry the most intent) and only appends as
 * many extra tags as fit.
 */
export function composeIgCaption(body: string, tags: string[] = [], cap = IG_MAX_HASHTAGS): string {
  let kept = 0
  const seen = new Set<string>()
  let text = body.replace(TAG_RE, (match, pre: string, tag: string) => {
    const key = tag.toLowerCase()
    if (seen.has(key) || kept >= cap) return pre
    seen.add(key)
    kept++
    return match
  })
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  const extra = cleanHashtags(tags).filter((t) => !seen.has(t.toLowerCase())).slice(0, Math.max(0, cap - kept))
  const tail = extra.map((t) => `#${t}`).join(' ')
  return [text, tail].filter(Boolean).join('\n\n').slice(0, IG_MAX_CAPTION)
}
