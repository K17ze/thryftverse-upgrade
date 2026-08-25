# 29 — Content Moderation & Safety

> **Department:** Content Moderation, Trust & Safety, and User Protection
> **Benchmark date:** 2026-08-18
> **Scope:** Report flows (user/listing/message), sensitive content filtering, blocked/muted/restricted users, trust & safety center, content moderation pipelines (automated + human), prohibited item detection, counterfeit detection, harassment prevention, minor safety, appeal flows, moderation queue, community guidelines, shadow banning, review bombing prevention, AI-assisted moderation.
> **Charter references:** AGENTS.md §2 (deep system research, layer diagnosis), §4 (anti-AI-made design — "truthful UI", "stateless UI"), §6 (truthful UI), §14 (state completeness); Design.md "Trust & Safety", "Support & Help", "Chat & Messaging".
> **Primary benchmarks:** eBay (98.2% prohibited listing block rate at creation, multi-layer AI + human moderation, counterfeit detection), Instagram (sensitive content filtering, report taxonomy, restriction/mute), Snapchat (minor safety, AI moderation), Pinterest (proactive content moderation). Secondary: Depop, Vinted (marketplace-specific moderation), Reddit (report taxonomy with 14 categories).

---

## 1. 2026 Competitor Benchmark

Content moderation and trust & safety are the foundation of a marketplace — not a feature, but the platform on which all commerce happens. eBay's 2025 Global Transparency Report reveals the scale and sophistication required: 98.2% of prohibited listings were blocked at the point of listing creation and never appeared on the marketplace; 21 million listings of potentially unsafe products were prevented through automated blocks; 1.8 million prohibited wildlife listings were blocked or removed ([eBay 2025 Global Transparency Report](https://static.ebayinc.com/static/assets/Uploads/Documents/eBay-2025-Global-Transparency-Report.pdf)). This is the benchmark: proactive, automated, at-scale — not reactive, manual, after-the-fact.

### The 2026 trust & safety stack

| Layer | 2026 industry standard | Tooling |
|---|---|---|
| Listing moderation | Automated pre-publish filter (image hashing, text classification, price-anomaly detection) → human review for edge cases → post-publish reactive reports. 60-80% caught by automated filter at pennies per listing | OpenAI Moderation API, AWS Comprehend, custom ML, image hashing (PhotoDNA) |
| Report taxonomy | 10-14 categories (spam, harassment, counterfeit, off-platform, hate speech, self-harm, sexual content, misinformation, illegal goods, privacy violation, other) — not 3-5 generic categories | Reddit's 14-category taxonomy is the benchmark |
| Report flow | Inline on the content (not a separate page); 2-3 taps to submit; optional details field; receipt confirmation; status tracking ("We received your report", "Under review", "Action taken") | Inline report sheet/modal |
| Sensitive content | Blur/cover with tap-to-reveal; sensitivity labels; user-controlled sensitivity filter in settings; algorithmic sensitivity detection | Instagram's Sensitive Content Control |
| Block/mute/restrict | Block (bidirectional — neither sees the other), mute (one-way — you don't see them, they see you), restrict (they can see your content but their comments/messages are hidden from others) — three distinct tools for three distinct needs | Instagram's three-tier system |
| Appeal flow | User can appeal a moderation decision; appeal reviewed by a different moderator than the original; appeal outcome communicated; time-bound (48-72h) | Procedural fairness framework |
| Trust & safety center | Centralized hub: community guidelines, safety policies, report history, blocked users, muted users, restricted accounts, safety tools education | Instagram's Safety Center |
| Prohibited items | Category-specific prohibited list (weapons, drugs, counterfeit, wildlife, regulated goods); AI detection at listing creation; seller education before listing | eBay's prohibited items policy |
| Counterfeit detection | Image matching against brand registries; VeRO (Verified Rights Owner) program for brand complaints; authenticator program for high-value categories | eBay VeRO + Authenticity Guarantee |
| Minor safety | Age gates; minor accounts cannot be contacted by adults they don't follow; minor content not recommended to adults; mandatory reporting of CSAM | Apple/Google platform requirements |
| Review bombing prevention | Review velocity limits; verified-purchase requirement; algorithmic detection of coordinated review campaigns; seller response mechanism | eBay's verified review system |
| Moderation queue | Admin/moderator dashboard: pending reports, flagged content, appeal queue, action history; SLA tracking; moderator performance metrics | Custom admin dashboard |
| Community guidelines | Publicly accessible, plain-language, category-specific; linked from report flow, signup, and settings; versioned with update notifications | eBay/Instagram community guidelines |

Sources: [eBay 2025 Global Transparency Report](https://static.ebayinc.com/static/assets/Uploads/Documents/eBay-2025-Global-Transparency-Report.pdf); [eBay — Reporting content](https://www.ebay.co.uk/help/account/regulatory/reporting-content-ebay?id=5412); [TechVinta — Marketplace Trust & Safety Playbook 2026](https://techvinta.com/blog/marketplace-trust-and-safety-playbook); [Shim & Jhaver — Procedural Fairness in Flag Submissions 2026](https://shagunjhaver.com/research/articles/shim-2026-flagging/shim-2026-flagging.pdf); [GetStream — Marketplace Content Moderation](https://getstream.io/blog/marketplace-content-moderation/).

### eBay — the marketplace moderation benchmark

eBay's moderation is multi-layered: (1) automated pre-publish filter using AI + image hashing + text classification blocks 98.2% of prohibited listings at creation, (2) human review for edge cases and appeals, (3) reactive user reports for anything that slips through, (4) brand-driven takedowns via the VeRO program, (5) authenticator program for high-value categories (sneakers, watches, handbags). The key insight: **proactive moderation at the point of creation is 100× cheaper than reactive moderation after the listing is live.** A prohibited listing that never appears causes zero buyer harm, zero support tickets, and zero brand damage.

### Instagram — three-tier user control

Instagram's block/mute/restrict system is the benchmark for granular user control:
- **Block:** Bidirectional — neither user sees the other's content. The nuclear option.
- **Mute:** One-way — you don't see their content, but they can see yours. The "I don't want to see this but don't want to cause drama" option.
- **Restrict:** Their comments on your posts are only visible to them; their messages go to message requests; they don't know they're restricted. The "protect myself from harassment without escalating" option.

Three tools for three distinct social situations. ThryftVerse currently has only block — missing mute and restrict.

### Snapchat — minor safety benchmark

Snapchat's minor safety features are the benchmark for under-18 protection: minors cannot be contacted by adults they don't follow; minor accounts are not recommended to adult users; mandatory CSAM reporting via NCMEC. For a marketplace with age verification, minor safety is both a legal requirement and a trust requirement.

### Reddit — report taxonomy benchmark

Reddit's 14-category report taxonomy (Hate, Sharing personal information, Non-consensual intimate media, Threatening violence, Sexual content involving minors, etc.) is the benchmark for report flow granularity. ThryftVerse's 5-category taxonomy (spam, harassment, counterfeit, off_platform, other) is too coarse — it forces users to pick "other" for most violations, which gives the moderation team no actionable signal.

### Converging principles

1. **Proactive > reactive.** Blocking a prohibited listing at creation (eBay's 98.2% block rate) is 100× cheaper and safer than removing it after it's live. Automated pre-publish filtering is the first line of defense.
2. **Report taxonomy must be granular.** 10-14 categories, not 3-5. Each category routes to a specific moderation workflow. "Other" should be the exception, not the majority of reports.
3. **Three-tier user control.** Block, mute, and restrict serve different needs. Offering only block forces users to choose between "nuclear option" and "do nothing."
4. **Appeals are mandatory for procedural fairness.** Users must be able to appeal moderation decisions. The appeal is reviewed by a different moderator than the original decision. The outcome is communicated. Without appeals, moderation is unilateral and trust-eroding ([Shim & Jhaver 2026](https://shagunjhaver.com/research/articles/shim-2026-flagging/shim-2026-flagging.pdf)).
5. **Report status tracking.** The reporter should be able to track the status of their report: received → under review → action taken / no action. Without status tracking, the reporter feels their report went into a void.
6. **Community guidelines are the contract.** Publicly accessible, plain-language, category-specific guidelines are the contract between the platform and its users. Every moderation decision references a specific guideline. Without this, moderation feels arbitrary.
7. **Moderation is a competitive advantage.** In 2026, users choose marketplaces based on trust. A marketplace with visible, effective moderation wins over one with invisible, reactive moderation. Trust is the moat ([GetStream — Marketplace Content Moderation](https://getstream.io/blog/marketplace-content-moderation/)).

---

## 2. Psychology & Principles

### Trust as the marketplace foundation

A marketplace without trust is a directory of scams. Users transact with strangers — sending money to someone they've never met, for an item they've never touched. The trust surface (verification badges, buyer protection, moderation, report flows) is what makes this possible. Remove the trust surface and the marketplace collapses — users either don't transact or take transactions off-platform (where the marketplace earns nothing and the user has no protection).

### The report-to-resolution journey

The user's experience of moderation is not the moderation itself — it's the journey from report to resolution. The user reports content → receives a confirmation → waits → receives an outcome. Each step in this journey is a trust touchpoint. A report that goes into a void (no confirmation, no status, no outcome) erodes trust — the user concludes the platform doesn't care. A report with status tracking and outcome communication builds trust — the user concludes the platform is responsive and effective, even if the outcome isn't what they hoped.

### Bystander intervention

Content moderation is not just the platform's job — it's the community's job. User reports are the primary signal for moderation at scale. The report flow must be frictionless (2-3 taps, inline on the content) because every tap of friction reduces the report rate. A report button buried in a settings menu produces 10× fewer reports than an inline button on the content itself. The community is the platform's eyes and ears — make it easy for them to see and report.

### Deterrence through visibility

Visible moderation deters future violations. When a user sees that a listing was removed for policy violation, they're less likely to post a similar listing. When a user sees that a seller was suspended for counterfeit goods, they're less likely to sell counterfeits. Invisible moderation (silent removal, shadow banning) is effective for the individual case but fails at deterrence — the community doesn't see the consequence and doesn't learn the norm.

### Restorative vs punitive moderation

Punitive moderation (ban, suspend) removes bad actors but doesn't reform them. Restorative moderation (education, warning, restricted privileges) teaches the norm and gives the user a path back. The 2026 consensus is a tiered approach: first violation → educational warning; repeated violation → restricted privileges (shadow ban, limited listing ability); severe violation → suspension; illegal activity → permanent ban + law enforcement. ThryftVerse currently has only binary block/report — no tiered response.

### The chilling effect of over-moderation

Over-moderation is as dangerous as under-moderation. A platform that removes too much content chills legitimate expression and drives users away. The line between "proactive moderation" and "censorship" is procedural fairness: clear guidelines, consistent enforcement, appeal rights, and transparency about what was removed and why. Without procedural fairness, proactive moderation becomes arbitrary censorship.

---

## 3. Architectural Issues & Engineering Flaws

Content moderation debt blocks production in concrete, high-stakes ways:

### Marketplace liability

Marketplaces are increasingly held liable for the content they host. Section 230 protections in the US are under legislative pressure. The EU's Digital Services Act (DSA) requires platforms to have transparent moderation systems, appeal processes, and clear community guidelines. A marketplace without a documented moderation pipeline, appeal flow, and community guidelines is non-compliant with the DSA and exposed to liability.

### Prohibited items risk

Without automated pre-publish filtering, prohibited items (weapons, drugs, counterfeit, wildlife, regulated goods) appear on the marketplace. Each prohibited listing is a potential legal violation, a buyer safety risk, and a brand damage event. eBay's 98.2% pre-publish block rate is the benchmark — ThryftVerse's 0% pre-publish block rate (no automated filtering) means every prohibited item reaches the marketplace until a user reports it.

### Counterfeit brand complaints

Without counterfeit detection (image matching against brand registries, VeRO-style brand complaint flow), counterfeit goods appear on the marketplace. Brand owners file takedown notices, and repeated failures lead to legal action and brand blacklisting. eBay's VeRO program and Authenticity Guarantee are the benchmarks.

### Harassment liability

Without three-tier user control (block/mute/restrict), harassment prevention is binary: block or nothing. Users who don't want to escalate (fear of retaliation) but want to stop seeing someone's content have no tool. This gap creates a harassment-permissive environment that drives vulnerable users off the platform.

### Review bombing

Without review velocity limits, verified-purchase requirements, and coordinated-campaign detection, a seller's reputation can be destroyed by a coordinated review bombing attack. Competitors or disgruntled users can flood a seller with 1-star reviews, destroying their conversion rate. Review bombing prevention is a marketplace integrity requirement.

### Minor safety legal requirements

For a marketplace with age verification and high-value items, minor safety is a legal requirement. Minors must not be contacted by unknown adults; minor content must not be recommended to adults; CSAM must be reported to NCMEC. Failure to implement minor safety features can result in criminal liability and App Store/Play Store removal.

### No moderation queue = no moderation at scale

Without a moderation queue dashboard for admins/moderators, reports pile up with no triage. The moderation team can't prioritize (urgent vs routine), can't track SLA, can't measure performance, and can't ensure consistency. A moderation queue is the operational backbone of trust & safety at scale.

---

## 4. AI Slop Diagnosis

AI-generated moderation UX has predictable failure modes:

### Generic "Report" button with no taxonomy

AI models generate a "Report" button that opens a text field with no category selection. The moderation team receives a stream of free-text reports that must be manually categorized — 10× the labor of structured reports. ThryftVerse avoids this — the `ReportScreen.tsx` has 5 categories with descriptions. But 5 is too few; the benchmark is 10-14.

### No appeal flow

AI models generate report flows but never generate appeal flows. The user can report but can't appeal a moderation decision against themselves. This is the most common AI moderation gap — the AI thinks about the reporter's journey but not the reported user's journey. ThryftVerse has this gap — no appeal flow exists.

### No community guidelines

AI models generate report flows that reference "community guidelines" but never generate the guidelines themselves. The report flow says "This violates our community guidelines" but the guidelines don't exist as a readable document. This is circular and non-compliant.

### Copy-paste community guidelines

AI models that do generate community guidelines often copy-paste generic text from training data ("Be respectful. Don't spam. No illegal content.") that is too vague to be enforceable. Real community guidelines are category-specific, plain-language, and reference specific prohibited items and behaviors.

### No proactive detection

AI models generate reactive moderation (user reports → human reviews) but never proactive moderation (AI scans content at creation → blocks if prohibited). Proactive moderation is the eBay benchmark (98.2% pre-publish block rate) and is the difference between a safe marketplace and an unsafe one.

### No status tracking

AI models generate report submission flows but not report status tracking. The user submits a report and never hears back. This is the "report into a void" pattern that erodes trust.

---

## 5. Current ThryftVerse Audit (file:line defects)

### Report flow — `frontend/src/screens/ReportScreen.tsx`

**Strengths:**
- `ReportScreen.tsx:19-49` — 5 report reasons (spam, harassment, counterfeit, off_platform, other) with descriptions — better than a generic text field
- `ReportScreen.tsx:51-86` — handles both user reports (`reportUser`) and listing reports (`reportListing`) via `type` param — unified flow
- `ReportScreen.tsx:67-85` — submit with loading state, error handling, success state
- `ReportScreen.tsx:88-121` — submitted state with confirmation message and "Done" button
- `ReportScreen.tsx:124-157` — invalid target state ("Report target unavailable") — edge case handling
- Backend `index.ts:16528-16555` — `POST /users/:userId/report` → `INSERT INTO user_reports` — real persistence with report ID

**Defects:**
| Line (file) | Defect |
|---|---|
| `ReportScreen.tsx:19-49` | Only 5 report reasons — benchmark is 10-14 (Reddit has 14). Missing: hate speech, self-harm, sexual content, misinformation, illegal goods, privacy violation, impersonation, minor safety |
| `ReportScreen.tsx` | No message reporting — can report users and listings but not individual chat messages. Chat harassment requires reporting the user, not the specific message. |
| `ReportScreen.tsx:88-108` | Submitted state says "The moderation team received your report" but there's no status tracking — the user can't check the report's status later. No "Report history" screen. |
| `ReportScreen.tsx:106-108` | "Blocking is available separately if you no longer want contact" — mentions blocking but doesn't offer a one-tap "Block this user" button from the report confirmation. The user has to navigate to a separate screen to block. |
| Missing | No appeal flow — a user who has been reported/moderated against cannot appeal the decision. |
| Missing | No community guidelines page — the report flow references moderation but there's no readable guidelines document. |

### Block/unblock — `frontend/src/screens/BlockedUsersScreen.tsx` + backend

**Strengths:**
- `BlockedUsersScreen.tsx:25-60` — blocked users list with profile fetching, search, unblock
- `BlockedUsersScreen.tsx:38-58` — `EmptyState` when no blocked users, `SettingsListSkeleton` while loading — state coverage
- Backend `index.ts:16478` — `POST /users/:userId/block` — real block API
- Backend `index.ts:15982-15989` — block check on follow ("Cannot follow this user" if blocked) — block is enforced server-side
- `useStore.ts:471` — `blockedUsers` array in store + `toggleBlockedUser` — client-side block state

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | No mute functionality — can't mute a user (one-way hide their content without blocking) |
| Missing | No restrict functionality — can't restrict a user (their comments/messages hidden from others without their knowledge) |
| Missing | No block from profile — need to verify if the profile screen has a block button, or if blocking is only from the blocked users screen |
| Missing | No "blocked users can't see your content" confirmation — the user should understand what blocking does before they do it |

### Chat safety — `frontend/src/utils/chatSafetyWarnings.ts` + `useConversationSafety.ts`

**Strengths (genuinely well-built):**
- `chatSafetyWarnings.ts:18-60` — comprehensive off-platform payment detection: PayPal, Venmo, CashApp, Zelle, Revolut, Monzo, Wise, bank transfers (sort code, IBAN, SWIFT), crypto (BTC, ETH, USDT), Western Union, MoneyGram, gift cards (Steam, iTunes, Amazon), generic off-platform language — 40+ regex patterns
- `chatSafetyWarnings.ts:66-75` — scam urgency pattern detection: "pay now/today/immediately", "urgent sale", "ship before payment", "won't last long" — high-pressure tactic detection
- `chatSafetyWarnings.ts:4-11` — three warning levels: `info`, `caution`, `danger` — graduated severity
- `useConversationSafety.ts` (2.5KB) — hook for contextual safety warnings in chat
- `chatSafetyProvenance.test.ts` — test coverage for chat safety

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | No message-level report — safety warnings detect risk but the user can't report the specific message that triggered the warning |
| Missing | No auto-flag to moderation — when a danger-level warning triggers, the message is not automatically flagged for moderator review |
| Missing | No image-based scam detection — the regex patterns cover text but not image-based scams (fake screenshots, phishing images) |

### Trust signals — `SellerTrustBadge.tsx`, `SellerTrustCard.tsx`, `ProfileTrustSignals.tsx`, `AITrustBadge.tsx`, `AITrustSignal.tsx`, `CoOwnTrustPanel.tsx`

**Strengths:**
- Multiple trust signal components — seller trust, profile trust, AI trust, co-own trust — covering different trust dimensions
- `AITrustBadge.tsx` / `AITrustSignal.tsx` — AI transparency (per AGENTS.md §16 AI antipatterns — labeling AI-generated content)
- Backend `aiTruth.ts` — blocks false AI capability claims (won't let the platform claim AI features it doesn't have)

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | Need to verify: are trust badges rendered on listing cards in the feed, or only on the detail screen? Trust signals in the feed (before the user taps) are more impactful than on the detail screen. |
| Missing | No "buyer protection" badge on listing cards — eBay's "Money Back Guarantee" is visible on every listing. ThryftVerse's `BuyerProtectionScreen.tsx` exists but the badge may not be rendered in the feed. |

### Fraud detection — `backend/api/src/lib/fraudDetection.ts` + `routes/fraudDetection.ts`

**Strengths:**
- `fraudDetection.ts` — fraud signals including device fingerprint, velocity, behavioral patterns
- `routes/fraudDetection.ts:219` — `POST /fraud/report` — user-facing fraud report endpoint
- `fraudDetection.ts:37,191,224` — `Accept-Language` as a fraud signal
- Backend `index.ts:12610-12614` — non-blocking fraud check on listing creation

**Defects:**
| Line (file) | Defect |
|---|---|
| `fraudDetection.ts` | This is payment/behavioral fraud detection, not content moderation. There's no content moderation pipeline (prohibited item detection, counterfeit detection, sensitive content detection). |
| Missing | No listing content moderation at creation — no text classification, no image hashing, no prohibited item detection. 100% of listings reach the marketplace unmoderated. |
| Missing | No image moderation — no PhotoDNA-style hashing for illegal imagery, no counterfeit image matching |

### Moderation infrastructure

| Item | Status |
|---|---|
| Moderation queue (admin dashboard) | **Missing** — no admin/moderator dashboard for reviewing reports |
| Appeal flow | **Missing** — users can't appeal moderation decisions |
| Community guidelines page | **Missing** — no readable guidelines document |
| Trust & Safety center | **Missing** — no centralized hub for safety tools and policies |
| Report status tracking | **Missing** — no way for reporter to check report status |
| Report history | **Missing** — no list of past reports by the user |
| Proactive listing moderation | **Missing** — no automated pre-publish filter |
| Prohibited item detection | **Missing** — no category-specific prohibited list or detection |
| Counterfeit detection | **Missing** — no image matching or brand registry |
| Sensitive content filtering | **Missing** — no blur/cover for sensitive content |
| Mute functionality | **Missing** — only block, no mute |
| Restrict functionality | **Missing** — only block, no restrict |
| Minor safety | **Missing** — no minor-specific protections |
| Review bombing prevention | **Missing** — no velocity limits or coordinated-campaign detection |
| Shadow ban / restricted account state | **Missing** — no tiered account state (normal → restricted → suspended) |
| Moderation action notifications | **Missing** — reporter not notified of outcome; reported user not notified of action |
| Message-level reporting | **Missing** — can report users but not individual messages |

---

## 6. Micro Improvements (file-and-line-level)

### M1 — Expand report taxonomy to 12 categories

In `ReportScreen.tsx:19-49`, expand from 5 to 12 categories:
```ts
const REPORT_REASONS = [
  { key: 'spam', label: 'Spam', description: 'Unwanted promotion, scams or repetitive messages' },
  { key: 'harassment', label: 'Harassment', description: 'Threatening, abusive or targeted unwanted contact' },
  { key: 'hate_speech', label: 'Hate speech', description: 'Slurs, dehumanizing language, or attacks on protected groups' },
  { key: 'counterfeit', label: 'Fake item', description: 'Counterfeit goods or misleading authenticity claims' },
  { key: 'prohibited', label: 'Prohibited item', description: 'Weapons, drugs, wildlife, or other prohibited categories' },
  { key: 'off_platform', label: 'Off-platform request', description: 'Asked to transact outside Thryftverse, against policy' },
  { key: 'scam', label: 'Scam or fraud', description: 'Attempted financial fraud, phishing, or impersonation' },
  { key: 'misinformation', label: 'Misleading content', description: 'False or misleading claims about an item' },
  { key: 'privacy', label: 'Privacy violation', description: 'Shared private information without consent' },
  { key: 'impersonation', label: 'Impersonation', description: 'Pretending to be someone else' },
  { key: 'minor_safety', label: 'Minor safety', description: 'Content or behavior endangering minors' },
  { key: 'other', label: 'Something else', description: 'Tell the moderation team what happened' },
];
```

### M2 — Add message-level reporting

Add a long-press context menu on chat messages with "Report message" option that opens a report sheet pre-filled with the message content and conversation context.

### M3 — Add "Block this user" button on report confirmation

In `ReportScreen.tsx:88-121`, add a "Block this user" button on the submitted state:
```tsx
<AnimatedPressable style={styles.blockAction} onPress={handleBlockUser}>
  <Text style={styles.blockActionText}>Block this user</Text>
</AnimatedPressable>
```

### M4 — Add report status tracking

Create a "Report History" screen showing the user's past reports with status: submitted → under review → action taken / no action. Send a push notification when the report status changes.

### M5 — Add mute and restrict functionality

Add `muteUser(userId)` and `restrictUser(userId)` to the store and backend. Muted users' content is hidden from the muter's feed. Restricted users' comments and messages are hidden from everyone except themselves.

### M6 — Add appeal flow

Create an `AppealScreen` accessible from moderation action notifications. The user sees the action taken, the guideline violated, and can submit an appeal with additional context. The appeal is reviewed by a different moderator.

### M7 — Add community guidelines page

Create a `CommunityGuidelinesScreen` with category-specific, plain-language guidelines. Link from: report flow, signup, settings, and each moderation action notification.

### M8 — Add proactive listing moderation

In the backend listing creation flow, add a pre-publish moderation step:
1. Text classification (OpenAI Moderation API or AWS Comprehend) on title + description
2. Image hashing against known-bad sets (PhotoDNA for illegal imagery)
3. Price-anomaly detection (listing a $5000 watch for $50)
4. Prohibited keyword matching (category-specific prohibited list)
5. If flagged → hold for human review; if clear → publish

### M9 — Add trust & safety center

Create a `TrustSafetyCenterScreen` as a centralized hub: community guidelines, safety policies, report history, blocked users, muted users, restricted accounts, safety tools education, contact safety team.

### M10 — Add moderation action notifications

When a moderation action is taken (listing removed, account restricted, report resolved), notify both the reporter ("Action taken on your report") and the affected user ("Your listing was removed for [guideline]. Tap to appeal.").

### M11 — Add sensitive content blur

For listings or images flagged as sensitive (adult content, graphic content), blur the image with a tap-to-reveal overlay and a sensitivity label. Add a sensitivity filter in settings (off / limit / strict).

### M12 — Add review bombing prevention

In the backend review submission flow:
- Require verified purchase (can only review items you bought)
- Limit review velocity (max 1 review per item per user, max 5 reviews per hour)
- Detect coordinated campaigns (multiple 1-star reviews from accounts created within 24h)
- Allow seller response to reviews

---

## 7. Macro Improvements (structural/architectural)

### A1 — Moderation as a product system

The root architectural flaw is that moderation is treated as a reactive feature (report button → human review) rather than a product system with proactive detection, tiered response, appeal rights, and status tracking. The fix is structural: moderation becomes a product surface with a dedicated team, a moderation queue dashboard, automated pre-publish filtering, tiered response (warning → restriction → suspension), appeal flow, and status tracking. The `notificationEventRegistry.ts` pattern (semantic metadata for notifications) should be replicated for moderation — a `moderationEventRegistry` that maps each violation type to severity, automated action, and human review threshold.

### A2 — Six-pillar trust & safety architecture

Per the [TechVinta Trust & Safety Playbook](https://techvinta.com/blog/marketplace-trust-and-safety-playbook), marketplace trust & safety has six pillars: identity, listings, reviews, communications, payments, disputes. Each pillar has its own failure mode and its own playbook. ThryftVerse's current state:
- **Identity:** KYC verification exists (good)
- **Listings:** No proactive moderation (critical gap)
- **Reviews:** Exist but no bombing prevention (moderate gap)
- **Communications:** Chat safety warnings exist (good), but no message reporting (gap)
- **Payments:** Stripe + fraud detection exist (good)
- **Disputes:** Support tickets exist (good), but no moderation appeal (gap)

The architecture should ensure each pillar has a complete playbook, not just the pieces that happened to be built.

### A3 — Proactive moderation pipeline

The single highest-impact architectural change is a proactive listing moderation pipeline:
```
listing created → text classification → image hashing → price anomaly → prohibited keyword match
    → clear: publish immediately
    → flagged: hold for human review → moderator approves/rejects → notify seller
    → blocked: reject with reason + appeal link + community guidelines reference
```
This pipeline catches 60-80% of prohibited listings at creation (the eBay benchmark is 98.2%). The cost is pennies per listing for automated checks; the savings are enormous (zero buyer harm, zero support tickets, zero brand damage from prohibited listings).

### A4 — Tiered account state

Account state should be tiered, not binary (normal/banned):
- **Normal:** Full platform access
- **Restricted:** Listings held for review; comments hidden from others; can't send messages to non-followers. User is notified and can appeal.
- **Shadow-restricted:** Same as restricted but the user is NOT notified (used for ongoing investigation)
- **Suspended:** Cannot list, buy, or message. Account is read-only. User is notified with reason and appeal link.
- **Banned:** Account permanently disabled. User is notified with reason. Data retained for legal compliance.

Each tier is triggered by accumulated violations, with clear thresholds and appeal rights.

### A5 — Moderation queue dashboard

Build an admin/moderator dashboard (web or in-app admin screen) with:
- Pending reports queue (sorted by severity and SLA)
- Flagged listings queue (from proactive moderation)
- Appeal queue (sorted by deadline)
- Action history per user (pattern detection for repeat offenders)
- Moderator performance metrics (SLA compliance, decision consistency)
- Community guidelines reference (for consistent enforcement)

### A6 — Report-to-resolution notification chain

Every report follows a notification chain:
1. **Report submitted** → reporter gets confirmation (in-app + push)
2. **Under review** → reporter gets status update (push)
3. **Action taken** → reporter gets outcome (push + in-app); affected user gets notification with reason + appeal link
4. **No action** → reporter gets outcome with explanation; if they disagree, they can escalate
5. **Appeal submitted** → affected user gets confirmation; original reporter is not notified of the appeal
6. **Appeal decision** → affected user gets outcome

This chain makes moderation visible and builds trust through transparency.

---

## 8. Flagship Acceptance Criteria

A flagship content moderation & safety system must achieve:

- **12+ report categories** — granular taxonomy routing to specific workflows
- **Report status tracking** — reporter can see submitted → under review → action taken / no action
- **Report history** — user can see all their past reports and outcomes
- **Message-level reporting** — can report individual chat messages, not just users
- **Block + mute + restrict** — three-tier user control for three distinct needs
- **Appeal flow** — users can appeal moderation decisions; reviewed by different moderator; outcome communicated
- **Community guidelines** — publicly accessible, category-specific, plain-language, versioned
- **Trust & Safety center** — centralized hub for all safety tools and policies
- **Proactive listing moderation** — automated pre-publish filter (text + image + price); 60-80% of prohibited listings blocked at creation
- **Prohibited item detection** — category-specific prohibited list with AI detection
- **Counterfeit detection** — image matching + brand complaint flow
- **Sensitive content filtering** — blur/cover with tap-to-reveal; user-controlled sensitivity filter
- **Moderation queue dashboard** — admin/moderator dashboard with pending reports, flagged listings, appeals, SLA tracking
- **Tiered account state** — normal → restricted → shadow-restricted → suspended → banned
- **Moderation action notifications** — both reporter and affected user notified of outcomes
- **Minor safety** — age-gated protections, minor content not recommended to adults, CSAM reporting
- **Review bombing prevention** — verified-purchase requirement, velocity limits, coordinated-campaign detection
- **Chat safety warnings** — off-platform payment detection, scam urgency detection (already exists)
- **Buyer protection badge** — visible on listing cards and checkout

### Thumbnail test

A ThryftVerse listing card at 25% scale must show: a buyer protection badge or trust signal, a seller verification badge if verified, and a report option accessible via long-press. If the card shows no trust signals, it is not done.

---

## 9. Priority & Sequencing

| Priority | Item | Why first | Risk | Unblocks |
|---|---|---|---|---|
| P0 | M1 — Expand report taxonomy to 12 categories | Current 5 is too coarse; "other" is the majority of reports | Low — add categories to existing flow | Report quality |
| P0 | M7 — Community guidelines page | Required for DSA compliance; referenced by report flow and moderation actions | Low — content + screen | Compliance, moderation transparency |
| P0 | M6 — Appeal flow | Required for procedural fairness; DSA compliance | Medium — new screen + backend | Procedural fairness |
| P0 | M3 — "Block this user" on report confirmation | Friction reduction; user just reported, should be able to block in one tap | Low — add button | UX quality |
| P1 | M8 — Proactive listing moderation | eBay's 98.2% pre-publish block rate is the benchmark; highest-impact safety improvement | High — ML pipeline + human review | Proactive safety |
| P1 | M4 — Report status tracking | Trust through transparency; reporter can see their report's journey | Medium — status pipeline + UI | Trust |
| P1 | M5 — Mute and restrict | Three-tier user control; currently only block | Medium — new backend + UI | User control |
| P1 | M10 — Moderation action notifications | Both parties notified of outcomes; trust through transparency | Medium — notification pipeline | Moderation visibility |
| P1 | A4 — Tiered account state | Binary ban is too blunt; tiered response is restorative + deterrent | Medium — backend state machine | Moderation sophistication |
| P2 | M9 — Trust & Safety center | Centralized hub; improves discoverability of safety tools | Low — new screen aggregating existing features | Safety tool discoverability |
| P2 | M2 — Message-level reporting | Chat harassment requires message-level granularity | Medium — context menu + backend | Chat safety |
| P2 | M11 — Sensitive content blur | Adult/graphic content protection | Medium — detection + UI | Content safety |
| P2 | M12 — Review bombing prevention | Seller reputation protection | Medium — velocity + detection logic | Marketplace integrity |
| P2 | A3 — Proactive moderation pipeline | Architectural foundation for M8 | High — pipeline architecture | Proactive safety at scale |
| P3 | A5 — Moderation queue dashboard | Operational backbone for moderation team | High — admin dashboard | Moderation at scale |
| P3 | A6 — Report-to-resolution notification chain | End-to-end transparency | Medium — notification pipeline | Trust through transparency |
| P3 | Minor safety | Legal requirement for under-18 users | High — age-gating + detection | Legal compliance |

---

## 10. Token-level Spec

| Token | Value | Notes |
|---|---|---|
| `moderation.reportCategories` | 12 (spam, harassment, hate_speech, counterfeit, prohibited, off_platform, scam, misinformation, privacy, impersonation, minor_safety, other) | Granular taxonomy |
| `moderation.reportFlow` | Inline sheet, 2-3 taps to submit, optional details | Frictionless |
| `moderation.reportStatus` | submitted → under_review → action_taken / no_action | Trackable |
| `moderation.reportHistory` | User can see all past reports + outcomes | Transparent |
| `moderation.userControl` | block (bidirectional), mute (one-way), restrict (hidden from others) | Three-tier |
| `moderation.appeal` | User can appeal; different moderator reviews; 48-72h SLA; outcome communicated | Procedural fairness |
| `moderation.communityGuidelines` | Publicly accessible, category-specific, plain-language, versioned | The contract |
| `moderation.trustSafetyCenter` | Centralized hub: guidelines, policies, report history, blocked/muted/restricted, safety tools | Discoverability |
| `moderation.proactiveFilter` | Text classification + image hashing + price anomaly + prohibited keywords at listing creation | 60-80% pre-publish block |
| `moderation.prohibitedItems` | Category-specific: weapons, drugs, wildlife, counterfeit, regulated goods | eBay benchmark |
| `moderation.counterfeit` | Image matching + brand complaint flow (VeRO-style) | Brand protection |
| `moderation.sensitiveContent` | Blur/cover, tap-to-reveal, sensitivity label, user-controlled filter | Content safety |
| `moderation.accountTiers` | normal → restricted → shadow-restricted → suspended → banned | Tiered response |
| `moderation.notifications` | Both reporter and affected user notified at each status change | Transparency |
| `moderation.queue` | Admin dashboard: pending reports, flagged listings, appeals, SLA, moderator metrics | Operational backbone |
| `moderation.minorSafety` | Age gates, no adult-to-minor contact, no minor recommendation to adults, CSAM reporting | Legal compliance |
| `moderation.reviewBombing` | Verified-purchase requirement, velocity limits, coordinated-campaign detection | Seller reputation protection |
| `moderation.chatSafety` | Off-platform payment detection, scam urgency detection (already exists) | Chat safety |
| `moderation.buyerProtectionBadge` | Visible on listing cards and checkout | Trust signal |

---

## 11. What "feels AI-made" here, and how to patch it

| AI tell in current state | Patch |
|---|---|
| Only 5 report categories (benchmark is 12+) | Expand to 12 with specific categories |
| No appeal flow | Add AppealScreen with different-moderator review |
| No community guidelines page | Create category-specific, plain-language guidelines |
| No report status tracking | Add status pipeline + report history screen |
| No mute or restrict (only block) | Add three-tier user control |
| No proactive listing moderation | Add automated pre-publish filter |
| No moderation queue dashboard | Build admin/moderator dashboard |
| No tiered account state (binary ban) | Add normal → restricted → suspended → banned |
| No moderation action notifications | Notify both parties at each status change |
| No message-level reporting | Add long-press context menu on chat messages |
| No sensitive content blur | Add blur/cover with tap-to-reveal |
| No review bombing prevention | Add velocity limits + verified-purchase + campaign detection |

**What's already well-built (not AI-slop):**
- `chatSafetyWarnings.ts` — 40+ regex patterns for off-platform payment detection + scam urgency detection — genuinely senior safety engineering
- `ReportScreen.tsx` — structured report flow with categories and descriptions (just needs more categories)
- `BlockedUsersScreen.tsx` — functional block list with search and unblock
- Backend `user_blocks` table with server-side enforcement on follow
- Backend `user_reports` table with real persistence
- `AITrustBadge` / `AITrustSignal` — AI transparency (labeling AI-generated content)
- `aiTruth.ts` — blocks false AI capability claims
- Trust signal components (SellerTrustBadge, ProfileTrustSignals, CoOwnTrustPanel)

The content moderation foundation exists — report flow, block, chat safety warnings, fraud detection, trust signals. The defects are gaps (no appeals, no proactive moderation, no mute/restrict, no community guidelines, no status tracking) rather than foundational failures. The path to flagship is filling the gaps and adding the proactive moderation pipeline, which is the single highest-impact safety improvement.

---

*Generated 2026-08-18 by the ThryftVerse flagship research programme. Live 2026 web benchmark + production codebase audit + psychology + micro/macro prescription. Sources: eBay Global Transparency Report 2025, eBay Reporting Content, TechVinta Trust & Safety Playbook 2026, Shim & Jhaver Procedural Fairness 2026, GetStream Marketplace Content Moderation.*
