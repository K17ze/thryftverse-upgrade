# 31 — Email & Transactional Communications

> **Department:** Email Infrastructure, Transactional Communications & Multi-Channel Notification Strategy
> **Benchmark date:** 2026-08-18
> **Scope:** Transactional emails (order confirmations, shipping updates, payment receipts, magic links, OTP), email template systems, SMS/OTP for auth, push vs email vs SMS channel strategy, email preference centers, unsubscribe/list-unsubscribe management, email deliverability (SPF/DKIM/DMARC), open/click tracking, re-engagement email campaigns, dark mode email design, responsive email, AMP email, multi-channel orchestration.
> **Charter references:** AGENTS.md §2 (deep system research, layer diagnosis), §4 (anti-AI-made design — "truthful UI", "stateless UI"), §6 (truthful UI — no fabricated success), §14 (state completeness); Design.md "Notifications & Inbox", "Settings & Account".
> **Primary benchmarks:** eBay (order/shipping transactional emails, buyer protection comms), Instagram (security alert emails, re-engagement), Stripe (payment receipts, dashboard summaries), Pinterest (taste-based re-engagement emails), Resend (modern email API provider). Secondary: Depop, Vinted (marketplace transactional patterns).

---

## 1. 2026 Competitor Benchmark

Transactional emails are the most-read customer touchpoint — open rates of 40-50%, 8× higher than marketing campaigns ([Mailsoftly — Transactional Email Guide 2026](https://mailsoftly.com/blog/transactional-email-guide/)). Every order confirmation, shipping update, password reset, and verification code is a high-attention moment that most apps waste with generic templates. The 2026 consensus: fast delivery (under 10 seconds for time-critical), mobile-first design, clear subject lines, dedicated sending infrastructure, and per-category preference centers.

### The 2026 email/transactional comms stack

| Layer | 2026 industry standard | Tooling |
|---|---|---|
| Email provider | Dedicated API provider (Resend, SendGrid, Postmark, SES) with subdomain isolation for transactional vs marketing | Resend, SendGrid, Postmark, AWS SES |
| Deliverability | SPF + DKIM + DMARC on dedicated subdomain; separate IP reputation for transactional vs marketing; Gmail/Yahoo 2024 bulk sender rules compliance | DNS records + provider config |
| Transactional templates | Mobile-first (single-column, 600px max, 44px buttons, 14px+ font); dark mode support; plain-text fallback; AMP email for interactivity | MJML, React Email, custom HTML |
| Template system | Component-based templates (not inline HTML strings); reusable layouts (header, footer, button, order-summary); versioned and testable | React Email, MJML, Handlebars |
| SMS/OTP | SMS for auth verification (OTP codes); dedicated SMS provider (Twilio, MessageBird); rate-limited; fallback to email if SMS fails | Twilio, MessageBird |
| Channel strategy | Push (real-time, in-app) → Email (durable, searchable) → SMS (urgent, auth-only); user controls which channels for which categories | Multi-channel orchestration |
| Preference center | Per-category toggles (security, orders, messages, price drops, marketing); essential categories locked (can't disable security alerts); grouped by domain (Essential, Shopping, Marketing) | In-app + web preference center |
| Unsubscribe | One-click unsubscribe (List-Unsubscribe header); preference center instead of all-or-nothing unsubscribe; CAN-SPAM and GDPR consent management | List-Unsubscribe header + preference center |
| Open/click tracking | Pixel-based open tracking; UTM-tagged links for click tracking; per-template and per-category analytics | Provider analytics + custom tracking |
| Re-engagement emails | Tiered: 7-day (soft nudge), 30-day (content highlight), 60-day (incentive), 90-day (last chance); personalized content; honored unsubscribe | Segmented email pipeline |
| Dark mode | `prefers-color-scheme: dark` media query; inverted colors for dark mode; tested on iOS Mail, Gmail dark mode, Outlook dark mode | CSS media queries + testing |
| Responsive | Single-column, fluid/hybrid layout; tested on iOS Mail, Gmail, Outlook, Apple Mail; 44px touch targets; 14px+ font | Hybrid responsive design |
| AMP email | Interactive emails (form submission, carousel, accordion) for Gmail/Yahoo Mail; graceful degradation for non-AMP clients | AMP for Email |
| Delivery speed | Under 10 seconds for time-critical (password reset, OTP, verification); under 30 seconds for order confirmations | Dedicated transactional pipeline |

Sources: [Mailsoftly — Transactional Email Guide 2026](https://mailsoftly.com/blog/transactional-email-guide/); [MyMail.page — Email Templates for RCS & iOS 2026](https://mymail.page/checklist-preparing-email-templates-for-new-mobile-messaging); [Merge.email — Responsive Email Design 2026](https://merge.email/blog/responsive-email-design); [DeBounce — Transactional Email Deliverability](https://debounce.com/blog/how-to-improve-transactional-email-deliverability/); [Sweego — What Is Transactional Email](https://www.sweego.io/channel/email/what-is-transactional-email).

### eBay — transactional email benchmark

eBay's transactional emails are the marketplace benchmark: order confirmations with item photo + order number + tracking link; shipping updates with carrier + tracking number + estimated delivery; buyer protection emails with dispute timeline; seller payout notifications with payout amount + bank account. Every email is mobile-first, branded, and includes a clear primary CTA ("Track package", "View order", "Open dispute"). Subject lines are specific: "Your order #4829 has shipped" not "Update on your order."

### Stripe — payment receipt benchmark

Stripe's payment receipts are the fintech benchmark: clean, minimal design with amount, date, merchant, and card last-4; downloadable PDF receipt; clear "View in dashboard" CTA. Stripe's emails are the opposite of AI-slop — no decorative chrome, no verbose copy, just the information the user needs.

### Pinterest — re-engagement email benchmark

Pinterest's re-engagement emails are the taste-based benchmark: "Ideas for you" emails with personalized pin recommendations based on the user's taste profile. The emails are visual-first (pin images as the primary content), not text-first. The subject line is personalized ("New ideas for your 'Minimalist Home' board"), not generic ("We miss you!"). This is the re-engagement pattern for a visual marketplace — show the user content they'll actually want to see.

### Converging principles

1. **Transactional emails are 8× more opened than marketing.** Every transactional email is a high-attention moment. Wasting it with a generic template is a missed trust-building opportunity ([Mailsoftly 2026](https://mailsoftly.com/blog/transactional-email-guide/)).
2. **Subject lines must be specific.** "Your order #4829 has shipped" outperforms "Update on your order" every time. Include the action, the reference number, and enough context to identify the email without opening it.
3. **Delivery speed matters.** A password reset link that arrives 45 seconds later is usable. One that arrives 5 minutes later finds the user already calling support. Under 10 seconds for time-critical, under 30 seconds for order confirmations ([Mailsoftly 2026](https://mailsoftly.com/blog/transactional-email-guide/)).
4. **Dedicated infrastructure for transactional vs marketing.** Marketing email reputation bleed can damage transactional deliverability. Use a dedicated subdomain (e.g., `notifications.thryftverse.com` for transactional, `marketing.thryftverse.com` for campaigns) with separate SPF/DKIM/DMARC records ([DeBounce — Deliverability](https://debounce.com/blog/how-to-improve-transactional-email-deliverability/)).
5. **Mobile-first design is non-negotiable.** 60%+ of transactional emails are opened on mobile. Single-column, 600px max, 44px buttons, 14px+ font. Test on iOS Mail, Gmail, Outlook ([Merge.email — Responsive Email 2026](https://merge.email/blog/responsive-email-design)).
6. **Preference center, not all-or-nothing unsubscribe.** Users should control which categories of emails they receive, not just unsubscribe from all. A user who wants order updates but not marketing should be able to make that choice. One-click unsubscribe (List-Unsubscribe header) for compliance, preference center for granularity.
7. **Multi-channel orchestration.** Push for real-time in-app events, email for durable searchable records, SMS for urgent auth-only. The user controls which channels for which categories. A "Your order has shipped" notification should go via push (real-time) AND email (durable record), with the user able to disable either.

---

## 2. Psychology & Principles

### Email as the out-of-app touchpoint

Email is the only touchpoint that reaches the user when they're not in the app. Push notifications require the app to be installed and notifications to be enabled. Email reaches the user wherever they are — on their phone, their laptop, their work computer. For a marketplace with no daily-use habit, email is the primary re-engagement channel for dormant users. A user who uninstalled the app still has their email — a re-engagement email can bring them back.

### Transactional vs marketing email distinction

CAN-SPAM and GDPR treat transactional and marketing emails differently ([Mailsoftly 2026](https://mailsoftly.com/blog/transactional-email-guide/)). Transactional emails (order confirmations, password resets, security alerts) don't require opt-in — they're triggered by the user's action and contain information the user needs. Marketing emails (promotions, newsletters, re-engagement campaigns) require opt-in consent and must include an unsubscribe mechanism. Blurring the line — adding promotional content to a transactional email — risks compliance violations and deliverability damage.

### The inbox attention competition

The user's inbox is a competition for attention. A transactional email competes with dozens of other emails for the user's attention. The subject line is the first competition — if it's not clear and specific, the email is ignored or deleted. The preview text is the second competition — the first 90 characters visible in the inbox preview. The from-name is the third — "Thryftverse" is recognizable; "noreply@notifications.thryftverse.com" is not. Every element must earn the open.

### Timing and frequency

Transactional emails are triggered by user actions, so timing is inherent. But re-engagement emails require timing strategy: too early and the user feels spammed; too late and the user has already churned. The 2026 consensus: 7-day re-engagement (soft nudge), 30-day (content highlight), 60-day (incentive), 90-day (last chance). Frequency caps: max 1 re-engagement email per week per user.

### The unsubscribe as a signal, not a failure

An unsubscribe is not a failure — it's a signal. A user who unsubscribes from marketing emails but keeps transactional emails is telling the platform: "I want my order updates but not your promotions." This is valuable signal. The preference center captures this signal and acts on it. A user who unsubscribes from all emails is telling the platform: "I don't want email contact." This is also valuable signal — the platform should shift to push-only for this user (if push is enabled) or accept that this user is unreachable out-of-app.

### SMS urgency hierarchy

SMS is the most urgent channel — it triggers a notification that the user almost certainly sees immediately. This makes it ideal for auth (OTP codes, verification) but dangerous for anything else. SMS for marketing is illegal in many jurisdictions without explicit opt-in. SMS for transactional alerts (shipping, order) is acceptable but expensive and should be opt-in. The hierarchy: SMS for auth only; push for real-time; email for durable; SMS for transactional only if the user opts in and push is unavailable.

---

## 3. Architectural Issues & Engineering Flaws

Email/transactional comms debt blocks production in concrete ways:

### No transactional emails = buyer anxiety

A buyer who makes a purchase and receives no order confirmation email experiences anxiety — "Did my order go through? Was I charged? When will it ship?" This anxiety triggers a support ticket, which costs the platform money and erodes trust. An order confirmation email sent within 30 seconds eliminates this anxiety. Without transactional emails, every purchase generates a support ticket that could have been prevented.

### No OTP = weak auth

Without email OTP or SMS OTP, the auth system relies on magic links (which require email) or passwords (which are vulnerable to credential stuffing). OTP via email is the minimum viable auth security; OTP via SMS is stronger (but SIM-swap vulnerable); Passkeys are strongest (per Report #28). ThryftVerse has email OTP (`buildOtpEmail` in `index.ts:12119`) — good, but no SMS OTP fallback.

### Poor deliverability = emails in spam

Without SPF, DKIM, and DMARC on a dedicated subdomain, transactional emails land in spam. Gmail and Yahoo's 2024 bulk sender rules require authentication for any sender pushing 5,000+ emails per day ([DeBounce — Deliverability](https://debounce.com/blog/how-to-improve-transactional-email-deliverability/)). A magic link in spam is a failed login. An order confirmation in spam is a support ticket. Deliverability is not optional — it's the prerequisite for email to function at all.

### No preferences = unsubscribes

Without a per-category preference center, the user's only option is to unsubscribe from all emails. A user who wants order updates but is annoyed by marketing emails unsubscribes from all — losing the order-update channel. A preference center preserves the high-value email channel by letting users opt out of low-value categories.

### No re-engagement = dormant user churn

Without re-engagement emails, dormant users stay dormant. A user who hasn't opened the app in 30 days has a <5% probability of returning organically. Re-engagement emails can recover 5-15% of dormant users. Without them, these users are permanently lost.

### Legal requirements (CAN-SPAM, GDPR)

CAN-SPAM requires: accurate from-name, clear subject, physical address, unsubscribe mechanism, unsubscribe honoring within 10 business days. GDPR requires: lawful basis for marketing emails (consent), right to withdraw consent, right to erasure (delete email from all lists). Non-compliance risks fines and deliverability damage.

---

## 4. AI Slop Diagnosis

AI-generated email systems have predictable failure modes:

### Inline HTML strings, not template systems

AI models generate email content as inline HTML strings in the route handler — `html: \`<div>...</div>\`` — instead of a template system. This makes templates untestable, unversioned, and unmaintainable. ThryftVerse has this pattern: `buildMagicLinkEmail` (`index.ts:12104-12117`) and `buildOtpEmail` (`index.ts:12119-12132`) are inline HTML string functions. A senior engineer would use a template system (React Email, MJML, Handlebars) with reusable components.

### No responsive design

AI models generate desktop-first HTML (`<div style="font-family: Inter, Arial, sans-serif;">`) with no media queries, no mobile-first layout, no 44px buttons. On mobile (60%+ of opens), the email is tiny and un-tappable. ThryftVerse's magic link email (`index.ts:12112`) has a button with `padding:10px 16px` — 20px tall, well below the 44px touch target standard.

### No dark mode support

AI models generate light-mode-only HTML with hardcoded colors (`color: #171717`, `background: #111`). In dark mode, these emails render with a white background and dark text — a jarring flash in the dark mode inbox. Dark mode support requires `prefers-color-scheme` media queries and inverted color tokens.

### No plain-text fallback

AI models generate HTML-only emails with no `text` alternative. Some email clients and accessibility tools require plain-text. ThryftVerse's `buildMagicLinkEmail` includes a `text` field (line 12107) — good, this is not the AI-slop pattern. But the plain text is minimal ("Use this secure login link...") and doesn't include the full context of the HTML version.

### Hardcoded SMTP with no retry

AI models generate a `fetch()` call to the email API with no retry logic. If the API returns a 5xx or the network times out, the email is silently lost. ThryftVerse's `sendAuthEmail` (`authEmail.ts:28-42`) has an 8-second timeout (`AbortSignal.timeout(8000)`) but no retry — a transient failure silently loses the email.

### No template testing

AI models generate email templates that are never tested in real email clients. The template looks fine in a browser preview but breaks in Outlook (which doesn't support modern CSS), Gmail (which strips some styles), or dark mode. A senior engineer uses an email testing service (Litmus, Email on Acid) to test across clients.

### No preference center

AI models generate an "emailNotificationsEnabled" boolean toggle — all-or-nothing. A senior engineer builds a per-category preference center with grouped toggles and locked essential categories. ThryftVerse has the per-category preference center (`EmailNotificationsScreen.tsx` with 9 categories in 4 groups) — this is well-built, not AI-slop.

---

## 5. Current ThryftVerse Audit (file:line defects)

### Email provider — `backend/api/src/lib/authEmail.ts` + `config.ts`

**Strengths:**
- `authEmail.ts:20-72` — `sendAuthEmail` function with Resend provider integration — modern API-based email provider
- `authEmail.ts:28-42` — `fetch('https://api.resend.com/emails', ...)` with `Authorization: Bearer`, `Content-Type: application/json` — correct API usage
- `authEmail.ts:30` — `AbortSignal.timeout(8000)` — 8-second timeout (good for time-critical emails)
- `authEmail.ts:16-18` — `normalizeEmail` (trim + lowercase) — email normalization
- `authEmail.ts:44-47` — error handling with response status and body — not silently swallowed
- `authEmail.ts:60-61` — production validation: throws if provider not configured in production — prevents silent email failures
- `config.ts:214-219` — `authEmailProvider`, `authEmailFrom`, `resendApiKey` — dedicated config for email
- `config.ts:477-488` — production validation: Resend requires API key + verified from-address — prevents misconfigured production

**Defects:**
| Line (file) | Defect |
|---|---|
| `authEmail.ts:28-42` | No retry/backoff — a single 5xx or timeout silently loses the email. Time-critical emails (OTP, magic link) need retry. |
| `authEmail.ts:20` | Only handles `resend` provider — no fallback to a second provider if Resend is down. |
| `config.ts:214-216` | `authEmailProvider` defaults to `'log'` in non-production — emails are logged to console, not sent. This is correct for development but must be explicitly switched to `resend` in production. |
| Missing | No subdomain isolation — `authEmailFrom` is a single address, not a dedicated subdomain (`notifications.thryftverse.com` vs `marketing.thryftverse.com`). Marketing and transactional emails share the same reputation. |
| Missing | No SPF/DKIM/DMARC configuration visible in the codebase — these are DNS records, not code, but their configuration should be documented. |

### Email templates — `backend/api/src/index.ts`

**Strengths:**
- `index.ts:12104-12117` — `buildMagicLinkEmail` with subject, text, and HTML — complete email
- `index.ts:12119-12132` — `buildOtpEmail` with large OTP code display (`font-size: 30px; letter-spacing: 6px`) — readable OTP
- `index.ts:12106-12107` — subject lines are specific: "Your Thryftverse login link", "Your Thryftverse verification code" — not generic
- `index.ts:12113` — expiry time communicated: "This link expires in X minutes" — urgency + clarity
- `index.ts:13187-13200` — error handling on email send failure: logs error, returns 502, user-facing error message

**Defects:**
| Line (file) | Defect |
|---|---|
| `index.ts:12104-12132` | Inline HTML string templates — not a template system. No reusable components (header, footer, button), no versioning, no testing across email clients. |
| `index.ts:12112` | Button: `padding:10px 16px` — ~20px tall, well below the 44px touch target standard for mobile. |
| `index.ts:12108-12115` | No responsive design — no media queries, no mobile-first layout, no 600px max-width. Desktop-first HTML. |
| `index.ts:12109` | Hardcoded colors: `color: #171717`, `background: #111` — no dark mode support. In dark mode, this email renders with a white background flash. |
| `index.ts:12104` | Only 2 email templates exist: magic link and OTP. Missing: order confirmation, shipping update, payment receipt, password reset, welcome, re-engagement, price drop, new listing from followed seller. |
| Missing | No email testing across clients (Outlook, Gmail, iOS Mail, dark mode) — templates are untested. |
| Missing | No open/click tracking — no analytics on email performance. |
| Missing | No List-Unsubscribe header — required for marketing emails (CAN-SPAM, Gmail/Yahoo 2024 bulk sender rules). |

### Email preferences — `frontend/src/screens/EmailNotificationsScreen.tsx`

**Strengths (genuinely well-built):**
- `EmailNotificationsScreen.tsx:54-139` — 9 email categories in 4 groups (Essential, Shopping, Co-Own, Marketing) — granular preference center
- `EmailNotificationsScreen.tsx:60-67` — `securityAlerts` with `locked: true` — essential category can't be disabled (correct — security alerts must always be on)
- `EmailNotificationsScreen.tsx:69-83` — `orderUpdates`, `messageNotifications` in Essential group — correct grouping
- `EmailNotificationsScreen.tsx:91-105` — `priceDropAlerts`, `newListingsFromFollowing` in Shopping group — correct grouping
- `EmailNotificationsScreen.tsx:113-127` — `distributionNotices`, `corporateActionNotices` in Co-Own group — marketplace-specific categories
- `EmailNotificationsScreen.tsx:135-139` — `marketing` in Marketing group with `defaultEnabled: false` — marketing off by default (correct — GDPR consent required)
- `EmailNotificationsScreen.tsx:29-33` — `fetchEmailPreferences`, `updateEmailPreferences` — real backend API integration
- `EmailNotificationsScreen.tsx:1-11` — grouped sections with colored icon badges — Pinterest/Instagram-quality information hierarchy

**Defects:**
| Line (file) | Defect |
|---|---|
| `settingsPreferences.ts:28` | `emailNotificationsEnabled: boolean` — a global toggle in addition to the per-category preferences. This is redundant with the per-category system and could conflict (global off but per-category on). |
| Missing | No "unsubscribe from all" one-click option — the preference center has per-category toggles but no global unsubscribe. CAN-SPAM requires a clear unsubscribe mechanism. |
| Missing | No List-Unsubscribe header in sent emails — the preference center exists in-app but the email itself doesn't have a one-click unsubscribe link. |

### Email usage in the codebase

| Email type | Status | Notes |
|---|---|---|
| Magic link (auth) | **Exists** | `buildMagicLinkEmail` + `sendAuthEmail` at `index.ts:13187` |
| OTP (auth) | **Exists** | `buildOtpEmail` at `index.ts:12119` |
| Order confirmation | **Missing** | No order confirmation email template or send logic |
| Shipping update | **Missing** | No shipping notification email |
| Payment receipt | **Missing** | No payment receipt email |
| Password reset | **Missing** | No password reset email (magic link serves this role?) |
| Welcome email | **Missing** | No welcome email after signup |
| Re-engagement | **Missing** | No re-engagement email pipeline |
| Price drop alert | **Missing** | No price drop email (push preference exists but no email) |
| New listing from followed seller | **Missing** | No new listing email |
| Security alert (new device login) | **Missing** | No security alert email (push preference exists but no email) |
| Payout notification | **Missing** | No seller payout email |
| Dispute resolution | **Missing** | No dispute resolution email |
| GDPR data export ready | **Partial** | `gdpr.export.completed` event exists (`index.ts:18346`) but no email notification on completion |

### SMS/OTP

| Item | Status | Notes |
|---|---|---|
| SMS OTP | **Missing** | No SMS provider integration (Twilio, MessageBird). Email OTP only. |
| SMS for auth | **Missing** | No SMS-based verification |
| SMS for transactional alerts | **Missing** | No SMS for shipping/order updates |

### Multi-channel orchestration

| Item | Status | Notes |
|---|---|---|
| Push + email for same event | **Missing** | Push and email are separate pipelines; no orchestration to send both for the same event |
| Channel preference per category | **Partial** | Push preferences (`PUSH_NOTIFICATION_DEFINITIONS`) and email preferences (`EmailNotificationsScreen`) exist separately but are not unified into a single "notification preferences" surface |
| Fallback from push to email | **Missing** | When push delivery fails (per Report #27), no fallback to email |

---

## 6. Micro Improvements (file-and-line-level)

### M1 — Add retry/backoff to `sendAuthEmail`

In `authEmail.ts:28-42`, wrap the `fetch` in a retry loop:
```ts
async function sendWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) return response;
      await sleep(Math.min(1000 * 2**attempt, 8000) + Math.random() * 500);
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
      await sleep(Math.min(1000 * 2**attempt, 8000));
    }
  }
}
```

### M2 — Adopt a template system (React Email or MJML)

Replace inline HTML strings (`buildMagicLinkEmail`, `buildOtpEmail`) with a template system:
- **React Email:** Component-based, reusable, testable, renders to HTML + plain text
- **MJML:** Markup language that compiles to responsive HTML

Create reusable components: `EmailHeader`, `EmailFooter`, `EmailButton`, `EmailOrderSummary`, `EmailDivider`. Each transactional email is a composition of these components.

### M3 — Add responsive design to email templates

In every email template:
- Single-column layout, max-width 600px
- `@media (max-width: 600px)` media queries for mobile
- 44px tall buttons with generous padding
- 14px+ font sizes
- Test on iOS Mail, Gmail, Outlook, Apple Mail

### M4 — Add dark mode support

In every email template:
```html
<style>
  @media (prefers-color-scheme: dark) {
    .email-body { background: #1a1a1a !important; color: #f5f5f5 !important; }
    .email-button { background: #f5f5f5 !important; color: #1a1a1a !important; }
  }
</style>
```

### M5 — Add order confirmation email

Create an order confirmation email template sent within 30 seconds of purchase:
- Subject: "Order confirmed: [Item name] (#[Order number])"
- Content: item photo, item name, order number, price, seller name, shipping address, estimated delivery, "Track order" CTA
- Sent via `sendAuthEmail` (or a renamed `sendTransactionalEmail`)

### M6 — Add shipping update email

Create a shipping update email template sent when the seller marks the order as shipped:
- Subject: "Your order #[Order number] has shipped"
- Content: item photo, carrier, tracking number, tracking link, estimated delivery, "Track package" CTA

### M7 — Add payment receipt email

Create a payment receipt email template sent after successful payment:
- Subject: "Receipt for your Thryftverse order #[Order number]"
- Content: item name, order number, amount, payment method (card last-4), date, "View receipt" CTA, downloadable PDF

### M8 — Add welcome email

Create a welcome email sent after signup:
- Subject: "Welcome to Thryftverse, [Username]!"
- Content: welcome message, "Complete your profile" CTA, first-purchase incentive (10% off), style quiz prompt, "How Thryftverse works" brief

### M9 — Add re-engagement email pipeline

Build a tiered re-engagement email pipeline:
- **7-day inactive:** "New listings from sellers you follow" (content highlight)
- **30-day inactive:** "Your taste profile has X new matches" (personalization)
- **60-day inactive:** "Come back for £10 off your next purchase" (incentive)
- **90-day inactive:** "We've changed. Here's what's new." (last chance)

Each email is personalized, includes a clear CTA, and honors unsubscribe preferences.

### M10 — Add List-Unsubscribe header

In every email sent via `sendAuthEmail`, add the `List-Unsubscribe` and `List-Unsubscribe-Post` headers:
```ts
headers: {
  'List-Unsubscribe': '<mailto:unsubscribe@thryftverse.com?subject=unsubscribe>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
}
```
This is required for Gmail/Yahoo 2024 bulk sender compliance.

### M11 — Add SMS OTP via Twilio

Integrate Twilio (or MessageBird) for SMS OTP:
```ts
async function sendSmsOtp(phone: string, code: string): Promise<void> {
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}` },
    body: new URLSearchParams({ To: phone, From: TWILIO_NUMBER, Body: `Your Thryftverse code: ${code}` }),
  });
}
```
Offer SMS OTP as a fallback when email OTP is not available or the user prefers SMS.

### M12 — Add open/click tracking

Use Resend's built-in analytics or add UTM-tagged links to every email CTA:
```
https://thryftverse.app/order/123?utm_source=email&utm_medium=transactional&utm_campaign=order_confirmation
```
Track opens via a 1x1 tracking pixel. Dashboard: open rate, click rate, delivery rate per template.

### M13 — Add subdomain isolation

Configure dedicated subdomains:
- `notifications.thryftverse.com` — transactional emails (order confirmations, OTP, security alerts)
- `marketing.thryftverse.com` — marketing emails (re-engagement, promotions)

Each subdomain has its own SPF, DKIM, and DMARC records, building separate IP reputation.

### M14 — Unify notification preferences

Merge push preferences (`PUSH_NOTIFICATION_DEFINITIONS`) and email preferences (`EmailNotificationsScreen` categories) into a unified "Notification Preferences" screen where the user sees each category with both push and email toggles side by side.

---

## 7. Macro Improvements (structural/architectural)

### A1 — Multi-channel notification orchestration

The root architectural flaw is that push and email are separate pipelines with no orchestration. A "Your order has shipped" event should trigger both a push notification (real-time) and an email (durable record), with the user able to disable either channel per category. The architecture:
1. **Notification event** (from `notificationEventRegistry`) →
2. **Channel router** (checks user preferences for push + email + SMS per category) →
3. **Push pipeline** (Expo Push API, per Report #27) →
4. **Email pipeline** (Resend, with template system) →
5. **SMS pipeline** (Twilio, for urgent auth only) →
6. **Fallback** (push fails → email; email fails → in-app notification on next open)

### A2 — Template system as a product surface

Email templates are a product surface, not an engineering afterthought. The architecture:
1. **React Email** (or MJML) for component-based templates
2. **Reusable components:** `EmailHeader`, `EmailFooter`, `EmailButton`, `EmailOrderSummary`, `EmailItemCard`, `EmailDivider`
3. **Template versions:** each template is versioned; A/B testing can compare versions
4. **Cross-client testing:** Litmus or Email on Acid for Outlook, Gmail, iOS Mail, dark mode
5. **Analytics:** open rate, click rate, delivery rate per template and per category

### A3 — Email as the dormant user lifeline

For a marketplace with no daily-use habit, email is the primary re-engagement channel for dormant users. A user who uninstalled the app still has their email. The architecture:
1. **Dormancy detection:** user hasn't opened the app in 7/30/60/90 days
2. **Tiered re-engagement:** content → personalization → incentive → last chance
3. **Personalization:** email content is personalized from the user's taste profile (saved items, followed sellers, style quiz)
4. **Win-back offer:** dormant users receive a one-time incentive (£10 credit, free shipping)
5. **Unsubscribe honored:** if the user unsubscribed from marketing, no re-engagement emails are sent

### A4 — Deliverability as infrastructure

Deliverability is not a feature — it's infrastructure. The architecture:
1. **Dedicated subdomains** for transactional vs marketing
2. **SPF + DKIM + DMARC** on each subdomain
3. **DMARC monitoring:** start at `p=none` (monitor), move to `p=quarantine`, then `p=reject`
4. **Bounce handling:** hard bounces → suppress the email; soft bounces → retry
5. **Reputation monitoring:** track delivery rate, bounce rate, complaint rate per subdomain
6. **Gmail/Yahoo compliance:** List-Unsubscribe header, authentication, unsubscribe honoring within 10 business days

### A5 — SMS as the auth-only channel

SMS is too expensive and too intrusive for anything except auth. The architecture:
1. **SMS OTP** for phone verification and 2FA fallback
2. **Rate limiting:** max 3 SMS per hour per phone number
3. **Fallback:** if SMS fails, fall back to email OTP
4. **No marketing SMS:** SMS for marketing is illegal without explicit opt-in in most jurisdictions
5. **No transactional SMS:** unless the user explicitly opts in (shipping alerts via SMS)

---

## 8. Flagship Acceptance Criteria

A flagship email/transactional comms system must achieve:

- **10+ transactional email templates** — order confirmation, shipping update, payment receipt, password reset, magic link, OTP, welcome, security alert, payout notification, dispute resolution
- **Template system** (React Email or MJML) — component-based, reusable, versioned, testable
- **Responsive design** — single-column, 600px max, 44px buttons, 14px+ font; tested on iOS Mail, Gmail, Outlook
- **Dark mode support** — `prefers-color-scheme` media queries; tested in dark mode
- **Plain-text fallback** — every email has a `text` alternative
- **Delivery speed** — under 10 seconds for time-critical (OTP, magic link); under 30 seconds for order confirmations
- **Retry/backoff** — 3 retries with exponential backoff on transient failures
- **Dedicated subdomain** — `notifications.thryftverse.com` for transactional, `marketing.thryftverse.com` for marketing
- **SPF + DKIM + DMARC** — on each subdomain; DMARC at `p=reject` in production
- **List-Unsubscribe header** — one-click unsubscribe in every email
- **Per-category preference center** — 9+ categories in 4+ groups; essential categories locked; marketing off by default
- **SMS OTP** — via Twilio or MessageBird; rate-limited; email fallback
- **Multi-channel orchestration** — push + email for same event; user controls per channel per category
- **Re-engagement pipeline** — tiered 7/30/60/90-day with personalized content
- **Open/click tracking** — per template and per category; dashboarded
- **Welcome email** — sent after signup with first-purchase incentive and style quiz prompt
- **Gmail/Yahoo bulk sender compliance** — authentication, List-Unsubscribe, unsubscribe honoring

### Thumbnail test

A ThryftVerse order confirmation email at 25% scale in the inbox preview must show: a recognizable brand name in the from-line, a specific subject ("Order #4829 confirmed: Vintage Leather Jacket"), and a preview text with the key information ("Your order is confirmed. Estimated delivery: Aug 22-25."). If the subject is generic ("Update on your order"), it is not done.

---

## 9. Priority & Sequencing

| Priority | Item | Why first | Risk | Unblocks |
|---|---|---|---|---|
| P0 | M5 — Order confirmation email | Without it, every purchase generates buyer anxiety + support ticket | Low — new template + send logic | Buyer trust, support ticket reduction |
| P0 | M1 — Retry/backoff on sendAuthEmail | Without retry, transient failures silently lose time-critical emails (OTP, magic link) | Low — wrap existing fetch | Email reliability |
| P0 | M10 — List-Unsubscribe header | Required for Gmail/Yahoo bulk sender compliance; deliverability risk without it | Low — add header | Compliance, deliverability |
| P0 | M13 — Subdomain isolation | Marketing reputation bleed damages transactional deliverability; fix early | Low — DNS config | Deliverability |
| P1 | M2 — Template system (React Email) | Inline HTML strings are unmaintainable; template system is the foundation for all future emails | Medium — migration | Maintainability, testing |
| P1 | M3 — Responsive design | 60%+ of emails opened on mobile; current templates are desktop-first | Low — CSS changes | Mobile email UX |
| P1 | M6 — Shipping update email | Second most important transactional email after order confirmation | Low — new template | Buyer communication |
| P1 | M7 — Payment receipt email | Required for financial records; buyers expect receipts | Low — new template | Financial UX |
| P1 | M8 — Welcome email | First email touchpoint after signup; sets the tone for the relationship | Low — new template | Onboarding retention |
| P1 | A1 — Multi-channel orchestration | Push and email as separate pipelines is the root architectural flaw | High — unified pipeline | Channel strategy |
| P2 | M4 — Dark mode support | Dark mode is the default for many users; light-mode-only emails are jarring | Low — CSS media queries | Email UX |
| P2 | M9 — Re-engagement email pipeline | Recovers 5-15% of dormant users; without it, dormant = permanently lost | Medium — segmentation + personalization | Dormant user recovery |
| P2 | M11 — SMS OTP via Twilio | Email OTP is the only auth fallback; SMS adds a second channel | Medium — Twilio integration | Auth resilience |
| P2 | M12 — Open/click tracking | Email performance data drives optimization | Medium — analytics pipeline | Email optimization |
| P2 | M14 — Unified notification preferences | Separate push and email preferences are confusing; unified is clearer | Medium — UI redesign | UX clarity |
| P3 | A2 — Template system as product surface | Cross-client testing, A/B testing, versioning | High — testing infrastructure | Email quality at scale |
| P3 | A3 — Email as dormant user lifeline | Full re-engagement architecture | High — segmentation + personalization | Dormant user recovery at scale |
| P3 | A4 — Deliverability as infrastructure | DMARC p=reject, bounce handling, reputation monitoring | High — DNS + monitoring | Deliverability at scale |
| P3 | A5 — SMS as auth-only channel | SMS rate limiting, fallback, no marketing SMS | Medium — SMS pipeline | Auth resilience |

---

## 10. Token-level Spec

| Token | Value | Notes |
|---|---|---|
| `email.provider` | Resend (primary), fallback TBD | API-based, modern |
| `email.subdomain.transactional` | `notifications.thryftverse.com` | Dedicated reputation |
| `email.subdomain.marketing` | `marketing.thryftverse.com` | Isolated from transactional |
| `email.auth.spf` | SPF record on each subdomain | Required |
| `email.auth.dkim` | DKIM signing on each subdomain | Required |
| `email.auth.dmarc` | `p=reject` in production | Start `p=none`, monitor, escalate |
| `email.delivery.timeoutMs` | 8000 | 8-second timeout |
| `email.delivery.retry.maxAttempts` | 3 | Exponential backoff with jitter |
| `email.delivery.retry.backoffMs` | `min(1000 * 2^attempt, 8000) + random(0, 500)` | Exponential with jitter |
| `email.delivery.speed.timeCritical` | <10s | OTP, magic link, password reset |
| `email.delivery.speed.transactional` | <30s | Order confirmation, shipping, receipt |
| `email.template.system` | React Email or MJML | Component-based, reusable, testable |
| `email.template.responsive` | Single-column, 600px max, 44px buttons, 14px+ font | Mobile-first |
| `email.template.darkMode` | `prefers-color-scheme` media queries | Tested in dark mode |
| `email.template.plainText` | Every email has `text` alternative | Accessibility + fallback |
| `email.templates.list` | order_confirmation, shipping_update, payment_receipt, password_reset, magic_link, otp, welcome, security_alert, payout_notification, dispute_resolution, reengagement_7d, reengagement_30d, reengagement_60d, reengagement_90d, price_drop, new_listing_followed | 16 templates |
| `email.unsubscribe.listHeader` | `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` | Gmail/Yahoo compliance |
| `email.unsubscribe.honoring` | Within 10 business days | CAN-SPAM requirement |
| `email.preferences.categories` | 9 (securityAlerts, orderUpdates, messageNotifications, priceDropAlerts, newListingsFromFollowing, distributionNotices, corporateActionNotices, marketing, [TBD: reengagement]) | Per-category toggles |
| `email.preferences.locked` | securityAlerts (always on) | Essential category |
| `email.preferences.marketingDefault` | false | GDPR consent required |
| `email.tracking.open` | 1x1 tracking pixel | Open rate per template |
| `email.tracking.click` | UTM-tagged links | Click rate per template |
| `sms.provider` | Twilio or MessageBird | Auth-only |
| `sms.otp.rateLimit` | 3 per hour per phone number | Anti-abuse |
| `sms.otp.fallback` | Email OTP if SMS fails | Resilience |
| `sms.marketing` | Prohibited | Legal compliance |
| `channel.orchestration` | Event → channel router → push + email + SMS (per preferences) | Multi-channel |
| `channel.fallback` | Push fails → email; email fails → in-app on next open | Resilience |
| `reengagement.tiers` | 7d (content), 30d (personalization), 60d (incentive), 90d (last chance) | Tiered pipeline |
| `reengagement.personalization` | Taste profile (saved items, followed sellers, style quiz) | Personalized content |

---

## 11. What "feels AI-made" here, and how to patch it

| AI tell in current state | Patch |
|---|---|
| Inline HTML string templates (`buildMagicLinkEmail`, `buildOtpEmail`) | Template system (React Email or MJML) with reusable components |
| Button padding `10px 16px` (~20px tall, below 44px touch target) | 44px tall buttons with generous padding |
| No responsive design (desktop-first HTML) | Single-column, 600px max, media queries, mobile-first |
| No dark mode support (hardcoded `#171717`, `#111`) | `prefers-color-scheme` media queries with inverted tokens |
| No retry/backoff on `sendAuthEmail` | 3 retries with exponential backoff + jitter |
| Only 2 email templates (magic link, OTP) | 16 templates covering the full transactional + re-engagement lifecycle |
| No subdomain isolation (single from-address) | Dedicated subdomains for transactional vs marketing |
| No List-Unsubscribe header | Add `List-Unsubscribe` + `List-Unsubscribe-Post` headers |
| No open/click tracking | Tracking pixel + UTM-tagged links |
| No SMS OTP | Twilio integration for SMS OTP |
| No multi-channel orchestration | Unified channel router: event → push + email + SMS per preferences |
| No re-engagement emails | Tiered 7/30/60/90-day pipeline with personalized content |
| No order confirmation email | Template + send logic within 30s of purchase |
| No welcome email | Template + send logic after signup |

**What's already well-built (not AI-slop):**
- `authEmail.ts` — Resend integration with production validation, timeout, error handling — solid foundation
- `EmailNotificationsScreen.tsx` — 9-category preference center with 4 groups, locked security alerts, marketing off by default — genuinely senior UX
- `buildOtpEmail` — large OTP code display (30px, 6px letter-spacing) — readable
- `config.ts` — production validation for Resend (requires API key + verified from-address) — prevents misconfigured production
- `sendAuthEmail` — email normalization (trim + lowercase) — correct
- Subject lines are specific ("Your Thryftverse login link", "Your Thryftverse verification code") — not generic
- Expiry time communicated in emails — urgency + clarity

The email foundation exists — Resend integration, preference center, auth emails (magic link + OTP). The defects are gaps (only 2 templates, no order/shipping/receipt emails, no re-engagement, no SMS, no template system, no responsive/dark-mode design, no retry, no subdomain isolation) rather than foundational failures. The path to flagship is adopting a template system, building the 14 missing templates, adding retry/backoff, configuring subdomain isolation + SPF/DKIM/DMARC, and building the multi-channel orchestration layer.

---

*Generated 2026-08-18 by the ThryftVerse flagship research programme. Live 2026 web benchmark + production codebase audit + psychology + micro/macro prescription. Sources: Mailsoftly, MyMail.page, Merge.email, DeBounce, Sweego, Resend docs, Gmail/Yahoo 2024 bulk sender rules, CAN-SPAM, GDPR.*
