# 29 — Content intelligence

Instagram-specific quality layer on top of AI content generation. The rules and the
scoring tools are ported from [instagram-agent-skill](https://github.com/Jakeschincariol/instagram-agent-skill)
by Jake Schincariol (MIT, see `lib/ig/LICENSE-instagram-agent-skill`), from Python to
TypeScript, with output verified identical to the originals.

## The library — `lib/ig/`

Pure TypeScript, no dependencies, runs on the server **and** in the browser (so the UI
re-scores on every keystroke at no AI cost).

| file | what it does |
| --- | --- |
| `compose.ts` | Final caption assembly for publishing. Hard-caps hashtags at **5** (Instagram's limit since 18 Dec 2025), counting inline tags too. |
| `caption-lint.ts` | The feed preview (first 125 chars before "… more") + checks: length, first line, concrete hook, hashtag cap/filler, tag placement, links, one ask, emoji density, search terms. |
| `humanize.ts` | Strips invisible characters, typography tells (em dashes, curly quotes) and 154 stock phrases (`data/slop.json`); flags structural tells it can't safely rewrite. |
| `detect.ts` | Five local checks (burstiness, specificity, slop density, fingerprint, voice) → human score + PASS / REVIEW / FLAGGED. Heuristics, not a detector API. |
| `hooks.ts` | 26 hook formulas (`data/hooks.json`), the five-property hook score and formula classifier. |
| `beats.ts` | Script → timed beat sheet at the speaking pace; flags a slow hook, long beats, abstract runs, missing loop, length vs target. |
| `outlier.ts` | Ranks posts by multiple over the account's own median, plus top-vs-bottom-third summary. |
| `playbook.ts` | Prompt blocks every Instagram prompt is grounded on (caption jobs, reel/carousel structure, never-fabricate, plain language, brand voice). |
| `polish.ts` | Post-processing applied to all AI copy: humanize + per-platform hashtag cap + filler-tag removal. |

## Where it is used

- **Publishing** (`app/api/cron/publish-content`) — `composeIgCaption` caps hashtags at the last gate.
- **AI generation** (`lib/ai/content-gen.ts`, Create Post "Generate", Auto-Pilot plans) — playbook rules in the prompt, `polishCopy` / `polishTags` on the output.
- **Caption Coach** (`components/content/caption-coach.tsx`) — live check under Create Post, AI Studio and the approval queue, with one-click clean-up.
- **Reel Studio** (`/content/reels`) — idea → 5 hooks from different formulas, scored and ranked → script with on-screen cards and a live beat sheet → Job-A caption → save as draft, or attach the video and schedule.
- **Profile Score** (`/growth/profile`) — 12-item / 100-point rubric (`data/rubric.json`) with rewrites in fix-first order and history (`profile_audits`).
- **Post Audit** (`/growth/audit`) — outlier ranking of the account's own posts, format/time breakdown, AI explanation and next post ideas.
- **Brand → Voice** — sample posts, positions, real proof, never-say words and keyword CTA feed every prompt via `voiceBlock`.

## Data

Migration `0025_content_intelligence.sql`: `content_posts.script` (Reel Studio output) and
`profile_audits`. Reel saving falls back gracefully if the migration hasn't run.

## Insights permission

Post Audit uses likes + comments by default. Reach / views / saves / shares need
`instagram_business_manage_insights`; set `IG_ENABLE_INSIGHTS=1` only after Meta approves
it, then reconnect accounts. See `DEPLOYMENT.md`.

## What it deliberately does not do

No scraping of other accounts, no automated comments or outreach DMs. Those violate
Instagram's Terms and put client accounts at risk.
