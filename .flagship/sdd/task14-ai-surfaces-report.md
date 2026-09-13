# Task 14 (F16) — AI Capability Surfaces: Truthful Presentation Report

## Summary

The repo has already undergone a "P0-9 AI/ML truth" hardening pass: the backend
exposes an honest capability contract (`/ai/health`, `/ai/capability`,
`/ai/labels`, `/ai/guards`, `/ai/classify-image` → 501) and most frontend AI
surfaces consume it correctly. The remaining defects were concentrated in four
places: a static compliance disclosure that fabricated ML capabilities, a
settings screen whose feature toggles write to AsyncStorage but are read by
nothing, a vague "AI Listing Assist" banner on the sell flow, and a support
chat header that claimed "AI assistant" after human handoff.

**Result: tsc --noEmit → 0 errors. 25/25 AI-truth unit tests pass.**

---

## AI surfaces found and their state

| Surface | File(s) | State before fix |
|---|---|---|
| Listing suggestions ("Quick list") | `screens/AIPoweredListingScreen.tsx`, `services/aiListingApi.ts`, `hooks/useAIListingSuggestion.ts` | Honest. Filename/seller-hint heuristics with per-field evidence, explicit accept/dismiss, dirty-field protection, condition always abstains for seller attestation, backend `/listing-intelligence/run` first with local fallback. No change needed. |
| Photo enhancement | `screens/AIPhotoEnhancementScreen.tsx`, `services/aiPhotoEnhancementApi.ts` | Honest. Fail-closed on `GET /media-enhancement/capabilities`; honest unavailable/error/outcome_unknown states; C2PA-style provenance labels (`standard_editing` / `ai_assisted` / `ai_generated`); before/after review with revert. No change needed. |
| Visual search | `screens/VisualSearchScreen.tsx` | Honest. Comments and behaviour make clear the backend is a colour/text heuristic, not image AI; filter-only fallback labelled "offline"/"partial"; saved-search alerts disabled because the visual query is not retained. No change needed. |
| Conversational search | `screens/ConversationalSearchScreen.tsx`, `services/conversationalSearchApi.ts`, `i18n conversationalSearch` | Honest. "Keyword matching" demo banner shown only when messages are actually `isDemo`; trust signal derived from matched-keyword count, never a fake percentage. No change needed. |
| Agent directory / studio | `screens/BotDirectoryScreen.tsx`, `screens/AIAgentIntegrationScreen.tsx` | Honest. Directory consumes `/ai/capability` ("AI specialists" only when provider-backed). Studio verifies keys via real provider round-trip, distinguishes server connections from device-local discovery keys. No change needed. |
| Agent builder | `screens/BotBuilderScreen.tsx` | Honest. Model picker scoped to the backend `agentConfigSchema` catalogue; planned capabilities marked "Coming soon — not yet available on this deployment"; risk-tiered permission labels. No change needed. |
| Chat agents + suggested replies | `components/chat/ChatAgentPicker.tsx`, `components/chat/SuggestedRepliesBar.tsx`, `services/chatAgentsApi.ts`, `hooks/chat/useConversationAgents.ts` | Honest. Picker uses real `/bots` + deployment APIs with error/retry; suggestions are tap-to-fill (reviewable); demo catalogue is `__DEV__`-gated and returns honest empty/unavailable in production. No change needed. |
| Smart Sell (offer automation) | `components/sell/SmartSellCard.tsx`, `services/smartSellApi.ts` | Honest. Explicit `unavailable`/`preview`/`active` capability; "preview — settings activated when the feature is fully available" messaging end-to-end. No change needed. |
| Catalog extraction | `components/catalogImport/*`, `hooks/useExtractionCandidates.ts`, backend `extractionIntelligenceService.ts` | Honest. User-triggered only; factual source labels ("From text in photo", never "AI-powered"); `unavailable_no_model` → "Extraction unavailable"; accept/edit/reject per candidate. No change needed. |
| Creator effects / stickers / cutout | `creator/tools/effects/*`, `creator/tools/stickers/*`, `creator/CreatorCutoutSheet.tsx`, `creator/InstantCutSheet.tsx` | Honest. Sheet titled "Effects" (not "AI Effects"); "ML"/"AI" badges rendered only when `isMLAvailable()` is true, else "Filter" fallback with an accessibility hint; cutout explicitly described as manual trace-crop; Instant Cut is deterministic layout auto-compose. No change needed. |
| Message translation / voice transcription | `services/messageTranslation.ts`, `hooks/useMessageTranslation.ts`, `components/chat/VoiceTranscriptionPanel.tsx` | Honest. Real `/chat/translate` endpoint; "Translation unavailable · Retry" recovery; transcription surfaces real failure reasons. No change needed. |
| Feed explanation | `components/algorithm/FeedExplanationSheet.tsx` | Honest. "Demo mode — illustrative data" pill gated on `getAlgorithmDemoMode()`. No change needed. |
| Trust signals | `components/ai/AITrustBadge.tsx`, `AITrustSignal.tsx` | Honest. Qualitative confidence only, "Demo" suffix when `isDemo`. No change needed. |
| Conversation safety | `hooks/chat/useConversationSafety.ts` | Platform-owned heuristics, explicitly works with no AI connection. No change needed. |
| **AI transparency disclosure** | `platform/compliance/AITransparencyDisclosure.tsx` | **Fixed** — see below. |
| **AI preferences** | `screens/AIPreferencesScreen.tsx` | **Fixed** — see below. |
| **Sell-screen AI banner** | `screens/SellScreen.tsx` + `i18n/index.ts` keys | **Fixed** — see below. |
| **Support conversation header** | `screens/SupportConversationScreen.tsx` | **Fixed** — see below. |

---

## Changes made

### 1. `frontend/src/platform/compliance/AITransparencyDisclosure.tsx`

This EU-AI-Act disclosure hardcoded capability claims that contradict the
backend contract:

- **Search** — claimed "ranked using a machine learning model". The backend
  (`routes/discovery.ts` `scoreAndRank`) is a deterministic weighted heuristic
  (`0.40 * titleRelevance + quality + …`). Retitled "Search Ranking" with a
  description that says exactly that; removed the unverifiable "Click-through
  data" processing claim.
- **Image labeling** — claimed "on-device ML Kit" tagging. No on-device ML
  exists for this; `/ai/classify-image` returns 501 by hard guard, and listing
  hints are photo-file-name heuristics. Retitled "Photo Detail Hints",
  description now states no image recognition is used and suggestions are
  always reviewable.
- **Price predictions** — claimed "AI-generated price predictions" for Co-Own
  assets. No such feature exists (`AssetDetailScreen` explicitly uses the last
  settled distribution, "not a forecast"). Retitled "Price Guidance" describing
  settled-history / resale-average reference ranges.
- **Fraud detection** — tightened to "rules-based checks … flagged for human
  review — no automated system takes action on your account on its own",
  matching the backend rule engine + shadow-ML that never enforces
  (`lib/fraudDetection.ts`, `fraudShadowScoring.ts`).
- Removed `image-labeling` and `price-prediction` from the default
  `ALL_FEATURES` list — they are not AI features that exist on this
  deployment. Their `FeatureInfo` entries remain (with the honest copy above)
  for any caller that passes them explicitly.
- Header subtitle "ThryftVerse uses artificial intelligence to enhance your
  experience" → "automated systems — and, where configured, an AI provider".
- Section label "AI Features We Use" → "Automated and assisted features".

### 2. `frontend/src/screens/AIPreferencesScreen.tsx`

- The six feature toggles persist to `AsyncStorage` under `AI_PREFS_KEY` and
  are read by **no other code** — they are device-local in every build. The
  honesty banner was gated on `__DEV__`, so production users saw a settings
  page implying live feature control with no disclaimer. The notice is now
  rendered unconditionally: "Preferences are saved on this device. Some
  features are in preview and may not respond to these settings yet."
- Removed the now-unused `AI_PREFERENCES_DEMO_MODE = __DEV__` constant.
- "Auto-negotiate offers — Allow agents to negotiate offers on your behalf"
  overclaimed: Smart Sell is a deterministic floor-price policy in preview,
  not an agent negotiating. Retitled "Offer auto-accept rules" with subtitle
  "Preview — save a floor price for incoming offers; rules are not applied to
  live offers yet".
- "Data usage" copy claimed "In demo mode this data stays on your device" —
  false framing in production builds. Rewritten to describe the real split:
  server assistant when configured, on-device signals (e.g. photo file names)
  otherwise, and that toggles record a device preference.

### 3. `frontend/src/i18n/index.ts` (SellScreen banner copy)

- `listing.create.aiAssist`: `'AI Listing Assist'` → `'Listing suggestions'`.
- `listing.create.aiAssistDesc`: `'Smart suggestions from your photos —
  titles, brands, and fair pricing.'` → `'Hints from your photo file names —
  title, brand and category. Review before applying.'`
  The old copy overclaimed twice: "Smart suggestions from your photos" (the
  `useListingAutofill` hook is a filename-keyword heuristic that does no image
  recognition) and "fair pricing" (autofill produces no pricing at all).

### 4. `frontend/src/screens/SupportConversationScreen.tsx`

- Header subtitle was hardcoded `"AI assistant"` regardless of conversation
  ownership — it kept claiming an AI was answering after human handoff or
  closure. Now derived from `ownershipState`: `ai_active` → "AI assistant";
  `human_queued` → "Waiting for a specialist"; `human_active` and
  `awaiting_customer` (set by human operators in `routes/operatorSupport.ts`)
  → "Support specialist"; `resolved`/`closed` → "Resolved". Per-message
  `agent_ai` → "AI assistant" labelling was already accurate (the backend only
  writes `agent_ai` when a provider actually responded; provider failure
  writes a `system` fallback and queues a human).

---

## Verification

- `node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` →
  **0 `error TS` lines**.
- `npx vitest run src/__tests__/aiTruthLabels.test.ts
  src/__tests__/aiProviderHardening.test.ts` → **25/25 pass**.
- No visual layout changes, no new features, no navigation/analytics/haptics
  changes, no `components/coown/` files touched. All edits are copy/label and
  one derived-subtitle change.

## Concerns / notes for the parent agent

1. `AIPreferencesScreen` toggles remain non-functional (nothing reads
   `AI_PREFS_KEY`). The fix makes the presentation honest, but wiring the
   preferences into the actual surfaces is a feature change and was out of
   scope.
2. `AITransparencyDisclosure` is exported but **not mounted anywhere** in the
   app (only re-exported via `platform/compliance/index.ts`). Its "Manage
   personalisation settings" / "Opt out of AI features" controls use
   `Linking.openURL('app://…')` deep links that have no registered handler —
   dead interactions if the sheet is ever mounted. Flagging, not fixing.
3. `i18n/index.ts` still contains legacy `aiListing.*` keys (e.g.
   `aiListing.confidence.subtitle` with "Confidence {percent}%") that are
   unused by the current screen. Left in place — unused keys are inert, and
   the retained copy is itself honest ("heuristic preview, not image
   recognition").
4. `useConversationAgents` still marks itself a "demo-mode service"; in
   production (`!__DEV__`) `chatAgentsApi` returns honest empty states, so no
   fabricated agents reach the UI. No change needed.
