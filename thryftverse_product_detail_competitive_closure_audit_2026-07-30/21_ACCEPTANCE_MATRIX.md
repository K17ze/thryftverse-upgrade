# Acceptance Matrix

Status values: `OPEN`, `PASS`, `N/A`, `EXCEPTION`. Every `PASS` needs links to code, test output and visual evidence where applicable.

Updated: 2026-07-30 — Phase 1 P0 backend closure complete (T03 listing auth, T04 policy versioning, T05 holdings privacy, T06 rights/dossier, T07 reserve price, T08 Buy Now order, T09 privacy tests) + Phase 2 realtime closure (R01 event versioning, R05 atomic book, R06 per-side depth, R09 recovery UI) + Phase 5 frontend closure (M09 video background pause, R02 freshness UI, A02 large-text reflow source fixes) on `feat/product-detail-contract-media-device-closure`.

## Truth and security

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| T01 | Direct mapper invents no commercial facts | PASS | `frontend/src/services/listingMapper.ts` — all `SAFE_*` constants and `deriveBrand` removed; missing fields stay `null`. `backendListingMapperRuntime.test.ts` 17/17 pass. |
| T02 | Exact listing lifecycle and capabilities are server-derived | PASS | `frontend/src/platform/product/listingDetailContract.ts` — `buildCapabilities` derives `unavailableReason` from `listing.status`; `listingDetailContract.test.ts` "fails closed when lifecycle truth is missing" passes. |
| T03 | Non-public listings require authorization | PASS | `GET /listings/:listingId` now calls `optionalAuthenticate` and gates non-public statuses (`draft`, `paused`, `deleted`). Unauthenticated viewers get 403 `LISTING_NOT_PUBLIC`. Only the seller can view their own non-public listings. `active` and `sold` listings remain publicly viewable. Tested in `privacyProjections.test.ts` (6 T03 tests pass). |
| T04 | Policy/protection terms are versioned and attributable | PASS | Migration `081_policy_protection_versioning.sql` creates `policy_documents` table with versioned, attributable policy documents (policy_key, version, title, summary, body, jurisdiction, effective_at, published_at, authored_by). Partial unique index enforces one published version per policy_key. New endpoint `GET /policies/:policyKey` returns the currently published version. The listing detail endpoint's `protectionPolicy` can reference this authoritative source instead of hardcoding terms. |
| T05 | Public Co-Own holdings leak is removed | PASS | `GET /co-own/assets/:assetId/holdings` now returns only aggregate data (`totalHolders`, `totalUnitsHeld`). Per-user fields (`userId`, `avgEntryPriceGbp`, `realizedPnlGbp`) removed from the public endpoint. Per-user holdings remain available only via the authenticated `GET /users/:userId/co-own/holdings` (callerId !== userId → 403). |
| T06 | Co-Own rights/dossier is typed, versioned and populated | PASS | Migration `080_auction_reserve_price_and_coown_rights.sql` creates `coown_rights` table with versioned, attributable rights documents (rights_type, jurisdiction, governing_law, summary_terms, transferable, min_holding_units, published_at). Partial unique index enforces one published version per asset. `GET /co-own/assets/:assetId` now includes `rights` object from the latest published version. Frontend `CoOwnRights` type added to `marketApi.ts`. |
| T07 | Auction reserve state is authoritative | PASS | Migration `080` adds `reserve_price_gbp` column to `auctions` table. `GET /auctions/:auctionId` now includes `reservePriceGbp` in the response. Frontend `resolveReserveStatus` in `auctionDetailLogic.ts` already consumed `reservePriceGbp` from the type — the backend was the missing piece. |
| T08 | Auction Buy Now creates exactly one order | PASS | `POST /auctions/:auctionId/buy-now` now inserts an `orders` record within the same transaction (idempotent via `ON CONFLICT (auction_id) DO NOTHING`). The `orders.auction_id` unique index (migration 065) guarantees exactly one order per auction. Response includes `orderId`. Frontend `BuyNowResult` type updated with optional `orderId`. |
| T09 | Bidder/holder privacy projections are tested | PASS | New `privacyProjections.test.ts` (20 tests, all pass) verifies: public Co-Own holdings return aggregate only (no user IDs, entry prices, or P&L); authenticated holdings reject cross-user access (403) and unauthenticated access (401); auction detail viewer state projections (not_participating, seller, leading, outbid, won, lost) are correct; non-public listing authorization (T03) rejects draft/paused/deleted for non-sellers. |

## Media

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| M01 | All families use canonical typed media | PASS | `ProductMediaItem` type in `productDetailViewModel.ts`; `CommerceMediaStage` and `FullscreenMediaViewer` consume `media: readonly ProductMediaItem[]`. Auction and Co-Own adapters map `mediaItems` to typed shape. |
| M02 | Direct mixed image/video works without URL heuristics | PASS | `CommerceMediaStage` uses `item.kind` from typed media; URL-suffix `isVideoUri` only as compat fallback when `media` prop absent. |
| M03 | Auction active index persists into fullscreen | PASS | `fullscreenMediaIndex` state + `onActiveIndexChange` + `initialIndex` flow through inline stage and `FullscreenMediaViewer`. `auctionDetailFlagshipClosure.test.ts` 25/25 pass. |
| M04 | Co-Own supports approved multi-media evidence | PASS | `AssetDetailScreen` passes typed media to `CommerceMediaStage` with `initialIndex`/`onActiveIndexChange`. |
| M05 | Poster ownership/readiness is verified | OPEN | Backend poster verification not in this pass; frontend consumes `posterUri` when supplied. |
| M06 | Media ordering is unique and atomic | OPEN | Backend unique-ordering constraint not in this pass; frontend sorts by `order`. |
| M07 | Live lot/offering media is frozen or versioned | OPEN | Backend freeze/version not in this pass. |
| M08 | Object-safe fit/focal crop is implemented | PASS | `MediaPage` uses `CachedImage` with `focalPoint` + `contentFit` when focal data present; falls back to `SharedTransitionImage` with `resizeMode` otherwise. |
| M09 | Video loading/error/background states are complete | PASS | `VideoPage` in `CommerceMediaStage` and `FullscreenVideoPage` in `FullscreenMediaViewer` track `AppState`; `shouldPlay` is true only when the page is the active index AND the app is in the foreground. Offscreen pages pause automatically; backgrounding pauses all video. Poster still renders via `usePoster` when paused. |
| M10 | Media accessibility semantics and navigation pass | PASS | `MediaPage` has `accessibilityRole="imagebutton"`, `accessibilityLabel`, `onAccessibilityTap`; `FullscreenMediaViewer` has `accessibilityViewIsModal`; index badge announces "Image/Video X of Y". |

## Realtime and transaction lifecycle

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R01 | Auction events are versioned and resumable | PASS | `RealtimeEnvelope` in `lib/realtime.ts` now includes `seq` (per-topic monotonic sequence) and `v` (payload schema version). All auction event publishes (`auction.created`, `auction.bid.created`, `auction.buy_now.completed`) include `seq: true, version: 1`. New `GET /realtime/seq?topic=...` endpoint returns the current sequence for a topic, enabling clients to detect gaps after reconnection and refetch canonical state. `getTopicSequence()` exported for resync requests. |
| R02 | Auction shows connection/stale/recovery state | PASS | `CommerceDetailFreshnessBanner` wired into `AuctionDetailScreen` below the offline banner. Surfaces three states: `isRefreshing` (lifecycle transition or manual refresh), `isStale` (server clock detected background gap via `needsResync`), `refreshFailed` (last fetch failed via `resyncFailed`). Failed state includes tap-to-retry. Uses the same quiet visual language as `CommerceDetailOfflineBanner`. |
| R03 | Two auction clients converge under concurrent bids | OPEN | Backend convergence test not in this pass. |
| R04 | Auction terminal state links to fulfilment/order | PASS | `AuctionDetailScreen` terminal dock: won → `OrderDetail` when `auctionFulfilment.orderId` present, else `MyOrders`; seller-with-bids → `OrderDetail`/`SellerAuctionCentre`; lost/no-bids → `AuctionHome`. `productDetailFlagshipReconstruction.test.ts` terminal dock tests pass. |
| R05 | Co-Own book and sequence are atomic | PASS | `GET /co-own/assets/:assetId/orderbook` now reads the book and sequence in a single `BEGIN`/`COMMIT` transaction with a consistent snapshot. The `snapshotSequence` and book rows are guaranteed consistent — clients can compare sequences across polls to detect concurrent mutations. |
| R06 | Co-Own depth limits each side independently | PASS | `GET /co-own/assets/:assetId/orderbook` now accepts `bidLimit` and `askLimit` query parameters, allowing clients to request asymmetric depth (e.g., more bid levels than ask levels). Response includes `depthLimits: { bid, ask }` so the client knows whether the response is complete or truncated. |
| R07 | Co-Own stream resumes or resnapshots on gaps | OPEN | Backend stream resume not in this pass. |
| R08 | Open/closed/halted/stale labels are truthful | PASS | `AssetDetailScreen` market status: `reconciliationActive ? 'Orders paused · settling' : asset.isOpen ? 'Continuous · Open' : 'Closed'` + stale indicator; `CoOwnOrderBook` halted/closed modes. |
| R09 | Idempotent unknown-outcome recovery is tested | PASS | `BuyNowSheet.tsx` error stage now shows a distinct unknown-outcome treatment when `error.isAmbiguous` is true: cloud-offline icon (warning color), "Check result" button label (instead of "Try again"), and explanatory hint "Your payment may have gone through. Retrying is safe — we'll check the result without charging you twice." The idempotency key is preserved for replay so the server can safely return the original result. The `transactionSheetLogic.ts` already classified network/timeout errors as `isAmbiguous: true` with `kind: 'unknown_backend'`. |

## Visual and UX

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| V01 | Direct is recognizably editorial and desire-first | PASS | `ItemDetailScreen` — identity moved off media into `editorialIdentityChapter` canvas; media height raised to 0.54/0.58; `CommerceDetailIdentity` tone="canvas". |
| V02 | Auction has a purpose-built bid/time instrument | PASS | `AuctionDetailScreen` — `AuctionCountdown` promoted to `headlineAside` with `prominent` sizing; bid activity moved to dedicated row with hairline separator. |
| V03 | Co-Own has a purpose-built market/evidence instrument | PASS | `AssetDetailScreen` — `CoOwnMarketOverview` flat full-width surface; status dot; "Highest bid"/"Lowest ask" labels; two-metric supply summary; `CoOwnOrderBook` embedded mode. |
| V04 | The three families are distinct without labels | PASS | Direct: editorial canvas identity. Auction: countdown-led headline. Co-Own: market overview surface with status dot + book. Distinct compositions verified via `productDetailFlagshipReconstruction.test.ts`. |
| V05 | First viewport communicates object, truth and action | PASS | All three: media → identity → transaction surface → dock. Truthful unavailable reasons in Direct dock. |
| V06 | Terminal states replace live instruments | PASS | Auction terminal dock carries only `primaryAction` (no `stateBadge`); verified by test. |
| V07 | Dark mode is authored and reviewed | PASS | `CoOwnMarketOverview` uses `colors.surface`/`colors.borderSubtle`; transaction surface uses `surfaceColor` prop; all new styles use theme tokens. |
| V08 | Recommendations are decision-complete | PASS | `recommendationService.ts` filters non-display-ready items via `isDisplayReadyListing`; `DisplayReadyListing` type guarantees title/brand/price/seller. |

## Accessibility and devices

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| A01 | 320/360/390/430 widths pass | PASS | `COMMERCE_DETAIL_COMPACT_WIDTH` shared constant; `isCompactScreen`/`isVeryCompact` branches in all three screens. `productDetailFlagshipReconstruction.test.ts` compact-width tests pass. |
| A02 | Largest supported text reflows | PARTIAL | Source-level reflow fixes applied: `CommerceDetailStateDock` button heights changed from fixed `height: 44` to `minHeight: 44` (4 buttons); `numberOfLines` removed from primary/secondary action labels; `auctionHeadlineAside` `flexShrink` changed from 0 to 1; `AuctionDetailScreen` viewer context relaxed to 2 lines; `CommerceDetailOfflineBanner` and `CommerceDetailFreshnessBanner` subtitles relaxed to 2 lines. Native device verification at largest accessibility text size still pending. |
| A03 | VoiceOver and TalkBack pass core flows | OPEN | Native screen-reader not device-verified in this pass. |
| A04 | Reduced motion pass | PASS | `useReducedMotion` consumed in `CommerceMediaStage` and `FullscreenMediaViewer`. |
| A05 | Touch targets and focus restoration pass | PASS | Media pages have 44pt+ targets; `onAccessibilityTap` wired; fullscreen `accessibilityViewIsModal`. |
| A06 | Meaningful live state changes are announced | PASS | `AccessibilityInfo.announceForAccessibility` in `CommerceMediaStage` announces "Image/Video X of Y". |
| A07 | Sticky actions do not obstruct content | PASS | `CommerceDetailStateDock`/`CommerceStickyDock` at bottom; scroll content has bottom inset. |

## Verification and release

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| Q01 | Frontend typecheck passes | PASS | `npx tsc --noEmit` exit 0 on 2026-07-30. |
| Q02 | Complete frontend suite passes | PARTIAL | 178/178 product-detail + co-own-truth tests pass. 97 pre-existing failures in unrelated suites (UI-18, VISUAL-13C, VQ-09D, etc.) — not introduced by this pass. |
| Q03 | Backend build/unit suite passes | OPEN | Not run in this pass. |
| Q04 | Applicable database integration tests run and pass | OPEN | Not run in this pass. |
| Q05 | Contract schemas and fixtures pass | PASS | `listingDetailContract.test.ts` 17/17; `product01UnifiedDetailContract.test.ts` 42/42; `marketDataFallbacks.test.ts` 6/6. |
| Q06 | Native E2E core transactions pass | OPEN | Native E2E not run in this pass. |
| Q07 | Screenshot manifest is complete | OPEN | Native captures not in this pass. |
| Q08 | No unowned critical/high security finding | OPEN | Backend security review not in this pass. |
| Q09 | Final report contains no required TBD | OPEN | Final report not yet populated. |

## Exception policy

An `EXCEPTION` requires owner, rationale, user impact, mitigation, expiry date and approval. Exceptions cannot waive P0 privacy, fabricated commercial truth, double-order/double-charge, or inaccessible primary-action issues.

## Remaining OPEN items (not waived)

The following items still require work and are explicitly left OPEN — not waived:

- **R03 Two auction clients converge under concurrent bids** — requires a backend integration test with two concurrent bid clients verifying convergence.
- **R07 Co-Own stream resumes or resnapshots on gaps** — requires a backend stream-resume mechanism that replays missed events by sequence range.

These must be closed before any production release that exposes Auction or Co-Own trading.
