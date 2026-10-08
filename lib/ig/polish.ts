/**
 * The post-processing every AI-written caption goes through before a person
 * sees it: humanize (strip invisible characters, em dashes, stock phrases) and
 * cap hashtags per platform. Pure + browser-safe.
 */

import { humanize } from './humanize'
import { detect } from './detect'
import { lintCaption, FILLER_TAGS } from './caption-lint'
import { cleanHashtags, IG_MAX_HASHTAGS } from './compose'

/** Hashtag ceilings per platform. Instagram's is a hard platform limit; the rest are taste. */
const TAG_CAP: Record<string, number> = { instagram: IG_MAX_HASHTAGS, facebook: 3, linkedin: 5, twitter: 2, youtube: 3 }

/** Clean AI tells out of a piece of copy. Never throws; returns the input trimmed on failure. */
export function polishCopy(text: string): string {
  const t = text.trim()
  if (!t) return ''
  try {
    // Deleting a stock closer ("Follow for more!") can leave "now!!" behind.
    return humanize(t).text.replace(/([!?])\1+/g, '$1').trim()
  } catch {
    return t
  }
}

/** Normalise + de-dupe, drop filler tags (#viral, #fyp…) and cap hashtags for a platform. */
export function polishTags(tags: string[], platform = 'instagram'): string[] {
  return cleanHashtags(tags)
    .filter((t) => !FILLER_TAGS.has(`#${t.toLowerCase()}`))
    .slice(0, TAG_CAP[platform] ?? IG_MAX_HASHTAGS)
}

/** Compact quality snapshot persisted on content_posts.quality for queue badges. */
export interface CaptionQuality {
  human: number
  verdict: string
  fails: number
  warns: number
  checkedAt: string
}

export function captionQuality(caption: string, hashtags: string[] = []): CaptionQuality | null {
  if (!caption.trim()) return null
  try {
    const lint = lintCaption(caption, { hashtags })
    const d = detect(caption)
    return {
      human: Math.round(d.score),
      verdict: d.verdict,
      fails: lint.checks.filter((c) => c.status === 'FAIL').length,
      warns: lint.checks.filter((c) => c.status === 'WARN').length,
      checkedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}
