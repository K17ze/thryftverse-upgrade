# Audit — Sell / Seller-Hub (mobile) — 2026-09-26

## Verdict

This is the strongest department audited to date: the composer has a real media studio (crop/rotate/focal, video posters, resumable upload queue), an idempotent publish pipeline with recovery context, honest sold-comps pricing guidance, seller-proceeds maths, and a per-resource-failure Seller Hub that respects the flat-canvas + hairline surface budget throughout. The gaps are concentrated at the edges: the Bulk Listing path bypasses the media-upload pipeline entirely (broken photos server-side), and three web-parity surfaces are missing or thinner — Bump with 24h cooldown, the fulfilment queue, and the earnings statement/next-payout schedule. Preview fidelity and draft-resume grammar trail the web flow.

## Findings

### SELL-01 — Bulk Listing submits local `file://`/`ph://` URIs as `imageUrl` — published listings ship broken media [P0]
- Screens: `frontend/src/screens/BulkListingScreen.tsx`, `frontend/src/services/bulkListingApi.ts`
- Evidence: `BulkListingScreen.tsx:145-152` collects `ImagePicker` URIs (local schemes) into `item.images`. `bulkListingApi.ts:108-116` passes `item.images[0]` verbatim as `imageUrl` to `createListingOnApi` — no presign/PUT through `mediaUploadQueue`. The canonical path (`useListingPublishPipeline.ts:198-219` → `executePublication`) uploads media then attaches `uploadId`s; bulk skips it, so the server stores a device-local path no buyer can render.
- Web parity: web `SellFlow.publish` uploads `blob:` photos through `uploadsService.uploadImageFile` before POST `/listings` (`web/src/components/sell/SellFlow.tsx:234-245`).
- Competitor: n/a — correctness.
- Root cause: bulk flow was built directly on `createListingOnApi` and never routed through `MediaUploadQueue`.
- Fix: per item, enqueue `item.images` on a `MediaUploadQueue`, then call `createListingOnApi` with `media`/`coverFinalizationId` commands (same contract `executePublication` uses); surface per-item upload failures in the results list.
- Acceptance: a bulk-published listing renders real remote images on PDP/feed for all submitted photos, and a photo-upload failure marks that item `error` without failing the batch.

### SELL-02 — No "Bump" action on mobile; web has one-per-24h bump with persisted cooldown [P1]
- Screens: `frontend/src/screens/MyListingsScreen.tsx`, `frontend/src/screens/ManageListingScreen.tsx`
- Evidence: `ManageListingScreen.tsx:475-509` action cluster = Poster/Share/Preview only; MyListings rows have no per-item bump. `isBumped` exists in contracts (`contracts/DiscoveryListingSummary.ts:94`, `services/listingsApi.ts:67`) and feed ranking consumes it (`presentation/homeDiscoveryViewModel.ts:289`) — the lever is contract-ready, the action is absent.
- Web parity: `web/src/app/seller-hub/listings/page.tsx:78-114` — `bumpCooldownRemaining(bumps[id], now)`, `recordListingBump`, toast "Bumped — back near the top of feeds", footnote "one per item every 24 hours".
- Competitor: Vinted "bump" is a core seller lever; Depop refresh-listing grammar.
- Root cause: bump mutation/persistence was built web-side only.
- Fix: bump endpoint/service + per-listing timestamp persisted in the store; row-level affordance on MyListings and ManageListing with remaining-cooldown state.
- Acceptance: bump disables for 24h per listing with visible countdown/last-bumped time; feed re-fetches so `isBumped` propagates.

### SELL-03 — No explicit draft resume/discard affordance; silent auto-restore with a narrow hint condition [P1]
- Screens: `frontend/src/screens/SellScreen.tsx`, `frontend/src/hooks/sell/useSellDraftPersistence.ts`
- Evidence: draft re-applies silently on mount (`useSellDraftPersistence.ts:200-205`); the only acknowledgement is `draftRestored` gated on `hasDraftContent && !title.trim() && mediaDraftItems.length > 0` (`SellScreen.tsx:252`) — a restored draft that already has a title shows nothing. There is no Discard path: `clearSellDraft` fires only on successful publish (`useListingPublishPipeline.ts:227`), so a stale/abandoned draft haunts the composer forever.
- Web parity: `DraftResumeBanner` with Resume/Discard + "Save draft & exit" (`SellFlow.tsx:442-474`); banner is context-scoped (`pendingDraft.editId === editId`).
- Competitor: Vinted/eBay drafts surfaces show an explicit resume choice.
- Root cause: persistence engineered but the consent affordance never built.
- Fix: on mount with non-empty draft, show a hairline resume banner (Restore / Start fresh → `clearSellDraft`) instead of silent apply; keep the transient "Saved" tick as-is.
- Acceptance: any persisted draft produces a visible resume-or-discard affordance on entry; Discard empties all fields and the store draft.

### SELL-04 — No fulfilment queue; dispatch is reachable only per-order, one level deep [P1]
- Screens: `frontend/src/screens/SellerFulfilmentScreen.tsx`, `frontend/src/components/seller/SellerOrdersModule.tsx`
- Evidence: `SellerFulfilment` is only entered from `OrderDetail` actions (`hooks/orderdetail/useOrderDetailActions.ts:193`), `ChatTransactionStrip`, and notification routing. The hub's orders rail opens `OrderDetail`, not the dispatch surface (`SellerHubScreen.tsx:209-211`). There is no To post / Posted / Delivered state-machine overview — a seller with 6 parcels must visit each order individually.
- Web parity: `web/src/app/seller-hub/fulfilment/page.tsx` — three-stage queue tabs, optimistic `useMarkPosted`, print-label handoff, per-tab honest empties; `SellerSectionNav` carries to-post/posted counts.
- Competitor: eBay seller dashboard "awaiting dispatch" queue is the primary daily surface.
- Root cause: dispatch screen built without the queue surface that feeds it.
- Fix: a `SellerFulfilmentQueue` screen (flat hairline rows, SLA-tinted ship-by) fed by `listUserOrders(role:'seller')`, with an inline Mark-posted/Print affordance routing into the existing single-order screen for label/tracking.
- Acceptance: hub "orders to dispatch" row lands on the queue; marking posted updates the row optimistically and reflects in counts.

### SELL-05 — Composer lacks step-progress grammar; one long scroll, progress only visible at the bottom [P2]
- Screens: `frontend/src/screens/SellScreen.tsx`
- Evidence: sections render sequentially (media → title → details → price/condition → description/tags → shipping) with the completeness row pinned at the bottom (`SellScreen.tsx:1006-1024`). Above the fold there is no indication of what's left.
- Web parity: `SellProgress` renders Photos → Details → Price → Postage → Review with per-step `done` states (`SellFlow.tsx:413-427`).
- Competitor: eBay's sell flow is explicitly stepwise; Vinted progressive disclosure.
- Root cause: mobile chose a single-form composition without a progress rail.
- Fix: a thin underline step rail under the nav header mapping to the existing `completeness` policy keys, or — cheaper — a persistent compact "2 of 4 sections" progress line that anchors-scrolls to the first incomplete section.
- Acceptance: user can see remaining required work without scrolling to the bottom.

### SELL-06 — Listing preview is bespoke, not the real PDP grammar; no feed-context or protection-inclusive price [P2]
- Screens: `frontend/src/screens/ListingPreviewScreen.tsx`
- Evidence: preview uses `ImageViewer` + a boxed `specGrid` (`ListingPreviewScreen.tsx:329-353`), a seller row with placeholder subtext "Seller preview" (`:198`), and no buyer-protection-inclusive price or feed-tile context. It approximates rather than reuses the PDP's component set, so layout/trust signals drift from what buyers actually see.
- Web parity: `web/src/components/sell/SellPreview.tsx` renders the real `PdpGallery`, BuyPanel facts grammar, protection-inclusive price (`:136-147`), seller rating row, and `SellPreviewCard` feed tile (`:242-251`).
- Competitor: Depop/eBay preview mirrors live PDP exactly.
- Root cause: mobile preview predates the shared PDP component set.
- Fix: render the draft through the PDP's identity/facts/seller components (or a PDP-lite path in `ItemDetailScreen`), add protection price line and a feed-tile context section.
- Acceptance: preview pixel-matches PDP section order and typography for the same draft; feed tile shown.

### SELL-07 — Earnings surface misses next-payout schedule, monthly totals and CSV export [P2]
- Screens: `frontend/src/screens/SellerEarningsScreen.tsx`
- Evidence: mobile shows Available/Pending/In-reserve + per-order release schedule (`SellerEarningsScreen.tsx:149-252`). No next-payout amount/date/method, no monthly rollup, no export.
- Web parity: `web/src/app/seller-hub/earnings/page.tsx:27-55` CSV statement (client-built Blob, honest local export), `:83-170` next-payout block + monthly totals + per-order protection-fee breakdown.
- Competitor: eBay payouts page leads with next payout + exportable statement.
- Root cause: mobile surface built from wallet balances only; no schedule/monthly endpoints consumed, no share/export path.
- Fix: consume payout-schedule data if exposed by `getSellerWalletBalances`/commerce API; build CSV client-side and share via `Share.share` — honest local export, no server claims.
- Acceptance: next-payout line present when data exists; "Download statement" produces a CSV with the per-order breakdown shown on screen.

### SELL-08 — BulkListing batch drafts are session-only; photo quality tooling absent [P2]
- Screens: `frontend/src/screens/BulkListingScreen.tsx`
- Evidence: `items` is component `useState` (`:92`) — navigating away or killing the app destroys the whole batch. The per-item sheet uses raw `ImagePicker` picks (`:145-152`) with no `ListingMediaStudio`/crop/focal/reorder, inconsistent with the flagship media grammar of the main composer.
- Web parity: web sell draft auto-saves to localStorage; bulk has no web analogue but the persistence gap contradicts the department's own draft guarantee.
- Competitor: eBay bulk uploader preserves CSV/photo batch state.
- Root cause: batch model never persisted; media path built before `ListingMediaStudio` existed.
- Fix: persist `items` to the store (or MMKV) keyed to user; reuse `ListingMediaStudio` per item or route bulk picks through `convertCaptureUri`+validation so crops/focals are possible.
- Acceptance: batch survives remount; each item's photos editable like the composer.

### SELL-09 — Co-Own "authentication photos" are silently the first two listing images [P3]
- Screens: `frontend/src/screens/SellScreen.tsx:942-986`, `frontend/src/hooks/sell/useSellScreenActions.ts:214-216`
- Evidence: `appendPhotoAsset` auto-fills `authPhotos` from `next.filter(kind==='image').slice(0,2)` — the evidence set is just the first two listing photos. The "Add authentication photo" button calls `handlePickFromLibrary` (`SellScreen.tsx:977`), which appends to the main media strip, not a distinct evidence slot.
- Web parity: none (co-own is mobile-first).
- Competitor: n/a.
- Root cause: auth-photo capture reused the general picker as a convenience; the auto-derive made it look intentional.
- Fix: a dedicated picker writing only `authPhotos`, or explicit "mark as evidence" toggles on media items; remove silent auto-derive so the evidence claim is truthful.
- Acceptance: auth photos are user-chosen and distinct from the cover set; publish validation reads actual evidence, not position.

### SELL-10 — ListingSuccess deviates from the department's flat grammar: elevated card, eyebrow, tips block, support link [P3]
- Screens: `frontend/src/screens/ListingSuccessScreen.tsx`
- Evidence: `ElevatedSurface` summary card + action-rows card (`:171-201`, `:221-343`), eyebrow "published listing" (`:192`), 4-tip tips card (`:347-368`), help-centre link (`:371-387`) — card-on-canvas + label-everything on a screen whose siblings are flat canvas + hairlines. `backendListing` typed `any` (`:51`).
- Web parity: `SellSuccess` is quieter (single success statement + next actions).
- Root cause: celebratory surface authored before the flat-canvas rules converged.
- Fix: flatten to canvas + hairlines; drop the eyebrow and trim tips to one line or move to first-listing education; type `backendListing` as `ListingApiItem`.
- Acceptance: zero elevated surfaces on screen; type-safe listing state.

## Non-findings (verified good)

- **Publish pipeline** (`useListingPublishPipeline.ts`, `services/listingPublication`): staged (upload → create → attach), idempotent retry via `recoveryRef`, honest `failed_recoverable` copy, double-tap guard, draft cleared only on success. Best-in-class.
- **Media studio** (`ListingMediaStudio`, `ListingCameraSheet`): crop/rotate/flip + focal points, ph:// staging, video poster frames, real byte progress rings, offline-aware, reorder/retry. Matches Depop/Pinterest bar.
- **Draft persistence** (`useSellDraftPersistence.ts`): signature-based untouched-field merge for external writes, transient Saved tick, store-persisted across restarts (`useStore.ts:3035`).
- **Composer honesty**: sold-comps window labelled truthful range, seller-proceeds estimate reusing checkout fee helper, category-aware completeness (brandless/sizeless policy), price-vs-market signals — no fabricated certainty.
- **SellerHubScreen**: per-resource failure model with inline `SyncRetryBanner`s (never whole-screen), silent focus revalidation, one dominant money hero, flat canvas + hairlines, sticky dock — exemplary Surface Budget adherence.
- **MyListingsScreen**: server-total tab counts with honest "partial counts" fallback note, silent revalidate, FlashList, promotions entry.
- **SellerFulfilmentScreen**: thin orchestrator; integrated vs manual dispatch, label-error recovery, SLA breach flag, extension proposal, blocked-state grammar.
- **SellerEarnings**: honest escrow states (exception/disputed/awaiting shipment), tabular money, screen-capture protection — just missing web's schedule/CSV.
- **Catalog import wizard**: genuine 5-stage flow (sources → consent attestations → backend-owned progress with no fake % → review workbench with readiness filters + attestation gate → publication receipt) — arguably ahead of web.
- **PostageScreen**: real capability-driven carriers, "from £X — actual costs at checkout" honesty, skeleton matching row geometry.
- **EditListingScreen**: section-deep-link focus scrolling, discard guard, optimistic-lock `expectedUpdatedAt` save, owner/permission gates.
- **Tag autocomplete** (`TagInputWithSuggestions`) present — web parity confirmed.
- **A11y**: roles/states/labels consistent; decorative icons `accessible={false}`; 44pt transparent targets; `useA11yAudit` on Sell.
