# 16 — AI Features & Anti-Patterns: The "AI-Slop" Diagnosis

**Department:** AI agents, bots, AI listings, AI photo enhancement, conversational search, AI preferences, your algorithm, bot builder/directory, AI agent integration
**Status:** Flagship research document — diagnosis and remediation plan
**Date:** August 2026

---

## 1. 2026 Competitor Benchmark — AI UX Best Practices

The 2026 AI UX landscape has matured dramatically. The industry has moved past the "slap an AI label on it" era into a disciplined practice of transparency, calibration, and human control. The following best practices are now table stakes for any flagship product that ships AI features.

### 1.1 Transparency as a default, not a feature

Apple's 2026 Human Interface Guidelines for Generative AI state plainly: "Clearly identify when and where you use AI." This is not a toggle — it is a design obligation. Instagram, Pinterest, and eBay all label AI-generated content inline, not buried in a settings page. Snapchat's AI features carry visible "AI" badges on every generated output. The 2026 Smashing Magazine agentic AI series identifies a "Decision Node Audit" methodology: map every point where the AI makes a probabilistic choice, then surface the right ones to the user — and deliberately keep the rest invisible to avoid noise.

The key insight from Amazon Science's 2026 framework for human-AI coordination is that transparency is not about showing everything — it is about showing the right things at the right moments. "Between the black box and the data dump lies a more thoughtful approach." The framework introduces three dimensions of coordination: **salience** (how prominently AI is presented), **involvement** (what users can do to engage AI), and **activity** (what AI actually does). Flagship products calibrate all three.

### 1.2 Citation and provenance

Google's People + AI Guidebook, updated for 2026, emphasizes that every AI-generated output should carry a visible signal of provenance. Pinterest's 2026 recommendation system shows "Why am I seeing this?" with ranked, source-labeled reasons. Instagram's algorithm transparency dashboard lets users see and adjust the topics that shape their feed. eBay's AI-powered listing tool shows which parts of a listing were AI-generated and which were user-authored. The pattern is consistent: **show the work, not just the result**.

### 1.3 Progressive disclosure of capability

The ideaplan.io 2026 trust research identifies a critical pattern from ChatGPT's design: "Let users discover AI capability incrementally. Do not front-load claims." A product that opens with "I can write code, analyze images, browse the web" is making a trust claim the user cannot verify. A product that lets users discover capabilities through use builds trust through evidence. This is the opposite of the "AI-powered" marketing splash that dominated 2023-2024 products.

### 1.4 Human-in-the-loop patterns

The AppSavvy 2026 human-in-the-loop framework calibrates control based on two axes: **stakes** (how bad is a wrong action) and **volume** (how often it happens). High stakes → more human control. High volume → more automation. The framework defines three patterns:

- **Suggest, don't act** — AI proposes; user accepts, edits, or rejects. The safest default for medium-to-high stakes.
- **Act, with undo** — AI takes the action, but it is easily reversible. Appropriate for lower-stakes actions.
- **Act autonomously, with monitoring** — AI acts without per-action involvement, but humans monitor in aggregate.

The Smashing Magazine agentic AI series adds the **Autonomy Dial** pattern: a UI control that lets users set their preferred level of agent independence, from "Observe & Suggest" to "Act Autonomously." This is not a settings page toggle — it is a visible, in-context control.

### 1.5 Graceful failure and honest uncertainty

The Agent Patterns Catalog's 2026 graceful degradation pattern is clear: "If the product treats every dependency as load-bearing and fails the whole request when any one of them is down, an isolated vendor outage becomes a complete product outage." The solution is per-feature fallback behavior with user-visible degradation messaging. When a vision model fails, the bot falls back to asking the user to describe the image — and tells them so plainly.

The mantlr.com 2026 trust research identifies the single most important pattern: **confidence signals**. "A feature with 95% accuracy and no trust mechanics underperforms a feature with 85% accuracy and well-designed confidence signals, honest uncertainty, and clear undo." Hiding uncertainty makes the AI look confidently wrong when it is wrong, which destroys trust permanently.

### 1.6 The "AI as tool, not magic" framing

The 2026 consensus across Apple HIG, Google PAIR Guidebook, and the CHI 2026 research on LLM rationales is that AI should be presented as a capable tool with known limitations, not as magic. The CHI 2026 study found that "certainty framing shifted trust and decisions even with the same rationale content" — meaning that how you frame confidence matters as much as the actual accuracy. False certainty destroys credibility faster than honest doubt.

### 1.7 How Instagram/Pinterest/eBay/Snapchat use AI in 2026 without slop

- **Instagram**: AI-generated content carries inline labels. The algorithm dashboard shows ranked signals with source labels (explicit, implicit, inferred). Recommendations are framed as "Because you liked X" not "AI thinks you'll like X."
- **Pinterest**: The "Why am I seeing this?" sheet shows ranked reasons with relative weight bars (not percentages). The system honestly labels exploratory recommendations differently from strong matches.
- **eBay**: The AI listing assistant shows which fields were AI-suggested vs. user-entered. The user can accept, edit, or reject each field independently. No field is auto-published without explicit user action.
- **Snapchat**: AI features are scoped to specific contexts (My AI in chat, AI lenses in camera). Each feature has clear boundaries and honest "AI can make mistakes" framing.

---

## 2. Psychology & Principles

### 2.1 Trust calibration

The 2026 design psychology consensus, grounded in Google's PAIR Guidebook and the NIST AI Risk Management Framework, is that the goal is not maximum trust — it is **calibrated trust**. Users should trust the AI for tasks where it genuinely performs well and override it in domains where it does not. Getting this right requires the user to have an accurate mental model of the AI's capabilities and limitations. Building that mental model is a design problem, not a technical one.

The risk is bidirectional. **Over-trust** (automation bias) leads users to accept wrong outputs without verification. **Under-trust** leads users to ignore genuinely useful assistance. The 2026 CHI study on LLM rationales found that "correct rationales and certainty cues increased trust, decision confidence, and AI advice adoption, whereas incorrect rationales and uncertainty cues reduced them" — but critically, "confidence framing can amplify persuasion and miscalibrate trust when it is not aligned with actual reliability." This means that displaying high confidence when the system is actually unreliable is worse than displaying no confidence at all.

### 2.2 The uncanny valley of AI text

AI-generated text that is *almost* right but subtly wrong triggers a specific distrust response. Users who have been exposed to ChatGPT, Claude, and other LLMs for 2+ years have developed a refined sensitivity to AI-generated prose. The "AI-slop" telltale signs — overly formal phrasing, hedging language, generic descriptors, the absence of specific detail — are now instantly recognizable to a large segment of users. When a marketplace listing description reads as AI-generated, the buyer's trust in the seller drops. The item feels less real, less cared-for, less likely to match the description.

This is the core of the "AI-slop" problem for ThryftVerse: it is not just that AI features feel low-quality. It is that AI-generated content *contaminates* the human trust that a marketplace depends on. A listing with an AI-generated description is less trustworthy than one with a messy, human-written description — because the human description signals that a real person handled this item.

### 2.3 Automation bias and the "is this real?" doubt

The 2026 Amazon Science framework identifies a key psychological state: the user who cannot tell whether an action was taken by a human or by AI. This "is this real?" doubt is corrosive. When a user sees a suggested reply in chat and cannot tell if it was generated by AI or written by the other person, trust in the entire conversation degrades. When a user sees a "confidence: 85%" badge and does not know what that number means or how it was derived, the badge is worse than no badge at all.

The Smashing Magazine 2026 series frames this as the difference between **absent AI** (too invisible), **intrusive AI** (too prominent), and **appropriately calibrated AI**. The goal is the third state: the user always knows when AI is involved, can see what it did, and can intervene.

### 2.4 Honest capability signaling

The mantlr.com 2026 research is unambiguous: "Missing or hidden uncertainty is worse than imperfect but visible uncertainty." The design implication is that every AI output must carry a visible signal of how confident the system is — and that signal must be honest. A confidence badge that always says "High confidence" is worse than no badge. A confidence badge that says "Low confidence — please review" builds trust because it is honest.

The 2026 "Optical Honesty" framework from versions.com takes this further: "The interface should be only as 'finished' as the underlying certainty merits. Provisional material should feel provisional — legible as draft, incomplete, or requiring human review." A suggestion should not look like a conclusion. A draft should not look like a published result. Visual solidity should grow as human review becomes substantive.

### 2.5 Progressive trust

The ideaplan.io 2026 trust research identifies a three-phase trust lifecycle: **initial trust** (enough to try the feature), **calibrated trust** (adjusted based on real experience), and **maintained skepticism** (catching errors instead of propagating them). Each phase requires different design support:

- **Initial trust**: Low-stakes entry points, clear scope, honest framing of what the AI can and cannot do.
- **Calibrated trust**: Confidence signals, source citations, undo/revert, feedback mechanisms.
- **Maintained skepticism**: Audit trails, activity ledgers, the ability to inspect what the AI did and when.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Pervasive demo mode — the app is essentially a mock-up

The most systemic defect is that nearly every AI feature runs in demo mode, gated by `__DEV__`. A grep for `DEMO_MODE` across `frontend/src` returns **33 files** with matches. In production (`__DEV__ = false`), these features either return honest "unavailable" states or silently do nothing. The result is that the entire AI feature surface is a development-time simulation that will not function for real users.

Key demo-mode flags:
- `CONVERSATIONAL_SEARCH_DEMO_MODE = __DEV__` (`conversationalSearchApi.ts:93`)
- `AI_PHOTO_DEMO_MODE = __DEV__` (`aiPhotoEnhancementApi.ts:82`)
- `ALGORITHM_DEMO_MODE = __DEV__` (`algorithmTransparencyApi.ts:123`)
- `CHAT_AGENTS_DEMO_MODE = __DEV__` (`chatAgentsApi.ts:36`)
- `AI_PREFERENCES_DEMO_MODE = __DEV__` (`AIPreferencesScreen.tsx:45`)
- `SMART_SELL_DEMO_MODE` (`smartSellApi.ts`)

This is not a single-file problem — it is the architectural reality of the AI layer. The services are "mock-ready" (function signatures mirror a real backend), but no backend is wired. The user who installs the production app will find that every AI feature is either disabled or shows a "Demo mode" banner.

### 3.2 "Full AI coming soon" — direct §11 violation

`ConversationalSearchScreen.tsx:580` contains the text:

> "AI search is in demo mode — using keyword matching. Full AI coming soon."

AGENTS.md §11 is explicit: "Never expose controls that only produce 'Coming soon', 'Backend required', or generic explanation toasts." This banner is a direct violation. The screen should either honestly label the current capability ("Keyword-based search" without the "coming soon" promise) or be disabled until a real backend exists.

### 3.3 AI Photo Enhancement — fake before/after comparison

`AIPhotoEnhancementScreen.tsx` presents a full photo enhancement UI with options (background removal, AI shadows, auto-crop, color correction, background replacement, lighting fix), presets, and a background scene picker. The user selects an enhancement, taps "Apply," sees a processing overlay, and then sees an "After (Demo)" label.

But the service (`aiPhotoEnhancementApi.ts:8-10`) is honest in its comments: "The mock is truthful. It does NOT fabricate enhanced images. When `AI_PHOTO_DEMO_MODE` is true, every function returns the ORIGINAL image URI with `isDemo: true`."

The screen even labels the preview "After (Demo)" (`AIPhotoEnhancementScreen.tsx:318`) and the accessibility label says "Enhanced photo preview (demo — no changes applied)" (line 298). The applied message says "Demo: No changes were made to your image. Connect the AI service to enable real enhancement." (line 536).

**The defect**: The user is presented with a full-featured enhancement studio — six enhancement options, a presets rail, a background scene picker grid with thumbnail images — and after going through the entire interaction, nothing happened. The "before" and "after" are the same image. This is a prototype masquerading as a feature. Even with the demo banner, the interaction design implies capability that does not exist. The user who spends 30 seconds selecting a background scene and tapping "Apply" has wasted their time.

### 3.4 AI Powered Listing — filename-based "AI" suggestions

`AIPoweredListingScreen.tsx` is titled "AI Quick List" (line 448) with the subtitle "Snap photos · review · publish." The screen uses `useAIListingSuggestion` which calls `analyzeListingImages` in `aiListingApi.ts`. The service comment (lines 9-14) is honest:

> "The current implementation is a *heuristic/mock* service. It derives plausible suggestions from image filenames/metadata — it does NOT perform real image recognition. The confidence score is intentionally low (0.3–0.5) to honestly communicate uncertainty."

The screen does show a confidence banner: "Suggestions — review before publishing" with "Confidence {confidencePct}% · heuristic preview, not image recognition" (lines 539-543). This is truthful labelling. But the screen is still called "AI Quick List" — the title itself overpromises. The user sees "AI Quick List" and expects AI-powered image recognition (as Tilt Snap and Facebook Marketplace provide). What they get is filename parsing.

The `SMART_SELL_DEMO_MODE` banner (line 457-464) says "Demo Mode — AI suggestions are illustrative and not sent to a backend." After publishing, a toast says "Smart Sell enabled (demo) — Auto-negotiation settings are illustrative." (lines 363-367). The truthfulness is present in the microcopy, but the feature name and the entire interaction flow imply a capability that does not exist.

### 3.5 Conversational Search — keyword matching labeled as "AI search"

`ConversationalSearchScreen.tsx` presents a chat interface titled "Ask ThryftVerse" (line 561). The user types natural-language queries and receives assistant responses with filter chips, match counts, and refinement suggestions. The `AITrustSignal` component shows confidence levels and "Matched keywords" labels.

The service (`conversationalSearchApi.ts:10-14`) is honest: "The mock does NOT claim to use a real LLM / GPT / ChatGPT. Filter extraction uses simple, honest keyword matching." The confidence is derived from the number of matched keywords (line 252-253): "3+ matches = high, 1–2 = medium, 0 = low."

**The defect**: The chat UI with typing indicators, assistant bubbles, and "Refine" suggestions creates the strong impression of a conversational AI. The user types "Vintage denim under £50" and gets a response that looks like ChatGPT — but it is deterministic keyword matching. The demo banner says "using keyword matching" but the interaction design screams "AI chatbot." This is the definition of AI-slop: the surface implies a capability the system does not have.

### 3.6 Your Algorithm — mock data with real interaction

`YourAlgorithmScreen.tsx` shows a full algorithm transparency dashboard: active topics, signals, last updated timestamp, expandable topic rows with weight controls (low/medium/high), recent signals, and an "Add a topic" form. The demo banner says "Algorithm data is illustrative in demo mode." (line 278).

The service (`algorithmTransparencyApi.ts:12-14`) carries mock data with `isDemo: true` flags. The user can adjust topic weights, remove topics, and add new ones — but in demo mode, these operations update an in-memory session profile that has no effect on any real feed.

**The partial defense**: The `FeedExplanationSheet` component (`algorithm/FeedExplanationSheet.tsx`) is a genuine trust pattern — "Why am I seeing this?" with ranked reasons, source labels, and confidence labels. This is the right design. The problem is that the data behind it is fabricated. A trust surface with fake data is worse than no trust surface at all, because it teaches the user that transparency is performative.

### 3.7 AI Preferences — local-only state labeled as preferences

`AIPreferencesScreen.tsx` presents six feature toggles (listing suggestions, photo enhancement, search autocomplete, chat agents, auto-negotiate, confidence indicators) plus a master control. The demo banner says "Preferences are saved on this device only in demo mode." (line 107).

The state is `React.useState` with no persistence — the comment on line 52 says "Local preference state — persisted to AsyncStorage in a real implementation" but no AsyncStorage call exists. The toggles reset on app restart. The data usage section (lines 227-229) says "In demo mode this data stays on your device and is never sent to a server" — which is technically true because nothing is sent anywhere, ever.

### 3.8 Bot Builder — real provider integration, but gated behind user API keys

`BotBuilderScreen.tsx` is the one AI surface that has real integration. It calls `getConnectedProviders()` and `discoverModels()` from `aiProviderApi.ts`, which perform real provider round-trips (GET /models). The `testApiKey` function in `AIAgentIntegrationScreen.tsx` performs a real provider round-trip (line 193). The `AIAgentIntegrationScreen.tsx` has `AI_PROVIDER_DEMO_MODE = false` (line 74) — demo mode is explicitly disabled.

This is the flagship pattern: the user brings their own API key, the app verifies it with a real round-trip, discovers real models, and the bot builder uses real provider configuration. The `BotDirectoryScreen.tsx` uses `fetchAiCapability()` from `aiTruthApi.ts` to honestly label the directory subtitle: "AI specialists" when a provider is configured, "Heuristic specialists" on baselines, "Assistant unavailable" when nothing is wired (lines 69-75).

**The remaining defect**: The bot builder creates agents with instructions, tone, response length, trigger mode, and capability grants — but the actual agent runtime (generating responses using the connected model) is not visible in these screens. The `chatAgentsApi.ts` has `CHAT_AGENTS_DEMO_MODE = __DEV__` — in production, agent functions "return honest 'unavailable' states instead of fabricated AI output" (line 7). So the user can configure a bot with a real API key, but when they deploy it to a chat, it will not respond unless the runtime is wired.

### 3.9 Agent Activity — honest but empty

`AgentActivityScreen.tsx` is a genuine trust pattern: a viewable ledger of material agent actions. The empty state is truthful: "No agent activity yet" (line 165). The clear action genuinely removes persisted entries. The entries are real records from the ledger service — never fabricated.

**The problem**: In production with no AI runtime, the ledger will always be empty. The screen is well-designed but there is nothing to show. This is not a defect in the screen — it is a symptom of the larger problem: the AI runtime does not exist.

### 3.10 AITrustBadge and AITrustSignal — right pattern, wrong context

The `AITrustBadge` and `AITrustSignal` components (`components/ai/`) are well-designed trust primitives. They implement five 2026 trust patterns: confidence signal, source citation, easy undo, visible context, and progressive disclosure. They use qualitative confidence levels (high/medium/low/exploratory) instead of raw percentages. They show "Demo" suffixes when `isDemo` is true.

**The problem**: These components are attached to outputs from demo-mode services. A "High confidence" badge on a keyword-matched search result is not honest — it is a well-designed component displaying a fabricated confidence level. The component is correct; the data feeding it is not.

---

## 4. Micro Improvements — Per-Feature Truthfulness

### 4.1 ConversationalSearchScreen: Remove "coming soon", rename the feature

- **Remove** the "Full AI coming soon" text (line 580). Replace with: "Keyword-based search — filters are matched from your words, not AI inference."
- **Rename** the header from "Ask ThryftVerse" to "Search with words" or "Natural-language search" — drop the AI chatbot framing entirely.
- **Remove** the typing indicator (`TypingIndicator` on line 399). A typing indicator implies a generative model thinking. Keyword matching is instant — show results immediately.
- **Replace** the `AITrustSignal` confidence with an honest match-strength indicator: "3 filters matched" instead of "High confidence."

### 4.2 AIPhotoEnhancementScreen: Disable or gate behind a real provider

- **If no provider is connected**: Replace the entire enhancement studio with an honest empty state: "Photo enhancement requires an AI provider. Connect one in Settings → Connections." Do not show the options rail, presets, or scene picker.
- **If a provider is connected**: Wire the `applyEnhancement` function to a real image processing API (Photoroom, Cloudinary AI, or the connected provider's vision model). Only then show the full studio.
- **Remove** the "After (Demo)" label and the fake before/after comparison. If the enhancement is real, show the real result. If it is not real, do not show the comparison UI at all.

### 4.3 AIPoweredListingScreen: Rename and reframe

- **Rename** from "AI Quick List" to "Quick List" or "Smart Listing." The "AI" prefix promises image recognition that does not exist.
- **Change** the confidence banner from "heuristic preview, not image recognition" to the primary framing: "Suggestions based on photo filenames — please review and edit before publishing."
- **Keep** the heuristic suggestions — they are useful as a starting point. But frame them as "auto-fill suggestions" not "AI suggestions."

### 4.4 AIPreferencesScreen: Persist or disable

- **Either** wire the toggles to AsyncStorage so they actually persist (and actually control the corresponding features), **or** replace the toggle UI with an honest explanation: "Assisted features will be available when AI providers are connected."
- **Remove** the "Auto-negotiate offers" toggle if there is no negotiation engine behind it. A toggle for a non-existent feature is a §11 violation.

### 4.5 YourAlgorithmScreen: Gate behind real data

- **If no personalization backend exists**: Replace the dashboard with an honest explanation: "Your feed is currently based on general popularity. Personalization will be available when more data is collected."
- **If a personalization backend exists**: Wire `fetchAlgorithmProfile` to real data. Remove the demo banner. The dashboard design is flagship-quality — it just needs real data.

### 4.6 BotDirectoryScreen: Maintain the honest labeling

- The `aiTruthApi` capability labeling is the right pattern. Maintain it. When no provider is connected, the subtitle "Assistant unavailable on this deployment" is honest and correct.
- **Add** a CTA in the empty/unavailable state: "Connect an AI provider in Settings → Connections to enable agents."

### 4.7 AgentActivityScreen: Maintain the honest empty state

- The empty state is correct. Do not fabricate activity. When the AI runtime is wired, real activity will appear.
- **Add** a contextual hint in the empty state: "Deploy an agent to a chat from the Agents directory to see activity here."

---

## 5. Macro Improvements — AI Architecture

### 5.1 The truthful-AI contract

Every AI feature in ThryftVerse must satisfy one of these conditions — no exceptions:

1. **Real AI**: The feature calls a real model (user-supplied provider key or ThryftVerse-hosted model) and displays real output. Confidence signals reflect actual model confidence.
2. **Honest heuristic**: The feature uses deterministic logic (keyword matching, filename parsing, rule-based scoring) and is labeled as such — never as "AI." The label says "Smart suggestions" or "Auto-fill," not "AI suggestions."
3. **Honestly disabled**: The feature is not available and the UI says so clearly, with a path to enable it ("Connect a provider in Settings").

The current codebase oscillates between conditions 1 and 3 but labels everything as "AI." This is the root cause of the AI-slop diagnosis.

### 5.2 Capability labeling system — extend aiTruthApi

The `aiTruthApi.ts` already defines a three-level capability system: `provider_backed`, `heuristic_baseline`, `unavailable`. This is the right architecture. It should be extended to cover every AI surface:

- **Conversational search**: Label as "keyword search" when `heuristic_baseline`, "AI search" when `provider_backed`, "Search unavailable" when `unavailable`.
- **Photo enhancement**: Label as "manual editing tools" when `heuristic_baseline`, "AI enhancement" when `provider_backed`, disabled when `unavailable`.
- **Listing suggestions**: Label as "auto-fill suggestions" when `heuristic_baseline`, "AI listing assistant" when `provider_backed`.
- **Algorithm transparency**: Gate entirely behind `provider_backed` — a transparency dashboard with fake data is worse than none.

### 5.3 Human-in-the-loop patterns — calibrate by stakes

Apply the AppSavvy 2026 framework:

| Feature | Stakes | Pattern |
|---------|--------|---------|
| Listing suggestions | Medium (wrong info on a listing) | Suggest, don't act — user reviews each field |
| Photo enhancement | Low (easily reverted) | Act, with undo |
| Chat agent replies | Medium (sent to another person) | Suggest, don't act — user reviews before sending |
| Auto-negotiate offers | High (money) | Suggest, don't act — user approves every offer |
| Agent deployment | Medium (agent joins a chat) | Confirm before deployment (already implemented) |
| Topic removal from algorithm | Low (affects only feed) | Act, with undo |

The current `BotBuilderScreen.tsx` already implements a sophisticated capability grant system with risk levels (low/medium/high/critical) and approval modes. This is flagship-quality human-in-the-loop design. It should be the template for all AI features.

### 5.4 When to hide vs. expose AI

The 2026 Amazon Science framework's salience dimension provides the answer:

- **Hide AI when**: The feature is a background optimization (feed ranking, search relevance) that the user does not need to think about. Show it only in a transparency dashboard.
- **Expose AI when**: The feature generates content the user will share (listing descriptions, chat replies, photos). The user must know it is AI-generated so they can take responsibility for it.
- **Never expose AI when**: There is no AI. Do not label heuristic features as AI. Do not show "AI" badges on keyword-matched search results.

### 5.5 Graceful degradation architecture

Implement the Agent Patterns Catalog graceful degradation pattern at the service layer:

- When a provider is down, fall back to heuristic mode and tell the user: "AI is temporarily unavailable — showing keyword-based results."
- When a vision model fails, fall back to manual entry: "Couldn't analyze your photo — please enter the details manually."
- When the agent runtime is unavailable, show "Agent paused — provider connection needed" in the chat, not a silent failure.

### 5.6 The activity ledger as a trust foundation

The `AgentActivityScreen` and `agentActivityLedger` service are the right pattern. Every material AI action should be recorded: agent deployed, agent removed, tool called, offer drafted, listing suggestion accepted/rejected. This creates an audit trail that supports the "maintained skepticism" phase of the trust lifecycle. Extend the ledger to record listing suggestion acceptances and photo enhancement applications, not just agent actions.

---

## 6. Flagship Acceptance Criteria

Every AI feature must satisfy **all** of these criteria. No exceptions.

### 6.1 The "real or disabled" rule

> Every AI feature either does real AI (calls a real model and displays real output) or is honestly disabled (shows a truthful unavailable state with a path to enable it). **Never fake.**

- No demo-mode banners in production. Demo mode is a development tool, not a user-facing state.
- No "After (Demo)" labels. If the enhancement is not real, the UI does not exist.
- No "Full AI coming soon" text. If the feature is not ready, it is not shipped.

### 6.2 The labeling rule

> Every AI surface is labeled with its actual capability level from `aiTruthApi`. Heuristic features are never labeled "AI."

- `provider_backed` → "AI-powered" labeling is allowed
- `heuristic_baseline` → "Smart" or "Auto" labeling only — never "AI"
- `unavailable` → Feature is disabled with an honest explanation

### 6.3 The confidence rule

> Every AI-generated output carries an honest confidence signal. Confidence reflects actual model reliability, not a hardcoded value.

- No `confidence="high"` on keyword-matched results.
- No `confidenceScore: 0.85` on filename-parsed suggestions.
- Confidence signals are derived from actual model metadata or honest heuristics with visible methodology.

### 6.4 The human-in-the-loop rule

> Every AI action that affects content shared with other users (listings, chat messages, offers) requires explicit user review before it is published.

- AI listing suggestions are drafts until the user taps "Publish."
- AI chat replies are suggestions until the user taps "Send."
- AI offer negotiations are proposals until the user taps "Approve."
- No AI action auto-publishes content that another user will see.

### 6.5 The undo rule

> Every AI action that modifies user content can be undone with one tap.

- Photo enhancement: "Revert" button (already implemented in `AIPhotoEnhancementScreen.tsx`).
- Listing suggestions: "Clear suggestions" or field-level revert.
- Topic removal from algorithm: "Undo" via the activity ledger.
- Agent deployment: "Remove from chat" (already implemented in `BotDetailScreen.tsx`).

### 6.6 The audit rule

> Every material AI action is recorded in the agent activity ledger.

- Agent deployed, agent removed, all_agents_paused (already recorded).
- Add: listing_suggestion_accepted, listing_suggestion_rejected, photo_enhancement_applied, offer_auto_drafted.

### 6.7 The no-slop copy rule

> No user-facing copy in the production app contains AI-slop tells: "AI-powered" without real AI, "coming soon," "demo mode," "illustrative only," or generic AI marketing language.

- Grep the production bundle for these phrases. Zero matches is the acceptance bar.
- Feature names do not contain "AI" unless the feature calls a real model.

---

## 7. Priority & Sequencing

### Phase 1 — Stop lying (Week 1-2, P0)

**Goal**: Remove every false AI claim from the production app. The app either does real AI or honestly says it does not.

1. **Remove "Full AI coming soon"** from `ConversationalSearchScreen.tsx:580`. Replace with honest keyword-search labeling. (1 hour)
2. **Rename "AI Quick List"** to "Quick List" in `AIPoweredListingScreen.tsx:448`. (30 min)
3. **Gate AIPhotoEnhancementScreen** behind a connected provider. If no provider, show honest empty state instead of the fake enhancement studio. (4 hours)
4. **Remove typing indicator** from `ConversationalSearchScreen.tsx`. Keyword matching is instant. (1 hour)
5. **Audit all `DEMO_MODE` flags**: Ensure every flag that gates on `__DEV__` produces an honest "unavailable" state in production, not a silent no-op. (1 day)
6. **Remove "Auto-negotiate offers" toggle** from `AIPreferencesScreen.tsx` if no negotiation engine exists. (30 min)

### Phase 2 — Honest labeling (Week 2-3, P1)

**Goal**: Every AI surface displays its actual capability level via `aiTruthApi`.

1. **Extend `aiTruthApi`** to cover conversational search, photo enhancement, listing suggestions, and algorithm transparency. (2 days)
2. **Wire `BotDirectoryScreen`'s capability labeling pattern** to every AI screen — the subtitle changes based on `capabilityLevel`. (1 day)
3. **Replace `AITrustSignal` confidence values** with honest, methodology-derived values. No hardcoded "high" on keyword matches. (1 day)
4. **Reframe `YourAlgorithmScreen`** as "Coming when data is available" when no personalization backend exists, not "demo mode." (1 day)

### Phase 3 — Real AI wiring (Week 3-6, P2)

**Goal**: Connect real AI backends to the features that are architecturally ready.

1. **Wire conversational search** to a real LLM via the user's connected provider (or a ThryftVerse-hosted model). The service signatures are already correct. (3 days)
2. **Wire photo enhancement** to a real image processing API (Photoroom, Cloudinary, or provider vision model). (3 days)
3. **Wire listing suggestions** to a real vision model for image recognition. Replace filename parsing with actual image classification. (5 days)
4. **Wire the agent runtime** so that deployed bots actually generate responses using the connected provider. (5 days)
5. **Wire algorithm transparency** to a real personalization backend. The dashboard design is flagship-quality — it needs real data. (5 days)

### Phase 4 — Trust polish (Week 6-8, P3)

**Goal**: Every AI feature has the full 2026 trust pattern suite.

1. **Add the Autonomy Dial** to agent settings — let users choose between "Suggest only," "Act with approval," and "Act autonomously" per agent. (2 days)
2. **Extend the activity ledger** to record listing suggestion acceptances, photo enhancements, and offer drafts. (1 day)
3. **Add "Why this?" explainers** to every AI suggestion, using the `AITrustSignal` progressive disclosure pattern. (2 days)
4. **Add graceful degradation messaging** to every AI service — visible "AI temporarily unavailable" states with heuristic fallback. (2 days)
5. **Implement Optical Honesty** — AI suggestions visually differ from user-authored content (draft styling, provisional appearance). (2 days)

### Summary

The AI-slop diagnosis is not a visual design problem — it is a truthfulness problem. The codebase has well-designed trust primitives (`AITrustBadge`, `AITrustSignal`, `AgentActivityScreen`, the `aiTruthApi` capability system, the `BotBuilderScreen` risk-grant framework) attached to services that fabricate their outputs. The fix is not to redesign the trust components — it is to make the data flowing through them honest. Every AI feature either does real AI or is honestly disabled. There is no third option.

---

*References: Apple HIG Generative AI (2026), Google PAIR Guidebook (2026), Smashing Magazine Agentic AI Series (Feb-May 2026), Amazon Science Human-AI Coordination Framework (2026), CHI 2026 LLM Rationales Study, mantlr.com AI Trust Patterns (2026), Lazarev.agency AI UX Patterns (2026), Agent Patterns Catalog Graceful Degradation (2026), versions.com Optical Honesty (2026), ideaplan.io Trust Patterns (2026), AppSavvy Human-in-the-Loop UX (2026).*
