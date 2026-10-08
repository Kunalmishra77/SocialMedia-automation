/**
 * Instagram playbook — the platform rules every Instagram prompt is grounded on.
 * Distilled from instagram-agent-skill by Jake Schincariol (MIT) —
 * https://github.com/Jakeschincariol/instagram-agent-skill
 *
 * These are prompt blocks, not code: keep each one short, concrete and in the
 * imperative, because the model reads every line on every call.
 */

import hooksData from './data/hooks.json'

/** Phrases the model must never write. The humanizer catches the rest. */
const BANNED_OPENERS = [
  'Hey guys', 'In today\'s video', 'In this video', 'Stop scrolling', 'Let\'s dive in',
  'In today\'s fast-paced world', 'Are you ready to', 'Did you know',
]

export const NEVER_FABRICATE =
  'Never invent metrics, prices, clients, results, testimonials or outcomes. If a specific number or proof is needed and was not provided, write {{your number}} (or {{your proof}}) as a placeholder instead.'

export const PLAIN_LANGUAGE = [
  'Write the way a person talks: contractions, short sentences, plain words.',
  'No em dashes (use a comma or a full stop). No "It\'s not just X, it\'s Y". No rule-of-three lists of adjectives.',
  'Avoid stock AI words: elevate, unlock, unleash, seamless, game-changer, delve, journey, tapestry, testament, navigate, empower, transformative, realm, robust.',
  `Never open with: ${BANNED_OPENERS.map((b) => `"${b}"`).join(', ')}.`,
].join('\n')

/**
 * Caption rules. `job` decides line one: for a Reel the video already hooked them
 * (Job A: the caption carries the ask + context + search words); for a photo or
 * carousel the caption IS the content (Job B: line one is the hook).
 */
export function captionRules(job: 'A' | 'B'): string {
  return [
    'INSTAGRAM CAPTION RULES:',
    job === 'A'
      ? '- This caption sits under a Reel that already has its own hook. Line 1 states the ask/context plainly. Do not write a second hook that competes with the video.'
      : '- Line 1 IS the hook: concrete (a number, a name, a specific situation), and it must make sense on its own within the first 125 characters, because the feed cuts the caption there behind "... more". End line 1 on a cliff, never mid-clause.',
    '- Line 1: never a greeting, never a hashtag, never an emoji as the first character.',
    '- Body: 2 to 6 short paragraphs separated by a blank line. Put the words people would search for (e.g. "skin care routine for oily skin") naturally in the sentences. Instagram search reads caption text; it matters more than hashtags.',
    '- Exactly ONE call to action: comment a one-word keyword, save it, share/send it, or DM. Never two asks.',
    '- A keyword CTA uses one sayable word in capitals with no spaces, e.g. Comment GUIDE.',
    '- No links in the caption body (they are not clickable). Point to the bio or DM instead.',
    '- Hashtags: 3 to 5, specific topic labels only. Instagram allows at most 5 per post. Never #viral, #fyp, #explorepage, #foryou, #instagood.',
    '- Emoji: as punctuation, not decoration. 0 to 3 in total.',
    '- Most captions need 300 to 900 characters, not 2,200.',
  ].join('\n')
}

export const REEL_RULES = [
  'REEL RULES:',
  '- One idea per Reel. If there are two ideas, it is two Reels.',
  '- 0:00-0:02 HOOK: the claim. No greeting, no name, no "in this video". Start at the sentence you would normally reach at second six.',
  '- 0:02-0:07 STAKE: why it matters to the viewer, one line.',
  '- BODY: one idea per beat; the frame/visual changes every beat. No beat over ~4 seconds spoken.',
  '- PAYOFF: deliver what the hook promised before the end, then ONE ask.',
  '- LOOP: the last line echoes a word from the hook so the replay lands cleanly.',
  '- Numbers over adjectives. "$4,200" beats "a lot".',
  '- On-screen text is a separate script: 6 words or fewer per card, ALL CAPS ok, hook card visible at frame 1.',
  '- 15 to 45 seconds is the working range.',
].join('\n')

export const CAROUSEL_RULES = [
  'CAROUSEL RULES:',
  '- 6 to 10 slides. Slide 1 COVER: the hook in 6 words or fewer + one short promise line.',
  '- Slide 2 STAKE: why this matters in one sentence; it must also work as a cover (Instagram can re-show a carousel from slide 2).',
  '- Middle slides: ONE idea each, a 3 to 7 word headline, at most 25 words under it.',
  '- Second to last: RECAP of the whole thing as a list (the screenshot/share slide).',
  '- Last: CTA with ONE action.',
].join('\n')

export interface HookFormula {
  id: number
  name: string
  template: string
  example: string
  on_screen: string
  best_for: string
  trap: string
}

export const HOOK_LIBRARY: HookFormula[] = (hooksData as { hooks: HookFormula[] }).hooks

export const HOOK_RULES: string[] = (hooksData as { rules: string[] }).rules

/** The formula catalogue as a compact prompt block (id, name, template, trap). */
export function hookCatalogue(): string {
  return HOOK_LIBRARY
    .map((h) => `#${h.id} ${h.name}: ${h.template} | e.g. "${h.example}" | on-screen "${h.on_screen}" | avoid: ${h.trap}`)
    .join('\n')
}

/** Brand voice fields the playbook understands (subset of BrandProfile). */
export interface VoiceFields {
  never_say?: string[]
  sample_posts?: string
  positions?: string
  proof_points?: string
  keyword_cta?: string
  on_camera?: string
}

/** Voice block appended to brand context. Empty string when nothing is set. */
export function voiceBlock(v: VoiceFields): string {
  const lines: string[] = []
  if (v.on_camera) lines.push(`On camera / tone: ${v.on_camera}`)
  if (v.positions) lines.push(`Positions this brand holds (use for angles): ${v.positions}`)
  if (v.proof_points) lines.push(`Real proof you MAY use (and only this): ${v.proof_points}`)
  if (v.keyword_cta) lines.push(`Preferred keyword CTA: Comment ${v.keyword_cta.toUpperCase().replace(/\s+/g, '')}`)
  if (v.never_say?.length) lines.push(`Never say these words/phrases: ${v.never_say.join(', ')}`)
  if (v.sample_posts) lines.push(`Write like these real posts by the brand (match rhythm and vocabulary, never copy):\n${v.sample_posts.slice(0, 1500)}`)
  return lines.length ? `VOICE:\n${lines.join('\n')}` : ''
}
