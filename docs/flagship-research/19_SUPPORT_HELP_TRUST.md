# 19 — Support, Help, Trust & Buyer Protection

> **Department:** Help & support, support tickets, report user/content, buyer protection, verification response.
> **Flagship research stream:** 2026 competitor benchmark, psychology of trust, current-codebase audit, micro/macro improvements, acceptance criteria, sequencing.
> **Charter references:** AGENTS.md §4 (push to maximum quality), §11 (truthful UI), §14 (state completeness), §22 (completion standard), §27.7 (trust architecture).

---

## 1. 2026 Competitor Benchmark

### 1.1 eBay Money Back Guarantee & Buyer Protection (2026)

eBay remains the canonical benchmark for marketplace buyer protection. As of May 2026 the eBay Money Back Guarantee policy was re-published with simplified wording but unchanged guidelines, covering most purchases paid through eBay checkout for **30 days from the estimated or actual delivery date** (https://www.ebay.com.au/help/buying/returns-refunds/ebay-money-back-guarantee-policy?id=4210). The guarantee triggers on three concrete conditions: the item did not arrive, the item is significantly not as described, or the item arrived damaged. A separate **Buyer Protection fee** is now charged on purchases from non-Pro Australia-based sellers, and is refunded proportionally if a partial refund is issued (https://www.ebay.com.au/help/buying/paying-items/buyer-protection-fee?id=5594, last updated 27 March 2026).

The eBay claim process is a five-step mediated resolution: (1) contact the seller through eBay messaging, (2) open a case in the Resolution Centre if unresolved within 3 business days, (3) choose the specific issue (not received / not as described), (4) eBay mediates with the seller given 3 business days to respond, (5) eBay decides and refunds to the original payment method within 3–5 business days (https://consumersadvisory.org/smart-shopping/ebay-buyer-protection-what-is-and-is-not-covered). Critically, eBay publishes a clear **exclusion table** — buyer's remorse, off-platform payment, local pickup after inspection, and buyer-address errors are explicitly not covered. This honesty about limits is itself a trust signal: users know exactly where the safety net ends.

eBay also runs a separate **Authenticity Guarantee** for watches, sneakers, trading cards, and handbags above price thresholds, where a third-party authenticator inspects the item before delivery and a verified badge is displayed. This layered protection model — a baseline guarantee plus category-specific authenticity verification — is the pattern ThryftVerse should emulate for its co-ownership and high-value asset flows.

### 1.2 2026 Help Center & In-App Help Patterns

The 2026 consensus on help center UX is remarkably consistent across sources. Docsio's 2026 Knowledge Base Design playbook identifies six core elements: a homepage with search as the hero, 5–8 top-level categories with icons, category landing pages, article pages with last-updated dates and related-article sidebars, persistent navigation with breadcrumbs, and a footer with contact and changelog (https://docsio.co/blog/knowledge-base-design). The search bar handles 40–60% of all traffic on mature help centers and should be the visual focal point with placeholder text that invites a real question. Poor search accounts for nearly 40% of failed self-service attempts (Gartner, 2025, cited in Docsio).

Helpkit's 2026 analysis of best-in-class help centers distills three patterns: search is the hero, categories a stranger could predict (Getting Started, Billing, Troubleshooting, Account), and articles sound like the customer — titles written as the sentence the customer already has in their head (https://www.helpkit.so/learn/help-center-examples). A key detail: the best help centers show two or three article titles under each category on the homepage, letting visitors confirm they are about to click the right door.

For mobile specifically, FAQ Pages' one-thumb UX guidance is decisive: the first screen must surface the highest-value actions and most common questions ("Start here," "Popular," "Fix it now"), with secondary material lower down, because the thumb's natural zone is the lower-center of the screen (https://faqpages.com/mobile-first-faq-placement-lessons-from-a-redesigned-system-). Grouping matters more than labels — clustering related items under short sub-headings makes the page feel smaller and parseable at a glance.

Chameleon's 2026 contextual help guide identifies eight proven UI patterns — inline instructions, tooltips, modals, help menus, checklists, guided tours, lightboxes, and banners — and notes that AI-powered help is shifting from fixed content to dynamic conversational answers, reducing support costs by up to 30% when done right (https://www.chameleon.io/blog/contextual-help-ux). Kompassify's July 2026 in-app support guide adds the five-layer deflection model: field labels, tooltips, embedded search, resource centre, and human escalation, arguing the cheapest ticket deflection is a field label that says what it wants (https://kompassify.com/blog/in-app-support-guide).

### 1.3 2026 Support Ticket Design

Gleap's 2026 mobile customer support guide is the most relevant benchmark for in-app ticketing: in-app support must happen inside the app because that is where the problem happens, conversations must persist across sessions, push notifications must bring users back when the team replies, and agents must see user identity, app version, device details, and previous conversations (https://www.gleap.io/blog/mobile-customer-support-in-app-guide-2026). Async chat is essential — mobile users will not sit in a chat window waiting. Strong in-app bug reporting captures screenshot/screen recording, device model, OS version, app version, user identity, recent actions, and logs.

The MPL customer support optimization case study (https://www.alooposto.com/work/mplcs) demonstrates the "Clear Visual Cues" (CVC) principle for ticket design: color-coded statuses, category icons for instant recognition, progressive disclosure of essential details upfront, and a scroll-to-ticket height ratio fine-tuned to maintain visual hierarchy so the interface feels spacious even with multiple open tickets. The Escalated React Native library (https://github.com/escalated-dev/escalated-react-native) shows the production feature set for an embeddable support ticket UI: ticket management with file attachments, searchable knowledge base, guest tickets, **real-time SLA countdown timers** on ticket detail views, and post-resolution CSAT ratings.

### 1.4 2026 Report Flow & Trust-Safety UX

The 2026 research on reporting flows is the most consequential finding for ThryftVerse. A CHI 2026 study on procedural fairness in flag submissions (https://shagunjhaver.com/research/articles/shim-2026-flagging/shim-2026-flagging.pdf) found that displaying community guidelines during the flag submission process significantly raises perceptions of transparency, and offering a text box for open-ended objections enhances users' sense of voice. The study recommends four design interventions: (1) integrate a text box for detailed perspectives, (2) expand the vocabulary of complaints by letting users highlight norm-violating portions and rate violation severity, (3) incorporate visualization systems that let flaggers **track the review status of submitted flags**, and (4) address concerns about biased decision-making by offering comprehensive information about posting guidelines, reviewers, and the review process.

Ofcom's December 2024/January 2025 behavioural audit of six major platforms (https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/research-statistics-and-data/online-services-research/behavioural-audits-insights-paper.pdf) found that while all platforms have tools to block, hide, or report content, these tools can be hard to find or confusing to use, and it is often unclear what happens after submitting a report. The EU DSA reporting research (https://facctconference.org/static/docs/facct2025-206archivalpdfs/facct2025-final182-acmpaginated.pdf) confirms that "easy to access" and "user friendly" are legal obligations under Article 16, and that usability and compliance interact directly in reporting interface design. The SocialMediaTransparency.org analysis (https://socialmediatransparency.org/research/eu-disinfolab-your-report-is-important-to-us-unnecessary-barriers-to-submit-cont) found that platforms design "sludge" into illegal-content reporting — Meta required roughly 15 clicks for illegal content vs ~5 for a standard community-guidelines complaint — which appears deliberate to reduce downstream obligations.

The marketplace trust-and-safety playbook from TechVinta (https://techvinta.com/blog/marketplace-trust-and-safety-playbook) identifies six pillars — identity, listings, reviews, communications, payments, and disputes — each with its own failure mode. The BoostRoom mobile-first marketplace analysis (https://boostroom.com/blog/mobile-first-digital-marketplace-why-mobile-ux-decides-who-wins) adds that mobile UX controls the marketplace flywheel (conversion → reviews → trust → visibility → repeat purchases) and that vague claims feel suspicious on mobile while specifics feel safe: what's included, timeline, return rules, proof images.

---

## 2. Psychology & Principles

### 2.1 Trust Through Transparency

Trust in a marketplace is not a single signal — it is a layered architecture (AGENTS.md §27.7). The 2026 ChannelEngine marketplace behavior report (https://www.channelengine.com/marketplace-shopping-behavior) found that confidence is shifting from brand-led to information-led, driven by consistency, transparency, and reliability at the point of comparison. For support and protection surfaces, this means every claim must be backed by a visible mechanism: if we say "you're protected," the user must see the coverage amount, the eligibility window, the claim process, and the exclusion list. eBay's published exclusion table is not a weakness — it is a trust signal, because honesty about limits is more credible than a blanket promise.

### 2.2 The "I'm Protected" Feeling

The buyer protection screen is the single most important trust surface in the post-purchase journey. A user who has just spent money is in a state of heightened risk perception. The screen must answer four questions in the first viewport: Am I covered? For how much? Until when? What do I do if something goes wrong? The current ThryftVerse `BuyerProtectionScreen` answers the first three but buries the action ("File a claim") below the fold and presents the claim form as an afterthought. The flagship version must make the protection status the dominant object and the claim action the obvious next step, with the "What's covered" list serving as reassurance, not the primary content.

### 2.3 Fairness in Reporting

The CHI 2026 flagging study establishes that procedural fairness in reporting has three dimensions: transparency (showing community guidelines), voice (offering a text box for specific objections), and agency (letting users track review status). ThryftVerse's current `ReportScreen` provides voice (the details text field) but lacks transparency (no guidelines shown during submission) and completely lacks agency (no way to track the report's status after submission). The success screen says "The moderation team received your report" but provides no report ID, no tracking link, and no timeline — the report vanishes into a black box. This is the exact pattern Ofcom flagged as confusing users.

### 2.4 Control in Support

Support tickets are fundamentally about control restoration. A user who opens a support ticket has lost control of a transaction — the item didn't arrive, the description was wrong, the payment failed. The ticket system must restore the feeling of control through: visible status (open/resolved/closed), a timeline showing what has happened and what happens next, the ability to close and reopen, and a clear response-time expectation. The current `SupportTicketDetailScreen` has a timeline but it is static — it shows only "Request submitted" and "Awaiting review" with no real updates, no agent responses, and no status transitions driven by backend events. The "Typical response time" note is a static string, not a live SLA.

### 2.5 Anxiety Reduction

Every support surface is an anxiety surface. The user is already stressed. The design must reduce, not amplify, anxiety. This means: no fabricated response times that set expectations the system cannot meet, no fake status that implies action when nothing is happening, no dead-end flows that leave the user wondering what to do next. The AGENTS.md §11 truthful-UI principle is paramount here: never fabricate success states, IDs, data, persistence, presence, or activity. A support system that fabricates response times or ticket activity is actively destroying the trust it is supposed to build.

---

## 3. Current ThryftVerse Audit

### 3.1 Fabricated Response Times (§11 violation)

**`HelpSupportScreen.tsx:79`** — The hero card displays "Average response time ~2 hours" as a hard-coded string with no backend data source. This is a fabricated presence/activity claim: there is no support analytics endpoint, no SLA measurement, and no evidence that the average is 2 hours. The same fabricated figure is repeated at **`HelpSupportScreen.tsx:204`** in the version footer: "Thryftverse v1.0.0 · Response time ~2 hours". If the real average is 24 hours, this is actively misleading users and setting an expectation the support team cannot meet.

**`SupportTicketDetailScreen.tsx:245-248`** — The "Typical response time" card states "Our support team typically responds within 24 hours" as a static string. This conflicts with the HelpSupportScreen's "~2 hours" claim, creating an internal inconsistency. Neither figure is sourced from a real SLA endpoint.

**`BuyerProtectionScreen.tsx:104,117`** — The claim submission alert and success toast both promise "We'll review it and respond within 48 hours" — a third, different response-time figure. The user sees three different response-time promises across three screens (2 hours, 24 hours, 48 hours), none of which are backed by data.

### 3.2 Dead Help Articles & Static FAQ

**`HelpSupportScreen.tsx:35-58`** — The FAQ list is entirely hard-coded in the component, not fetched from a CMS or backend. There are only 5 FAQs, all generic. The FAQ at line 55 claims "Our trust team reviews flagged items within 24 hours" — another fabricated SLA with no backend source. The search at lines 61-65 is a naive client-side `toLowerCase().includes()` filter over 5 items; it cannot find anything not in the hard-coded list and provides no autocomplete, no relevance ranking, and no "no results" escalation path beyond the empty-state text.

**`HelpSupportScreen.tsx:96-113`** — "Report a problem" and "Safety and scams" rows open external `mailto:` and `https://thryftverse.app/safety` links. The safety and privacy URLs point to web pages that may or may not exist; if they 404, the user hits a dead end with only a toast ("Unable to open link"). There is no in-app fallback.

### 3.3 Card-on-Card Composition (§4 violation)

**`HelpSupportScreen.tsx:70-84`** — The hero card wraps a `heroRow` containing a `heroIcon` circle and `heroText` inside a bordered, rounded surface — a card containing a row that could be flat canvas. The hero icon is a brand-filled circle with a glyph, which is decorative chrome, not a meaningful containment boundary.

**`SupportTicketDetailScreen.tsx:152-191`** — The status card is a surface containing a status header (icon wrap + title + pill), then a meta row with a hairline divider — all inside one elevated surface. The `statusIconWrap` at line 327 is a `surfaceAlt` circle inside the `surface` card, creating a nested surface with no distinct interaction boundary. Per AGENTS.md §4 "No card-on-card composition," this should be flattened.

**`BuyerProtectionScreen.tsx:170-201`** — The coverage card contains a coverage header (icon circle + text) and coverage details — the `coverageIcon` at line 355 is a `success + '15'` tinted circle inside the bordered card. The "What's covered" section card at line 204 and the claims history card at line 228 are separate bordered surfaces stacked vertically, each with `Stroke.standard` borders, creating a stack of repeated rounded rectangles — the thumbnail test would show repeated containers dominating the silhouette.

### 3.4 Weak Report Flow

**`ReportScreen.tsx:19-49`** — The report reasons list is hard-coded with 5 reasons. The `ReportReason` type in `profileApi.ts:151-157` includes `inappropriate` and `unresponsive` which are not surfaced in the `REPORT_REASONS` array — the UI is missing two valid report categories. The `ListingReportReason` type is cast from `ReportReason` at line 76 with `as ListingReportReason`, which is an unsafe cast if the types diverge.

**`ReportScreen.tsx:88-121`** — The success screen provides no report ID, no tracking mechanism, and no link to see the report's status. The user is told "The moderation team received your report" but has no way to follow up. This is the black-box pattern that Ofcom and the CHI 2026 study identify as a major trust failure. The `reportUser` and `reportListing` services return a `reportId` (profileApi.ts:164, listingsApi.ts:478) but the screen discards it entirely.

**`ReportScreen.tsx:232-248`** — The details text field only appears when `selectedReason === 'other'`. For all other reasons, the user cannot add context. The CHI 2026 study found that offering a text box for specific objections significantly enhances perceived voice — restricting it to "other" only is a fairness failure.

### 3.5 Missing Ticket Status & Activity

**`SupportTicketDetailScreen.tsx:215-238`** — The timeline shows only two static nodes: "Request submitted" and "Awaiting review / Resolved / Closed". There are no agent responses, no status change events, no evidence review notes, and no backend-driven updates. The `updateSupportTicketStatus` store action at `useStore.ts:1656` only supports local status changes (open/closed/resolved) — there is no backend PATCH integration for status updates initiated by the support team. The ticket detail screen calls `updateSupportTicketStatus` directly (lines 81, 92) which updates only local state, not the backend — meaning if the support team resolves a ticket server-side, the app will not reflect it unless `loadSupportTicketsFromApi` is called.

**`SupportTicketDetailScreen.tsx:69-87`** — The close/reopen actions update local state only via `updateSupportTicketStatus`. The `supportApi.ts:55-62` `updateSupportTicketStatus` function exists and calls `PATCH /support/tickets/:id/status`, but the store action at `useStore.ts:1656` does not call it — it only updates local state. This is a §11 violation: the UI shows "Request closed" success but the backend is never notified, so the status is fabricated persistence.

### 3.6 Fake Protection Claims & Inconsistent SLA

**`BuyerProtectionScreen.tsx:92-131`** — The claim form requires a reason (min 2 chars) and description (min 10 chars) but does not support evidence photo uploads, despite the `createBuyerProtectionClaim` API accepting `evidenceUrls` (commerceApi.ts:727). The form is less capable than the API. The `OrderSupportScreen` and `VerificationResponseScreen` both support photo evidence, making this an inconsistency.

**`BuyerProtectionScreen.tsx:206-223`** — The "What's covered" list is hard-coded with 4 items (not as described, not received, counterfeit, damaged in transit). There is no corresponding "What's NOT covered" list — unlike eBay's published exclusion table. Omitting exclusions is not just an information gap; it is a trust risk, because users who assume they are covered for buyer's remorse will discover at claim time that they are not.

**`BuyerProtectionScreen.tsx:248-311`** — The "File a claim" button and claim form only appear when `isCovered` is true. If protection has expired or was not purchased, the user sees "Not covered" with no claim path and no explanation of alternative options (e.g., contacting the seller, opening a standard support ticket). This is a dead end for the user who needs help most.

### 3.7 Verification Response — Strongest Surface

**`VerificationResponseScreen.tsx`** is the most production-grade surface in this department. It has real backend integration (`fetchCoOwnRecourseStatus`, `respondToVerificationDemand`), real media upload (`uploadMedia` with camera and gallery), complete state coverage (loading, error, empty, responded, expired, failed, pending), a deadline badge with real date math (lines 305-308), per-demand-type guidance (lines 42-51), and a liability warning. This screen is the benchmark the other surfaces should be elevated to match. Its one weakness is the `setTimeout(() => navigation.goBack(), 1200)` at line 186 — an artificial delay before navigation that feels non-native; the success state should persist until the user dismisses it.

---

## 4. Micro Improvements

1. **Remove fabricated response times.** Delete the "~2 hours" string at `HelpSupportScreen.tsx:79,204` and the "24 hours" string at `SupportTicketDetailScreen.tsx:247`. Replace with either a real SLA fetched from a `/support/sla` endpoint, or remove the claim entirely. If no SLA data exists, the honest text is "We respond as quickly as we can" — no fabricated number. The "48 hours" at `BuyerProtectionScreen.tsx:104,117` should be sourced from the same SLA endpoint or removed.

2. **Surface the report ID on the report success screen.** `ReportScreen.tsx:88-121` — capture the `reportId` returned by `reportUser`/`reportListing` and display it as "Report #ABC123" with a note that it can be referenced in future support contact. This is a one-line change that transforms the black box into a traceable record.

3. **Show the details text field for all report reasons, not just "other".** `ReportScreen.tsx:232-248` — move the details field outside the `selectedReason === 'other'` conditional so users can add context to any report. Label it "Additional context (optional)" to avoid making it feel mandatory.

4. **Add the missing report reasons.** `ReportScreen.tsx:19-49` — add "Inappropriate content" and "Unresponsive seller" to the `REPORT_REASONS` array to match the `ReportReason` type in `profileApi.ts:151-157`.

5. **Flatten the hero card in HelpSupportScreen.** `HelpSupportScreen.tsx:70-84` — remove the bordered `heroCard` surface and render the hero row directly on flat canvas with the brand icon as a transparent-target glyph, per §4 surface budget.

6. **Add a "What's not covered" section to BuyerProtectionScreen.** `BuyerProtectionScreen.tsx:203` — after the "What's covered" card, add a parallel "Not covered" list (buyer's remorse, off-platform payment, damage after delivery, items inspected at pickup). This matches eBay's published exclusion table and is a trust signal.

7. **Wire the close/reopen ticket actions to the backend.** `SupportTicketDetailScreen.tsx:81,92` — call `updateSupportTicketStatus` from `supportApi.ts` (the real API) before updating local state, or update the store action at `useStore.ts:1656` to call the API. Currently the status change is local-only — a §11 fabricated-persistence violation.

8. **Remove the artificial setTimeout in VerificationResponseScreen.** `VerificationResponseScreen.tsx:186-188` — let the user dismiss the success state manually with a "Done" button instead of auto-navigating after 1200ms.

9. **Add evidence photo upload to the buyer protection claim form.** `BuyerProtectionScreen.tsx:260-308` — add camera/gallery upload buttons matching the pattern in `VerificationResponseScreen.tsx:407-442`, and pass `evidenceUrls` to `createBuyerProtectionClaim`.

10. **Add a claim path for non-covered orders.** `BuyerProtectionScreen.tsx:248` — when `!isCovered`, show a secondary action "Contact support" that navigates to `OrderSupport` for that order, so the user is not left at a dead end.

---

## 5. Macro Improvements

### 5.1 Support Architecture: Real SLA + Backend-Driven Status

The support system needs a real SLA infrastructure. Add a `/support/sla` endpoint that returns current average response time, median resolution time, and operating-hours context. The HelpSupportScreen hero should display this live figure (or omit it if unavailable). The ticket detail screen should poll or subscribe to ticket updates so that status changes made by the support team on the backend are reflected in the app without manual refresh. The store's `updateSupportTicketStatus` action must call the backend API (`supportApi.ts:55`) — the current local-only update is a §11 violation that fabricates persistence.

The ticket timeline must become event-driven, not static. Each status change, agent response, and evidence review should create a timeline event stored on the backend and rendered in the app. The current two-node static timeline (`SupportTicketDetailScreen.tsx:215-238`) should be replaced with a backend-driven event list, matching the Gleap 2026 pattern where agents and users both contribute to a persistent conversation thread.

### 5.2 Help Center: Searchable, Categorized, Backend-Served

The help center must move from 5 hard-coded FAQs to a backend-served knowledge base with: a search-first homepage (search as the hero, per Docsio/Helpkit 2026 guidance), 4-6 task-based categories (Buying, Selling, Payments & Payouts, Safety, Account), article pages with last-updated dates, and a "Still need help?" escalation path at the bottom of every article. The search must support intent matching (not just `toLowerCase().includes()`), with autocomplete and type-ahead results. The current `filteredFaqs` memo at `HelpSupportScreen.tsx:61-65` is a prototype-quality filter that should be replaced with a real search service.

The external links to `thryftverse.app/safety`, `/privacy`, `/terms` should be replaced with in-app article views where possible, so the user never leaves the app for core help content. The `handleOpenExternal` fallback at `HelpSupportScreen.tsx:25-31` should be a last resort, not the primary navigation pattern.

### 5.3 Ticket System: Conversation Thread + SLA Timer

The ticket system should evolve from a status-only model to a conversation model matching the 2026 benchmarks. `SupportTicketDetailScreen` should render a message thread where both the user and the support agent can post messages, with timestamps and read receipts. The current "Details" card (`SupportTicketDetailScreen.tsx:193-199`) is a one-way dump of the initial ticket details — it should be the first message in a thread.

Add an SLA countdown timer to the ticket detail header, matching the Escalated React Native library's "real-time SLA countdown timers on ticket detail views." The timer should show time remaining until the next response, sourced from the backend, and transition visually (warning color) as the deadline approaches. This replaces the static "Typical response time" card with a live, truthful signal.

Add a post-resolution CSAT rating (star display) when a ticket is resolved, matching the Escalated library's "satisfaction ratings with star display." This closes the feedback loop and provides data for support quality improvement.

### 5.4 Report Flow: Trackable, Transparent, Fair

The report flow must implement all three procedural-fairness dimensions from the CHI 2026 study. **Transparency:** show a brief community-guidelines summary during the report submission flow, so the user understands what constitutes a violation before submitting. **Voice:** allow optional context for all report reasons (not just "other"). **Agency:** after submission, provide a report ID and a "My reports" section in the help center where users can see the status of their submitted reports (submitted, under review, action taken, no violation found).

The `reportUser` and `reportListing` services already return a `reportId` — the frontend just needs to capture and persist it. Add a `reports` array to the user store (mirroring `supportTickets`) and a `MyReportsScreen` accessible from the help center. Each report should show its reason, submission date, current status, and the moderation outcome. This transforms the report from a black-box submission into a transparent, trackable process.

### 5.5 Protection Truthfulness: Exclusions + Evidence + Non-Covered Path

The buyer protection screen must be truthful about what is and is not covered. Add the "Not covered" section (micro improvement #6) and ensure the claim form supports evidence uploads (micro improvement #9). The claim submission alert at `BuyerProtectionScreen.tsx:102-130` should not promise a specific response time unless sourced from a real SLA — replace "within 48 hours" with the live SLA figure or a truthful "We'll review your claim and update you in the app."

For non-covered orders, the screen should explain why protection is not active (e.g., "This order was placed before buyer protection was introduced" or "The protection window has expired") and provide a path to contact support. The current "No buyer protection fee was paid" subtitle at line 180 is technically honest but unhelpful — it does not tell the user what to do next.

The protection status should also be visible earlier in the journey — on the order detail screen and in the checkout flow — so the user knows they are protected before they need to file a claim, not after. This matches the BoostRoom guidance that trust signals must appear early, not just at the point of failure.

---

## 6. Flagship Acceptance Criteria

1. **No fabricated response times anywhere.** Every response-time figure (help hero, ticket detail, protection claim) is either sourced from a real `/support/sla` endpoint or removed. Zero hard-coded "~2 hours", "24 hours", or "48 hours" strings remain. (§11 truthful UI)

2. **Report flow provides a trackable ID.** The report success screen displays the `reportId` returned by the API. A "My reports" section in the help center shows all submitted reports with their current status. (CHI 2026 fairness: agency)

3. **Report flow allows context for all reasons.** The details text field is available for every report reason, not just "other". (CHI 2026 fairness: voice)

4. **Report flow shows community guidelines.** A brief guidelines summary is displayed during the submission flow, before the user selects a reason. (CHI 2026 fairness: transparency)

5. **Ticket status changes are backend-driven.** Closing or reopening a ticket calls the real `updateSupportTicketStatus` API (`supportApi.ts:55`), not just local state. The store action at `useStore.ts:1656` is wired to the API. (§11 fabricated persistence)

6. **Ticket timeline is event-driven.** The timeline renders backend events (submission, agent response, status change, resolution), not two static nodes. (Gleap 2026 conversation pattern)

7. **Help center is backend-served.** FAQs are fetched from a CMS or backend endpoint, not hard-coded in the component. Search supports intent matching, not just `toLowerCase().includes()`. (Docsio/Helpkit 2026)

8. **Buyer protection shows exclusions.** A "Not covered" section parallels the "What's covered" section, matching eBay's published exclusion table. (trust through transparency)

9. **Buyer protection claim form supports evidence uploads.** Camera and gallery upload buttons are present, matching the `VerificationResponseScreen` pattern. Evidence URLs are passed to `createBuyerProtectionClaim`. (consistency with API contract)

10. **Non-covered orders have a support path.** When `!isCovered`, the screen shows a "Contact support" action that navigates to `OrderSupport`, not a dead end. (§11 truthful UI — no dead controls)

11. **No card-on-card composition.** Hero cards, status cards, and coverage cards are flattened per §4. The thumbnail test shows content and media dominating, not repeated rounded rectangles. (§4 composition)

12. **VerificationResponseScreen success state is user-dismissed.** The `setTimeout` auto-navigation is removed; the user dismisses the success state with a "Done" button. (§13 control quality)

13. **All response-time claims are consistent.** If a single SLA figure is used, it appears identically across help hero, ticket detail, and protection claim. No screen contradicts another. (§11 truthful UI)

---

## 7. Priority & Sequencing

### Phase 1 — Truthfulness (immediate, no backend required)
- Remove all fabricated response-time strings (HelpSupportScreen:79,204; SupportTicketDetailScreen:247; BuyerProtectionScreen:104,117). Replace with honest text or omit. **1-2 hours.**
- Capture and display the `reportId` on the report success screen (ReportScreen:88-121). **1 hour.**
- Show the details text field for all report reasons (ReportScreen:232-248). **30 min.**
- Add missing report reasons (ReportScreen:19-49). **30 min.**
- Wire ticket close/reopen to the backend API (SupportTicketDetailScreen:81,92 → supportApi.ts:55). **1 hour.**
- Remove the `setTimeout` in VerificationResponseScreen:186-188. **15 min.**

### Phase 2 — Trust Surfaces (1-2 days, frontend-heavy)
- Add "Not covered" section to BuyerProtectionScreen. **2 hours.**
- Add evidence photo upload to the buyer protection claim form. **3 hours.**
- Add "Contact support" path for non-covered orders. **1 hour.**
- Flatten card-on-card composition across HelpSupportScreen, SupportTicketDetailScreen, BuyerProtectionScreen. **4 hours.**
- Add a "My reports" section to the help center with report status tracking. **1 day** (requires a `listReports` API endpoint or local persistence of submitted report IDs).

### Phase 3 — Help Center Architecture (1-2 weeks, backend + frontend)
- Build a backend knowledge-base endpoint (`/help/articles`, `/help/search`) with categorized, searchable articles. **3-5 days backend.**
- Rebuild HelpSupportScreen with search-first homepage, category grid, and article detail view. **3-5 days frontend.**
- Replace the static FAQ accordion with a search-first interface matching the Docsio/Helpkit 2026 pattern. **2 days.**

### Phase 4 — Ticket System Evolution (2-3 weeks, backend + frontend)
- Build a backend ticket event/timeline system (`/support/tickets/:id/events`). **1 week backend.**
- Rebuild SupportTicketDetailScreen with a conversation thread, event-driven timeline, and SLA countdown timer. **1 week frontend.**
- Add post-resolution CSAT rating. **2 days.**
- Build a `/support/sla` endpoint and wire it to all response-time displays. **2 days backend, 1 day frontend.**

### Phase 5 — Report Transparency (1-2 weeks, backend + frontend)
- Build a backend report-status system (`/reports/:id/status`). **1 week backend.**
- Build the "My reports" screen with status tracking. **3 days frontend.**
- Add community-guidelines summary to the report submission flow. **1 day.**

---

## Sources

- eBay Money Back Guarantee policy (effective 12 May 2026): https://www.ebay.com.au/help/buying/returns-refunds/ebay-money-back-guarantee-policy?id=4210
- eBay Buyer Protection fee (last updated 27 March 2026): https://www.ebay.com.au/help/buying/paying-items/buyer-protection-fee?id=5594
- eBay Buyer Protection: What Is and Is Not Covered (Consumer Advisory, April 2026): https://consumersadvisory.org/smart-shopping/ebay-buyer-protection-what-is-and-is-not-covered
- eBay Return Policy 2026 (StorePolicies): https://storepolicies.com/ebay-return-policy/
- eBay Money Back Guarantee limitations (Consumer Rights Expert, 23 May 2026): https://www.consumerrightsexpert.co.uk/ebay-money-back-guarantee-why-it-may-not-protect-you.html
- Docsio, Knowledge Base Design: The 2026 UX and IA Playbook: https://docsio.co/blog/knowledge-base-design
- Helpkit, Help Center Examples: What the Best Ones Get Right (2026): https://www.helpkit.so/learn/help-center-examples
- FAQ Pages, Mobile FAQ Placement for One-Thumb UX: https://faqpages.com/mobile-first-faq-placement-lessons-from-a-redesigned-system-
- Ecom Design Pro, Help Center UX That Cuts Support Tickets and Builds Trust: https://ecomdesignpro.com/help-center-ux/
- Android Developers, Help and Feedback screens: https://developer.android.com/design/ui/mobile/guides/patterns/help-content
- Gleap, Mobile Customer Support: The Complete In-App Support Guide for 2026: https://www.gleap.io/blog/mobile-customer-support-in-app-guide-2026
- Supportbench, Mobile-First Support Intake for Field Teams (3 June 2026): https://www.supportbench.com/design-support-intake-field-teams-mobile-first-portal/
- Escalated React Native (embeddable support ticket UI): https://github.com/escalated-dev/escalated-react-native
- Mava — Web & Mobile Support App Design System (Behance, 2 June 2026): https://www.behance.net/gallery/244363455/Mava-Web-Mobile-Support-App-Design-System
- MPL — Customer Support Optimization (Alooposto): https://www.alooposto.com/work/mplcs
- Chameleon, Contextual Help UX in 2026: https://www.chameleon.io/blog/contextual-help-ux
- Kompassify, In-App Support: How to Deflect Tickets with Self-Serve Help (July 2026): https://kompassify.com/blog/in-app-support-guide
- Helpcenter.io, Customer Self-Service: The 2026 Guide: https://helpcenter.io/blog/customer-self-service-guide/
- Shim et al., Procedural Fairness in Flag Submissions on Social Media Platforms (CHI 2026): https://shagunjhaver.com/research/articles/shim-2026-flagging/shim-2026-flagging.pdf
- Ofcom, Behavioural Audits Insights Paper (Dec 2024/Jan 2025): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/research-statistics-and-data/online-services-research/behavioural-audits-insights-paper.pdf
- SocialMediaTransparency.org, 'Your report is important to us': unnecessary barriers to submit content reports: https://socialmediatransparency.org/research/eu-disinfolab-your-report-is-important-to-us-unnecessary-barriers-to-submit-cont
- FAccT 2025, Evaluating reporting mechanisms under the Digital Services Act: https://facctconference.org/static/docs/facct2025-206archivalpdfs/facct2025-final182-acmpaginated.pdf
- Berkman Klein Center, Mapping the Burden: Survivor-Centered Reporting Systems (2026): https://cyber.harvard.edu/publication/2026/mapping-burden-survivor-centered-reporting-systems-policies-ncii
- ChannelEngine, Marketplace Shopping Behavior Report 2026: https://www.channelengine.com/marketplace-shopping-behavior
- TechVinta, Marketplace Trust & Safety Playbook: 6 Pillars (2026): https://techvinta.com/blog/marketplace-trust-and-safety-playbook
- BoostRoom, Mobile-First Marketplace UX: Why Mobile Decides Winners: https://boostroom.com/blog/mobile-first-digital-marketplace-why-mobile-ux-decides-who-wins
- LowCode Agency, Marketplace App UI/UX Design Best Practices: https://www.lowcode.agency/blog/marketplace-app-ui-ux-design-best-practices
- Revolvertech, Trust Signals in Mobile Marketplace Apps (14 Jan 2026): https://revolvertech.com/2026/01/14/trust-signals-in-mobile-marketplace-apps/
