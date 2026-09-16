# Client Onboarding Guide (A → Z)

Ye guide ek naye client ko onboard karne ka **repeatable, easy** tareeka hai.
Zyada pareshani jo Thames ke time hui wo ONE-TIME bugs ki wajah se thi (ab fixed):
OAuth redirect (0.0.0.0), galat IG id, AI chat provider (OpenRouter) fail — teeno fix ho chuke.

---

## Do models — pehle ye decide karo

### ⭐ Model A — Central App (RECOMMENDED, sabse aasaan)
Sab clients EK hi "AI-Agentix" Meta app se connect hote hain. Client ko apna Meta app
banana hi nahi padta.

**Onboarding (client ke liye ~2 min):**
1. Client ke liye workspace banao (portal).
2. Client portal me login → **Settings → Channels → Instagram → "Connect with Instagram"** → Allow.
3. Bas — token + webhooks automatic ho jaate hain.

**Shart:** Central app ko **Advanced Access** (App Review) approved hona chahiye — tabhi
kisi bhi client ka IG bina "tester" banaye connect hota hai. (Ek baar ka kaam.)
Jab tak approve nahi, har naye client ka IG central app me **Instagram Tester** add karna padta hai.

### Model B — Client ka apna Meta app (Thames wala — zyada kaam)
Har client apna Meta app banata hai. Zyada steps (neeche checklist). Sirf tab use karo
jab client apna independent app / rate-limits chahta ho.

**Recommendation: Model A pe standardize karo.** Central app ka App Review ek baar karwa lo,
phir har onboarding sirf "Connect + persona/KB" reh jayega.

---

## Model B — Per-client own app checklist (agar zaroori ho)

**Meta side (client/tum):**
1. developers.facebook.com → Create App → **Business** → add **Instagram → API setup with Instagram business login**.
2. Note karo: **Instagram App ID** (Facebook App ID nahi) + **Instagram App Secret**.
3. App ko **Live** karo.
4. **Business login settings → OAuth redirect URIs**:
   `https://social-media.aiagentixdev.com/api/integrations/instagram/callback`
5. **Configure webhooks → Callback URL**:
   `https://social-media.aiagentixdev.com/api/webhooks/instagram/<WORKSPACE_ID>`
   **Verify token**: portal me jo dikhe wahi (Settings → Channels). Subscribe: `messages, messaging_postbacks, comments`.
6. Client IG account **Professional (Business/Creator) + Public** ho.
7. Standard Access pe: client IG ko **App roles → Instagram testers** me add karo → IG app me **Tester Invites → Accept**.

**Portal side:**
8. Settings → Channels → Instagram → apna **App ID (Instagram App ID) + Secret** save karo.
9. **Connect with Instagram** → Allow. (Token + subscribe automatic.)

---

## Har client ke liye (dono models me) — AI setup

1. **Persona/prompt** daalo: Knowledge Base → AI settings → persona.
2. **KB file upload** karo (PDF/DOCX/MD/CSV) → auto chunk + embed. (Prod me valid `OPENAI_API_KEY` hona chahiye.)
3. **Settings** (defaults):
   - `auto_reply` = ON
   - `follow_gate` = OFF (ya ON, par ON pe customer ko "I've Followed" tap karna padega — real auto-detect ke liye Advanced Access chahiye)
   - `follow_gate_strict` = OFF (Advanced Access ke bina strict = koi pass nahi karta)
   - `ai_model` = `gpt-4o` (sales/complex persona) ya default `gpt-4o-mini` (simple)
4. **Test**: doosre account se DM → reply aana chahiye.

---

## Env (prod / Coolify) — ye set hone chahiye

| Var | Value |
|-----|-------|
| `NEXT_PUBLIC_APP_URL` | `https://social-media.aiagentixdev.com` |
| `OPENAI_API_KEY` | valid OpenAI key (gpt-4o + embeddings dono chahiye) |
| `OPENROUTER_API_KEY` | **set mat karo** (ya valid `sk-or-...` key). OpenAI key yahan mat daalo. |
| `DATABASE_URL`, `SUPABASE_*`, `ENCRYPTION_KEY`, `CRON_SECRET` | standard |

---

## Common problems → 1-line fixes

| Problem | Reason | Fix |
|---------|--------|-----|
| Connect ke baad "0.0.0.0" error | `NEXT_PUBLIC_APP_URL` missing | env set karo (ab code header se bhi handle karta hai) |
| Token "Unsupported request" | IG account tester nahi / not accepted | Instagram Tester add + accept invite |
| DM aata hai par reply nahi | AI chat fail (OpenRouter dead) ya KB embed 0 | `OPENROUTER_API_KEY` hatao; KB re-upload |
| Reply "please follow" pe atak jaata | follow_gate ON + customer ne button tap nahi kiya | gate OFF karo ya customer "I've Followed" tap kare |
| KB grounding kaam nahi | embeddings 0 (key issue at ingest) | valid OpenAI key set karke KB re-upload |
| Follow karne par bhi gate nahi khulti | Advanced Access nahi (API follow detect nahi karta) | App Review → Advanced Access, ya lenient gate (button) |

---

## Sabse aasaan future (recommended roadmap)
1. **Central app ka App Review** karwa lo (Advanced Access) — phir har client = "Connect + persona/KB".
2. Portal me **health/status page** (connection ✓ / webhook ✓ / KB embedded ✓ / AI ✓) — ek nazar me pata.
3. New workspace pe **sensible defaults** auto-set (auto_reply on, gate off, model).
