# 17 — Live Shopping & Live Streaming (Flagship Research)

**Department:** Live shopping, live streaming (seller + viewer), real-time commerce video
**Date:** August 2026
**Scope:** `LiveShoppingHomeScreen.tsx`, `LiveStreamSellerScreen.tsx`, `LiveStreamViewerScreen.tsx`, `services/liveShoppingApi.ts`, and the navigation contracts that wire them.

---

## 1. 2026 Competitor Benchmark

Live commerce in 2026 is no longer "emerging" — it is the single highest-converting surface in mobile retail. A June 2026 Videowise benchmark across 4,000+ Shopify merchants found live commerce sessions on mobile average a **9.4% conversion rate versus 2.1% on equivalent static PDPs** for the same SKUs, with the gap widest in fashion where real-time try-on and size callouts collapse the consideration phase ([onlinestorenews.com — Live Commerce Most Valuable Real Estate](https://onlinestorenews.com/live-commerce-is-quietly-becoming-the-most-valuable-real-estate-on-mobile/)). eBay's Q2 2026 earnings call reported eBay Live GMV jumped roughly **8× year-over-year** across seven markets, with regular streamers seeing GMV growth and Live users selling ~3× more than non-Live users ([techcrunch.com — eBay continues to bet on live shopping](https://techcrunch.com/2026/08/06/ebay-continues-to-bet-on-live-shopping-after-record-quarter/)). The infrastructure story is settled: sub-2-second mobile streaming latency is the 2025–2026 default, and one-tap checkout (Shop Pay, Apple Pay) has removed the historical drop-off between "I want this" and "I bought this."

### TikTok Shop Live
TikTok Shop Live is the design benchmark Western apps are measured against. The core composition is a **full-bleed vertical video with a pinned product card at the bottom**, a channel/follow row, a live viewer count, and a floating chat rail — all reachable by thumb without leaving the stream ([getstream.io — Deconstructing TikTok's Live Shopping UX](https://getstream.io/blog/tiktok-live-shopping/)). Tapping the product card opens an **in-stream listing page** (not a navigation away) with Add to Cart / Buy Now, and a second tap brings up a checkout overlay that returns the user to the stream automatically on completion. The chat room drives real-time engagement, and "Someone Just Bought" notifications plus floating hearts function as live social proof. TikTok also formalized **Countdown Bidding (LIVE Auctions)** in 2026: a seller presents a product, sets a starting bid and timer, and the audience bids in real time; a **Fixed Auction** ends at zero, while an **Extended Auction** resets the timer on late bids — all binding and final, with immediate payment ([ppc.land — TikTok Shop Countdown Bidding](https://ppc.land/tiktok-shops-countdown-bidding-turns-live-sessions-into-real-time-auctions/)). Critically, TikTok Shop's May 2026 quality rules **ban AI voices, pre-recorded audio, still-frame visuals, and PDP screenshots from LIVEs** — enforcement is tied to account health and commission access ([ppc.land — TikTok Shop quality rules](https://ppc.land/tiktok-shops-quality-rules-ban-ai-voices-and-still-images-from-lives/)). The platform is legislating *liveness*: a static placeholder is now a policy violation, not just a UX weakness.

### Instagram Live Shopping
Instagram's native in-app checkout for Live was phased out in March 2023, and as of September 2025 Shops redirect to website checkout ([inro.social — Instagram Live Shopping in 2026](https://www.inro.social/blog/instagram-live-shopping)). The dominant 2026 pattern is **comment-to-DM automation**: viewers comment a keyword, an automatic DM carries the product link, and purchase completes on the brand site. However, Meta is re-expanding Live Video Ads to Instagram and partnering with live commerce providers (CommentSold, Firework, LiveMeUp, Sprii, TalkShopLive) to let sellers convert livestreams into ads with in-stream product browsing ([searchengineland.com — Meta expands live shopping ads](https://searchengineland.com/meta-expands-live-shopping-ads-and-virtual-card-checkout-to-drive-more-purchases-480532)). The lesson for ThryftVerse: the **in-stream product shelf and pinned product** survived even as native checkout left — the product-pin pattern is the durable primitive.

### eBay Live 2026
eBay Live is the closest functional analogue to ThryftVerse's auction DNA. It pairs a livestream with **real-time chat, instant purchasing, rapid-fire auctions, and "popcorn" bidding** (extended/soft-close auctions where a last-second bid resets the timer to 10 seconds) ([ebayinc.com — eBay Live Launches in Australia](https://www.ebayinc.com/stories/press-room/au/ebay-live-launches-in-australia-marking-a-major-milestone-in-ebays-evolution/); [pages.ebay.com.au — eBay Live FAQ](https://pages.ebay.com.au/ebaylive-faq/)). The highest bid and bidder username display **just above the comments section**, bids are one-touch and binding, and the winner gets an in-app notification plus an inbox message. eBay moved past invite-only to self-service onboarding in 300+ categories and added discovery features across homepage and mobile app to surface live events. eBay Canada launched February 2026 with 30-second extended bidding and $1 starting bids on rare cards to drive participation ([ebayinc.com — eBay Live Launches in Canada](https://www.ebayinc.com/stories/press-room/ca/ebay-live-launches-in-canada-bringing-real-time-community-driven-shopping-nationwide/)).

### The shared 2026 pattern
Across all three, the canonical architecture is **three isolated planes**: a video plane (bandwidth-heavy, CDN-served), a realtime plane (chat, reactions, pinned products, polls over WebSocket/MQTT), and a commerce plane (catalog, pricing, inventory, checkout). The single most important architectural rule from 2026 literature is to **keep these planes isolated** — if commerce goes down, viewers still watch and chat; if chat disconnects, the stream keeps playing; if the stream buffers, the buy button still works ([getstream.io — Live shopping features implementation](https://getstream.io/blog/live-shopping-features-implementation/)). A second shared rule: **timestamp events and schedule displays relative to each viewer's estimated video latency** so a pinned product card never appears over the previous product's demo. The 2026 default transport is **WebRTC for the hot path** (sub-1s latency for buy-now mechanics) with **LL-HLS fallback** for fragile mobile networks ([forasoft.com — Live Commerce Platform Development 2026](https://www.forasoft.com/blog/article/live-commerce-platform-development-2026)).

---

## 2. Psychology & Principles

Live shopping is not a video with a buy button bolted on — it is a **checkout funnel with a host attached**, and its conversion power comes from a stack of psychological mechanisms that static PDPs cannot replicate.

**Parasocial buying.** Viewers form a one-sided relationship with a host who holds a 30–60 minute shopping narrative. The host's demonstrations, asides, and direct address create the feeling of a personal recommendation. This is why TikTok's quality rules police liveness so aggressively — the moment the host is revealed to be a recording or AI voice, the parasocial contract breaks and the conversion engine stalls. The host is the product's emotional anchor.

**Social proof in real time.** Static reviews are retrospective; live social proof is *present-tense*. Viewer count, floating hearts, "Someone Just Bought" toasts, and chat consensus ("these are clean", "got my eye on the next lot") all signal that *people are buying this right now, with me*. The chat functions as a crowd: if the consensus is that an item is high quality, purchasing anxiety drops. This is the mechanism that drives the 9.4% vs 2.1% conversion gap.

**Scarcity liveness.** A countdown timer that is visibly ticking down *in this exact second* is categorically more urgent than a static "ends in 2 hours" badge. eBay's popcorn bidding weaponizes this: each late bid resets the clock, creating a collective holding-of-breath. The timer is not decoration — it is the scarcity engine, and it must be sub-second accurate and visually honest.

**The "I'm part of something" feeling.** Live commerce converts because it is a shared moment. The viewer is not browsing alone at 11pm; they are in a room with 1,284 other people watching a sneaker drop. This collective presence is what the viewer count, the chat velocity, and the reaction animations all manufacture. A fabricated viewer count doesn't just violate §11 — it breaks the psychological mechanism, because the viewer can feel when a "1,284 viewers" stream has a dead chat.

**FOMO.** Limited stock indicators, stream-only pricing, and the ticking timer create the fear of losing access. TikTok users literally seek Reddit tips for buying trendy items before they sell out. FOMO is the conversion trigger that turns a watcher into a bidder in the final 10 seconds.

**Streamer trust.** Verified badges, host demonstrations, real-time Q&A, and the host's stake (commission, reputation) build trust that a static listing cannot. The "Ask to show" button — where a viewer requests the host demonstrate a specific product — is trust made interactive. ThryftVerse's seller-verified checkmark is the seed of this; the missing piece is the interactive request loop.

**Frictionless checkout keeps users in the moment.** The entire purchase must stay inside the stream. Any redirect to an external payment gateway breaks the spell. Product cards must load near-instantly, and the stream audio must continue playing even while a viewer browses a product page — the constant chatter maintains momentum and inspires add-on purchases ([getstream.io — TikTok Live Shopping UX](https://getstream.io/blog/tiktok-live-shopping/)).

---

## 3. Current ThryftVerse Audit

The live shopping department spans three screens and one service. The service layer (`liveShoppingApi.ts`) is surprisingly mature — it defines a full real-time event system (`StreamEvent`, `connectToStream`, `subscribeToStreamEvents`, `placeStreamBid`, `buyNowDuringStream`, `advanceToNextLot`, `endLiveStream`) with typed payloads for bid, chat, lot_change, viewer_count, like, purchase, stream_end, lot_sold, and lot_passed events (`liveShoppingApi.ts:488-554`, `:772-1216`). The problem is that **the screens do not consume this real-time layer** — they were written against an earlier, simpler mock and never upgraded to use the streaming infrastructure that already exists in the same file.

### Defect 1 — Fabricated viewer count fluctuation (§11 violation)
`LiveStreamViewerScreen.tsx:154-160` simulates viewer count drift with `Math.floor(Math.random() * 5) - 2` on an 8-second interval. This fabricates *activity* — the count moves to create the illusion of a live audience. Per AGENTS.md §11, fabricating presence and activity is prohibited. The service layer already has a truthful `subscribeToViewerCount` (`liveShoppingApi.ts:912-921`) backed by `connectToStream`'s demo timer (`:807-813`) that drifts `-3 to +7` — still simulated, but honestly labelled via `isDemo`. The screen bypasses this and invents its own random walk.

### Defect 2 — Fabricated chat messages (§11 violation)
`LiveStreamViewerScreen.tsx:163-180` generates fake chat from `DEMO_CHAT_RESPONSES` with random names (`Alex`, `Jordan`, `Taylor`...) on a 6-second interval, using `Math.random()` for senderId (`:171`). The service layer has `subscribeToChat` (`liveShoppingApi.ts:884-893`) and a seeded followup pool (`STREAM_CHAT_FOLLOWUPS`, `:691-698`) with real-looking usernames tied to the session. The screen ignores all of this and fabricates a parallel, lower-quality chat stream.

### Defect 3 — "Coming soon" / dead live video surface (§11 violation)
`LiveShoppingHomeScreen.tsx:424` displays "Demo mode — live streams are simulated. Real video coming soon." The word "coming soon" in a user-facing banner is a §11 violation — it is a control/label that only produces an explanation, not an action. `LiveStreamViewerScreen.tsx:304-309` renders a `demoVideoPlaceholder` with a videocam-outline icon and "Live video stream will appear here" — a dead video surface that is the *primary* object on the viewer screen. On a live shopping screen, the video is the product; a grey placeholder where the video should be fails the media-storytelling rule (§4) catastrophically. `LiveStreamSellerScreen.tsx:124-130` has the same issue: the "Camera Preview" is a `surfaceAlt` rectangle with a videocam-outline icon — the broadcaster's primary surface is a dead placeholder.

### Defect 4 — The viewer screen ignores the real-time layer it documents
The file header (`LiveStreamViewerScreen.tsx:1-18`) describes a "three-plane live shopping viewer" with "low-latency WebRTC stream", "real-time chat", and "synced product catalog." The implementation uses none of `connectToStream`, `subscribeToStreamEvents`, `subscribeToBids`, `subscribeToChat`, `subscribeToLotChanges`, `placeStreamBid`, or `buyNowDuringStream`. Instead it uses local `useState` + `setInterval` fabrications. The bid handler (`:197-211`) only updates local state and appends a local system message — it never calls `placeStreamBid`. The buy-now handler (`:222-229`) navigates to `Checkout` with the `currentItemId`, abandoning the in-stream purchase flow that the service layer was built to support. This is the highest-impact defect: the architecture exists, the screen doesn't use it.

### Defect 5 — Seller screen is a static prototype
`LiveStreamSellerScreen.tsx` has three phases (setup/live/summary) but the live phase (`:193-274`) is a static composition: a `sellerCameraPreview` grey rectangle with "Broadcasting" text (`:200-207`), a stats bar with a viewer count hardcoded to start at 1 (`:70`), and lot management that mutates local state only (`:78-98`). `handleNextLot` (`:78-88`) hardcodes `setTotalSales(s + 45)` — fabricating sales data. It never calls `advanceToNextLot`, `endCurrentLot`, or `endLiveStream` from the service. The summary phase (`:278-319`) displays `viewerCount`, `lotsSold`, `totalSales` that are all locally fabricated. The `liveDuration` state (`:63`) is never incremented by any timer — it stays at 0 forever, so the duration display (`:217`) always reads `0:00`.

### Defect 6 — Missing pinned product rail
None of the three screens implement a pinned product rail or product carousel — the single most durable pattern across TikTok, Instagram, eBay, and Whatnot. The viewer screen has a single `productPlane` (`:391-430`) showing one item with Bid/Buy Now buttons, but no way to browse the seller's other lots without leaving the stream. The service layer's `LiveStream.lots` array (`liveShoppingApi.ts:443-463`) is fully modeled and unused by the UI.

### Defect 7 — Card-on-card and surface-budget violations
The viewer screen stacks a `videoPlane` (background), a `sellerBar` with `colors.surface` background (`:632-639`), a `productPlane` with hardcoded `#161616` (`:680-687`), and a `chatPlane` with `colors.background` (`:783-786`) — four distinct surface tones in one viewport, none of which is media. The `bidCountBadge` (`:722-730`) is a pill inside the product plane, and the `sellerBadge` (`:797-801`) is another pill inside chat messages. The seller screen's summary (`LiveStreamSellerScreen.tsx:289-304`) wraps three stats in a `summaryStats` card with dividers — card-on-card. Per §4, above the fold there should be at most one dominant non-media panel.

### Defect 8 — Hardcoded color literals break dark/light parity
`LiveStreamViewerScreen.tsx` is littered with hardcoded `#161616` (`:686`), `rgba(255,255,255,0.5)`, `rgba(0,0,0,0.6)`, and `white` literals that ignore the theme. `LiveStreamSellerScreen.tsx:538` hardcodes `#161616` for `sellerCurrentLot`. Per §4 light/dark parity, geometry and hierarchy must remain identical across themes — these literals make the live screens a different product in dark mode.

### Defect 9 — Missing state coverage for live
The viewer screen has no loading state (it initializes from `DEMO_SESSION` synchronously, so there's never a moment where the stream is connecting), no error state (no try/catch around any "API" call because none are made), no offline state, and no "stream ended" state. The seller screen has no permission-denied state for camera/mic. Per §14, every screen must account for loading, error, offline, partial, and permission-denied states.

### Defect 10 — Search button is a dead control
`LiveShoppingHomeScreen.tsx:408-416` renders a search button whose `onPress` only calls `haptic.light()` — it performs no search, navigates nowhere. Per §11, a control that only produces haptic feedback is a dead control. It must navigate to a live-session search screen or be removed.

---

## 4. Micro Improvements (Per-Screen, Per-Feature)

### LiveShoppingHomeScreen
- **Replace the "coming soon" banner** (`:420-427`) with a truthful, non-apologetic demo indicator: a small "Demo" pill in the header next to the Live pulse, not a banner that occupies first-viewport space. The demo state is a persistent fact, not an announcement.
- **Wire the search button** (`:408-416`) to a live-session search route or remove it. A haptic-only press is a §11 violation.
- **Make featured cards tappable** — `FeaturedLiveCard` (`:75-136`) has `accessibilityRole="image"` but no `onPress`. It must navigate to `LiveStreamViewer` with the session id. Currently the entire "Live now" strip is non-navigable.
- **Add a real-time "live now" pulse** — the `LivePulse` (`:42-48`) is a static dot. A genuine, restrained pulse animation (opacity 0.5↔1.0, 1.2s) communicates liveness without violating the §17 prohibition on continuous pulsing (a status pulse is the documented exception — it communicates state).
- **Surface the current item on featured cards** — the card shows seller, title, and bid, but not the *current item image*. TikTok's cards show the item being auctioned right now. Add a small item thumbnail or a "Currently auctioning: [item]" line.

### LiveStreamViewerScreen
- **Replace the dead video placeholder** (`:304-309`) with a real video surface (or, in demo mode, an art-directed looping video/animated thumbnail from the session's `thumbnail` — not a grey rectangle with an icon). The video is the product.
- **Wire the real-time layer** — replace `useState` + `setInterval` fabrications with `connectToStream` + `subscribeToChat` + `subscribeToViewerCount` + `subscribeToBids` + `subscribeToLotChanges`. The service already exists.
- **Replace fabricated chat** (`:163-180`) with `subscribeToChat` and `sendStreamChatMessage`. Remove `DEMO_CHAT_RESPONSES` and the random-name generator.
- **Replace fabricated viewer count** (`:154-160`) with `subscribeToViewerCount`.
- **Replace local bid handler** (`:197-211`) with `placeStreamBid` — show a pending state on the bid button, handle success/error/outsbid truthfully.
- **Replace buy-now navigation** (`:222-229`) with `buyNowDuringStream` and an in-stream checkout overlay, not a navigation to `Checkout` that abandons the stream.
- **Add a pinned product rail** — a horizontally scrollable strip of the seller's `lots` above or below the current product card, so viewers can browse the queue without leaving.
- **Add a "stream ended" state** — when `stream_end` event fires, show a truthful recap with the sold lots, not a silent freeze.
- **Add a connecting/loading state** — between mount and `connectToStream` resolution, show a skeleton that matches the three-plane layout, not an instant fabricated feed.
- **Remove hardcoded `#161616`** (`:686`) and `rgba` literals — route through theme tokens.
- **Add "Ask to show" / question pinning** — the TikTok pattern where a viewer can request the host demonstrate an item. Even a lightweight version (a question chip that the seller sees in their dashboard) closes the trust loop.

### LiveStreamSellerScreen
- **Replace the dead camera preview** (`:124-130`, `:200-207`) with a real camera surface (`expo-camera`) or, pre-WebRTC, an art-directed local-camera preview. "Camera Preview" text over a grey rectangle is not a broadcaster experience.
- **Wire `advanceToNextLot`, `endCurrentLot`, `endLiveStream`** from the service layer instead of local state mutation. `handleNextLot` (`:78-88`) hardcoding `setTotalSales(s + 45)` is fabricated data.
- **Fix the frozen duration timer** — `liveDuration` (`:63`) is never incremented. Add a `setInterval` that ticks every second while `phase === 'live'`.
- **Add a real-time GMV/readiness dashboard** — the 2026 seller expectation is a live ops panel showing concurrent viewers, current bid, items sold, and remaining queue, fed by the same `subscribeToStreamEvents` the viewer uses.
- **Add a pre-stream readiness checklist** — camera permission, mic permission, lots loaded, title set, network check. TikTok and eBay both gate going live on readiness.
- **Remove hardcoded `#161616`** (`:538`) and route through theme.

---

## 5. Macro Improvements

### 5.1 Three-plane live architecture (video / realtime / commerce)
The service layer already models the isolated-plane architecture from 2026 literature. The macro fix is to **make the screens consume it**: `connectToStream` on mount, subscribe to all event types, and dispatch into a single `useReducer` that holds the live session state. Each plane renders from that reducer. If the video plane buffers, the chat and commerce planes continue from the same reducer. If commerce fails, the video and chat continue. This is the single highest-leverage change because it converts three fabricated screens into one real-time surface backed by infrastructure that already exists in `liveShoppingApi.ts`.

### 5.2 Real-time layer (WebSocket side-channel)
The current `connections` Map (`liveShoppingApi.ts:573`) is an in-memory timer-based simulator. The macro upgrade is to define the WebSocket contract (event types are already typed at `:488-554`) and swap the implementation behind the same public API. The screens should not change — the `subscribeTo*` functions are the seam. This means the flagship UI work is implementation-complete against the mock and automatically inherits the real backend when it lands.

### 5.3 Video-first composition
The viewer screen must become a **full-bleed vertical video** with overlaid chrome, not a three-stacked-rectangle layout. 2026 mobile shoppable video is 9:16, full-bleed, with the product card pinned to the bottom thumb-zone and chat floating as a translucent overlay on the right edge ([idukki.io — Mobile-first shoppable video design](https://www.idukki.io/blog/mobile-first-shoppable-video-design)). The current `VIDEO_HEIGHT = SCREEN_WIDTH * 0.5625` (16:9, `LiveStreamViewerScreen.tsx:529`) is a desktop crop — it should be 9:16 full-screen with the product and chat planes as overlays, not stacked panels. The seller screen should mirror this: full-bleed camera with overlaid lot controls.

### 5.4 Product-pin system
Implement a first-class **pinned product** primitive: the seller pins a lot (via `advanceToNextLot` / a new `pinLot` action), and all viewers receive a `lot_change` event that updates the pinned product card with a timestamped latency compensation so the card never appears over the previous product's demo. The pinned card is the single dominant commerce surface; a horizontally scrollable rail of upcoming lots sits below it. This replaces the current single static `productPlane` and is the durable pattern that survived even Instagram's checkout removal.

### 5.5 Streamer dashboard
The seller screen's live phase should be a **broadcaster dashboard**: full-bleed camera preview with an overlay rail showing the current lot (image, current bid, bid count, timer), the next 3 lots, a live viewer count, a live GMV counter, and three actions (Sell & Next, Skip, End). This mirrors the 2026 "pod" model where a Live Ops Manager watches a real-time GMV dashboard and feeds signals to the host ([zonflip.com — TikTok Shop Live 2.0](https://zonflip.com/tiktok-shop-live-2-0-the-operational-infrastructure-behind-streams-that-actually-scale/)). For a solo ThryftVerse seller, the dashboard *is* the ops manager.

### 5.6 Popcorn / extended auctions
eBay Live's extended auctions (last-second bid resets the timer to 10s) and TikTok's Extended Auction are the 2026 standard for live bidding. The service layer's `endCurrentLot` and the lot timer (`liveShoppingApi.ts:816-844`) should support an `extendedAuction` mode where a late bid adds time. This is a commerce-engine feature but it manifests in the UI as a timer that visibly resets with a "Time extended — last bid!" toast, which is a high-impact FOMO signal.

### 5.7 Shoppable replay
2026 data shows replays convert at 5.1% for up to 45 days post-broadcast ([onlinestorenews.com](https://onlinestorenews.com/live-commerce-is-quietly-becoming-the-most-valuable-real-estate-on-mobile/)). The ended-session hint on the home screen (`LiveShoppingHomeScreen.tsx:538-546`) should become a shoppable replay surface: a VOD player with the product timeline synced, so a viewer who missed the stream can still bid on unsold lots or buy-now on remaining inventory.

---

## 6. Flagship Acceptance Criteria

### Thumbnail test (§4)
At 25% scale, the viewer screen's primary object must be the **video/image of the current item**, with the pinned product card and chat as receding overlays. Today, at 25% scale, the dominant silhouette is three stacked grey rectangles (video placeholder, product plane, chat plane) — repeated rounded rectangles dominate, which is a direct thumbnail-test failure. After the flagship pass, the silhouette should be a full-bleed media object with a single product card anchored at the bottom and a thin chat rail on the right.

### Squint test (§4)
Squinting at the current viewer screen reveals a grid of equal-weight grey panels with no dominant media. After the flagship pass, squinting should reveal the video/image as the dominant color and visual anchor, with the bid/buy-now buttons as the only prominent chrome and chat as an ambient texture.

### State coverage for live (§14)
The viewer screen must explicitly design: **connecting** (skeleton matching the three-plane layout), **live populated** (full real-time feed), **live partial** (video buffering, chat working — planes isolated), **stream ended** (recap with sold lots + shoppable replay), **offline** (truthful banner, chat history preserved locally), **error** (retry without losing chat), **permission denied** (camera/mic for seller). The seller screen must add: **pre-stream readiness** (camera/mic/title/lots checklist), **live broadcasting**, **stream ended summary** (real GMV, not fabricated).

### Media storytelling (§4, §15)
On the home screen, real stream thumbnails must be the primary color — the featured strip already uses `CachedImage` (`LiveShoppingHomeScreen.tsx:92-97`) which is good. On the viewer and seller screens, the video surface must be the primary visual anchor. A grey `surfaceAlt` rectangle with a videocam-outline icon is a generic placeholder dominating a creator surface — a direct §4 media-storytelling violation. In demo mode, use an art-directed animated thumbnail or a muted looping video, never a static grey rectangle.

### Truthful UI (§11)
- No "coming soon" banners (`LiveShoppingHomeScreen.tsx:424`).
- No fabricated viewer-count drift (`LiveStreamViewerScreen.tsx:154-160`).
- No fabricated chat (`LiveStreamViewerScreen.tsx:163-180`).
- No fabricated sales totals (`LiveStreamSellerScreen.tsx:86`).
- Every bid/buy-now/follow/notify action must call the real service function or show a truthful disabled state.
- The demo state is communicated by a persistent, restrained "Demo" indicator, not by apologetic banners or dead placeholders.

### Comparative visual-fidelity delta
```text
dominant object:  grey placeholder rectangle → full-bleed video / art-directed media
content density:  3 stacked panels → 1 media + overlaid product + ambient chat
visible surfaces: 4 distinct tones → 1 media + 1 product card (surface budget)
radii:            mixed lg/xxl/sm → 2 sizes max (media 16pt, product card 16pt)
strokes:          hairline + 1pt mixed → hairline separators only
icon chrome:      44pt grey circles for overlay btns → transparent 44pt targets, 22pt glyphs
typography:       5+ sizes competing → 3 sizes (stream title, product title, chat)
media crop:       16:9 desktop crop → 9:16 full-bleed
motion:           none → restrained lot-change crossfade, timer color interpolation
states:           1 (populated) → 7 (connecting, live, partial, ended, offline, error, permission)
```

---

## 7. Priority & Sequencing

| Priority | Work item | Rationale | Files |
|----------|-----------|-----------|-------|
| **P0** | Wire viewer screen to the real-time layer (`connectToStream` + all `subscribeTo*`) | Eliminates 3 §11 violations (fabricated count, chat, bids) in one pass; uses infrastructure that already exists | `LiveStreamViewerScreen.tsx`, `liveShoppingApi.ts` |
| **P0** | Remove "coming soon" banner; replace with truthful Demo indicator | §11 violation in first viewport | `LiveShoppingHomeScreen.tsx:420-427` |
| **P0** | Make featured cards + search button functional | Dead navigation + dead control (§11, §12) | `LiveShoppingHomeScreen.tsx:75-136`, `:408-416` |
| **P1** | Replace dead video placeholder with art-directed media surface | §4 media storytelling; the video is the product | `LiveStreamViewerScreen.tsx:304-309`, `LiveStreamSellerScreen.tsx:124-130`, `:200-207` |
| **P1** | Convert viewer layout to full-bleed 9:16 video with overlaid product + chat | Thumbnail/squint test failure; 2026 mobile-first pattern | `LiveStreamViewerScreen.tsx` (layout + `:529` VIDEO_HEIGHT) |
| **P1** | Wire seller screen to `advanceToNextLot` / `endCurrentLot` / `endLiveStream`; fix frozen duration timer | Fabricated sales data (§11); broken timer | `LiveStreamSellerScreen.tsx:63`, `:78-98` |
| **P2** | Add pinned product rail + upcoming-lots queue on viewer screen | Missing durable 2026 pattern; service layer already models `lots` | `LiveStreamViewerScreen.tsx`, new `PinnedProductRail` component |
| **P2** | Add streamer dashboard overlay (live GMV, viewers, current bid, queue) | 2026 seller expectation; replaces static stats bar | `LiveStreamSellerScreen.tsx:209-271` |
| **P2** | Add state coverage: connecting, stream-ended, offline, error, permission-denied | §14 state completeness | All three screens |
| **P2** | Remove hardcoded `#161616` / `rgba` literals; route through theme tokens | §4 light/dark parity | `LiveStreamViewerScreen.tsx:686`, `LiveStreamSellerScreen.tsx:538` |
| **P3** | Implement extended/popcorn auctions (late bid resets timer) | 2026 live-auction standard; high-impact FOMO | `liveShoppingApi.ts` lot timer logic `:816-844` |
| **P3** | Add shoppable replay for ended sessions | 5.1% replay conversion for 45 days post-broadcast | `LiveShoppingHomeScreen.tsx:538-546`, new VOD surface |
| **P3** | Add "Ask to show" / question pinning | Trust loop; TikTok-proven interactive pattern | `LiveStreamViewerScreen.tsx` (new chip), `LiveStreamSellerScreen.tsx` (dashboard) |

**Sequencing principle:** P0 is the §11 truthfulness pass — it is non-negotiable and unblocks the rest because it forces the screen onto the real-time API. P1 is the composition pass — it converts the wired-but-ugly screen into a flagship visual surface. P2 is depth — product rail, dashboard, state coverage. P3 is the 2026 differentiator — popcorn auctions, replay, and interactive trust loops that exceed the competitor benchmark rather than match it.

---

### Web sources cited
- [getstream.io — Deconstructing TikTok's Live Shopping UX](https://getstream.io/blog/tiktok-live-shopping/) (Jan 2026)
- [getstream.io — How to technically implement live shopping features](https://getstream.io/blog/live-shopping-features-implementation/)
- [getstream.io — Live Selling: Formats, Tips & Tools](https://getstream.io/blog/live-selling/)
- [getstream.io — The Design Process Behind a One-Shot AI Live Shopping App](https://getstream.io/blog/live-shopping-app-design/)
- [idukki.io — Mobile-first shoppable video design](https://www.idukki.io/blog/mobile-first-shoppable-video-design)
- [onlinestorenews.com — Live Shopping Is Finally Forcing Mainstream UX Rethinks in 2026](https://onlinestorenews.com/live-shopping-is-finally-forcing-mainstream-ux-rethinks-in-2026/)
- [onlinestorenews.com — Live Commerce Is Quietly Becoming the Most Valuable Real Estate on Mobile](https://onlinestorenews.com/live-commerce-is-quietly-becoming-the-most-valuable-real-estate-on-mobile/)
- [forasoft.com — Live Commerce Platform Development 2026: Sprii Architecture Inside](https://www.forasoft.com/blog/article/live-commerce-platform-development-2026)
- [ppc.land — TikTok Shop Countdown Bidding turns LIVE sessions into real-time auctions](https://ppc.land/tiktok-shops-countdown-bidding-turns-live-sessions-into-real-time-auctions/)
- [ppc.land — TikTok Shop's quality rules ban AI voices and still images from LIVEs](https://ppc.land/tiktok-shops-quality-rules-ban-ai-voices-and-still-images-from-lives/)
- [syntopia.ai — How to Set Up a TikTok Shop Live Room: Complete 2026 Guide](https://syntopia.ai/tiktok-shop-live-room-setup/)
- [zonflip.com — TikTok Shop Live 2.0: The Operational Infrastructure Behind Streams That Actually Scale](https://zonflip.com/tiktok-shop-live-2-0-the-operational-infrastructure-behind-streams-that-actually-scale/)
- [searchengineland.com — Meta expands live shopping ads and virtual card checkout](https://searchengineland.com/meta-expands-live-shopping-ads-and-virtual-card-checkout-to-drive-more-purchases-480532)
- [inro.social — Instagram Live Shopping in 2026: What Changed and What Still Works](https://www.inro.social/blog/instagram-live-shopping)
- [hashmeta.com — Instagram Live Shopping: The Complete Seller Setup Guide](https://hashmeta.com/blog/instagram-live-shopping-the-complete-seller-setup-guide/)
- [influencers-time.com — Instagram Live Shopping Playbook That Converts](https://www.influencers-time.com/instagram-live-shopping-playbook-that-actually-converts/)
- [liveshopfront.com — Instagram Live Shopping Guide: What Still Works After Meta's Changes [2026]](https://liveshopfront.com/instagram-live-shopping-guide)
- [techcrunch.com — eBay continues to bet on live shopping after record quarter](https://techcrunch.com/2026/08/06/ebay-continues-to-bet-on-live-shopping-after-record-quarter/) (Aug 2026)
- [ebayinc.com — eBay Live Launches in Australia](https://www.ebayinc.com/stories/press-room/au/ebay-live-launches-in-australia-marking-a-major-milestone-in-ebays-evolution/)
- [ebayinc.com — eBay Live Launches in Canada](https://www.ebayinc.com/stories/press-room/ca/ebay-live-launches-in-canada-bringing-real-time-community-driven-shopping-nationwide/) (Feb 2026)
- [pages.ebay.com.au — eBay Live FAQ](https://pages.ebay.com.au/ebaylive-faq/)
- [sabat.io — Sabat Live Shopping](https://sabat.io/products/live-shopping)
- [cloudinary.com — Video Shopping Platform Guide](https://cloudinary.com/guides/video/video-shopping-platform)
