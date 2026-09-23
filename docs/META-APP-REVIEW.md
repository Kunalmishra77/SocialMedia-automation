# Meta App Review — Advanced Access submission (ready to paste)

Goal: get **Advanced Access** on the Instagram permissions so ANY client's Instagram
account can connect without being added as a tester. One-time. After approval, every
new client = "Connect with Instagram" + persona/KB. No more tester dance.

Copy each block below into the matching field in Meta:
**App → App Review → Permissions and Features → Request Advanced Access → (per permission).**

---

## 0. Before you submit (checklist)

- [ ] App is set to **Live** (top toggle).
- [ ] **Business Verification** complete (App Review → Business Verification, or Security Center). Upload company docs (registration / GST). Takes 2–5 days — start this FIRST.
- [ ] **Privacy Policy URL** set: `https://social-media.aiagentixdev.com/privacy`
- [ ] **Business login settings** filled:
  - OAuth redirect URI: `https://social-media.aiagentixdev.com/api/integrations/instagram/callback`
  - Deauthorize callback URL: `https://social-media.aiagentixdev.com/api/instagram/deauthorize`
  - Data deletion request URL: `https://social-media.aiagentixdev.com/api/instagram/data-deletion`
- [ ] A **test login for the reviewer**: create a demo workspace + app login (email + password) and a test Instagram professional account already connected, so the reviewer can log in and see it working. Put these in the "Instructions" field (Meta lets you provide test credentials).
- [ ] A **screencast video** per permission (screen recording showing the flow). 30–90 sec each. This is the #1 thing reviewers check.

---

## ⚠️ Why the earlier submission was REJECTED (fix this)

The previous Skinwise submission pasted the SAME "We read comments…" text into
almost every permission (messages, content_publish, insights). Meta requires each
permission's description to match THAT permission's actual use. Using the wrong
description = automatic rejection. Use the exact per-permission text below — each
one is different. Only request permissions the app actually uses.

---

## 1. App overview (use in the "How your app uses..." intro)

AI-Agentix SocialFlow is a business messaging and content-management platform for small
and medium businesses. A business owner connects their OWN Instagram professional
(Business/Creator) account and uses our tools to:

- Automatically reply to customer DMs and comments using an AI assistant that is
  configured by the business (a persona + a knowledge base of the business's own info).
- Manage their inbox (a shared team inbox with human takeover).
- Create, approve and schedule content that is published to their own account.

Every action happens on the business's own connected account, with the account owner's
explicit consent (Instagram Business Login OAuth), and only to serve that business's own
customers. We never post to or message from accounts that have not authorized the app.

---

## 2. instagram_business_basic

**How your app uses this permission:**
We use instagram_business_basic to read the connected professional account's basic
profile — its id, username, name and profile picture — at the moment the business owner
connects their account. We display this in the dashboard so the owner can confirm which
account is connected, and we use the account id to route that account's webhooks and
API calls. It is not used for any other purpose.

**Step-by-step for the reviewer:**
1. Log in to the app at https://social-media.aiagentixdev.com/login using the test
   credentials provided in the Instructions field.
2. Go to Settings → Channels → Instagram → "Connect with Instagram".
3. Authorize with the test Instagram professional account.
4. After authorizing, the dashboard shows the connected account's username, name and
   profile picture — this data was fetched using instagram_business_basic.

---

## 3. instagram_business_manage_messages

**How your app uses this permission:**
This is the core of our product. With the business owner's consent, we receive their
account's inbound Instagram DMs via webhooks and send replies on their behalf. The
business configures an AI persona and a knowledge base; when one of their customers
sends a DM, our app generates a helpful, on-brand reply grounded in that business's own
information and sends it back. The business can also take over any conversation manually
from the inbox. We only send messages within Instagram's messaging policy and only for
accounts that have authorized the app.

**Step-by-step for the reviewer:**
1. Log in and connect the test account (steps in section 2).
2. From a SECOND Instagram account, send a direct message (e.g. "What services do you
   offer?") to the connected test account.
3. Within a few seconds, the connected account replies automatically with a relevant,
   AI-generated message.
4. In the app, open Conversations/Inbox to see the full conversation, including the
   inbound message and the reply we sent. A human can also reply manually here.

---

## 4. instagram_business_manage_comments

**How your app uses this permission:**
With the business owner's consent, we read comments left on their posts and respond to
them — a short public reply and, where appropriate, a private reply (DM) that moves the
conversation into the inbox so the business can help the customer. This lets businesses
respond to interested commenters quickly. We only act on the connected account's own
media.

**Step-by-step for the reviewer:**
1. Log in and connect the test account (section 2).
2. From a SECOND Instagram account, leave a comment on one of the connected test
   account's posts.
3. The app automatically posts a short public reply to that comment and/or sends the
   commenter a private reply (DM).
4. The interaction is visible in the app's inbox/comments view.

---

## 5. instagram_business_content_publish

**How your app uses this permission:**
Businesses create content inside our app (with optional AI assistance), review and
approve it, and schedule it. At the scheduled time we publish the approved image or reel
to their own connected Instagram account. Publishing only ever happens for content the
business created and approved, to their own account.

**Step-by-step for the reviewer:**
1. Log in and connect the test account (section 2).
2. Go to Content → create a post, attach an image and a caption.
3. Either schedule it or use "Publish now".
4. The post appears on the connected test Instagram account's profile.

---

## 5b. instagram_business_manage_insights (ONLY request if you actually show IG insights)

Our app does not currently read Instagram Insights — it computes its own message/
reply counts internally. **Recommendation: do NOT request this permission** (remove
it from the submission), or Meta may reject for requesting an unused permission.

If you DO add analytics later, the honest description would be:
"With the business owner's consent we read insights for their own professional
account (reach, engagement, message/reply counts) and display them in the
business's analytics dashboard so they can measure their automation's performance.
Only the connected account's own insights are accessed."

---

## 5c. Human Agent (keep — the app has a human inbox)

**How your app uses this feature:**
Our app is a shared team inbox. In addition to AI replies, a human agent from the
business can take over any conversation and reply to the customer. When a reply is
sent by a human more than 24 hours after the customer's last message (for example
the business was closed), we send it using the human_agent tag, within the 7-day
window, so the business can still help the customer. This is used only for the
business's own conversations, by the business's own team.

**Step-by-step for the reviewer:**
1. Log in and connect the test account (section 2).
2. From a second account, DM the connected account.
3. In the app's Inbox, open the conversation and send a reply as a human agent
   (pause the bot / take over). The reply is delivered to the customer on Instagram.

---

## 6. Screencast tips (per permission)

- Record your screen while doing the exact reviewer steps above.
- Show the app login → connect → the action (send a DM to it, comment, publish).
- Show the RESULT on Instagram (the reply arriving, the comment reply, the published post).
- Keep each video focused on one permission. No editing needed — a clean single take is best.
- Reviewers reject vague/generic videos. Show real value: a customer asks something → the
  business's bot answers correctly.

---

## 7. After approval

Once Advanced Access is granted:
- Any client's Instagram account connects via "Connect with Instagram" with NO tester step.
- Standardise all clients on this one app (central model) — see docs/CLIENT-ONBOARDING.md.
- Onboarding becomes: create workspace → client clicks Connect → you add persona + KB.
