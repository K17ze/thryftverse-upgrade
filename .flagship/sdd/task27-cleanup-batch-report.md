# Task 27 — Cleanup Batch: Cache Propagation, Recommendation Control, Accessibility

Status: DONE
Scope: 10 minor findings from the cache-propagation, recommendation-control and
accessibility-cleanup reviews. All fixes are surgical; no visual layout changed,
no new features, no `coown/` files touched.

## Verification

- `frontend` `tsc --noEmit -p tsconfig.json` → **0 errors**
- `backend/api` `tsc --noEmit -p tsconfig.json` → **0 errors**
  (note: the package layout is `backend/api/` with its own node_modules —
  `backend/tsconfig.json` / `backend/node_modules/typescript` do not exist)

## Fixes

### Cache propagation

1. **`useOrderDetail` focus-effect refire loop** — `frontend/src/hooks/useOrderDetail.ts`
   `fetchOrder` depended on `backendOrder` state, so every `setBackendOrder`
   recreated `refreshOrder` → new `useFocusEffect` callback → React Navigation
   re-ran the effect while focused → refetch loop. Fixed with
   `backendOrderRef` (line ~60): the ref is written inside `fetchOrder` on
   success and read in the catch to choose load vs refresh error copy.
   `fetchOrder` deps are now `[orderId]` only, so `refreshOrder`, the focus
   effect and the status-driven polling interval are all stable.

2. **`WalletScreen` non-silent callers** — `frontend/src/screens/WalletScreen.tsx`
   - `handleRefresh` (~:195) now calls `loadBalance(true)` — pull-to-refresh no
     longer flips `isLoading` and unmounts the ScrollView mid-pull.
   - Both `AddMoneySheet` instances (`:388` empty state, `:673` populated) now
     use `onCompleted={() => loadBalance(true)}` — a completed top-up reloads
     silently instead of flashing the full skeleton.
   - The mount effect and the error-state "Try again" deliberately remain
     non-silent (initial skeleton / error → skeleton are the correct states).

3. **`['user','following']` prefix invalidation** —
   - `useProfileSocialQueries.ts` `useFollowMutation.onSettled` (~:137): now
     reads `useStore.getState().currentUser?.id` and invalidates
     `queryKeys.user.following(viewerId)` instead of the whole prefix
     (previously refetched every user's mounted following list).
   - `useListingQueries.ts` `useSellerFollow.onSuccess` (~:210): same fix.
   - Both files gained a static `useStore` import (no import cycle — `useStore`
     only pulls `queryClient`/`queryKeys` from `platform/`; the sibling
     `useProductSocialState.ts` already does this).

4. **`MakeOfferSheet` unknown-outcome reconciliation** —
   `frontend/src/components/commerce/detail/MakeOfferSheet.tsx`
   Mirrored the `MakeOfferScreen` pattern: on a network-class error with a
   live `idempotencyKeyRef`, the sheet now calls
   `useUnknownOutcomeReconciliation().reconcile` with
   `lookupOfferByIdempotencyKey`. `onAcknowledged` runs the same success path
   (invalidate `listing.detail`, `onSent` with the real `conversationId`,
   dismiss); `onSafeToRetry` clears the key so a resubmit gets a fresh one;
   `onUnresolved` shows an honest "check your offer history" message. Added
   `isMountedRef` for `shouldContinue` and hardcoded copy consistent with the
   sheet's existing (non-i18n) strings.

### Recommendation control

5. **Interaction events 422 for non-personalised tiles** —
   `frontend/src/scenes/discovery/DiscoverScene.tsx` `feedbackAttribution` (~:256)
   now only attaches `requestId`/`policyVersion` when the listing is found in
   `forYouFeed.items`. The backend `POST /interactions` (recommendations.ts
   :439-460) joins `requestId` to `recommendation_impressions` for that
   listing and 422s on no match — so tiles from the non-personalised cursor
   previously always failed attribution.

6. **`FeedExplanationSheet` mock topics for real users** —
   - `algorithmTransparencyApi.ts`: new `ServedItemExplanationContext`
     (`reasonCodes`, `componentScores`, `score`, `itemTitle`, `itemThumbnail`)
     and `fetchFeedExplanation(itemId, served?)`. When served context is
     present the explanation is built from the serve's own component scores
     (ranked top-3, labelled via a `COMPONENT_REASON_LABEL` map mirroring
     ml-service `RANKING_FEATURES`, falling back to ranked `reasonCodes` via
     `REASON_CODE_LABEL`), `isDemo: false`, and the real item title/thumbnail.
     Reasons deliberately carry no `topicId` — component scores are ranking
     features, so more/less/remove must not write a fabricated topic mutation
     (the sheet already guards `if (topReason.topicId)` for the API write).
   - `FeedExplanationSheet.tsx`: new `servedContext` prop threaded into the
     fetch effect; the demo-mode pill now binds to `explanation.isDemo` (the
     data's own honesty flag) instead of the module-level
     `getAlgorithmDemoMode()` default.
   - `DiscoverScene.tsx`: `explanationServedContext` memo resolves the
     `RecommendationItemVM` for `explanationItemId` and passes it through.

7. **Surface mismatch** — `useForYouFeed(surface = 'home')` is now
   parameterised and sends `?surface=<surface>`; `mapResponseToPage` records
   the same surface. Call sites: `DiscoverScene` → `'discover'` (now agrees
   with the `'discover'` feedback attribution),
   `UnifiedDiscoveryScreen` → `'discovery'`, `useDynamicAlgorithmSignals`
   forwards its own `surface` option, `HomeScreen` keeps the `'home'` default.
   Serve records and impression joins now agree with the surface the items
   are actually rendered on.

8. **Item-scope `less` no-op ledger write** —
   `backend/api/src/routes/recommendations.ts` (~:851): item-scope
   `less`/`more` mutations are now mapped to `topicDirectives` on the
   mutation's `target_label` (the item title), so "show fewer like this" on a
   listing without category/brand facets produces a real bounded
   `LESS_TOPIC_PENALTY` down-rank on token-similar candidates instead of a
   dead ledger row. `seller`-scope semantics unchanged; `exclude`/`remove`
   handling unchanged.

### Accessibility cleanup

9. **Redundant hint text** — `frontend/src/components/SwipeableRow.tsx` (~:351)
   `accessibilityHint` is now `custom ?? autoGenerated` — a caller-provided
   hint is authoritative and the auto-generated "Swipe right to X. Swipe left
   to Y." sentence is no longer appended (fixes the duplicated "Swipe left to
   delete…" + "…Swipe left to Delete." in `CreatorLayersSheet`, and the same
   redundancy in `InboxScreen`/`CreatorDraftListScreen` which also pass custom
   hints).

10. **Double haptic on long-press** — `SwipeableRow.tsx` `onPanResponderGrant`
    dwell timer no longer fires `haptic.patterns.longPress()`. The
    `onLongPress` callback owns the semantic haptic across every invocation
    path (row dwell timer, inner pressable long-press, `longpress`
    accessibility action): `CreatorLayersSheet.handleLongPressRow` fires
    `haptic.light()`, `InboxScreen.handleQuickActions` fires `haptic.medium()`.
    One haptic per long-press on all paths.

## Concerns / notes for follow-up

- `FeedExplanationSheet` "Remove this topic" on a serve-attributed reason
  still falls back to a `topic-label-*` mutation id (pre-existing demo-path
  behaviour). The ledger write is harmless (scope `topic` `remove` on an
  unknown id is a no-op delete) but could be gated in a later pass.
- `useDynamicAlgorithmSignals` internally mounts its own `useForYouFeed` in
  addition to the screen-level instance — pre-existing duplication, now at
  least consistent in surface tagging. Not changed (out of scope).
- `useProfileSocialQueries.useBlockMutation` still uses a dynamic
  `import('../../store/useStore')` — now redundant alongside the static
  import but harmless; left as-is.
- The two accessibility fixes were verified against
  `src/__tests__/accessibilityAcceptance.test.tsx` — no test asserts on
  `accessibilityHint` composition or the row's long-press haptic, so no test
  updates were needed.
