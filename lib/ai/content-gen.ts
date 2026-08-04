import 'server-only'

import { callAI, callVision, aiConfigured } from '@/lib/ai/client'
import { buildBrandBlock, type BrandProfile } from '@/lib/ai/brand'

/** A single platform's generated copy. Uniform shape across platforms so the
 *  UI and publisher can treat them the same. `caption` holds the main body
 *  (post text / thread / article) for every platform. */
export interface PlatformVariant {
  caption: string
  hashtags: string[]
  cta: string
  first_comment?: string
}

export type PlatformVariants = Record<string, PlatformVariant>

export interface GeneratedContent {
  title: string
  image_prompt: string
  variants: PlatformVariants
}

/** Per-platform authoring guidance the model adapts the same idea to. */
const PLATFORM_SPECS: Record<string, string> = {
  instagram:
    'Instagram feed post. Caption under 125 words, warm and engaging, 1-3 tasteful emojis, hook in the first line. Provide 8-15 relevant hashtags (no # prefix). Optionally a "first_comment" with extra hashtags or a question.',
  facebook:
    'Facebook post. Longer, more conversational caption (up to ~200 words), storytelling tone, 0-3 hashtags.',
  linkedin:
    'LinkedIn post. Professional, first-person, credible. 100-220 words, short paragraphs, minimal or no emojis, 3-5 professional hashtags. End with a thoughtful question or CTA.',
  twitter:
    'X/Twitter. Either one punchy tweet under 280 characters, or a short thread separated by blank lines. 1-2 hashtags max.',
  youtube:
    'YouTube community post. Short, community-friendly announcement style, 0-3 hashtags.',
}

/** Extract the first JSON object from a model response (tolerant of ``` fences). */
function extractJson(raw: string): unknown | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).replace(/^#/, '').trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[\s,]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean)
  return []
}

/**
 * Generate platform-optimised copy + an image prompt for a topic/brief,
 * grounded on the client's brand profile and (optional) knowledge context.
 * Returns null if AI isn't configured or the model produced unparseable output.
 */
export async function generateContent(opts: {
  brand: BrandProfile
  brief: string
  platforms: string[]
  kbContext?: string
}): Promise<GeneratedContent | null> {
  if (!aiConfigured()) return null
  const platforms = opts.platforms.filter((p) => PLATFORM_SPECS[p])
  if (!platforms.length) return null

  const specBlock = platforms.map((p) => `- ${p}: ${PLATFORM_SPECS[p]}`).join('\n')
  const variantSchema = platforms
    .map((p) => `    "${p}": { "caption": "...", "hashtags": ["..."], "cta": "..."${p === 'instagram' ? ', "first_comment": "..."' : ''} }`)
    .join(',\n')

  const system = [
    'You are an expert social media copywriter and brand strategist.',
    'Create original, on-brand, factual social content. Never invent prices, discounts, medical claims, or policies that were not provided.',
    '',
    'BRAND PROFILE:',
    buildBrandBlock(opts.brand),
    opts.kbContext ? `\nBUSINESS KNOWLEDGE (use for facts):\n${opts.kbContext}` : '',
  ].join('\n')

  const user = [
    `Topic / brief: "${opts.brief}"`,
    '',
    'Adapt this ONE idea into platform-specific posts. Guidance per platform:',
    specBlock,
    '',
    'Return ONLY valid JSON (no markdown, no commentary) in exactly this shape:',
    '{',
    '  "title": "short internal label for this post",',
    '  "image_prompt": "a vivid, detailed prompt to generate an on-brand square social image for this post (describe scene, style, mood, colors; no text overlays)",',
    '  "variants": {',
    variantSchema,
    '  }',
    '}',
  ].join('\n')

  const raw = await callAI(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { maxTokens: 1400, temperature: 0.75 },
  )
  if (!raw) return null

  const parsed = extractJson(raw) as
    | { title?: string; image_prompt?: string; variants?: Record<string, Record<string, unknown>> }
    | null
  if (!parsed || !parsed.variants) return null

  const variants: PlatformVariants = {}
  for (const p of platforms) {
    const v = parsed.variants[p]
    if (!v) continue
    const caption = String(v.caption ?? '').trim()
    if (!caption) continue
    variants[p] = {
      caption,
      hashtags: asStringArray(v.hashtags),
      cta: String(v.cta ?? '').trim(),
      ...(v.first_comment ? { first_comment: String(v.first_comment).trim() } : {}),
    }
  }
  if (!Object.keys(variants).length) return null

  return {
    title: String(parsed.title ?? opts.brief).trim().slice(0, 120),
    image_prompt: String(parsed.image_prompt ?? '').trim(),
    variants,
  }
}

/** Structured content for a designed (template) post — precise text rendered in
 *  the editor, plus an art-directed prompt for the AI hero photo. */
export interface PostDesign {
  badge: string          // small pill label, e.g. "THE HIDDEN COST"
  headline: string       // main line(s), UPPERCASE punchy
  headlineAccent: string // the portion of the headline to highlight in the accent colour
  subtext: string        // one supporting line
  cards: string[]        // 4 short 2-4 word labels (for card/list templates)
  icons: string[]        // 4 icon names (one per card) from ICON_NAMES
  hashtags: string[]     // relevant hashtags for the caption
  cta: string            // short call-to-action / closing line
  heroPrompt: string     // detailed prompt for a photorealistic hero image (no text)
  layout: string         // AI-chosen layout: hero | bullets | split | cards | receipt
}

const LAYOUTS = ['hero', 'bullets', 'split', 'cards', 'receipt']
/** Icon vocabulary the editor can render (kept in sync with design-editor ICONS). */
export const ICON_NAMES = ['check', 'droplet', 'sun', 'star', 'heart', 'shield', 'sparkles', 'trending-up', 'clock', 'zap', 'leaf', 'target', 'users', 'message', 'gift', 'camera', 'award', 'dollar', 'smile', 'book']

/** Generate designed-post content (badge + two-tone headline + subtext + hero prompt). */
export async function generateDesign(opts: { brand: BrandProfile; brief: string; kbContext?: string }): Promise<PostDesign | null> {
  if (!aiConfigured()) return null
  const system = [
    'You are a senior social-media art director and copywriter. You design bold, premium branded posts.',
    'BRAND PROFILE:', buildBrandBlock(opts.brand),
    opts.kbContext ? `\nBUSINESS KNOWLEDGE:\n${opts.kbContext}` : '',
  ].join('\n')
  const user = [
    `Topic: "${opts.brief}"`,
    'Design ONE scroll-stopping Instagram post. Return ONLY JSON:',
    '{',
    '  "badge": "2-4 word ALL-CAPS pill label",',
    '  "headline": "punchy ALL-CAPS headline, max ~8 words, can be two short sentences",',
    '  "headlineAccent": "the exact substring of headline to highlight in the accent colour (a key phrase)",',
    '  "subtext": "one supporting sentence, sentence case, under 14 words",',
    '  "cards": ["4 short 2-4 word labels that support the topic (e.g. tasks, tips, benefits) — ALL CAPS"],',
    `  "icons": ["4 icon names, one matching each card, chosen ONLY from: ${ICON_NAMES.join(', ')}"],`,
    '  "hashtags": ["8-12 relevant hashtags for this post, no # prefix"],',
    '  "cta": "a short closing line or call-to-action, under 12 words",',
    `  "layout": "choose the BEST layout for THIS content — one of: ${LAYOUTS.join(', ')}. Use 'bullets' for a value/benefit list with a CTA, 'cards' for 4 parallel items/tips, 'receipt' for a cost/statement/list framed as a card, 'split' for one strong statement with a framed photo, 'hero' for a bold single message with a full photo.",`,
    `  "heroPrompt": "a detailed prompt for a hero image in the brand's imagery style (${opts.brand.imagery_style || 'real photo'}) relevant to the topic — describe subject, setting, lighting, mood, composition; professional, high quality; NO text, NO words, NO logos in the image"`,
    '}',
  ].join('\n')
  const raw = await callAI([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 650, temperature: 0.8 })
  if (!raw) return null
  const p = extractJson(raw) as Partial<PostDesign> | null
  if (!p?.headline) return null
  const cards = Array.isArray(p.cards) ? p.cards.map((c) => noEmoji(String(c)).toUpperCase().slice(0, 30)).filter(Boolean).slice(0, 4) : []
  const fallbackIcons = ['sparkles', 'star', 'check', 'heart']
  const icons = Array.from({ length: 4 }, (_, i) => {
    const v = Array.isArray(p.icons) ? String(p.icons[i] ?? '').toLowerCase().trim() : ''
    return ICON_NAMES.includes(v) ? v : fallbackIcons[i]
  })
  const hashtags = Array.isArray(p.hashtags) ? p.hashtags.map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 15) : []
  const layout = LAYOUTS.includes(String(p.layout)) ? String(p.layout) : 'hero'
  return {
    icons,
    hashtags,
    badge: noEmoji(String(p.badge ?? '')).toUpperCase().slice(0, 40),
    headline: noEmoji(String(p.headline ?? '')).toUpperCase().slice(0, 120),
    headlineAccent: noEmoji(String(p.headlineAccent ?? '')).toUpperCase().slice(0, 80),
    subtext: noEmoji(String(p.subtext ?? '')).slice(0, 160),
    cards,
    cta: noEmoji(String(p.cta ?? '')).slice(0, 120),
    heroPrompt: String(p.heroPrompt ?? opts.brief).slice(0, 1000),
    layout,
  }
}

/** Strip emoji/pictographs — the display fonts (Anton/Inter) can't render them. */
function noEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Propose one fresh, specific post topic for a scheduled content plan, grounded
 * on the brand + themes, avoiding recently used topics. Returns null if AI off.
 */
export async function suggestTopic(opts: {
  brand: BrandProfile
  themes?: string
  recent?: string[]
}): Promise<string | null> {
  if (!aiConfigured()) return null
  const out = await callAI(
    [
      { role: 'system', content: `You plan a social media calendar for this business.\n${buildBrandBlock(opts.brand)}` },
      {
        role: 'user',
        content: [
          `Suggest ONE specific, engaging social post topic${opts.themes ? ` about: ${opts.themes}` : ''}.`,
          opts.recent?.length ? `Do NOT repeat these recent topics: ${opts.recent.slice(0, 10).join('; ')}.` : '',
          'Reply with just the topic line — no quotes, no numbering, no explanation.',
        ].filter(Boolean).join('\n'),
      },
    ],
    { maxTokens: 40, temperature: 0.9 },
  )
  return out ? out.trim().replace(/^["'\-\d.\s]+/, '').slice(0, 160) : null
}

/**
 * AI prompt architect: turn a short topic + the brand kit into a long, detailed
 * gpt-image-1 prompt that renders a complete premium branded poster (text baked
 * in), plus a matching caption + hashtags. This replaces the manual prompt-
 * writing users otherwise do in ChatGPT/Gamma.
 */
interface PosterSpec {
  concept: string
  headline: string
  subheadline: string
  benefits: { title: string; desc: string; icon: string }[]
  subject: string
  products: string
  caption: string
  hashtags: string[]
}

export async function expandPoster(opts: { brand: BrandProfile; brief: string; kbContext?: string; shape?: string; referenceStyle?: string }): Promise<{ imagePrompt: string; caption: string; hashtags: string[]; spec: PosterSpec } | null> {
  if (!aiConfigured()) return null
  const b = opts.brand
  const system = 'You are a world-class advertising art director planning a PREMIUM, photorealistic branded Instagram poster. You output a precise, structured content spec. Keep ALL on-image words minimal, short and impactful (fewer words render far more reliably). Never invent facts, prices or claims not provided.'
  const brandBlock = [
    `Brand name (spell EXACTLY): "${b.business_name}"`,
    b.industry && `Industry: ${b.industry}`,
    b.target_audience && `Audience: ${b.target_audience}`,
    b.products && `Products / services: ${b.products}`,
    b.brand_colors.length ? `Color palette: ${b.brand_colors.join(', ')}` : '',
    `Theme: ${b.theme}. Imagery style: ${b.imagery_style}.`,
  ].filter(Boolean).join('\n')
  const user = [
    `Plan a poster about: "${opts.brief}".`,
    'BRAND:', brandBlock,
    opts.referenceStyle ? `\nMATCH THIS VISUAL STYLE (from a reference the user provided):\n${opts.referenceStyle}` : '',
    opts.kbContext ? `\nFACTS (use, never contradict):\n${opts.kbContext}` : '',
    '',
    'Keep on-image text MINIMAL: headline max 5 words; each benefit title max 3 words; one short subline. Fewer words = fewer rendering errors.',
    'Return ONLY JSON:',
    '{',
    '  "concept": "1-2 sentences: the composition idea and mood (e.g. clean split layout, subject right, message left)",',
    '  "headline": "the main headline to render on the image — short (max 5 words), punchy, correctly spelled",',
    '  "subheadline": "one short supporting line",',
    '  "benefits": [{"title": "SHORT BENEFIT", "desc": "2-5 word detail", "icon": "simple icon idea e.g. water droplet, shield, sparkle"}],',
    '  "subject": "detailed description of the main photorealistic subject/scene relevant to the topic and brand imagery style",',
    '  "products": "description of a tasteful product display if (and only if) the brand sells physical products, else empty string",',
    '  "caption": "engaging Instagram caption, 2-4 short lines",',
    '  "hashtags": ["8-12 relevant hashtags, no # prefix"]',
    '}',
    'Provide 3-4 benefits.',
  ].filter(Boolean).join('\n')
  const raw = await callAI([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 1200, temperature: 0.8 })
  if (!raw) return null
  const p = extractJson(raw) as Partial<PosterSpec> | null
  if (!p?.headline) return null
  const spec: PosterSpec = {
    concept: String(p.concept ?? '').slice(0, 300),
    headline: String(p.headline ?? '').slice(0, 80),
    subheadline: String(p.subheadline ?? '').slice(0, 120),
    benefits: Array.isArray(p.benefits) ? p.benefits.slice(0, 4).map((x) => ({ title: String(x?.title ?? '').slice(0, 40), desc: String(x?.desc ?? '').slice(0, 60), icon: String(x?.icon ?? '').slice(0, 40) })) : [],
    subject: String(p.subject ?? '').slice(0, 600),
    products: String(p.products ?? '').slice(0, 400),
    caption: String(p.caption ?? opts.brief).slice(0, 600),
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 15) : [],
  }
  return { imagePrompt: buildPosterPrompt(b, spec, opts.shape ?? 'portrait', opts.referenceStyle), caption: spec.caption, hashtags: spec.hashtags, spec }
}

/** Analyze a user-provided reference image and describe its style/layout (vision). */
export async function describeReference(imageUrl: string): Promise<string | null> {
  return callVision(imageUrl, 'Analyze this social-media poster/design. In 5-7 concise bullet points, describe ONLY its VISUAL STYLE and LAYOUT so it can be recreated for a DIFFERENT brand: overall composition/layout structure, color mood, typography style, use of photography/illustration, decorative elements, spacing, and aesthetic. Do NOT mention the specific brand name, product names or exact text content.')
}

const SHAPE_TEXT: Record<string, string> = {
  portrait: 'A vertical 4:5 portrait',
  square: 'A perfectly square 1:1',
  landscape: 'A wide 3:2 landscape',
}

/** Assemble a complete gpt-image-1 prompt from the spec + fixed FOLLOW / AVOID rules. */
function buildPosterPrompt(b: BrandProfile, s: PosterSpec, shape: string, referenceStyle?: string): string {
  const palette = b.brand_colors.length ? b.brand_colors.join(', ') : 'an elegant, tasteful palette'
  const footer = [b.website, b.phone].filter(Boolean).join('   and   ') || 'the brand website'
  const benefits = s.benefits.map((x, i) => `${i + 1}. Icon: ${x.icon || 'simple line icon'} — "${x.title}"${x.desc ? ` (${x.desc})` : ''}`).join('\n')
  return [
    `FORMAT: ${SHAPE_TEXT[shape] ?? SHAPE_TEXT.portrait} social-media advertisement poster, premium editorial commercial design, ultra-clean and uncluttered, bright and airy.`,
    referenceStyle && `STYLE REFERENCE (match this aesthetic, but for THIS brand and content):\n${referenceStyle}`,
    `BRAND: Feature the brand name "${b.business_name}" spelled EXACTLY. Use ONLY this color palette: ${palette}. Visual theme: ${b.theme}. Imagery style: ${b.imagery_style}.`,
    `COMPOSITION: ${s.concept || 'A sophisticated, balanced split composition with generous whitespace.'}`,
    `HEADLINE (render exactly and sharply): "${s.headline}"${s.subheadline ? `, with the short supporting line "${s.subheadline}".` : '.'}`,
    benefits && `FEATURE POINTS (each a minimal line icon + a bold SHORT label, correctly spelled):\n${benefits}`,
    `MAIN SUBJECT: ${s.subject}. Photorealistic, professional studio lighting, natural realistic texture, sharp focus.`,
    s.products && `PRODUCTS: ${s.products}. Realistic premium packaging showing the brand name; all products fully visible, none cropped or duplicated.`,
    `FOOTER: a full-width horizontal footer strip along the bottom edge in the brand accent color, showing ${footer} in clean bold WHITE sans-serif text, clearly readable.`,
    'TYPOGRAPHY: professional hierarchy — heavy modern sans-serif for headings; perfect alignment and spacing.',
    'CRITICAL TEXT RULES: Keep the TOTAL amount of on-image text minimal. Render ONLY the exact words specified above — spelled perfectly, sharp, legible, high-contrast, well-kerned. Do NOT invent, add, repeat, or hallucinate any extra words, gibberish, lorem-ipsum, random letters or fake paragraphs. If unsure, use fewer words.',
    'QUALITY: photorealistic, high-end commercial advertising, luxury editorial art direction, soft natural shadows, professional color grading.',
    'STRICTLY AVOID: watermarks, random or duplicate logos, extra unrequested text, misspelled/blurry/illegible/garbled text, deformed hands or fingers, duplicate or cropped products, cluttered layout, dark or harsh backgrounds, low-quality artifacts.',
  ].filter(Boolean).join('\n\n')
}

/** Regenerate copy for a single platform (used by "regenerate caption"). */
export async function regeneratePlatform(opts: {
  brand: BrandProfile
  brief: string
  platform: string
  kbContext?: string
}): Promise<PlatformVariant | null> {
  const res = await generateContent({ brand: opts.brand, brief: opts.brief, platforms: [opts.platform], kbContext: opts.kbContext })
  return res?.variants[opts.platform] ?? null
}
