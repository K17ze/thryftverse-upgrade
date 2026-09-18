# Co-Own validation ledger

## Passed

- Frontend TypeScript: pass.
- Backend TypeScript: pass.
- Focused frontend closure tests: 3 files, 85 tests passed.
- Complete Co-Own frontend matrix: 14 files, 211 tests passed.
- Targeted lint: 0 errors; warnings are existing localization, accessibility-hint, and max-lines policy findings.
- Live `GET /api/v1/co-own/assets?limit=1`: 200; response includes `bestBidGbp`, `bestAskGbp`, `bidDepthUnits`, and `askDepthUnits`.
- Live authenticated `GET /api/v1/users/:userId/co-own/holdings`: 200; empty holdings are represented by `items: []`.
- Live authenticated issue report: `POST /api/v1/co-own/assets/:assetId/issues` returned 201 with an authoritative open issue id.
- Public asset order projection no longer contains `userId`.

## Known blockers

- Native device capture and accessibility traversal are still pending.
- The existing `smoke:coown` script is stale: its listing fixture omits required images and currently stops at listing creation with 422. This is a test-harness defect, not an API success claim.
- The repository backend test command has a pre-existing runner mismatch for `coownMatchingProperty.test.ts` (`@vitest/runner` under Node's native test loader); the Co-Own API build and live checks remain green.
- Native visual capture and accessibility traversal remain pending because no configured native device is available in this environment.
- The implementation was adversarially re-reviewed for issue authorization/audit, mark-vs-sale truth, reserved units, self-bid exclusion, public counterparty privacy, foreground stale fail-closed behavior, and online ledger failure recovery.

## Inbox realtime + orders detail wave (2026-10)

### Passed
- `npx tsc --noEmit` — clean (incl. InboxRow typing/commerce wiring, ChatTopBar avatarSeedId, CommerceDetailSection optional label).
- Vitest: `inboxCommerceBadge.test.ts` new — 6 tests green (order>offer>listing priority, tone map, active-listing silence).
- Vitest batch: chatRuntimeBehaviour, realtimeTopicRefcount, vq09dInboxBadgeUnit, commerceDetailRuntime, groupChatInfoParity — 108 tests green.
- `npm run lint:design-tokens` — pass; 2 pre-existing warnings (CoOwnAssetProspectus:389, ReturnCaseActions:426, borderRadius 999) in untouched files.
- `.flagship/gap-registry.json` — valid JSON, 13 findings all done.

### Realtime lifecycle review (self)
- `useInboxTypingEvents` registers `client.on` handlers only — topics are already subscribed by `useInboxMessageEvent`; zero new subscriptions. Self-echo filtered at handler. Each (conv,user) entry auto-clears after 4s; empty maps pruned. `useConversationTyping` uses `useSyncExternalStore` with boolean snapshot — no render loop. Realtime-unavailable → map stays empty → no typing shown.
- `deriveInboxDeliveryStatus` returns undefined unless `sender === 'me'` — no fabricated glyph.
- `deriveInboxCommerceBadge` reads only server `ConversationContext`; returns null when absent — no fabricated status.

### Skipped (honest-data rule)
- Seller-net on MyOrders rows: `Order` contract carries no net/payout/fee field; deriving it client-side would fabricate money data.

### Known blockers
- No configured native device — visual/a11y capture still pending.

## Adversarial review + repair round (2026-10, same wave)

Fresh-context subagent review verdict: SHIP-WITH-FIXES. Repairs landed:

- P1: dead "Inspection ends" row — `inspectionDeadlineAt` only populates post-delivery (terminal), `!isReceiptFinal` guard made it unreachable → guard dropped.
- P1: failed pull-to-refresh destroyed the loaded receipt — `setLoadError` now only fires pre-load; refresh failure on a loaded receipt toasts instead (`hasLoadedOrderRef`, avoids dep loop).
- P2: `useInboxTypingEvents` now subscribes/unsubscribes its own topic set (refcounted) — no implicit ordering dependency on `useInboxMessageEvent`.
- P2: O(N) handler churn per message — effect keyed by stable joined-id `topicsKey`, not array identity.
- P2: self-echo hydration gap — `useConversationTyping` snapshot re-filters `selfId` at read time.
- P2: `getCommerceStatus` (dead, divergent labels: "Counter sent"/"Order pending") deleted; `deriveInboxCommerceBadge` now mirrors `ChatListingContextBar` exactly incl. `danger` tones (cancelled/refunded/declined) — `CommerceStatusTone` extended, `InboxConversationRow` tone map extended.
- P2: per-row `useBackendData` subscription removed from `InboxRowBase` — request listing title prefers server `context.listing.title`, feed lookup isolated in leaf `RequestListingLabel`.
- P2: `textInverse` initials on `colorForId` fills failed dark-mode contrast (~2.2:1) — fixed `#FFFFFF` (palette is tuned for white ≥3:1) in ChatTopBar and AvatarRing.
- P2: DM identity now consistent — `AvatarRing` gains `seedId`; inbox rows seed by `counterpartyId`, top bar by `resolvedPartnerId`, ForwardSheet DM rows reseeded from `item.id`→counterparty id.
- P3: `hasDeliveryFacts` gate now includes carrier/shippedAt/deliveredAt; "Ship by" suppressed once shippedAt exists (moot deadline); ReceiptRow values wrap to 2 lines.
- P3: OrderRowSkeleton realigns to OrderLedgerRow (top-aligned, Space.md rhythm, badge+number row / title / context+total row, top-pinned chevron).
- P3: dead `styles.typingPreview` removed.
- Self-review caught: `topicsKey` separator had been stripped to `''` (would split ids into chars) → `join(',')`/`split(',')`.

### Post-repair verification
- `npx tsc --noEmit` clean.
- Vitest: 6 files / 114 tests green (incl. updated inboxCommerceBadge — danger tones).
- `lint:design-tokens` pass (same 2 pre-existing warnings).
- `.flagship/gap-registry.json` valid, 13 findings all done.
- 6 unrelated WIP files untouched.

## External audit wave (ThryftVerse-Flagship-Production-Audit-2026-09-18)

Audit pinned commit f50eb63; all findings re-verified against current branch before fixing. 11 of 22 findings actionable in frontend/tooling scope; rest are backend-worker/secret/device blockers recorded below.

### Implemented
- F06: discovery hasMore/pagination/refresh wired UnifiedDiscoveryScreen → DiscoveryFeedView → PinterestMasonryGrid (RefreshControl).
- F07 (P0): settings balance — unknown renders em-dash/Unavailable, never fabricated £0.
- F08: dangerText/successText/warningText tokens both palettes; 923 fg usages migrated; fills preserved.
- F09/F10: performer direction from signed return; position status from authoritative VM.status.
- F11: agent health distinct none/no-agents/healthy/degraded + new i18n keys.
- F12: order-book values + prospectus cells wrap (2 lines, fontScale caps) — no silent clipping at large text.
- F13: description expansion gates on measured rendered lines (onTextLayout), not char count.
- F14 (P0): queryClient.clear() inside store.logout() — fail-closed cross-account purge.
- F19 (P0): resolveMockMode fails closed — fixture/integration dev-only, production always 'production'.
- F03: migration checker partitions _down.sql rollbacks; verifies pairing; exits 0.
- F20: ClosetGrid preview capped at 12 (reorder mode keeps full list).
- F21: staleModules surfaced as quiet pull-to-retry note — partial outage ≠ empty feed.

### Tests added/updated
- runtimeFlagsFailClosed.test.ts (3): prod-forced, dev-fixture, dev-default.
- productionAuditWave.test.ts (6): balance honesty, performer direction, paused status, description gate, module staleness, mock resolver.
- platformRuntime.test.ts: logout-purge expectation updated to fail-closed.
- productDetailFlagshipReconstruction.test.ts: order-book spec updated to numberOfLines={2} F12 contract.
- iconographySystem.test.tsx mock extended with new tokens.

### Verification
- tsc --noEmit clean (post 923-site migration).
- Vitest targeted: 25 + 216 + 33 + misc green.
- lint:design-tokens pass — 2 pre-existing warnings (CoOwnAssetProspectus:389, ReturnCaseActions:426 borderRadius 999).
- Migration checker exits 0.
- Registry: 24 findings, 0 open.

### Audit items blocked outside frontend scope
- F01: native visual/a11y capture — no device/simulator in this environment.
- F04/F05: backend test suite + dependency triage — backend scope.
- F16/F17: backend worker semantics — backend scope.
- F18: real EAS secrets — requires ops access.

## Adversarial review round 2 (external audit wave)

Reviewer lacked file access — all findings arrived as VERIFY items; each verified against source by orchestrator.

### Confirmed + repaired
- `BackendDataContext.loadMoreListings`: empty-page result left `cursor` set while `hasMore=false` → every subsequent `onEndReached` re-fetched the same cursor forever (infinite pagination storm). Added `!hasMore` guard + cleared cursor on empty page. Also wrapped fetch in try/catch/finally so a thrown `fetchHomeFeed` can no longer stick `isLoadingMore=true` permanently.
- Token migration gap: five Record-typed string-key maps still resolved deep `danger/success/warning` tokens into dots/status text (sed only caught `colors.X` literals): `AgentLedgerScreen` STATUS_COLOR_KEY, `BulkListingScreen` STATUS_META, `ImportListingTile` STATUS_DOT_COLOR, `withdrawViewModels` PAYOUT_STATUS_CONFIG, `SupportCaseDetailScreen` PRIORITY_DISPLAY. All migrated to *Text keys + union types updated.

### Verified clean (no defect)
- `clearUserScopedQueryCache`: no shared/bootstrap/staleTime-Infinity queries exist; full clear() is correct (also clears mutationCache in TanStack v5). Sync call inside logout — no race.
- `handleRefresh` uses `Promise.allSettled` + `.finally` — spinner resets on failure; re-entry guarded.
- `directionFor`: strict `>0`/`<0` + neutral zero branch; pct derived, never null.
- Measure Text: same `descriptionText` style + same `maxFontSizeMultiplier`, absolute `left:0/right:0` width parity; `importantForAccessibility="no-hide-descendants"` for Android.
- Agent overview branch order exhaustive (0/0 → 0-agents → 0-conns → healthy → all-unhealthy → degraded); all `status.*` keys exist with matching `{{healthy}}/{{total}}` interpolation.
- `walletBalanceFailed` resets at each fetch start.
- Migration checker: `endsWith('_down.sql')` anchored; stem-exact pairing; exits 0 (12 known-duplicate warnings, all allowlisted).
- `ThemeContext`: only two palettes, both carry new tokens; context default is null (no third object).
- `ClosetGrid`: `isCapped = listings.length > visibleListings.length` — exactly-12 closets show no dead affordance; only consumer is StorefrontTabs profile preview.
- `CoOwnOrderBook`: `fontVariant: ['tabular-nums']` preserved on all numeric styles.
- `staleModules` fully rewritten per load — no accumulation/loop.
- `InAppNotificationBanner` accent `backgroundColor` is a thin progress line — brightened token acceptable.
- `ActivityBadge` `glowColor` colors the dot itself (foreground) — correct.

### Post-repair verification
- `npx tsc --noEmit` clean (after key-map + BackendDataContext fixes).
- Vitest: 6 files / 75 tests green (discoverySurfaces, backendContractsFlagshipClosure, backendListingMapperRuntime, productionAuditWave, runtimeFlagsFailClosed, platformRuntime).
