# Campaign Status — Web Frontend (ThryftVerse Web)

**Campaign:** `web-frontend-flagship`
**Scope:** New `web/` folder — full web replication of the mobile app's
departments, design system and commerce flows.
**Branch:** `feat/product-detail-contract-media-device-closure`
**Stack:** Next.js 15.5.26 · React 19 · TypeScript strict · Tailwind v4 ·
TanStack Query · Zustand · Zod
**Design contract:** `web/DESIGN-SYSTEM.md` (port of mobile designTokens +
colors; dark-first editorial luxury; anti-AI policy applied)

## Execution model

Main agent built the shared foundation (scaffold, tokens, contracts, data
layer, primitives, layout shell, home + explore feed). Six leaf-level
parallel agents then built independent departments against the shared
contract, with disjoint file ownership.

| Agent | Department | Routes delivered | Status |
|-------|-----------|------------------|--------|
| orchestrator | Foundation + Home/Explore | `/`, `/explore`, `not-found`, `error`, `loading` | ✅ |
| d15beedf | Commerce | `/item/[id]`, `/bag`, `/checkout`, `/orders`, `/orders/[id]`, `/offers` | ✅ |
| 623ce160 | Messaging | `/inbox`, `/inbox/[id]`, `/notifications` | ✅ |
| d04e7152 | Identity | `/profile`, `/u/[username]`, `/saved`, `/moodboard/[id]`, `/collection/[id]` | ✅ |
| 44e80288 | Search & browse | `/search`, `/categories`, `/category/[slug]`, `/browse` | ✅ |
| a675eb9e | Sell & auth | `/sell`, `/auth`, `/auth/login`, `/auth/signup` | ✅ |
| 398784ad | Utility & media | `/wallet`, `/settings`, `/live`, `/galleria`, `/look/[id]`, `/poster/[id]`, `/help`, `/about`, `/privacy`, `/terms`, `/buyer-protection`, `/sustainability`, `/seller-hub` | ✅ |

## Orchestrator repairs during integration

- `next.config.ts`: `outputFileTracingRoot` (multi-lockfile warning),
  `images.qualities` (Next 16 compat warning).
- `AppShell`: immersive-route grammar — `MobileTabBar` hidden on pushed
  screens (`/inbox/[id]`, `/poster/[id]`, `/look/[id]`); chat height corrected.
- `fixtures.ts`: dead Unsplash image replaced.
- `package.json`: `lint` → `eslint .` (next lint deprecated); `overrides.postcss`
  `8.5.28` — closed nested postcss CVEs without Next 16 breaking upgrade;
  `sharp` bumped via `npm audit fix`. **npm audit: 0 vulnerabilities.**
- ESLint flat config added (`next/core-web-vitals` + `next/typescript`).
- Prose pages converted to typographic punctuation (lint-clean, editorial-
  correct).

## Verification

- `tsc --noEmit` — clean
- `eslint .` — clean (0 errors, 0 warnings)
- `next build` — 37 routes, 31 prerendered, 103 kB shared JS
- Production smoke (`next start`): **39/39 route checks 200**, unknown → 404,
  bogus dynamic IDs → designed not-found states
- Code review (fresh-context adversarial pass): 10 findings — 4 major, 6 minor —
  all fixed and browser-verified:
  - Sell publish now writes a real `Listing` into `MY_LISTINGS` via
    `recordListing` (`fixtures-commerce.ts`) — "View listing" lands on a live
    PDP instead of a guaranteed not-found; committed blob-URL photos are no
    longer revoked on unmount/reset.
  - Persisted-store reads (`wishlist`/`saved`/`bag`/`likedLooks`) gated behind
    `useHydrated()` in `ProductTile`, `BuyPanel`, `look/[id]` — eliminates the
    SSR/client mismatch class for returning sessions.
  - `ord-1021.listingId` corrected `l27` → `ml3` (order now shows the user's
    own sold Graphic Print Tee).
  - Sell photo validation enforced (`photos` error + focus target).
  - `recordOrder` ids now `Date.now()`-based (no intra-session collisions).
  - `'person'` icon → `'profile'`; `ICONS` map retyped with `satisfies` so
    `AppIconName` is compile-time checked.
  - `of-3` offer amount corrected to the agreed item price (£32).
  - `Review.userId` (reviewee) added; `data.reviews(userId)` filters —
    profiles no longer share one global review set.
  - `PdpGallery.step()` guards `images.length === 0` (modulo-zero/NaN).
  - `ProductTile` restructured to the stretched-link pattern — no interactive
    elements nested inside the anchor; tile, seller row, save + heart all
    verified working.
- Browser QA (Playwright, prod build, desktop 1440 + mobile 390):
  - React hydration error `#418` root-caused to the global `loading.tsx`
    streaming a route-agnostic MasonrySkeleton; file removed — inbox,
    inbox thread and notifications now hydrate clean at both viewports.
  - Mobile horizontal overflow fixed (`min-w-0` on header search, relative
    wrappers for badge dots) — 0px overflow verified.
  - Sell flow e2e: empty publish → photo error; valid draft → success →
    "View listing" → real `/item/local-*` PDP.
  - Remaining earlier "failures" were test artifacts: lazy images below the
    fold (all 13 load on scroll, zero broken), a `@you` expectation vs the
    hero's `you`, and a visible-viewport text-length heuristic.

## Known limitations

- Fixture mode is the default data path (`NEXT_PUBLIC_DATA_MODE=fixture`);
  live mode targets `NEXT_PUBLIC_API_BASE_URL` (backend/api routes).
- Moodboard/collection entities read fixtures directly — need `data.*` query
  surface when live mode lands.
- Sell publish + offer/message mutations are session-local fixture writes
  (same posture as mobile mock layer).
- Dev-server `.next` corruption observed when multiple agents ran builds
  concurrently — resolved; single-owner dev server only.

## Wave 2 — quality elevation (post-review upgrade pass)

**Systemic root cause fixed:** custom named `--spacing-*` tokens in `@theme`
shadowed Tailwind's named `max-w-*` scale — `max-w-xl` resolved to
`--spacing-xl` (32px), collapsing the header search bar, profile bio,
empty states, Galleria hero and every `max-w-sm/md/lg` surface into
min-content columns. Tokens removed (zero usage); header search, hero
copy, and empty states restored.

**Reference-driven upgrades (Pinterest modules / Vinted PDP / Depop search):**
- `/` — authored feed canvas: Fresh drops rail → feed → Trending this week
  rail → feed → Featured sellers strip → Galleria editorial banner → feed
  (Pinterest homefeed module pattern).
- `/search` — landing now dense: recents, trending chips, brands, Galleria
  banner, Trending-this-week product rail, Shop-by-category grid with live
  item counts.
- `/item/[id]` — Vinted-structure buy column: gallery capped at 75vh,
  brand/title/price+protection, facts strip, seller card, actions,
  description (pre-line), Item details `<dl>` ledger (brand/size/condition/
  category/type/posted), shipping-from strip + Buyer Protection link.
- `/explore` — topic-led: Trending topics tiles (deep-linking real
  taxonomy), Looks & moodboards editorial cards, then "Made for you" feed.
- Header — search focus opens suggestion dropdown: live listing matches,
  recents (removable), trending, brand chips; combobox ARIA + arrow-key nav.
- Polish: media hairline outline on all AppImage surfaces, balanced
  headings, `text-pretty` descriptions.

Verified: tsc clean, eslint clean, build clean, 36/36 routes 200,
zero console errors on upgraded routes, PDP 75vh stage + first-viewport
buy box confirmed, sell e2e still green.

## Wave 3 — trading-grade Co-Own + missing departments

**Coverage audit:** mobile has ~180 screens vs 37 web routes. Biggest
missing departments: Co-Own/trading cluster (coown, asset, trade,
portfolio, syndicate — 50+ mobile components), Auctions, Seller
analytics/fulfilment, Wallet convert/exchange/history, Support centre.

**Foundation (orchestrator-owned):**
- `lib/contracts/coown.ts` — full trading contracts ported from the
  mobile v2 contract (order book snapshots, order previews, protected
  market orders, lifecycle states, distributions, corporate actions).
- `lib/utils/trade.ts` — trade math ported from utils/tradeFlow.ts:
  1% fee, 20-unit cap, book-walking fill estimation, ±2% depth bands,
  BigInt minor-unit arithmetic, submit gating.
- `lib/data/fixtures-coown.ts` — 8 assets (co1–co8) with seeded
  deterministic price history, order books, positions, activity,
  distributions, corporate actions, open orders.
- `components/charts/` — dependency-free SVG primitives: Sparkline,
  PriceChart (crosshair), DepthChart, CandleChart, AllocationBar.
- `lib/hooks/coown-queries.ts` — fixture-backed hooks.

**Departments (5 parallel agents, disjoint ownership):**
- `/co-own` hub — Polymarket-style: featured hero, category tabs, market
  rows with sparklines + allocation meters, education band, risk note.
- `/co-own/[id]` — trading terminal: price panel (windows, line/candles,
  depth chart), order book with depth bars + click-to-prefill, trade
  composer (market/limit/protected, live quote, submit gate, receipt),
  position strip, Overview/Ownership/Activity tabs, corporate-action
  voting, related rail, risk disclosure. Mobile: sticky dock + Sheet.
- `/co-own/portfolio` — Robinhood-style: market value + today's move,
  allocation bar, positions table with P/L, open orders with cancel,
  distributions history.
- `/auctions` — hub (Live/Upcoming/Ended, countdown cards), detail
  (ticking countdown, anti-sniping extension, bid ledger, min-increment
  composer, buy-now), my-bids (Outbid/Winning/Won/Lost), create flow.
- `/seller-hub` — analytics command centre: revenue chart, metric grid
  with period deltas, sortable listings performance, to-do radar;
  fulfilment queue with optimistic mark-posted; earnings breakdown +
  CSV export.
- `/wallet/convert` + `/wallet/history` — conversion flow with pocket
  breakdown + receipt, filterable ledger with running balance + CSV.
- `/support` + `/support/[id]` — resolution centre: tickets, thread,
  reply composer, accept/escalate, CSAT.

**Verified:** tsc 0 errors, eslint 0 errors 0 warnings, build 41/41
static pages, 43/43 routes 200, zero console errors on all new surfaces,
Co-Own hub/terminal/portfolio + auctions visually verified at 1440 and 390.

## Wave 4 — interaction integrity + parity depth

**Click-path audit results:**
- All header/footer links navigate; home feed tabs work (earlier "dead" flags were audit artifacts — already-selected tabs + stale handles).
- ROOT CAUSE of user-reported breakage: `.next` corruption (concurrent dev/prod builds) shipped dynamic pages referencing unhashed `main-app.js` → 404 → zero hydration → all buttons dead on /item/[id], /co-own/[id], /auctions/[id]. Fixed via clean wipe+build; verified offer sheet, bid composer, trade panel all hydrate.
- SYSTEMIC BUG: `z-modal|sticky|elevated|dropdown|overlay|toast` classes used everywhere but never defined — z-index:auto meant every stretched z-[1] tile link painted above sheets/menus/toasts and swallowed their clicks. Added explicit `@utility` z scale (10/20/30/40/50/60); SignupWall "Create account" verified clickable → /auth/signup.

**Account + auth:**
- AccountMenu: avatar dropdown (Profile/Orders/Saved/Offers/Wallet/Seller hub/Support/Settings/Sign out), menu ARIA, arrows/Escape. Fixes unreachable orphan routes + invisible login.
- SignupWall ported 1:1 (useSignupWall/useSignupWallSheet mobile pattern): soft wall on all guest write paths (save/follow/message/bid/purchase/list), per-action once-per-session; wired incl. BidPanel.

**New departments/sections:**
- /collections hub — cover-collage boards grid, private lock, curated rail (sheet + tile grid), create-collection sheet (session store).
- PDP: ListingQA (ask/answer threads, seller-composer), SeenInLooksRail, CuratedCollectionsRail, SizeGuideSheet (size-aware, buyer row highlight; fixed a mobile port bug where US M/F columns rendered em-dashes).
- Profile: verification tier badge, member-since, Listings|Looks|Boards|Saved|Reviews tabs with counts, boards incl. private.
- Notifications: day groups, kind-accent rows with real deep links, All/Unread/Orders filters, mark-all-read.
- Auth: polished login/signup/landing, guest continue, signed-in guard on /auth.

**Verified:** tsc 0, eslint 0/0, build clean, 49/49 routes 200, hashed main-app on dynamic pages, signup-wall click-through, menu, PDP depth visually checked desktop+mobile. Note: `next dev` alongside `next start`/`next build` corrupts `.next` — killed stray dev servers; keep one build owner at a time.

## Wave 5 — department depth + systemic nav fixes (8 parallel workstreams)

**Built by agents:**
- Bundles: PDP BundleUpsellRow (same-seller rail, staged selection, "Add all to bag"), bag grouped by seller with BUNDLE_RULE discount line (10% off 3+/seller — documented web rule; mobile explicitly has none), checkout totals threading.
- /search/visual: on-device image analysis (createImageBitmap → colour/luminance signature → deterministic matching, honestly labelled), region picker, detected-attribute chips, dropzone + error states; entry points on /search + header suggestions.
- Closet filters: /u/[username] + /profile — brand chip rail w/ counts, facet sheet (size/condition/category), sort (newest/price/most-liked), "Search this closet", active chips + clear-all, scoped empty states. Playwright-verified.
- Inbox: group threads (mosaic avatars, member counts, sender labels), image/system message kinds, new-message + create-group sheets, requests tab accept/decline, unread badges. 37/37 DOM smoke.
- Galleria: editorial magazine — masthead hero (Issue/kicker/byline/read-time), featured-collections rail, TOC editorial list opening reader sheets w/ shoppable grids, featured assets, archive issues.
- Live viewer: pinned-product rail w/ quick-add bag, seeded live chat rail + composer, reactions, ticking viewer count, share, replay states.
- Orders: capability model (needs_action/active/completed/cancelled), Buying/Selling rail + status tabs + filter sheet, escrow/ETA/carrier-failure/dispatch banners, confirm-receipt sheet, review prompt, issue report → support ticket, return cases, authentication section.
- Sell: draft auto-save + resume banner (localStorage, debounced), tag autocomplete (taxonomy + combobox a11y), edit mode /sell?edit=<id>, save-draft-&-exit.

**My fixes:**
- Mobile/tablet nav gap: primary nav was hidden below lg with no alternative → added scrollable department rail under header (verified 0px h-overflow, nav works).
- Footer: added Co-Own, Auctions, Support centre links.
- Saved searches: unified two drifting implementations into useSavedSearches zustand store (ListingFilters + alertsOn); /saved gains "Searches" segment (rows w/ filter summary, alert switch, delete, run→replay); /search parses ?category=&condition=&min=&max=&size=&brand= into ResultsSurface initialFilters so saves replay EXACTLY; removed dead searchHistory.saveSearch.
- Notification badge bug: header counted all legacy rows (~9) vs page's 3 real unreads; moved read cursor to persisted notificationCursor store — badge and page now share truth, mark-all-read clears the badge.
- New NotificationKind 'saved_search_match' + accent (mobile emits these).

**Verified:** tsc 0, eslint 0, build 56 routes clean, 17/17 wave-5 Playwright checks, saved-search e2e round-trip, zero console errors, mobile rail + closet/orders/galleria/visual-search visually verified.

## Wave 6 — remaining mobile departments (8 parallel workstreams + checkout depth)

**Agents dept (new):** /agents hub (installed bots w/ run toggles + directory w/ category chips), /agents/[id] (permissions by risk tier, activity log), /agents/builder (purpose templates → scoped grants), /agents/ledger (filterable run table, ?bot=), /agents/algorithm (persisted feed-tuning prefs — interest/brand weights, price comfort, fresh↔trending). Contracts+fixtures ported from botbuilder/agents dirs.

**Moodboard editor:** /moodboard/[id] owner edit mode — rename inline, remove w/ Undo (Toast gained action prop), drag-or-chevron reorder, batch select+remove, import tray from saved items. Overlay store (moodboards.ts) — fixtures untouched; read-only identical for non-owners.

**Catalog import:** /seller-hub/import — 5-stage wizard (CSV dropzone/paste → consent → editable review table w/ per-row validation → deterministic progress → summary) → session drafts via query-cache store; seller-hub entry added.

**KYC:** /verification — Intro→Identity→Document→Review→Status steps; persisted store; session merges approved tier (identity badge lands on profile w/o profile edits); settings Verification sheet now reflects real state; honest demo-check copy + rejected preview.

**Co-Own depth 2:** /co-own/alerts (persisted create-sheet + toggle/delete), /co-own/distributions (YTD + receipts ledger), asset detail gains due-diligence section (custody/auth/condition/docs) + real trade-tape ledger + price-alert bell.

**PDP extras:** SustainabilityBadge (grade + honest estimate line), PdpMarket (price-history ledger: reductions, sold-comps range, time-on-market + similar-sold rail), OfferToLikersSheet (owner-gated discount sender → PDP shows sent offer).

**Seller listings mgmt:** /seller-hub/listings — All/Active/Sold/Drafts rail, sort, per-row Bump (24h cooldown persisted)/Edit/Mark-sold/Relist/View; closet Edit chip on own tiles → /sell?edit=.

**Outfit builder:** /outfits grid (2×2 collage cards) + /outfits/builder (slot canvas: top/bottom/shoes/outerwear/accessory + saved-items tray + ≥2-item save gate, persisted) + /outfits/[id] detail (cells → PDP).

**Mine:** checkout Add-address/Add-card are real now — validated sheets (UK postcode, Luhn+brand detect, MM/YY, CVC), persisted via userPaymentData store, only last4 stored w/ honesty note; merged into pickers + auto-select on save. Entry points: AccountMenu (+Outfits, +AI agents), Footer (+Outfits).

**Verified:** tsc 0, eslint 0, build clean (67 routes), 62/62 route smoke, checkout e2e (add addr+card → Pay enabled), zero console errors; stale-PID server incident resolved (taskkill //F syntax; .next rebuilt under a free port).

---

## Wave 7 — Syndicate, Pulse, Conversational Search, Settings depth, Go-live, Withdraw, Report/Review + self-owned gaps

**Seven parallel workstreams:**
- **Syndicate** (`/co-own/syndicate[/create|/syn-*]`): pooled group-buys on Co-Own assets — hub (your + open pools, status tags, meters), detail (target card, member contributions, execution tape, contribution composer w/ min/max/cap/headroom validation), 2-step create wizard w/ live feasibility, guest walls, query-cache session store. Note: mobile Syndicate*Screen files were legacy-named Co-Own screens; pooled-buy semantics ported per spec.
- **Pulse** (`/pulse`): snap-scroll commerce feed — creator cards (avatar/follow/verified), event kinds (live auction/fresh drop/price drop), like/save/share rail wired to real favourites stores, shoppable chips, desktop prev/next + keyboard stepping, "caught up" end card, guest walls.
- **Conversational search** (`/search/chat`): deterministic local intent engine (845 lines) — brands/categories/conditions/prices/sizes/colours/keywords parsed from plain text against real fixture taxonomy, merge-refine turns, removable constraint chips, product rail per turn, "Open these results" → real /search URL params, honest "Rule-based" labelling. Entry: "Refine in chat" on /search.
- **Settings depth**: `/settings/notifications` (push/email matrix, pause-resume snapshots, quiet hours, locked security alerts), `/settings/privacy` (blocked/restricted managers + profile switches), `/settings/security` (password strength form, sessions, 2FA demo sheet), `/settings/data` (consent toggles, real JSON export blob, typed-DELETE account wipe). All persisted in settingsPrefs store.
- **Go-live seller flow** (`/live/create`, `/live/host/[id]`): compose (title/cover/pins max 6/schedule), host console (scheduled→live→ended summary), seeded chat moderation (pin/hide), demo-mode honesty, hub sync via ['live-sessions'] cache.
- **Withdraw + payouts** (`/wallet/withdraw`, `/wallet/payouts`): full state machine (composer→confirm→submitting→receipt), UK sort-code/account validation stored masked-last4-only, pending-honest ledger entries integrated into wallet history, £0 fee + 1–3 day ETA per mobile contract.
- **Report + write-review**: report sheet (12 mobile reasons verbatim, evidence grid, staged submit, case ref) launched from PDP overflow + profile overflow; `/review/[orderId]` composer (stars, tags, photos) writing real REVIEWS + seller aggregate bumps; order review prompts wired.

**Self-owned additions:** `/profile/edit` (persisted overlay merged into session user), `/u/[u]/followers`+`/following` (connection lists w/ persisted FollowButton + signup wall), `/onboarding` (mobile OnboardingScreen port — welcome + Notification permission + denial recovery; signup now routes through it), inbox archive/mute (row kebab menu, Archived tab, badge suppression), `/seller-hub/quick-replies` + composer bolt picker, `/invite` (referral code/link, rewards stats, honest zero history), Pulse in header nav + dept rail.

**Fixes this wave:** pulse Follow pill white-on-white (`text-inverse` misuse on `bg-scrim-text-primary` — matched established `text-black` grammar); stale-server incidents avoided (killed :3000 before each rebuild).

**Verified:** tsc 0 · eslint 0 errors/0 warnings full tree · build 85 routes · 83/83 route smoke 200 · zero console errors on 14 new surfaces · pulse follow toggle + contrast verified · visual QA all new surfaces desktop.

---

## Wave 8 — flagship polish pass (quality depth, not breadth)

Seven parallel polish agents + self-owned systemic fixes:

**Cards** (`ProductTile`): `Size · Condition` meta line (Vinted grammar), `media-zoom` hover scale on md+, lighter on-media indicator pills (replaced heavy chrome circles), focus ring on seller row.

**PDP**: `PdpLightbox` — fullscreen viewer (portal, Escape/←/→, drag-swipe paging, synced thumb rail, ratio-preserving stage); hero expand affordance; **sticky buy column fixed** (dead `lg:sticky` → max-height scroll column, eBay buy-box pattern); honest shipping line (`shippingMethod`/`shippingPayer` contract fields, free-delivery vs calculated-at-checkout); dynamic item-specifics ledger; expandable Buyer-Protection disclosure.

**Header**: `DepartmentNav` — CSS flyouts on Explore/Co-Own/Auctions/Live/Galleria (hover+focus-within, Escape, only real routes); `bg-header` flat (glass removed); unified `CountBadge` pill (9+ cap, unread-accurate); search suggestions + **Members section** (USERS fixture, avatar/verified/followers → `/u/[username]`).

**Home**: module rhythm ported from mobile HomeScreen — tabs → signal rail → stories → Fresh drops rail → Looks → Member edits → Featured sellers → Galleria; new `Rail` shared shelf w/ edge-fade scroll affordance; `homeSignals` fixes broken chip filters (`men` substring-hitting `women`, zero-match Vintage/Designer/Streetwear); mirrored skeleton; `SegmentedControl` flat selected grammar unified app-wide.

**Motion**: `globals.css` additive utilities — `link-quiet`, `fade-up`, `fade-in`, `sheet-enter`, `toast-enter/exit`, `media-zoom`; reduced-motion coverage; Sheet/Toast entrance motion wired; IconButton/Chip disabled parity.

**Explore/results**: `useResultColumns` via `useSyncExternalStore` (kills post-paint masonry reflow; 2/3/4/5 cols); sticky filter toolbar w/ `bg-background/95` + hairline; removable active-filter chips row + Clear all; category metadata; tile hover-zoom consistency.

**Bag/checkout**: item rows → `brand · Size · condition` meta + quiet "Save for later"/"Remove" text actions (eBay grammar); save-for-later wired to real wishlist store; skeleton mirrors layout; buyer-protection + terms lines moved beside Pay CTA.

**Self-owned:** **theme-FOUC fix** — theme resolution ran in `useEffect` post-hydration so every light-OS visitor got a dark flash; moved to a pre-paint inline script in `<head>`, removed the redundant provider effect. Dark-theme audit sweep: clean on all 10 routes shot.

**Verified:** tsc 0 · build clean · routes 200 · e2e checks green (flyout, members suggestions, lightbox nav/escape, filter chips, home rails) · zero console errors.

## WAVE 9 — mobile parity gap closure (178-screen audit)

Gap audit of ~178 mobile screens vs 85 web routes → 8 parallel agents + orchestrator integration.

- Auth: `/auth/forgot` + `/auth/reset` (token states, strength meter, honest demo handoff)
- Group chat admin: `/inbox/[id]/info` — roles, permissions (fail-closed to live API), shared media + lightbox, member management, mute/archive/leave/block; composer gates for blocked/admin-only
- Payments: `/settings/addresses|payments|postage` — full CRUD on one source of truth (`useSavedAddresses`/`useSavedPaymentMethods`); checkout rewired to the same hooks so settings edits propagate mid-checkout
- Sell: Postage step 04 → Preview surface (real PdpGallery+lightbox, BuyPanel grammar) → rewritten success; draft persistence now round-trips shipping fields
- Settings: `/settings/accessibility` (real zoom/reduced-motion/high-contrast), `/settings/sustainability` (honest impact — no fabricated CO2e), age-confirmation sheet, `/appeal` → support tickets
- Co-Own: `/co-own/[id]/buyout` (offers + accept composer), `/co-own/[id]/issue` (report-an-issue, not issuance), syndicate history feed, onboarding gate
- Seller auctions: `/seller-hub/auctions` — stats summary, tab buckets (live/scheduled/sold/unsold), fixtures + bids seeded
- Posters: `/poster/archive`, `/poster/highlight/[id]`, viewer upgraded (archive+story-rail sources, shoppable hotspots, owner menu); collection owner edit mode + import sheet

Verified: tsc 0 · eslint 0/0 · build clean · 100/100 routes 200 · wave-9 QA 15/15 routes + 3/3 checks · 0 console errors · visual QA clean

Remaining mobile delta: dev-tool screens only (ModelRegistry, RuntimeSmokeTest) — intentionally not user-facing web routes.

## WAVE 10 — reference-research quality pass (eBay / Vinted / Pinterest / Depop)

Online research into reference UX → 6 parallel workstreams + orchestrator integration + click-path audit.

- **eBay VI signals**: PDP conversational signal line ("One only · 320 views · 40 likes" — real contract fields only, no fabricated scarcity); auction deadline chip over PDP gallery (live "Ends in X" / upcoming "Starts X", links to auction); trust copy moved adjacent to buy actions; seller rail → Depop closet preview; similar rail states its basis
- **Vinted weakness exceeded**: bundle rail now has facet filter chips (size/category, hidden when no real choice) + honest progress caption ("add M more for 10% off"); bag discount line self-explains + 1-short hint deep-links to seller closet
- **Depop loop**: persisted recently-viewed store → "Recently viewed" home rail (guest/empty-gated, Clear + toast); deterministic like/follow-driven feed re-ranking (score=2·follow+2·brand+1·category+1·subcat, stride-4 interleave, non-listing units pinned)
- **Pinterest grammar**: hover/focus-within quick-action cluster on tiles (share→navigator.share/clipboard+toast, save, heart) — capability-gated `@media (hover:hover)`, not width-proxy; opacity 0→1 verified
- **Search quality**: tolerant matcher (normalize/plural/prefix, bigram-Dice≥0.5 + Levenshtein≤2 only on zero-hit) → "addias"→Adidas; "did you mean" notice; zero-result recovery surface w/ fixture-derived popular searches; fixed dead trending terms
- **Auctions**: live countdown chips ("Ends in"→"Ending soon"<10m), "Next bid £X or more", anti-sniping note from real constants, outbid status line, bid ladder in transaction rail, my-bids Leading/Outbid/Won/Lost + deep-link "Bid again" → #bid

## Orchestrator: live-mode layer repair (user-added DATA_MODE=live)
Fixed 16 tsc errors from the API-service layer landing: Promise|T unions awaited at 5 call sites, LiveSession contract extended + mapRoom fixed (coverUri/aspectRatio/viewers), CommerceOrder gained shippedAt/deliveredAt + mapper, ListingOffer/WalletAccount service types, agents enum mappings (pricing→commerce, schedule→daily, partial→skipped), Transaction.date, visual-search style facet → category kind, BidSnapshot optional field.

## Verified
tsc 0 · eslint 0/0 · build clean · 100/100 routes 200 · click-path audit 83 controls 0 dead · wave-10 functional QA 11/11 real checks · 0 console errors

---

## WAVE 12 — reference-verified quality audit (eBay / Polymarket / Pinterest / Instagram)

Fresh live research (2026-09-26) + full mechanical + code-level audit of the
100-route web app. Sources: eBay VI-signals papers (arxiv 2510.01198,
2608.27366 — Urgency/Conversational placements), Polymarket order-book docs +
market-page teardowns, Pinterest design-system analyses (masonry/hover-save
grammar), Instagram desktop-messaging engineering blog + 2022 web redesign
coverage.

### Mechanical audit — all green
- `tsc --noEmit` 0 errors · `eslint .` 0 errors/0 warnings · `next build` clean
- 100/100 routes return 200 on the production server (full enumeration, not a sample)
- Zero TODO/FIXME/dead-href/no-op onClick across the tree; zero `any` casts
- State coverage verified per surface (loading skeleton / empty / error / populated)
- Accessibility: Sheet focus-trap + Escape + aria-modal; Toast role=status; stretched-link tiles keep interactive children above the link layer

### Reference parity — verified in code
- **eBay**: PDP conversational signal line (real contract fields only), item-specifics ledger, sticky capped buy column, seller reviews section, urgency chip over media, bid history inside the transaction rail (user-authored), top-bid sort by amount→time (user-authored)
- **Polymarket**: market cards as navigation (hub), single-column order book with cumulative depth bars + spread band (bps) + last-print tick rule (user-authored), Book/Depth/Trades views, trade composer with live quote + submit gate, portfolio with cost basis/24h/income-YTD (user-authored), resting-order cancel through the shared mutation (user-authored)
- **Pinterest**: balanced-column masonry at server-truth ratios, capability-gated `@media (hover:hover)` quick-actions (user-authored CSS), edge-to-edge canvas, band breaks
- **Instagram**: date-separated message stream, per-message receipt grammar (user-authored), group mosaic + member roles, inbox timestamp formatting (user-authored), notifications day-groups with deep links

### User-authored wave-12 changes — integrated and verified
Auction top-bidder sort + bid ladder in rail; bag totals order (postage/protection before discount, bundle rule labelled); quick-actions CSS (hover-capability gate); PDP recently-viewed recording + basis-stated rails; offers shared expiry clock + lazy-expired status + server-honest withdraw mapping + counter-round labelling; order milestones (ordered→paid→shipped→delivered) with honest pending captions; home feed personalization re-rank + EntryBand + Following empty recovery; order-row caption priority (attention→ship-by→review); profile for-sale/sold stats; inbox receipt/timestamp/mosaic fixes; co-own watchlist star, day-range stat, order-book rebuild, trade tape; wallet transaction sort fix; live service contract cleanup.

### Runtime incidents (resolved)
Two `.next` corruption events from racing build/start processes (known
single-build-owner constraint) — resolved via taskkill + full cache wipe +
clean rebuild; final state: build clean, 100/100 routes 200.

### Remaining honest gaps (documented, not defects)
- Poster/moodboard detail + profile looks/boards remain fixture-mode under
  `DATA_MODE=live` (composite `/poster-stories` document needs a dedicated
  mapper pass; no per-user looks/moodboards list endpoint verified)
- Syndicates have no backend surface (fixture-only by design)
- Bag is client-side Zustand (no backend cart endpoint exists — verified)

## Verified (wave 12)
tsc 0 · eslint 0/0 · build 80 routes clean · 100/100 routes 200 ·
0 dead controls · 0 console-error risks found in code audit (hydration-safe
Date.now usage confirmed; SSR renders skeletons for client-fetched surfaces)

## WAVE 11 — cross-reference parity upgrade (Polymarket + TradingView + eBay + Vinted + Instagram)

8 parallel workstreams mapped each department to its closest reference grammar; orchestrator handled notifications + integration.

- **Co-Own asset** (Polymarket/TV): price hero in natural language ("£142.50 per unit" + plain-language % move), TradingView Details strip (BID/ASK/SPREAD/DAY RANGE/24H VOL — real fields only), order book → mirrored depth ladder (bids/asks cumulative bars, spread band, imbalance gauge, Book/Depth/Trades tab views), trade tape, persisted watchlist star
- **Portfolio**: TradingView-watchlist density — sortable positions table (units/avg/last/value/P&L/1M sparkline), open-orders section with 2-tap cancel (mobile ConfirmationSheet parity), YTD income + totals header
- **Home**: authored EntryBand (Vinted's curated-selections answer — 9 tiles derived from real fixture facets, every destination verified to resolve), glanceable unit-type badges (Instagram badge-legibility fix), Following-tab honest empty+CTA
- **Profile**: Instagram/Depop tab structure (Items · Sold · Reviews + Looks/Boards when data exists), 4-col grid desktop, N-for-sale/N-sold stats, ReviewSummary (avg + distribution bars), share-shop
- **Inbox**: mobile date-divider grammar (Today/Yesterday/weekday/date, fixed DST bug), 4-state receipt ticks on every own message (sending/sent/delivered/read — not just last), full message-type previews, OfferCard seen-state
- **Checkout/bag**: eBay box-model per-seller parcels ("Postage — combined" when 2+ items, carrier appended, honest "Confirmed at checkout" for multi-seller — no fabricated £), complete itemized ledger
- **Orders/offers**: canonical orderAttention() → needs-attention lane (rank-sorted), 4-milestone timeline (ordered→paid→shipped→delivered), ball-in-court captions, effective-status lazy expiry, real ship-by urgency
- **Live/pulse**: persisted live reminders (shared key with live-mode service), pulse cards deep-link to real destinations (auction/item/member), save writes listing id, guest chat gated
- **Notifications** (orchestrator): in-row FollowButton on follow rows (IG grammar) — resolved actor from /u/ href, stretched-link pattern

## Bugs found + fixed during verification
1. **Missing global-error.tsx** → prod-only `a[d] is not a function` SSR failure on /review/* (dev rendered fine). Added canonical global-error.tsx; route 500→200.
2. **Stacking-context hit-test bug** — `.pressable` :active transform on a stretched-link row let the absolute link steal pointerup from in-row actions. Instrumented: pointerdown→BUTTON, pointerup→A. Removed pressable from NotificationRow surface; pointer click now toggles Follow (aria-pressed true).

## Verified
tsc 0 · eslint 0/0 · clean build · all routes 200 · wave-11 QA 20/20 (2 initial fails proven artifact+fixed) · 0 console errors

## WAVE 12 — department-depth pass (8 parallel agents + orchestrator)

Each department re-audited against its reference grammar; disjoint file ownership.

- **PDP** (eBay): breadcrumb from real taxonomy, About-this-item 2-col specifics ledger (renders only real fields), seller reviews section w/ rating chips >4 reviews, similar-items rail w/ honest count, buy column spans both rows (sticky verified), "Visit shop" grammar
- **Search/explore** (eBay/Vinted): desktop RefinementRail w/ true facet counts (computed with exact applyListingFilters semantics), SortDropdown persisted in URL (?sort=), thousands-formatted counts, /categories as department directory (most-liked cover per dept, honest counts), recovery surface gains category tiles
- **Home/feed** (Pinterest): tile quick-actions reveal on keyboard focus, masonry gap rhythm, ProductTile meta discipline
- **Profile/closet** (Instagram/Depop): closet hover overlay (likes+price, hover+focus-within, hover-gated), saved-page underline tabs w/ live counts + in-grid unsave, sticky closet toolbar, connections search >20 rows, hydration fix on follow lists
- **Inbox/notifications** (WhatsApp/IG): in-thread message search w/ match highlighting + result count, bubble copy action (hover+focus), composer photo staging w/ caption, group previews "@sender: text", notifications auto-grouped into type sections (>6 rows) w/ unread counts
- **Orders/offers/checkout/bag** (eBay): purchase summary box (item/postage/protection/total, copy order no., Paid-with from real saved methods, delivery address), Need-help section, CounterLadder on offers, box-manifest checkout parcels, inline confirm on bag remove/save (no window.confirm), error+retry states everywhere
- **Live/auctions/pulse** (Whatnot/eBay): bid history as masked ledger table, real 5%-increment bid ladder + confirmation sheet + outbid re-bid banner, live category segments + today's schedule timeline, shared ReminderToggle, pulse active-card dim/scale
- **Co-Own/syndicate/wallet** (Polymarket/TV): hub watchlist now reads the PERSISTED store (fixed local-state bug — stars never persisted before), Markets/Watchlist segment, market-rules accordion (issuer/custody/fees from contract constants), wallet ledger grouped by month w/ sticky rails + month nets, balance hero w/ masked payout account + 3 quick actions, canonical 3-row activity preview (deleted the disagreeing parallel list), syndicate avatar stacks + step rail

## Orchestrator fixes during wave 12
- EntryBand tile contrast: labels were white-on-light over images (same defect class as the wave-7 pulse pill). Hardened black scrim + white text (verified computed: rgb(255,255,255) on oklab 0.75→0.35 gradient).

## Verified
tsc 0 (whole tree) · eslint 0/0 (all changed dirs) · clean build 80/80 · 33-route smoke all 200 · zero console/page errors · visual QA: search refinement rail, PDP breadcrumb+about, wallet hero, notifications type sections, live category rails, order-detail purchase summary, categories directory — all flagship-grade
