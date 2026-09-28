# Task D — Agent Studio operational clarity (findings 15, 16, 17)

Status: DONE

Spec: `docs/research/current-uiux-parity-audit-2026-09-28.md` findings 15 (P1),
16 (P2), 17 (P1). Plan: `.flagship/plans/audit-2026-09-28-implementation-plan.md`.

## What changed

### F17 (P1) — per-resource freshness/error state

`frontend/src/hooks/useAgentStudioResources.ts` (rewritten)
- Replaced the single `failed` boolean with a `resources` record:
  `bots`, `connections`, `approvals` each carry
  `{ status: 'loading' | 'ok' | 'stale' | 'error', errorMessage: string | null }`.
- `'stale'` = last fetch failed but a previous load succeeded (store data is
  still shown, labelled out-of-date). `'error'` = failed before anything ever
  loaded — never presented as confirmed-empty. The verbatim rejection message
  is kept on `errorMessage`.
- `reload(key?)` retries a single resource (`reload('connections')` fetches
  only that resource); `reload()` still refreshes all three. Sequence/viewer
  guards preserved. Exported `AgentStudioResourceKey`, `AgentStudioResourceState`,
  `AgentStudioResources` types for consumers.

`frontend/src/components/agents/AgentStudioStatusOverview.tsx` (rewritten)
- Props changed: `failed`/`onRetry: () => void` → `resources` +
  `onRetry(resource?)`.
- The whole-summary generic retry row is gone. Summary counts render per
  segment and omit only the failed resource; healthy counts stay put.
- Per-resource issue rows mark only the affected resource: "…couldn't load"
  (error), "…may be out of date" (stale), "Refreshing…" (in-flight partial
  retry), each followed by the full `errorMessage` (wrapping, no clamp) and a
  labelled `SecondaryButton` ("Retry connections" style) that calls
  `onRetry(key)`.
- Skeleton shows only while every resource is unresolved (`loading &&
  !anyResolved`), so a single-resource retry no longer blanks healthy info.
- Subtitle is suppressed when agents/connections are unresolved instead of
  guessing from zero counts.

`frontend/src/screens/AIAgentIntegrationScreen.tsx` (wiring only)
- Consumes `resources` + per-resource loading flags; passes
  `loadError`/`onRetry` into both sections and the labeled per-resource retry
  into the overview.

`frontend/src/components/agents/AgentStudioConnectionsSection.tsx`
- New optional props `loadError`/`onRetry`: a failed first connections fetch
  renders the truthful error + retry instead of "No server connections yet".
- `conn.lastError` now renders on its own unclamped line (colored by failure
  health) instead of being `numberOfLines={1}`-clamped inside the verified-by
  caveat — the full actionable provider error is visible in context.

`frontend/src/components/agents/AgentStudioAgentsSection.tsx`
- New optional props `loadError`/`onRetry`: a failed bots fetch renders the
  truthful error + retry instead of "No agents yet".

### F15 (P1) — provider chips

`AgentStudioConnectionsSection.tsx`
- Both provider options (OpenAI / Custom — the only ones the server
  verification contract supports) are Pressables with
  `accessibilityRole="radio"` + `accessibilityState={{ selected }}` wrapping a
  compact visible chip in a ≥44pt transparent target (`providerChipTarget`).
- Removed the unreachable `isAvailable`/"coming soon" branches and the
  now-dead `providerChipSoon` style; updated the stale comment.

`agentStudioStyles.ts`
- Added `providerChipTarget` (minHeight/minWidth `Control.hit`, centered),
  `agentTitleRow` (flexWrap row for name+status reflow), `agentTitleText`
  (shrinkable name), `agentStatusInline` (shrinkable inline status), and
  `statusIssueRow` (per-resource issue spacing).

### F16 (P2) — agent rows purpose-first

`AgentStudioAgentsSection.tsx`
- Name + status now share a wrapping row (`agentTitleRow`): both reflow
  together at large text; the name is no longer single-line and the status no
  longer refuses to shrink.
- Purpose line leads: `runtimeReadinessReason` (warning color) when
  `runtimeReady === false`, else the contract's `description` (fallback
  `commandHint`) — real fields only, nothing invented. Runtime/version demoted
  to a quiet `flatRowCaveat` metadata line.
- Row accessibility label now includes the status (`View <name> — <status>`).

### i18n

`frontend/src/i18n/locales/en.json` — added under `aiAgent`:
`status.resources.{agents,connections,approvals}`, `status.resourceFailed`,
`status.resourceStale`, `status.resourceRefreshing`, `status.retryResource`,
`serverConnections.loadFailed`, `connection.retry`, `agents.loadFailed`,
`agents.retry`. Other locales inherit English via per-key fallback (existing
convention in `locales/index.ts`).

## Tests

New file `frontend/src/__tests__/agentStudioResources.test.tsx` — 9 tests,
all passing:
- connections-only rejection → bots/approvals stay `ok`, connections `error`
  with verbatim message, store untouched for the failed resource;
- previously-loaded resource failing a refresh → `stale` + message + data kept;
- `reload('connections')` calls only that fetcher;
- overview keeps healthy counts, drops the failed count (no `0/0` lie),
  shows the full error, and its labelled retry calls `onRetry('connections')`;
- stale counts stay rendered and are labelled stale;
- both provider chips are host `radio` nodes with correct `selected` state and
  ≥44pt minHeight/minWidth targets; no "coming soon" residue; selecting
  "Custom" calls `setConnectProvider('custom')`;
- agent row renders description purpose-first with `AI · v3` demoted to
  metadata, name unclamped; `runtimeReadinessReason` wins when not ready;
  failed bots fetch renders the error instead of `agents.empty`.

## Verification

- `npx vitest run src/__tests__/agentStudioResources.test.tsx` — 9/9 pass.
- `npx vitest run src/__tests__/agentChatParity.test.ts agentDefinition.test.ts
  agentRuntimeIntegration.test.ts agentCapabilityBroker.test.ts` — 64/64 pass
  (existing agent suites, untouched).
- `npx tsc --noEmit` — clean for all Task-D files. A full-tree run surfaced
  errors in other in-flight tasks' files (`partialStateRecovery.test.tsx` —
  Task G, `SwipeableMessage.tsx` — Task F), not owned here and left
  untouched; re-running with those paths excluded produced zero errors.

## Concerns / notes for orchestrator

- The hook still returns a top-level `loading` boolean (any resource in
  `loading`) for API completeness; the screen derives per-resource flags from
  `resources` instead. `approvalsLoading` is kept in `statusLoading` parity
  with the old behavior even though the overview no longer blocks on it.
- `providerChipSoon` style and the `provider.soon` copy path are now unused in
  this file; the i18n key remains in en.json (shared surface, left for a
  cleanup pass rather than risking other consumers).
- Section-level error rows reuse existing flat styles + `SecondaryButton`
  (44pt target) — no new chrome added per the anti-AI/flat-canvas policy.

---

# Fix round — adversarial review (3 issues)

Status: DONE

## 1. IMPORTANT — per-key request tokens in `useAgentStudioResources.ts`

`reload('connections')` previously bumped one shared `sequence` counter, so a
later-settling focus-triggered `reload()` early-returned: its already-resolved
bots/approvals payloads never reached the store AND their `resources` entries
stayed `'loading'` forever — and the overview hides retry while `'loading'`,
making the state unrecoverable in-session until refocus.

Fix: `sequence` is now `Record<AgentStudioResourceKey, number>`. Each `reload`
issues a per-key token (`++sequence.current[key]` for requested keys only);
on settle, each key independently checks its token — a superseded key drops
its store write and status update while sibling keys from the same request
still commit. Focus-effect cleanup bumps all keys. Documented semantics:
last-writer-wins per key — the most recently issued request for a key owns
that key's store write and status update.

Also removed the fabricated `'Request failed'` English fallback from
`errorMessageOf` — non-Error/non-string rejections now produce
`errorMessage: null` rather than invented copy (the keyed issue-row headline
still renders).

New test: `a per-key retry racing a full reload still commits the full
reload's other payloads` — full `reload()` issued, `reload('connections')`
races it, retry resolves first then the full reload: bots/approvals payloads
land and go `'ok'`; connections is owned by the retry (freshest token).

## 2. MINOR — in-section stale markers + decoupled skeleton gate

- `AgentStudioAgentsSection` and `AgentStudioConnectionsSection` each accept
  a `stale?: boolean` prop; when true (previously loaded data, last refresh
  failed) a quiet `staleMarker` block renders the keyed
  `status.resourceStale` line plus a `pendingAction`-style labelled retry
  (`status.retryResource`) — the list itself carries the staleness label for
  a user scrolled past the overview.
- `agentStudioStyles.ts`: added `staleMarker` (page inset + tight gap).
- `AIAgentIntegrationScreen.tsx`: derives `agentsStale`/`connectionsStale`
  from `resources.*.status === 'stale'` and passes them in; `statusLoading`
  now tracks only the three fetched resources — `deviceKeys.loading` (local
  keystore, unrelated) no longer holds the overview skeleton gate.

New test: `a stale resource marks its own section while preserving rows` —
rows still render, `status.resourceStale` + retry present, retry calls the
per-resource `onRetry`.

## 3. MINOR — new strings routed through `t()`

- `AgentStudioAgentsSection`: the wave-modified row label now uses
  `t('agents.viewLabel', { name, status })` (new en.json key
  `"View {{name}} — {{status}}"`).
- `AgentStudioStatusOverview`: the pending-approvals `accessibilityLabel`
  (carried into the rewritten file) now reuses the existing
  `status.viewPending` key — no re-keying.
- Both new stale markers and the hook's error fallback use keyed copy only.
- The reviewer's other flagged lines (`AgentStudioConnectionsSection` ~80,
  154, 169, 184; `AgentStudioAgentsSection` ~185, 198-202, 233) are
  pre-existing hardcoded strings verbatim from before this wave — left
  untouched per the review's own "do NOT re-key pre-existing strings" rule.

## Re-verification

- `npx vitest run src/__tests__/agentStudioResources.test.tsx` — 11/11 pass.
- `npx vitest run agentChatParity agentDefinition agentRuntimeIntegration
  agentCapabilityBroker` — 64/64 pass.
- `npx tsc --noEmit` — fully clean across the tree (zero errors printed).
