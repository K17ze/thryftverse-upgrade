# Frontier Research Ledger — 2026-09-15 (Wave Q)

Live web research to saturation. Legend: OBS = direct observation · SEC = secondary · INF = inference.

## Market context
- Resale ~$393B trajectory, US online resale $29.7B→$48.3B by 2030; ~50% of secondhand discovery now via social/creator feeds (ThredUp 14th report, Apr 2026).
- US livestream shopping ~$20B 2026 (+35%); Whatnot ~60% share, $20B valuation (Aug 2026), 1B orders; StockX Live launched Jul 2026 (timed/sudden-death/pre-bid/max-bid auctions); eBay Live 8× YoY.
- TikTok Shop ~$23.4B 2026; live converts 8–12% vs 3–6% video; in-stream checkout latency 6.2s→2.1s.

## Competitor deltas (last 12 months)
- **AI listing-from-photo is table stakes**: eBay Magical Listing (agentic, default for new US listers), Grailed AI beta, Poshmark Smart List AI, StockX Listings AI photo analysis.
- **Poshmark redesign (Mar 2026)**: 3:4 portrait feed — NOTE: does NOT apply to ThryftVerse; masonry is protected identity.
- **Grailed Account Health score → visibility** (May 2026, 4-tier). eBay seller standards monthly eval. Poshmark >3% cancels/90d → restricted. → seller health→distribution coupling is convention; we have reach states (normal/limited/suspended) — a *visible* seller-facing health score is the gap.
- **Whatnot Sep 2026**: Live Seller Analytics (sales/hr, watch time, live-vs-shop split, buyer-context chat badges), Points loyalty, pre-bids in Activity tab w/ Winning/Outbid/Won/Lost states + seller Pre-Bids filter; Top Trends real-time demand signal under search.
- **Depop Outfits** (Sep 2025): shoppable collages w/ background removal, similar-item substitution when sold.
- **Stale inventory**: Grailed purged 3M listings from 2yr-inactive sellers; Depop suppresses "ghost shops".
- **Vinted AI photo moderation** (Nov 2025–Apr 2026): blurry/dark photos auto-hidden — ~9% false-positive rate, trust risk; Vinted Jun 2026 moderation controversy.

## UX standards 2026
- **Loading bands**: <100ms nothing · ~100–400ms subtle in-place only · 400ms–2s skeleton (if layout known) · 2–10s skeleton+label · >10s determinate progress + escape. Delay any indicator ~300–400ms.
- **Haptics**: central semantic wrapper (success/warning/error/selection/impact-light), user setting, platform fallbacks — we have useHaptic; audit coverage.
- **Optimistic UI**: only reversible low-risk actions (save/follow/like); NEVER financial (bids/checkout/CLOB). React 19 useOptimistic is idiomatic path — not currently used.
- **Bottom sheets**: detents (peek 15–25%, half ~50%, expanded ~90%), visible close + swipe-dismiss + confirm-on-dirty.
- **iOS 26 Liquid Glass**: brand in content layer, native bars; test Reduce Transparency.

## RN engineering
- **New Arch**: forced since RN 0.85; we're on RN 0.86.2 / SDK 57 → satisfied. ✅
- **FlashList v2**: masonry prop, no estimatedItemSize, getItemType — masonry grid already compliant; InventoryList had dead v1 prop (removed 2026-09-15). Legend List = alternative worth benchmarking, not forced.
- **Reanimated 4.5.1** installed: CSS animations for state-driven microinteractions; **SETs re-introduced in 4.2 (flag-gated) → masonry-card→PDP image continuity is the single highest "flagship feel" win**.
- **React Compiler**: enabled in app.config.js experiments (2026-09-15) — 18–34% JS-time cuts on list surfaces.
- **expo-av**: not in deps (already on expo-audio/expo-video). ✅
- **Skia**: retained mode + shared values; throttle CLOB ticks ~30fps for multi-chart screens.

## Trust/commerce
- **Sponsored disclosure**: FTC "clear and conspicuous + unavoidable"; label every promoted card "Sponsored" at listing level (done — server-stamped verbatim). Add public ranking-disclosure page (Etsy convention).
- **Buyer-protection fee**: all-in or locked breakdown + "what this covers" sheet; Vinted scandal = cautionary tale on fee-not-delivering optics.
- **Search**: disclosed reversible correction ("Showing results for X — search instead for Y"); zero-results never dead-end. Our backend ships fallbackReason — UI surfacing is the audit question.
- **Notifications**: inbox as source of truth; group by object not time; iOS 26 Apple Intelligence summarizes → front-load first 5–8 words w/ numbers/brand; caps 1–2/day transactional.
- **Checkout**: trust-between-strangers elements (seller rep, delivery date, protection) are conversion elements; express pay on PDP ~65% faster.

## Accessibility
- **EAA enforced since Jun 28 2025** — marketplace = "e-commerce services" in scope → WCAG 2.1 AA mandatory for EU (2.2 the target). WCAG2Mobile WD maps criteria to native.
- 24px min targets (design 44/48); dragging needs single-pointer alternatives (sheets, price sliders, chart scrub); sticky buy bar must not obscure focus (2.4.11); fontScale-adaptive ≥1.7x; announce bids/orders via live regions; recycle-safe a11y labels on FlashList; reduced-motion swaps scale/parallax→crossfade.

## Co-own CLOB flag
- Rally = last major fractional platform (Reg A+, SEC penalty precedent). If co-own shares = profit-seeking fractional interests → **securities counsel review** flagged; if utility/ownership-tracking → document the distinction. Thin secondary liquidity killed competitors → consider market-hours batching/liquidity concentration.

## Repo verification results (checked 2026-09-15)
- newArchEnabled: N/A (RN 0.86 = New Arch only) ✅
- MasonryFlashList: not used; FlashList masonry + getItemType already ✅
- estimatedItemSize: removed from InventoryList ✅
- expo-av: absent ✅
- reactCompiler: now enabled ✅
- useOptimistic: absent — candidate for save/follow paths (audit)
- haptics: useHaptic exists — coverage audit pending
