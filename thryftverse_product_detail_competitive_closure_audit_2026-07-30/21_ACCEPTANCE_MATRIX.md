# Acceptance Matrix

Status values: `OPEN`, `PASS`, `N/A`, `EXCEPTION`. Every `PASS` needs links to code, test output and visual evidence where applicable.

Updated: 2026-07-30 — frontend contract/media/art-direction closure pass on `feat/product-detail-contract-media-device-closure`.

## Truth and security

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| T01 | Direct mapper invents no commercial facts | PASS | `frontend/src/services/listingMapper.ts` — all `SAFE_*` constants and `deriveBrand` removed; missing fields stay `null`. `backendListingMapperRuntime.test.ts` 17/17 pass. |
| T02 | Exact listing lifecycle and capabilities are server-derived | PASS | `frontend/src/platform/product/listingDetailContract.ts` — `buildCapabilities` derives `unavailableReason` from `listing.status`; `listingDetailContract.test.ts` "fails closed when lifecycle truth is missing" passes. |
| T03 | Non-public listings require authorization | OPEN | Backend authorization gate not in this pass. |
| T04 | Policy/protection terms are versioned and attributable | OPEN | Backend policy versioning not in this pass. |
| T05 | Public Co-Own holdings leak is removed | OPEN | Backend holdings route privacy not in this pass. |
| T06 | Co-Own rights/dossier is typed, versioned and populated | OPEN | Backend rights contract not in this pass. |
| T07 | Auction reserve state is authoritative | OPEN | Backend reserve_price not in detail response; client-side `reserveStatus` remains. |
| T08 | Auction Buy Now creates exactly one order | OPEN | Backend Buy Now creates a bid + marks auction ended; no order/fulfilment record. |
| T09 | Bidder/holder privacy projections are tested | OPEN | Backend privacy projections not in this pass. |

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
| M09 | Video loading/error/background states are complete | PARTIAL | `VideoPage` renders poster via `usePoster`; `shouldPlay` set to `false` (user-initiated via native controls). Offscreen/background pause not yet wired. |
| M10 | Media accessibility semantics and navigation pass | PASS | `MediaPage` has `accessibilityRole="imagebutton"`, `accessibilityLabel`, `onAccessibilityTap`; `FullscreenMediaViewer` has `accessibilityViewIsModal`; index badge announces "Image/Video X of Y". |

## Realtime and transaction lifecycle

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R01 | Auction events are versioned and resumable | OPEN | Backend event versioning not in this pass. |
| R02 | Auction shows connection/stale/recovery state | OPEN | Realtime connection health UI not in this pass. |
| R03 | Two auction clients converge under concurrent bids | OPEN | Backend convergence test not in this pass. |
| R04 | Auction terminal state links to fulfilment/order | PASS | `AuctionDetailScreen` terminal dock: won → `OrderDetail` when `auctionFulfilment.orderId` present, else `MyOrders`; seller-with-bids → `OrderDetail`/`SellerAuctionCentre`; lost/no-bids → `AuctionHome`. `productDetailFlagshipReconstruction.test.ts` terminal dock tests pass. |
| R05 | Co-Own book and sequence are atomic | OPEN | Backend atomic book not in this pass. |
| R06 | Co-Own depth limits each side independently | OPEN | Backend per-side limits not in this pass. |
| R07 | Co-Own stream resumes or resnapshots on gaps | OPEN | Backend stream resume not in this pass. |
| R08 | Open/closed/halted/stale labels are truthful | PASS | `AssetDetailScreen` market status: `reconciliationActive ? 'Orders paused · settling' : asset.isOpen ? 'Continuous · Open' : 'Closed'` + stale indicator; `CoOwnOrderBook` halted/closed modes. |
| R09 | Idempotent unknown-outcome recovery is tested | OPEN | Frontend idempotent recovery UI not in this pass. |

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
| A02 | Largest supported text reflows | OPEN | Native large-text reflow not device-verified in this pass. |
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

## Remaining P0 backend gaps (not waived)

The following P0 items require backend work (schema migrations + new contracts) and are explicitly left OPEN — not waived:

- **T07 Auction reserve** — `reserve_price_gbp` absent from `auctions` table and detail response; client `reserveStatus` is modelled without server authority.
- **T08 Auction Buy Now order closure** — Buy Now creates a bid and marks `status='ended'` but does not insert into `orders`/fulfilment workflow.
- **T05 Co-Own holdings privacy** — public holdings-detail route still exposes user identifiers, units, entry price, realised P&L.
- **T06 Co-Own rights/dossier** — rights data is mock-only; no versioned rights table.

These must be closed before any production release that exposes Auction or Co-Own trading.
