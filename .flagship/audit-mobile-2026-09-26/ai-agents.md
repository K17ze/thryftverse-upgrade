# Audit — AI / Agents / Bots (mobile) — 2026-09-26

## Verdict
This is the most honest department audited: photo enhancement is fail-closed with real before/after and provenance, listing suggestions abstain rather than fabricate, the ledger is server-backed with approval gates and run traces, and device keys do real provider round-trips. Mobile is actually richer than web on approvals/traces — but web now leads on algorithm tuning breadth, ledger filtering, and risk-tiered permission display, and one optimistic-update bug lets the UI claim a feed weight that never persisted.

## Findings

### AIA-01 — Algorithm weight change not reverted on API failure (silent false-persist) [P0]
- Screens: `frontend/src/screens/YourAlgorithmScreen.tsx`
- Evidence: `handleWeightChange` (lines 141–160) applies the new weight optimistically via `setProfile`, then `await updateTopicWeight(...)`. Rollback to `previous` only runs when the call returns `null` (line 154); if the call **throws** (backend reject/network), the exception propagates out of the `void handleWeightChange(...)` call at line 378 as an unhandled rejection and the optimistic weight stays rendered. The chip then displays a weight the backend never accepted — a dishonest persisted-looking state. `addTopicByName` (lines 121–139) has the same shape: `await addTopic` throws → no user-facing error, just `isAdding` reset.
- Web parity: `web/src/components/agents/useAlgorithmPrefs.ts` — prefs are device-local writes that can't silently fail.
- Competitor: honest settings surfaces (eBay/Vinted never show a preference the server rejected).
- Root cause: optimistic path written for null-return but not for thrown errors.
- Fix: wrap the mutation in try/catch; on catch, restore `previous` and show an error toast ("Couldn't update — your feed is unchanged"). Same for add/remove.
- Acceptance: killing the network mid-tap reverts the chip to the prior weight and surfaces an error within ~1s; no unhandled rejection in console.

### AIA-02 — Algorithm tuning is topics-only; missing brands, price comfort, fresh↔trending [P1]
- Screens: `frontend/src/screens/YourAlgorithmScreen.tsx`
- Evidence: mobile exposes only topic chips + a 3-option weight sheet (lines 368–392). `web/src/components/agents/AlgorithmView.tsx:305-346` adds "Price comfort" (£10–Any slider with labelled value), "Fresh or trending" dial (Just-listed ↔ Trending), and a full Brands section with weights + suggested brands (`SUGGESTED_BRANDS`, lines 39–48) — none exist on mobile.
- Web parity: `/agents/algorithm` — four tuning dimensions vs mobile's one.
- Competitor: Pinterest smart-feed tuning (best-first, source-mix); Depop-style brand affinity is core thrift grammar.
- Root cause: mobile profile contract (`AlgorithmTopic`) predates the web's `useAlgorithmPrefs` dimensions; backend `/recommendations/intent/.../mutate` scopes only `topic`.
- Fix: extend the intent contract with `priceComfort`, `discoveryDial`, and brand topics (scope: 'brand'); render the two dials above topic chips and a Brands section mirroring the topic grammar.
- Acceptance: mobile algorithm surface exposes ≥4 tuning dimensions at parity with web; each persists through the mutate endpoint with idempotency keys.

### AIA-03 — Agent ledger has no filtering; web filters per-bot via deep-linkable chips [P1]
- Screens: `frontend/src/screens/AgentLedgerScreen.tsx`
- Evidence: loads a flat `loadAgentRuns({ limit: 100 })` (line 179) — no bot filter, no status filter, no deep-link param. `web/src/components/agents/AgentLedgerView.tsx:82-97` renders per-bot filter chips derived from runs and supports `?bot=<id>` deep links (also linked from agent detail, `BotDetail.tsx:233-239`).
- Web parity: `/agents/ledger` — filterable, deep-linkable run table.
- Competitor: eBay-style activity/audit views are always facet-filterable at scale.
- Root cause: mobile screen never got the filter pass after the per-bot-detail route shipped.
- Fix: accept an optional `botId` route param; render a horizontal chip rail (All agents + bots present in runs); reuse it from BotDetail "Activity" (see AIA-04). Optionally add status filter.
- Acceptance: ledger opens filtered when deep-linked; chips filter the list; filter state survives refresh.

### AIA-04 — Bot detail shows flat permission strings; no risk tiers, no activity feed [P1]
- Screens: `frontend/src/screens/BotDetailScreen.tsx:397-417`
- Evidence: `bot.permissions.map` renders `permission.replace(/_/g, ' ')` as flat checkmark rows — no risk tier, no risk word, no "what it can't do" scope line. `web/src/components/agents/BotDetail.tsx:62-73,200-226` groups capabilities by low/medium/high/critical with `riskWord` labels and the honest scope line ("It can't spend money, publish, or message on your behalf"), plus a Recent-activity section with 6 runs + "Full ledger" deep link. Mobile shows none of the bot's run history.
- Web parity: `/agents/[id]` — risk-tiered permissions + per-agent activity.
- Competitor: agent-safety grammar (grant scoping is the trust surface; the mobile builder already proves the data exists via `CAPABILITY_RISK_LABELS`/`plannedGrantsByRisk`).
- Root cause: detail screen was authored before the risk-tier vocabulary landed in `platform/agents/agentDefinition`.
- Fix: reuse `CAPABILITY_RISK_LABELS` to group `bot.permissions` by risk; add the scope disclaimer; add a 5-run "Recent activity" section fed by `loadAgentRuns` filtered by botId, linking to `AgentLedger` with the bot param (AIA-03).
- Acceptance: permissions render under risk-tiered group headers; ≥1 activity row or honest empty state; "Full ledger" navigates pre-filtered.

### AIA-05 — Capability label fetched but never rendered (honest-labelling is screen-reader-only) [P2]
- Screens: `frontend/src/screens/BotDirectoryScreen.tsx:52-62,101-119`
- Evidence: the comment (lines 52–56) promises the header subtitle reflects real capability ("AI specialists" / "Heuristic specialists" / unavailable), and `fetchAiCapability()` is called — but `FlagshipHeader` is only given `title="Agents"` (line 102). `aiCapability` only influences the create-button `accessibilityLabel` (lines 111–115). On a heuristic deployment the directory still reads "Agents" with no visible honesty marker.
- Web parity: n/a (web copy is honest about "automation assistants on rules you set").
- Competitor: honest AI labelling — the department's own §11 standard.
- Root cause: subtitle wiring dropped in refactor; dead fetch result.
- Fix: pass `subtitle={aiCapability?.label}` to `FlagshipHeader` (or remove the fetch if a label isn't wanted).
- Acceptance: heuristic deployment shows "Heuristic specialists" (or the API label) visibly in the header.

### AIA-06 — Master "Enable suggestions" toggle is one-way destructive [P2]
- Screens: `frontend/src/screens/AIPreferencesScreen.tsx:135-146`
- Evidence: `handleMasterToggle(false)` sets all six feature prefs to `false`; toggling master back on does not restore them — the user's prior configuration is silently destroyed and the summary resets to "0 of 6 features on" until each row is re-enabled by hand.
- Root cause: no snapshot of prior per-feature state.
- Fix: persist the pre-disable map; on master re-enable restore it (or make dependent rows visibly disabled without mutating their stored values).
- Acceptance: disable→re-enable round-trips all six toggles to their previous values.

### AIA-07 — Agent row claims "AI" runtime when `runtimeMode` is undefined [P2]
- Screens: `frontend/src/components/agents/AgentStudioAgentsSection.tsx:93`
- Evidence: `bot.runtimeMode === 'ai' ? 'AI' : (bot.runtimeMode ?? 'AI')` — a bot with no `runtimeMode` is labelled "AI", a fabricated-intelligence tell; a non-'ai' runtime renders the raw enum string (e.g. "heuristic") uncapitalised and unexplained.
- Fix: map runtime modes to honest labels (`ai`→"AI", `heuristic`→"Rules-based", undefined→no label or "Standard"); never default to "AI".
- Acceptance: no bot row displays "AI" unless `runtimeMode==='ai'`.

### AIA-08 — Ledger hard-caps at 100 runs with no pagination [P3]
- Screens: `frontend/src/screens/AgentLedgerScreen.tsx:179`
- Evidence: single `loadAgentRuns({ limit: 100 })`; older runs are unreachable.
- Fix: cursor/`offset` pagination on scroll, matching ModelRegistryScreen's FlashList pattern (`loadMore`, `PAGE_SIZE`).
- Acceptance: scrolling past row 100 loads the next page.

### AIA-09 — Demo algorithm profile renders as generic "error" state [P3]
- Screens: `frontend/src/screens/YourAlgorithmScreen.tsx:94-101,279-287`
- Evidence: when the intent backend is unreachable the service returns `isDemo: true`; the screen correctly refuses fabricated topics but labels the state "error" (`t('error.title')`) — a demo/unavailable outcome is not a failure, and the retry will always fail again while offline-independent demo data could power the suggested-chips path.
- Fix: distinct `unavailable` status with copy "Feed tuning isn't available yet — check back later" rather than an error treatment.
- Acceptance: backend-down shows a non-error unavailable state; retry only shown for genuine failures.

## Non-findings (verified good)
- `AIPhotoEnhancementScreen` — fail-closed capability check, honest stage text, `outcome_unknown` on network drop, provenance line (`disclosureLabel` + provider), WCAG §2.5.7 slider with non-drag alternatives, `accessible` adjustable role, cancel-in-flight. Best-in-scope.
- `AIPoweredListingScreen` — dirty-field protection, per-field accept/dismiss, condition always abstains for seller attestation, price is guidance not autofill, skeleton (not spinner) while analysing.
- `aiListingApi.ts` — explicitly heuristic; evidence refs on every candidate; no aggregate pseudo-confidence.
- `AgentLedgerScreen` — pending-approvals section with approve/reject, expandable step traces (model_call/tool_call/guardrail…), cancel only for queued/running, full loading/empty/error states.
- `AgentMemoryScreen` — real `/agent-memory` endpoints, optimistic toggles with revert, forget/clear-all confirms.
- `ModelRegistryScreen` — admin-gated lifecycle (shadow/active/retire/block + rollback), approval actor for promotion, paginated FlashList.
- `AITrustSignal`/`AITrustBadge` — qualitative confidence only, colour never sole signal, honest "Demo" suffix.
- `AgentStudio*` — connections do real provider round-trips, masked keys, per-status truth (connected/invalid/degraded/revoked), "planned capabilities" labelled coming-soon rather than toggleable.
- `BotBuilder` — hydration gate, category→default grants, planned grants grouped by risk, draft vs publish.
- `AIPreferencesScreen` — permanent honesty banner ("saved on this device"), preview-labelled auto-accept rules.
- `YourAlgorithmScreen` — refuses to render `isDemo` topics (honest); weight-visible chips; locked-topic grammar.
