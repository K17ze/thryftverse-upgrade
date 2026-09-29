# Campaign Status — Web Flagship Quality Audit + Upgrade (2026-09-26)

**Campaign:** `web-flagship-quality-2026-09-26`
**Target:** `web/` (Next.js 15.5.26, React 19, Tailwind v4, TS strict — 100 routes, 345 components)
**Branch:** `feat/product-detail-contract-media-device-closure`
**Trigger:** User directive — audit mobile dept-by-dept as product reference, audit the
webapp, cross-reference with eBay / Vinted / Pinterest / Instagram (and adjacent
references: Depop, Polymarket/TradingView, Whatnot, Grailed), find quality caveats
via in-depth research, and keep upgrading the WEBAPP to flagship production level.
Anti-AI design policy is binding (`web/DESIGN-SYSTEM.md`, AGENTS.md §4).

## Prior state

Web app completed 12 upgrade waves (see `campaign-status-web-frontend.md`):
mechanical audit green (tsc/eslint/build/100-routes/0 dead controls), reference
parity verified in code for eBay/Polymarket/Pinterest/Instagram. Mobile app
audited today in parallel campaign (`campaign-status-mobile-audit-2026-09-26.md`,
8 P0 / 44 P1 / 42 P2 / 28 P3 — mobile-side fixes, disjoint from web/).

## This campaign's audit angles (residual quality caveats)

Previous waves verified *mechanical* correctness and reference parity. This wave
targets the layer mechanical audits can't see:

1. Composition/hierarchy per surface (thumbnail + squint test vs references)
2. Rendered quality at 1440px desktop AND 390px mobile (overflow, density,
   tap-target, safe-area, sticky collisions)
3. State coverage depth (partial/error/offline/slow/hydration edge cases)
4. Anti-AI tells (label-everything, card-fatigue, symmetry-by-default, duplicate
   titles, decorative chrome, placeholder media treatment)
5. Competitor-grammar depth per department (fresh 2026-09 live research)
6. Data-truth honesty (fabricated fields, copy that overpromises, fixture-only
   surfaces presented as live)
7. Perceived performance (image priority/sizes, skeleton fidelity, layout shift)
8. Accessibility depth beyond mechanical checks (focus order, contrast in both
   themes, reduced-motion, keyboard-only journeys)

## Execution model

- Phase 1: clean prod build + server on :3000 (single build owner)
- Phase 2: N parallel read-only audit agents (disjoint departments) →
  `.flagship/audit-web-2026-09-26/<dept>.md`
- Phase 3: parallel live-research agents → competitor grammar refresh
- Phase 4: gap registry synthesis → P0-P3
- Phase 5: parallel implementers, disjoint file ownership
- Phase 6: verify (tsc/eslint/build/route-smoke/Playwright) + fresh adversarial review

## Ledger

## Phase 4 complete — gap registry written
- `.flagship/gap-registry-web-2026-09-26.json`: P0:10 · P1:74 · P2:68 · P3:22, grouped into 9 workstreams with disjoint file ownership.
- Orchestrator foundation edits (tsc clean): AppImage blob/data-URI + src-reset; `isLocalMediaUri` shared in media.ts; coverPhoto seeds (u1/u3/u5/u6/me); `data.posterStories()`; `data.notificationEntries()`; feed units editorial + recommendation_break + featured span.

## Phase 5 — implementation wave dispatched (9 parallel)
- WS-1 home/feed/pulse (a8d20074) — FOLLOWED_SELLERS hardcode, error/retry states, MasonryGrid hook, rail wiring, segmented semantics
- WS-2 search/browse (814d06b6) — visual-search error/copy, filter consolidation, facet counts, synonyms, dead components
- WS-3 commerce/orders (6753523f) — offer→order P0, report-fabrication P0, fee/postage truth, mobile dock, order grammar
- WS-4 sell/seller-hub (5750caf8) — draft store unification, fulfillment join, print-label truth, publish validation, guest wall
- WS-5 identity/social (be2b1a6e) — Message→DM, private collections, tab semantics, verified-buyer badge, cover wiring
- WS-6 messaging/notifications (28dfeff7) — mark-read P0, muted badge accounting, message-type rendering, notificationEntries wiring, hydration
- WS-7 auctions/live (f402e194) — guest 'me' P0, host-pin→viewer P0, self-bid, leading state, watch, won-payment, focus trap
- WS-8 co-own/wallet (1c6c7f6c) — walletKeys factory P0, order/position/ledger P0, limit fill eval, holdings checks, chart a11y
- WS-9 settings/chrome/primitives (ad21e477) — a11y app-wide P0, onboarding flag, social-auth honesty, skip link, toggle grammar, toast role

## Phase 6 — wave-2 depth passes + integrated verification (2026-09-26)

- All 9 wave-1 + 9 wave-2 workstreams complete (~215 files touched).
- Integrated verification: `tsc --noEmit` clean, `eslint .` clean (0/0), `next build` clean (81 static + dynamic routes), 80-route smoke all 200, `scripts/journey.mjs` 6/6 PASS (inbox mark-read 3→2, offer-accept→order nav, orders rows, private collection, wallet balances).

## R2 adversarial review — fresh-eyes wave (3 reviewers, read-only)

Three independent reviewers (honesty / a11y+state / consistency+parity vs mobile) produced the following confirmed findings — now in fix wave R2 (5 workstreams):

### Honesty (8 P0, 5 P1, 4 P2)
- P0 wallet top-up fabricates card charge incl. live mode (WalletSheets)
- P0 settings 'Thryft balance' renders fixture constant (SettingsView)
- P0 support replies self-confirm + fake system ack on failure
- P0 accept/escalate/CSAT cache-only on live cases w/ success toasts
- P0 live-order lifecycle actions fixture-only w/ success toasts
- P0 RM-format tracking numbers minted on dispatch
- P0 seller earnings/payout ledger fixture-only in live mode
- P0 live viewer count randomized + scripted chat undisclosed
- P1 systemic `user?.id ?? 'me'` guest leaks (9+ account surfaces)
- P1 follow button never calls backend in live mode
- P1 co-own report mints random ref; VerificationSheet hardcodes 'Verified'; language picker dead

### A11y/state (2 P0, 7 P1, 5 P2)
- P0 SessionProvider reads useFollows ungated → SSR mismatch on /profile
- P0 auction hooks drop isError/refetch → live failure renders "not found"
- P1 error→not-found conflation on 5 surfaces; role=tablist on filter Chips (2); role=tab rails w/o roving tabindex (OrdersTabRail, OrderBookPanel); CoOwnOnboardingGate dialog no Escape/focus; placeholder-only labels (ReturnCaseCard cluster + 4 sheets); 20+ hit targets <44px (one at 20px)

### Consistency/parity (4 High, 8 Medium, 6 Low)
- HIGH in-chat offer Accept/Decline cosmetic — Message contract lacked offerId (orchestrator added); mobile creates real order
- HIGH PDP ignores reserved/paused/draft + holidayMode/reachState (ListingSeller fields added); /checkout?item= pays sold items
- HIGH fixture purchases never mark listing sold (recordOrder)
- HIGH fulfilment dispatch writes parallel FULFILMENT_QUEUE; /orders never updated; live shipOrder doesn't invalidate ['orders']
- MED recordOrder superseded flat-fee totals + only-first-item; no ['orders'] invalidation after createOrder/BidPanel; offer accept skips listing/feed invalidation; offer payload missing idempotency/expiry/conversationId; decline/cancel ephemeral; OfferCard matrix divergent; profile About tab missing; cache-write key mismatch; SLA copy contradicts; Pay-on-created-order re-mints order

## R2 fix wave dispatched (5 parallel, disjoint ownership)
- Fix-A commerce/orders/seller truth (queries.ts, fixtures-commerce, checkout/orders/offers/seller-hub, PDP buy surfaces, capabilities port)
- Fix-B inbox/notifications (offerId wiring, OfferCard matrix, muted/request badges, request persistence, menu kbd, error branches, 'me' leaks)
- Fix-C wallet/co-own/live/support (top-up gating, support confirm-on-post, fixture footer, withdraw/invite/report copy, live presence truth, onboarding dialog a11y)
- Fix-D settings/profile/social (SessionProvider hydration gate, follows live calls, payment-data hydration, verification sheet, About tab, 5 error surfaces, 'me' leaks)
- Fix-E auctions/search/pdp-media/shared-ui (auction isError, thumbnail semantics, Sheet/Chip/SegmentedControl hit areas, region-picker kbd, PdpReviews silent failure)

## R2 fix wave — complete (5/5 workstreams)

- **Fix-E** (auctions/search/pdp-media/shared-ui): auction hooks expose isError/refetch + retry states on all auction surfaces incl. create flow; thumbnail role=tab → aria-pressed; Sheet close restored to 44px; Chip/SegmentedControl/TagField/ChatTurns/FilterSheet hit areas to 44px via pad-out; VisualSearchRegionPicker keyboard nudge path + real role; PdpReviews error state; item/[id] error≠not-found.
- **Fix-D** (settings/profile/social): SessionProvider follows-count hydration gate + stale-follows reset on sign-out; follows.ts live follow/unfollow calls w/ optimistic revert + fixture-scoped seeds; payment-data hooks self-gate hydration; VerificationSheet derives real fields; fabricated unmounted sheets deleted; language picker honest; settings balance → useWalletData; About tab ported (Shop/For-sale/Sold labels unified); 5 error-vs-not-found surfaces fixed; 9 'me' leaks gated; RatingInput roving radiogroup.
- **Fix-C** (wallet/co-own/live/support): top-up demo-gated + hidden live; support replies confirm-on-POST w/ failed+retry; fake system ack deleted; accept/escalate/CSAT hidden on live cases (CSAT posts to /feedback live); fixture footers gated; withdraw/invite/report-SLA copy honest; co-own report → real createTicket; live viewer count verbatim + scripted chat disclosed; onboarding gate focus-trap; tablist misuses downgraded.
- **Fix-B** (inbox/notifications): offerId→real offer actions via acceptOffer → order nav; OfferCard canonical matrix (cancel for buyer, withdraw for author); muted badge dimmed-not-hidden; request threads excluded from header/tab badges; request resolution persisted to inboxPrefs v3; menu kbd traversal; error branches; 'me' leaks gated; cache keys real shape.
- **Fix-A** (commerce/orders/seller): **live payment truth** — createOrder + payment-intent + settlement poll, pending → order detail (native useCheckoutPaymentFlow parity); fixture recordOrder marks listing sold; ?item= filters unavailable; ['orders'] invalidation + seeding on all order-creation paths; offer accept invalidates listing/feed; decline/cancel persist; live-order lifecycle actions DATA_MODE-gated; RM-format tracking mint removed (live uses real POST /shipping-label); fulfilment writes through to orders; live earnings emit honest nulls, no fixture ledger; listingCapabilities() port (reserved/paused/draft/removed + holidayMode/suspended suppression); dispatch SLA single constant (2d) incl. policy pages; offer payload parity (expiry/conversationId/idempotency); guest gates on orders/offers; order-scoped pay; labels/hit-area/roving-tabindex a11y in owned files.

## Final verification (post-R2)
- `npx tsc --noEmit`: clean (0 errors)
- `npx eslint .`: clean (0 errors, 0 warnings)
- `next build`: clean
- Route smoke: 50/50 → 200
- `scripts/journey.mjs`: 6/6 PASS

## Deferred / blocked by contract (honest, documented)
- Live web card checkout: orders+intents created truthfully; card settlement needs Stripe Payment Element (not present). Pending state routes to order detail.
- Live support-case accept/escalate endpoints absent — hidden in live mode.
- Editorial/recommendation feed units fixture-authored only — live feed contract carries listing/poster/look.

## Phase 7 — flagship cross-reference research (2026-09-26)

9 dept research agents: live competitor research (Vinted/eBay/Depop/IG/Pinterest/TikTok Shop/Whatnot/Polymarket/Kalshi/Robinhood/StockX/Etsy/Airbnb/Linear) + deep code audit -> .flagship/research-crossref-2026-09-26/ (REPORT.md + 9 dept reports).

Headline: honesty/grammar layer flagship-grade post-R2; residual gap = UNWIRED capabilities (recommendations serve, feed feedback, chat cursors/typing/reactions, proxy bidding, lot auctions, PDP delivery/returns fields, vacation mode, promoted listings) + ~8 residual truth nits. Wave-3 ordering proposed in REPORT.md.

## Phase 8 — wave-3 implementation fleet (dispatched 2026-09-27)

9 disjoint-ownership workstreams implementing REPORT.md wave-3 ordering:
W3-A discovery/feed (recommendations serve, feedback controls, explainability, refresh grammar, Made-for-you honesty, infinite scroll)
W3-B messaging (cursors/load-older, reactions, edit/delete, safety banner, unread filter, notification pagination, typing-if-transport)
W3-C auctions/live (maxBidGbp proxy, reservePrice, ended grammar, seconds countdown, six-hour copy fix)
W3-D commerce/PDP (delivery/returns contract fields, offer guards, zoom honesty, Q&A, dispatch line)
W3-E search (facets->URL, colour facet, multi-select, member honesty, best-match scoring, related/most-liked)
W3-F profile/social (highlights rail, SaveToBoardSheet recents/search/create, board mgmt, share consistency, block)
W3-G seller (vacation mode control, promoted manage, RRP/sustainability, bulk ops, demo-bank caveat)
W3-H trading/wallet (P&L cost basis, derive reserved, unseed alerts, syndicate settlement, live sparklines, candle toggle)
W3-I chrome/settings (settings search, badge semantics, pre-disclosure, signup-wall re-entry, sheet drag, session confirm)

Shared seams resolved: queries.ts/domain.ts read-only for WS (new hooks in dedicated files; domain.ts additive-fields owned by W3-D).

## Phase 9 — wave-3 verification (2026-09-27)

All 9 workstreams landed (3 required restart after rate-limit kills; restarts resumed predecessors partial work and fixed breakage).

Shipped: recommendations serve via GET /recommendations/:userId + feed feedback/explainability; chat cursors + reactions + edit/delete + safety banner + unread filter + notification pagination; maxBidGbp proxy + reservePrice + ended grammar + live seconds countdown + live lot dock; PDP delivery/returns contract fields + offer floor/one-active guards + real 2.5x lightbox zoom + live Q&A + pay-now on unpaid orders; search facets->URL + colour facet + multi-select + member results + best-match scoring + related searches; highlights rail + SaveToBoardSheet recents/search/create + board mgmt + unified share + block; vacation mode control + promoted manage + RRP/sustainability + bulk ops + per-listing stats sheet + demo-bank label; cost-basis P&L + derived reserved + unseeded alerts + syndicate settlement + live sparklines + candle toggle + order review step + GFD/GTC90 TIF; settings search + badge semantics + notification pre-ask + signup-wall re-entry + drag-to-dismiss sheet + personal info surface.

Verification: tsc clean, eslint clean, next build clean (84 static gens / ~109 routes), smoke 79/79 -> 200, journey 6/6 PASS (incl. offer-accept->order).

Orchestrator fix: fixture time-bomb — hardcoded expiresAt/closesAt dates rotted overnight killing the offers journey; all deadline-gating fixture fields now relative (offerExpires / inline Date.now()). Display-only history untouched.

Accepted platform gaps (documented, not fabricated): web realtime transport (typing/streaming) absent; live support accept/escalate endpoints absent; APM payment rails (PayPal/Apple Pay) need saved-instrument contract; live lot polling only; auctions notifications need NotificationKind extension.

## Phase 10 — R3 adversarial repair round (2026-09-27)

3 fresh-eyes reviewers (focus/state a11y, truthfulness, parity) -> ~20 confirmed findings. 5 disjoint repair workstreams landed:
- Shared a11y primitives: lib/a11y/scrollLock.ts (refcounted body lock) + lib/a11y/focus.ts (trapTabKey, focusAdjacentMatch); Sheet/PdpLightbox focus traps + onCloseRef pattern (focus steal + Shift+Tab leak fixed); FeedItemMenu deliberate-vs-passive dismissal + focus parking on tile removal.
- Chat: near-bottom gating (80px) + "New messages" pill; MessageBubble deliberate restore; Composer edit-stash stack; notifications dedupe + clearedIds cap-500 + store versioning; chat.ts ok:false guard.
- Truth P0s: live 1ZE balance now real (GET /wallet/1ze/:userId/position, null on failure, buys gated honestly); offer-to-likers posts POST /listings/:id/offers-to-likers in live; corporate-action votes POST /co-own/corporate-actions/:id/votes with optimistic revert + status/deadline locks + guest sign-in gate; syndicate fixture pools gated in live (SyndicateLiveNotice).
- Settings/seller: settings-search aria-live + Enter activation, bulk-action 44px hits, feedPrefs versioning.

## Phase 11 — wave-4 parity review + R4 repair fleet (dispatched 2026-09-27)

Parity reviewer: 21 findings, 4 HIGH — auction bid/buy-now missing idempotencyKey + unknown_outcome (double-bid risk), live seller-away gate unreachable (needs GET /sellers/:id), no composer-time safety scan, reserve price silently dropped by backend schema in live mode.

R4 fleet (disjoint): R4-A auctions money path; R4-B inbox safety/action grammar/menus; R4-C seller-away wiring + carrier fallbacks; R4-D feed explanation topics / highlights grammar / Most-liked honesty / tile markers / blur restraint.

## Phase 12 — R4 repair verification (2026-09-27)

All 4 R4 workstreams landed + orchestrator follow-ups:
- Auction money path: idempotencyKey per attempt + reconcileBidOutcome (lookup-by-key, 8-attempt backoff), outcomeUnknown copy; buy-now {idempotencyKey, expectedPriceGbp}; VERIFIED maxBidGbp is hard-400'd by live schema -> proxy toggle gated live with honest copy, reserve field gated live (backend drops it); binding-bid disclosure; sentence countdown + danger <60min.
- Inbox: composer-time safety scan (port of native detectComposerWarnings) + quick-reply rescans; role-aware banner copy; menu Tab-orphaning fixed across Composer/ConversationRowMenu/AccountMenu/MessageBubble; duplicate MediaLightbox mount removed; Extended reactions verified at 18 (native parity); ForwardSheet/pin/save/report wiring verified against backend chat routes.
- Seller-away live gate: sellers.ts service (GET /sellers/:id trust summary) + useSellerTrustSummary wired into capabilities at BuyPanel + PdpBuyDock + checkout ?item= guard; normalizeSeller maps holidayMode/reachState; holiday-mode row added to Privacy settings + search index; "Welcome back" toast -> factual copy; carrier fallbacks nulled in fixtures-commerce.
- Feed/profile/search: FeedExplanationSheet See-more + Remove-topic wired to POST /recommendations/intent/:userId/mutate (live-gated, not faked in fixtures); highlights rail gated-on-nonempty + New tile trailing + frame badge + 80px tiles; SortDropdown "Most liked" when no query + casing; ProductTile Paused chip + sold-tile quick-action suppression; LiveLotDock backdrop-blur -> flat scrim; CoOwnOnboardingGate/LiveViewerOverlay/SharedMediaGrid migrated to refcounted scrollLock.
- Backend bug found (not web-owned): auction_bids.idempotency_key stored scoped (bid:/buy_now: prefixes) but lookup route compares raw key — reconciliation degrades to safe_to_retry; dedupe still protects. Filed for backend fix. Native parity gap found: native useAuctionDetail sends maxBidGbp to a schema that forbids it.

Verification post-R4: tsc clean, eslint --max-warnings 0 clean, next build clean (~120 routes incl. receipts/verification/security/moodboard/vote surfaces), smoke 38/38 -> 200, journey 6/6 PASS.

## Phase 13 — R5 final audit + repair (2026-09-27)

Fresh-context audit found 4 real defects post-R4; all repaired and verified:
- P0 auction winner-pay: POST /orders on auction-paused listing was a guaranteed 409 -> payAuction (POST /auctions/:id/payment) wired with per-attempt key, SCA nextActionUrl handoff, settle polling, paidOut state. Buy-now CTA wired to buyAuctionNow (isBuyNow verified, navigates to bound order).
- P0 withdraw fabrication: payouts.ts service + real Stripe Connect onboarding, idempotent submitPayoutRequest + lookup-by-key; live mode never merges fixtures; fixture path discloses demo.
- P1 placeCoOwnOrder idempotencyKey required at boundary, minted per confirm.
- P1 seller-away pending window -> pending surfaces while trust fetch in flight.

Post-R5: tsc clean, eslint clean, build clean, smoke 33/33, journey 6/6.
R6 convergence audit dispatched as the charter's confirming re-audit wave.

## Phase 14 — R6 convergence audit + repair (2026-09-27)

Fresh-context convergence audit found 4 P1 fixture-in-live leaks; all repaired:
- Wallet ledger rendered fixture transactions in live; real /users/:id/transactions fetched but dropped -> buildLedger consumes the real wire shape (direction-signed, no fabricated running balance).
- Live checkout showed fixture addresses/cards then NaN-stripped ids on POST /orders -> real address/payment-method rails wired (new services/checkout.ts + useCheckoutInstruments); AddCardSheet self-gates to tokenisation notice (no web card rail exists — documented product gap).
- Bag dead in live (fixture-only listingById) -> useBagListings batch-resolves live ids via GET /listings/:id.
- PDP published fixture sold-comps + fixture similar-listing 404 deep-links -> real /listings/:id/price-history, /sold-comparables, /related wired via pdp-market-queries.ts (wired, not hidden).
- Follow-on: settings addresses/payment-methods, order detail + receipt instrument rows wired to the live rails (instrument-queries.ts).
- Orchestrator: auction PDP similar rail -> real hook; useSellerListings enabled-gate.

Post-R6: tsc clean, eslint clean, build clean (~135 routes), smoke 37/37, journey 6/6 PASS.
Accepted P2/P3 residuals + backend follow-ups recorded in gap-registry.

## Phase 15 — Desktop rework wave (2026-09-28)

User direction: webapp reads as a stretched mobile UI; engineer properly for desktop.
Contract authored: .flagship/desktop-contract-2026-09-28.md (canvas 1440px,
breakpoint contract, per-surface grammar, additive-only rule).
8 disjoint workstreams dispatched: DX-A discovery/home, DX-B search, DX-C commerce,
DX-D profile/social, DX-E messaging/notifications/support (inbox master-detail),
DX-F wallet/co-own trading panes, DX-G seller/live/auctions ops, DX-H settings rail + misc.
Shared (read-only for all): components/ui, components/layout, src/lib.

## Phase 16 — Desktop rework landed + verified (2026-09-28)

All 8 DX workstreams landed clean; contract honored (additive lg:/xl: only,
zero mobile regressions, no fabricated content):
- DX-A discovery: 1440 canvases, grids scale to xl:5/xl:6, explore→useMasonryColumns.
- DX-B search: verified Vinted facet rail existed; member 2-col scan rows, landing xl:8.
- DX-C commerce: orders/offers true table grammar at lg; order detail two-pane;
  receipt document+rail; PDP canvas xl:1440 with corrected image sizes.
- DX-D profile/social: IG-desktop hero (150px avatar, stats inline), highlight 87px,
  look/outfit/poster two-panes, edit-profile live preview rail.
- DX-E messaging: InboxSplitView master-detail (380px rail + chat), notifications
  2-col groups, help/support/appeal two-pane + sticky rails.
- DX-F wallet/co-own: balances+ledger two-pane, payouts destinations rail,
  asset detail 1fr/400px trade rail, syndicate/market-tape true columns.
- DX-G seller/live/auctions: ops tables with lg column headers, earnings two-pane,
  sell form + sticky preview rail, auction create run-sheet rail, catalog-import step rail.
- DX-H settings/agents: new settings/layout.tsx rail (248px sticky nav derived from
  destinations) + 720px content; agents ops tables; invite two-col; onboarding card.
Orchestrator fixes: InboxSplitView rail w-full→w-auto (empty-pane clipping bug found
in rendered check); closet editable grid xl:5 + mosaic lg:h-64 (DX-D flags).
VERIFY: tsc clean, eslint clean, build clean (135 routes), smoke 39/39,
journey 6/6 PASS @1440px, desktop screenshots verified (inbox/orders/profile/
wallet/settings/home/search/seller-hub/auctions) in .flagship/desktop-2026-09-28/shots/.

## Phase 17 — DX-2 follow-up wave (2026-09-28)

User-directed corrections after the DX desktop wave:

- **DX2-A messaging/notifications depth**: ConversationList gained
  Buying/Selling/Requests segment rail + secondary filter chips, roving
  keyboard nav, Escape-clears-search; ConversationRowMenu is a real
  pointer-anchored context menu (touch-visible kebab kept); ChatPanel got
  Escape-to-deselect, group avatar recurrence, readable lg column;
  Composer restores per-thread drafts (new useChatDrafts) + desktop
  autofocus; MessageBubble linkifies URLs; notifications gained a
  Needs-attention section, actionable rows (Follow back), dismiss overlay
  in notificationCursor store, settings gear, two-column day groups.
  Reports: dx2a-messaging-report.md.
- **DX2-B co-own pools**: "syndicate" purged from all user-visible copy —
  routes /co-own/syndicate/** → /co-own/pools/** (next.config 308s),
  components/syndicate/ → components/pools/ (PoolHubView, PoolRow, etc.),
  all 13 locale files regenerated from the sync script source. Concept
  parity vs native verified: removed two fabricated lifecycle CTAs
  (Settle pooled buy, Dissolve pool — no wire/native contract); withdraw
  now open to any member. Contract/type names stay `syndicate` to match
  the backend wire shape. Report: dx2b-pools-report.md.
- **DX2-C forms**: edit-profile preview rail removed (re-authored as a
  focused form: two-up field pairs, View-profile link, right-aligned
  commit). Run-sheet restatement rails removed from /live/create and
  /auctions/create. Functional rails kept (sell preview, checkout summary,
  help, support). Report: dx2c-forms-report.md.

VERIFY: tsc clean, eslint clean, build clean (pools routes generated,
syndicate routes gone), smoke 17/17 + /co-own/syndicate 308→pools,
journey 6/6 PASS @1440x900, rendered shots verified in
shots-dx2/ (inbox, notifications, pools, profile-edit, live-create,
auctions-create).

## Phase 18 — DX-3 flagship polish wave (2026-09-28)

- **DX3-A profile hero (P0 bug + redesign)**: identity row's -mt-16 dragged
  the username/bio/stats ONTO the cover photo — invisible dark-on-image.
  Re-authored: contained banner (lg:mx-6, h-56/xl-64, rounded, focal crop
  lg:object-[50%_35%], honest sizes attr), avatar alone bridges the seam
  (lg:-mt-[75px] = native AVATAR_SIZE/2 contract), all identity text on
  canvas. h1 -> lg:text-hero. ClosetGrid lg:5/xl:6, ShopRail 168px cards,
  ClosetListingsSection grid parity lg:5/xl:6 (orchestrator fix).
- **DX3-B flagship tab system**: new components/ui/Tabs.tsx — text tabs
  with 2px underline indicator on hairline baseline, WAI-APG roving
  tabindex (arrows/Home/End), route-mode (Link/aria-current) + state-mode,
  honest counts. Migrated 12 surfaces: notifications, inbox primary rail,
  profile tabs, orders, seller section nav (8 pages), co-own hub + asset
  detail, auctions + my-bids + fulfilment, offers. True filter chips kept
  as chips; SegmentedControl retained for toolbar use. Orchestrator:
  migrated home For You/Following to Tabs too.
- **DX3-C residual sweep**: codebase ~95% covered by prior waves;
  fixed /co-own/guide (was a phone column -> lg two-pane explainer +
  3-cell nav).

VERIFY: tsc clean, eslint clean, next build clean, journey 6/6 PASS
@1440x900, rendered shots verified (profile, /u/dankdunksuk,
notifications, inbox) in shots-dx2/.
Reports: dx3a-profile-hero-report.md, dx3b (in agent transcript),
dx3c (in agent transcript).

## Phase 19 — DX-4 production-engineering audit dispatched (2026-09-28)

Five parallel read-only auditors over the web codebase:
state/data-integrity (persist hydration, query keys, fixture leakage,
optimistic-write truthfulness, races) · React perf/render health
(memoization, effects, hydration, code-split, virtualization, image
budgets) · a11y+interaction (semantics, focus, keyboard, hover-parity,
targets, SR truth, forms) · app-router correctness (error/loading/
not-found boundaries, metadata, streaming, param handling) ·
design-system coherence (primitive drift, token violations, AI-tells,
typography, icons, density, state-surface drift).
Reports: .flagship/review-r4/*.md -> repair fleet next.

## Phase 19b — DX-4 audit results + repair fleet (2026-09-28)

All five audit reports in `.flagship/review-r4/`:
- approuter-audit: soft-404s on all public detail routes, zero
  metadata/favicon/robots/sitemap, no loading/error boundaries,
  onboarding deep-link hijack, /orders/[id] fetch-all-then-find.
- a11y-interaction-audit: 9 mediums + lows — focus-restoration losses
  (menu/dismiss/remove), fake tablists (SupportHub, PhotoEditSheet,
  auctions/create radiogroup), no chat live-region, sub-44px targets.
- perf-render-audit: Toast context inline-value fans out to ~122
  consumers; 10-14 competing priority images; zero code-splitting;
  unbounded lists; search cursor dropped (page-1 only); header badges
  over-fetch; Composer render-phase rAF.
- design-system-audit: dead border-hairline, white-on-brand invisible
  check, shadow-lg drift, caps-label/verified-color/count-pill drift.
- state-integrity-audit: 3 P0s — live /saved + profile favourites
  resolve server ids through fixtures (empty grids, real counts); no
  queryClient.clear() on account switch (account B inherits A's
  orders/notifications); persisted slices survive logout. P1s: profile
  edit never reaches server (PATCH /users/me unwired), look/poster/
  outfits/orders fixture-resolution, saved-search alerts localStorage-
  only despite real endpoints, optimistic writes w/o rollback.

Repair fleet dispatched (disjoint ownership):
- R4-A: app-router correctness (app/** + next.config + AppShell)
- R4-B: perf/render (Toast, feeds, images, queries.ts, dynamic imports)
- R4-C: a11y/interaction (inbox rows, notifications, Sheet, fake tablists)
- R4-E: state core (stores, SessionProvider, listing-resolution helper)
- R4-D design-token sweep sequenced LAST (codebase-wide, collides).
- Orchestrator follow-ups queued: queries.ts key scoping (post-B),
  app-page state wiring (post-A, E supplies hook APIs).

## Phase 19c — DX-4 repair fleet complete (2026-09-28)

Six repair workstreams landed (all restarted once after rate-limit kills;
resume-aware prompts verified prior partial landings before continuing):

- **R4-A app-router** (`r4a-approuter-fixes.md`): tri-state route
  resolvers (lib/api/server.ts — resolved/missing/unresolvable, never a
  fabricated gravestone); server shells + notFound() + generateMetadata
  on item/u/auctions/collection/galleria x2/look/moodboard/poster/
  category/explore/pools/co-own; robots.ts + sitemap.ts + icon +
  apple-icon + manifest; metadataBase + OG defaults; onboarding
  deep-link return (sessionStorage return-to); useOrder(orderId) hook
  (GET /orders/:id) replacing fetch-all-then-find; orders ?tab=
  deep-link; loading.tsx x3 + error.tsx x4; Suspense fallback skeletons;
  outfits miss → notFound().
- **R4-B perf** (`r4b-perf-fixes.md`): Toast context memoized + timer
  hygiene + focus-pause; one prioritized image per grid (HomeFeed
  prioritizeFirst); dynamic imports for CameraSheet/PhotoEditSheet/
  PdpLightbox/OfferSheets/VisualSearch camera (capability gate moved to
  lib/media/cameraSupport.ts so the split is real); SignupWall →
  app-level provider (26 consumers, single sheet); ClientTime wrapper +
  UTC-pinned timeAgo/formatDate (~38 sites); React.memo on ProductTile +
  MessageBubble (ChatPanel restructured to stable message-keyed
  callbacks); AuctionDeadlineChip gated; header count-only badges.
- **R4-C a11y** (`r4c-a11y-fixes.md`): focus restoration on
  menu-activation/dismiss/remove (focusAdjacentGroupControl); SupportHub
  + PhotoEditSheet fake tablists fixed; auctions/create radiogroup
  roving tabindex; 5 pad-out sites; Sheet aria-labelledby + type-guard;
  ForwardSheet role=list; kebab viewport clamping; aria-expanded sweep.
- **R4-E state core** (`r4e-state-fixes.md`): P0 session-identity reset
  — adoptIdentity bumps epoch + queryClient.clear() +
  resetAccountSlices() (24 persisted slices) on every identity change;
  late-hydration veto; saved-list writes revert-on-fail +
  savedSyncError/savedListsStale channels; look-save domain split
  (savedLooks → /looks/:id/save); useListingIds/useSellerSummary
  resolution helper; profile edit → PATCH /users/me (saveProfileLive);
  saved searches → real /users/me/saved-searches CRUD; collections
  no-swallow writes; moodboard membership endpoints + syncIssues;
  agent mutation rollback; useOwnerBoards hydration gate.
- **R4-F app wiring** (`r4f-app-wiring.md`): all 10 wiring items —
  saved/profile grids via useListingIds (P0 #1), look creator/rail,
  orders detail/receipt live resolution, collection delete/membership
  try/catch + useBoardCoverThumbs, moodboard actions routed + overlay
  fixture-scoped, profile edit live save, outfits live, poster
  author-from-wire + live-hidden owner actions, sync-failure surfacing.
- **R4-D design tokens** (`r4d-design-tokens.md`): dead text-title class
  found + fixed; bg-brand text-white → text-text-inverse; 3 shadow-lg →
  tokens; 98 screen-title sites weight-unified; 14 verified badges →
  text-commerce-trust; 6 row hovers → bg-row; LiveBadge dedupe; z-10 →
  z-elevated x14; scrim ink tokens; text-micro; caps-label grammar
  unified (137 label + ~140 micro/meta sites).

Orchestrator handoffs also landed: intent-topics/candles/governance-
votes/auction queryFns thread AbortSignal; BuyPanel formatEtaDay
UTC-pinned; ListingShareCard/OfferCard times via ClientTime; priority
residue removed (ClosetGrid/LooksGrid/ClosetListingsSection); eslint
warnings cleared.

VERIFY (fresh runs): tsc clean · eslint clean (0 problems) · next build
clean (102 routes) · smoke 39/39 → 200 with real fixture ids (404s on
guessed ids were the new notFound() working) · journey 6/6 PASS ·
rendered shots verified: PDP (delivery truth + unified badge), look
(creator resolved + shoppable rail), saved (honest empty + text tabs),
profile, notifications, orders — .flagship/desktop-2026-09-28/shots-dx2/.

Accepted residuals: chat unread has no count endpoint (documented);
count-pill has no shared primitive (drift documented); live white/10
fills have no tokens; SocialButtons logo glyphs bypass registry (no
logo glyphs exist); meta-caps unification tightened 21 tracking sites
(visible-but-intended); ListingQA seller label stays success-text
(answer attribution, distinct element).

## Phase 19d — R4 convergence review + seam repairs (2026-09-28)

Fresh adversarial reviewer on the six-wave cumulative diff found 9 seam
defects (3 P1, 6 P2) — all fixed and re-verified:

- **P1 offers counter dead in live**: counterListing resolved via
  useListingIds (was ungated fixture lookup → Counter action no-op);
  OfferSheet now dynamic-imported (last eager consumer).
- **P1 AuctionRunwayCard fixture ghost**: wire-provided auction.seller
  preferred; fixture catalogue fixture-gated (live-id collision would
  attribute lots to the wrong member); verified badge renders only when
  the identity carries the field (wire shape has none — never assumed).
- **P1 resetAccountSlices gaps**: feedPrefs (hidden/downweights/ceilings
  — pushed to /interactions live), algorithm tuning, auction watchlist,
  live reminders, postage prefs, sell draft — all now cleared on
  identity change via module reset helpers that clear the
  useSyncExternalStore caches + notify mounted subscribers.
- **P2s**: conversationRole fixture lookup gated (live seller threads no
  longer mislabel buying when ownerId absent — native's same default);
  SellerAuctionRow brand via useListingIds live; BidHistory enrichment
  fixture-gated (wire bidderName is truth).

Checked clean by the reviewer: session epoch veto (no permanent wedge),
server-shell/client notFound() no double-fire, memo comparators complete,
toast timer hygiene, dynamic-import gating, token-sweep hierarchy intact,
pulseModel/MemberEditsRail/offerAcceptance fixture seams.

Two findings rejected as intentional: groupAdmin "A member" copy
(removeFixtureMember is fixture-gated by caller; live uses liveGroupApi),
SignupWall once-per-action session memory (documented mobile-matching
grammar with cooldown nudge re-entry affordance).

VERIFY (fresh): tsc clean · eslint clean · build clean · smoke 40/40 ·
journey 6/6 PASS.
