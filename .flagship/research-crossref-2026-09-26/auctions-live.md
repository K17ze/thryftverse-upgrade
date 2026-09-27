# Cross-Reference Audit — Auctions Hub, Auction Detail, Bidding, Live Shopping, Host Tools

**Codebase audited:** `web/src` (fixture-mode web client)
**Mobile reference:** `frontend/src` (React Native flagship — the parity target)
**Date:** 2026-09-26 · **Dept scope:** `app/auctions/**`, `app/live/**`, `components/auctions/**`, `components/live/**`, `components/livehost/**`, `lib/contracts/auction*`, `lib/hooks/auction-queries.ts`, `lib/data/fixtures-auctions*`

---

## 1. Reference Grammar (live research, distilled)

### eBay auctions
- **Proxy bidding is THE mechanic.** "Enter the maximum you'll pay — we bid in increments on your behalf, confidentially, only as much as needed to keep the lead." The visible bid is the *second-price+increment* outcome, not the bidder's max. This is eBay's actual sniping defense: there is **no time extension** — the auction hard-closes and the proxy agent absorbs last-second bids for you.
- **Increment schedule is bracketed by price**, not a flat rate (UK: £0.05 under £1 … £100 at £3,000+). Occasional sub-increment steps signal another proxy's residue.
- **Outbid notifications** fire immediately (email/push), with a return-link to re-bid. Losing bidders get an end-of-auction email that **surfaces similar items** — the lost moment is a re-engagement surface.
- **Watchlist** is first-class: watcher counts are public ("X watchers"), watch = lightweight commitment short of a bid.
- Countdown grammar: "Time left" text on cards, red urgency in the final stretch; listing page shows real seconds.

### Whatnot live shows
- **In-show per-lot auctions** — seconds-to-minutes timers run by the host from a pinned item. Standard clock: bids in the final <10 s reset to a seller-set "counter bid time" (soft-close). **Sudden Death**: zero-extension clock, 💀 marker beside the timer.
- **Pinned product rail** at bottom of the video; starting an auction **auto-pins** the product; can't re-pin mid-auction. Pin ≠ auction — it's a preview/warm-up affordance.
- **Max Bid is ON by default** in the bid sheet (proxy, same as eBay); toggle off submits an exact bid. **Pre-bids** on listed items auto-apply when the auction runs — bid before the show, win without watching.
- **Giveaways**: top-of-screen entry box, host gates on followers/buyers, seller ships free. **Flash sales**: discounted BIN on a seconds-scale window.
- **Won = auto-charged** to saved payment; Activity > Purchases is the ledger.
- Host tools: auction start controls, moderation commands, co-host, raid, rehearsal mode. Seller trust rides in-stream (rating, verified).

### TikTok Live shopping ("Countdown Bidding")
- Auction-only listings pulled into LIVE; seller sets starting bid + duration (15–30 s recommended for urgency). **Pre-qualification**: bidders must accept terms + keep a payment card on file before bidding. Win → in-LIVE pay.
- **Pinned product card sits above chat** — tap → PDP → buy. Temporary auction-only listings can be created mid-show. Compliance framing: "highest bidder wins — no luck involved."

### Poshmark Posh Shows
- Host builds a **featured queue** of listings (up to 50) pre-show; during the show, "feature" → "Auction item" with start price + duration. Shoppers see highest bid + countdown, tap suggested bid or custom; **all bids binding**.
- **Sell Together**: hosts auction *other sellers'* listings. **Quick List** mid-show from a second device. Exclusive Show Price / Buy Now coexist with auctions. Waiting-room preview of the queue before going live. Multi-quantity listings re-auction until sold out.

### StockX (bid/ask — the different beast)
- Continuous anonymous market: bids and asks listed by price, transaction when they meet. **Market data = sold history** — "data for actual sales, not listings" — the comps rail every resale auction product eventually needs.
- **Smart Bidding**: auto-increments your bid on a schedule up to a max threshold — proxy grammar applied to a bid/ask book.
- StockX Live: in-show real-time auctions, swipe-to-bid, winning bid charged at close.

### Distilled grammar summary
| Grammar | Reference |
|---|---|
| Proxy/max-bid affordance | eBay core; Whatnot default-ON; StockX Smart Bidding; **mobile app ships it** (`BidSheet.tsx` "Set maximum bid" → `maxBidGbp`) |
| Anti-snipe | eBay: none (proxy absorbs). Whatnot: counter-bid reset. Posh/TikTok: short hard clocks. Ours: +2 min extension |
| Ending-soon surfacing | eBay red urgency + "Ending soon" sort; Whatnot runway = the live show itself |
| Won/lost moment | eBay outbid email + similar-items redirect; Whatnot/TikTok auto-charge; mobile: payment deadline countdown + second-chance offer |
| Live room | video stage + pinned lot + chat + bid dock + reactions + viewer count + follow/share |
| Host tools | pin/feature queue, start/stop auction, sudden-death toggle, giveaway, flash sale, moderation, go-live schedule |
| Trust in-stream | verified badge, rating, watchers/waiting counts, pre-qualified bidders |

---

## 2. Our Implementation

### Auction board — `app/auctions/page.tsx`
- **Scope rail** Live | Upcoming | Results | Watching with per-scope counts — `page.tsx:37-42`, SegmentedControl at `:136`.
- **Editorial live composition** — ending-soonest takes the runway, next two stack as supporting tiles, rest continue in a grid — `LiveScope` `page.tsx:220-260` (1-col runway `lg:flex-[1.6]` + tiles).
- **Personal attention strip** — outbid (ending soonest) > won-awaiting-checkout > leading-into-final-hour; hairline bar with left accent + action — `page.tsx:96-107`, `AuctionAttentionStrip.tsx:50-101`.
- Upcoming = scheduled programme rows (`AuctionScheduleRow`, `AuctionRows.tsx:19-52`); Results = settled ledger with Won/Outbid/Sold/No-bids outcome grammar (`AuctionResultRow`, `AuctionRows.tsx:66-127`); Watching = compact grid of watched items.
- Header declares the rules inline: "Six-hour windows · 5% increments · anti-snipe to the last two minutes" (`page.tsx:115`) — **overstates**: create offers 3/6/12/24h (`create/page.tsx:21-26`).

### Auction detail — `app/auctions/[id]/page.tsx` + `BidPanel.tsx`
- Media stage + evidence (About this item facts) left; sticky transaction rail right.
- **Countdown clock** `AuctionCountdown.tsx:41-70` — ticking H:MM:SS, `role="timer"`, sr-only minute-granularity live region. Honest urgency ladder: chip `Ends in 2h 14m` → `Ending soon` <10m, tones normal/soon/final (`AuctionCard.tsx:35-48`, `fixtures-auctions.ts:299-305`).
- **Bid composer** `BidPanel.tsx:296-439` — "Next bid £X or more · 5% increments", £-prefixed input with min validation, **quick-bid ladder of the next three valid increments** (`:88-96`, `:414-435`), leading/outbid status banners with one-tap `Re-bid £X` (`:346-367`), auth gate via signup wall, **confirmation sheet** restating item + exact amount + anti-snipe consequence (`:229-288`).
- **Anti-snipe** declared up front (`BidPanel.tsx:145-150`) and applied in the mutation (`auction-queries.ts:340-344`): bid inside final 2 min → +2 min end, mirrored in the success toast.
- **Bid history** `BidHistory.tsx` — eBay ledger grammar: masked bidders ("Marie F.", `:26-34`), newest-first, "You" marking, Top bid emphasis, `aria-live` on the head row. **No proxy/auto-bid flags** — correctly none shown since the contract doesn't model them (`:8-9` comment).
- **Watch/unwatch** `auctionWatchlist.ts` — localStorage-persisted `Set` via `useSyncExternalStore`; live mode unions server watchlist once per session + writes through `POST/DELETE /auctions/:id/watch` (`:84-124`). Guests hit the auth wall. Honest and durable.
- **Ended state** `BidPanel.tsx:497-633` — winning-bidder mask, You-won vs "Your highest bid £X — outbid", winner checkout against a hammer-priced pseudo-listing with honest payable breakdown (hammer + protection + postage, `:528`/`617-623`). Seller gets "Your auction ended / Sold to X / unsold".
- **Buy now** — routes to real checkout while listing lives; honest disabled state when the listing is gone (`:208-226`).
- Seller-of-record gets an owner note instead of a fake composer (`:441-459`).

### My bids — `app/auctions/my-bids/page.tsx`
- Active (outbid-first alert ordering)/Won/Lost/Watching tabs, ending-soonest sort chip (`:110-128`), `MyBidRow.tsx` carries status + your-bid-vs-top + "Bid again" deep link to `#bid`.
- Status derived from the ledger, never stored (`fixtures-auctions.ts:330-361`). Guest sees a sign-in wall, never the fixture identity.

### Live hub — `app/live/page.tsx` + `LiveView.tsx`
- Whatnot-style composition: category-segmented rails, LIVE NOW hero + rail, Today's schedule timetable, Coming up rail (persisted Remind-me), Replays grid (`LiveView.tsx:142-212`). Session-honest category filter (`:64-72`); authored empties per scope.

### Viewer room — `LiveViewerOverlay.tsx`
- Full-viewport media stage; top chrome = seller + Follow + LIVE badge + viewers + share + close (`:144-195`); bottom = chat column (desktop) / collapsible sheet (mobile), title, **pinned product rail**, heart reactions action column (`:199-230`). Focus-trapped dialog, Esc exits.
- `LiveProductRail.tsx` — pins resolve to real listings, first card = "on the table" pin mark, **Bag quick-add** to persisted bag, sold items say Sold (`:62-124`). ⚠ No in-show bidding, no BIN-in-show.
- `LiveChatRail.tsx` — flat hairline rows, host badge, host-pinned chat note banner, composer gated on auth; replays = read-only transcript.
- `useLiveChat.ts` — fixture chat streams a **disclosed script** ("Simulated preview — chat is scripted in this build", `:105-111`); **live mode shows "Live chat isn't connected"** rather than faking traffic (`:64-80`). Latency honesty is exemplary.
- `useLivePresence.ts` — seeded bounded drift on fixture counts; **server count verbatim in live mode** (`:48-49`). `LiveReactions` = ambient trickle + tap hearts, reduced-motion safe.

### Host room — `components/livehost/**`
- `HostConsole.tsx` — three-phase orchestrator: `HostScheduledRoom` (cover + pinned list + Go live now) → `HostLiveRoom` (stage w/ LIVE+Demo pills, viewers, elapsed clock; `HostPinnedRail` ordered pins max 6, "first pin is on the table"; `HostChatPanel` moderation with pin/hide/restore) → `HostSummary` (peak viewers, pin clicks, orders, duration — labelled "Simulated results").
- **Pin→viewer propagation is real in-session**: `setHostStreamPins` → `setLivePins` → `LiveProductRail` reads the same zustand store (`hostStreams.ts:137-143`, `livePins.ts:38-41`); pinned chat notes propagate the same way (`HostChatPanel.tsx:80-88` → `LiveChatRail.tsx:59-68`). Hub cache sync via `syncSessionToHub` (`hostStreams.ts:95-100`).
- `CreateStreamFlow.tsx` — cover pick (listing cover or upload), title, ordered pin selection ≤6, now/schedule, honesty note "no video is broadcast" (`:470-473`).

### Data layer
- `auction-queries.ts` — session runtime store (`runtimeAuctions`/`runtimeBids`/`runtimeEnds`) overlaid on fixtures; optimistic bid commit with rollback + anti-snipe (`:298-362`); 1s now-tick on board/detail, 30s on my-bids.
- `lib/api/services/auctions.ts` — live-mode service exists: board, detail, bids, watch, my-bids, create (accepts `reservePriceGbp`, `minIncrementGbp` — **not surfaced in the web create form**), buy-now. **`placeAuctionBid` sends only `amountGbp`** (`:102-108`) — the backend's `maxBidGbp` param (mobile `marketApi.ts:754-758`) is dropped.

---

## 3. Gap Table

| # | Reference grammar | Status | Where (file:line) | Notes |
|---|---|---|---|---|
| 1 | Scope rail Live/Upcoming/Results/Watching | **MATCHED** | `app/auctions/page.tsx:37-42` | Counts included; guest-aware Watching |
| 2 | Runway + supporting tiles (ending-soonest first) | **MATCHED** | `page.tsx:220-260`, `AuctionRunwayCard.tsx`, `AuctionCard.tsx` | Mobile `LiveComposition` grammar ported |
| 3 | Countdown urgency ladder (normal→soon→final) | **MATCHED** | `AuctionCard.tsx:35-48`, `AuctionCountdown.tsx`, `fixtures-auctions.ts:299-305` | Detail clock ticks seconds; **chip collapses to "Ending soon" under 10m** — no seconds where eBay peaks urgency |
| 4 | Bid increments | **DIVERGENT** | `contracts/auction.ts:63` | Flat 5% ceil vs eBay's price-bracketed table. Simple, honest, defensible |
| 5 | **Proxy / max-bid (automatic bidding)** | **MISSING** | Contract `auction.ts` has no field; `services/auctions.ts:102-108` sends `amountGbp` only; `BidPanel.tsx` has no max-bid affordance | The biggest gap. eBay's core mechanic + Whatnot default-ON + **mobile ships it** (`frontend/components/ui/BidSheet.tsx:114-116,577-615` → `maxBidGbp` in `marketApi.ts:756`). API already accepts it — web UI doesn't expose it |
| 6 | Anti-snipe (soft-close extension) | **MATCHED** | `contracts/auction.ts:65-66`, `auction-queries.ts:340-344`, `BidPanel.tsx:145-150,268-270` | Whatnot-style counter-bid extension; declared + applied + toasted. eBay's model (hard close + proxy) is a superset we're missing |
| 7 | Watchlist | **MATCHED** | `auctionWatchlist.ts:96-127`, `BidPanel.tsx:463-492` | Persisted, auth-gated, server-seeded in live mode |
| 8 | Watcher count (eBay "X watchers"; mobile `watchers` on upcoming shows) | **MISSING** | Not in `AuctionMarketItem` contract; not rendered | Live sessions carry `watchers` in mobile API (`liveShoppingApi.ts:53`, "318 waiting") — web `LiveSession` doesn't render it |
| 9 | Outbid / won / ending-soon **notifications** | **PARTIAL** | `AuctionAttentionStrip.tsx` + `page.tsx:96-107` (in-page only) | Mobile has `AuctionNotificationRow` (`auction_outbid`, `auction_won`, `auction_ending_soon`); web delivers no inbox/push events — the alert only exists while you stand on the board |
| 10 | Bid history ledger | **MATCHED** | `BidHistory.tsx` | Masked bidders, newest-first, You-marking; mask format diverges from eBay `a***r` (ours "Marie F.") — equivalent intent |
| 11 | Confirm-before-commit bid sheet | **MATCHED** | `BidPanel.tsx:229-288` | Mobile's review sheet equivalent |
| 12 | Reserve price (met/not-met, accept-below-reserve) | **MISSING** | API accepts `reservePriceGbp` (`services/auctions.ts:141`); contract/UI don't model it | Mobile: `AuctionPostEndBanners` reserve-not-met banner, "Reserve met" badge, seller accept-highest-bid |
| 13 | Ended-auction result grammar (winner, hammer, checkout) | **PARTIAL** | `BidPanel.tsx:497-633`, `AuctionRows.tsx:66-127` | Won→pay / lost / unsold all honest. Missing: payment-deadline countdown, second-chance offer, cancelled state — all in mobile (`AuctionPostEndBanners`, `AuctionTerminalResult`) |
| 14 | Sold-for comps / market data | **MISSING** | Detail shows "Similar items" (`[id]/page.tsx:214-227`) but no price history | StockX grammar; mobile results rows at least carry hammer — no comps rail either side |
| 15 | My-bids ledger (outbid/winning/won/lost + ending soonest) | **MATCHED** | `my-bids/page.tsx:69-84`, `MyBidRow.tsx` | Derived from ledger, never stored |
| 16 | Auction search + category filter on the board | **MISSING** | Web board has scopes only | Mobile `AuctionHomeScreen` ships search overlay + category chips (`AuctionHomeScreen.tsx:182-192`) |
| 17 | Live hub (hero + rail + schedule + coming up + replays + category filter) | **MATCHED** | `LiveView.tsx:142-212` | Whatnot/Posh grammar; honest splits, scripted-category honesty |
| 18 | Live room composition (stage + chat + pinned products + reactions + presence) | **MATCHED** | `LiveViewerOverlay.tsx:123-262`, `LiveProductRail.tsx`, `LiveChatRail.tsx`, `LiveReactions.tsx` | Focus-trapped, honest chrome |
| 19 | **In-show lot auctions** (host runs timed bidding on a pinned lot; bid dock w/ countdown + extension count) | **MISSING** | Web pins are Bag-only (`LiveProductRail.tsx:107-120`) | The core Whatnot/TikTok/Posh mechanic. Mobile ships it: `LiveLotDock` (server `closesAt` countdown, `extensionCount`), `LiveBidSheet`, `useLiveBidActions` (placeStreamBid/checkBidStatus/buyNowDuringStream/settleLot) |
| 20 | Giveaways | **MISSING** | — | Not in mobile either; Whatnot signature feature |
| 21 | Sudden-death auctions | **MISSING** | — | Whatnot's no-extension clock; mobile lot model carries `extensionCount` machinery but the viewer grammar exists there, not web |
| 22 | Pre-bids on upcoming lots | **MISSING** | — | Whatnot grammar; `upcoming` auctions disable the composer instead (`BidPanel.tsx:406-410`) — correct given no pre-bid contract |
| 23 | Flash sale (seconds-window discounted BIN) | **MISSING** | — | Whatnot/TikTok grammar |
| 24 | Host pin→viewer propagation | **MATCHED (session-scoped)** | `livePins.ts:38-66`, `hostStreams.ts:137-143`, `HostChatPanel.tsx:80-88` | Real shared store in fixture; **live mode has no pins endpoint → empty rail** (honest but absent) |
| 25 | Host tools: pin queue, chat pin/hide, end→summary, scheduled room | **MATCHED** | `HostConsole.tsx`, `HostLiveRoom.tsx`, `HostPinnedRail.tsx`, `HostChatPanel.tsx`, `HostSummary.tsx` | Missing vs references: start-auction control, giveaway, flash sale, co-host, raid, quick-list mid-show, sell-together |
| 26 | Sell Together (auction other sellers' items) / Quick List mid-show | **MISSING** | Pins draw only from own active listings (`HostConsole.tsx:134`) | Poshmark grammar |
| 27 | Bidder pre-qualification (payment on file before bidding) / auto-charge on win | **DIVERGENT** | Winner actively checks out (`BidPanel.tsx:602-624`) | Whatnot/TikTok auto-charge; ours is consent-first — arguably better trust posture, but no payment-deadline countdown to force the moment |
| 28 | Live latency honesty | **MATCHED (exemplary)** | `useLiveChat.ts:64-80,105-111`, `useLivePresence.ts:48`, `HostLiveRoom.tsx:118,138` | Scripted preview disclosed; live mode admits "chat isn't connected"; Demo badge on stage; server counts verbatim |
| 29 | Replay = read-only transcript | **MATCHED** | `useLiveChat.ts:88-95`, `LiveChatRail.tsx:19` | |
| 30 | Show reminders | **MATCHED** | `liveReminders.ts`, `ReminderToggle.tsx`, `ScheduleTimeline.tsx:54`, `UpcomingRail.tsx:56` | localStorage + live-mode POST + cache patch |
| 31 | Create auction (item→opening bid→window→schedule, buy-now) | **PARTIAL** | `create/page.tsx` | Missing reserve price + custom increment + anti-snipe config the API accepts (`services/auctions.ts:140-141`, mobile `marketApi.ts:808-815`); header copy hardcodes "six-hour windows" though 3/12/24h exist |
| 32 | Auction rules education ("How bidding works" sheet) | **MISSING** | One caption line in `BidPanel.tsx:369-373` | Mobile ships `AuctionRulesSheet` (proxy, outbid alerts, reserves, binding bids) |
| 33 | Seller auction board | **MATCHED** | `components/auctions/seller/*`, `seller-hub/auctions/page.tsx` | Four buckets (scheduled/live/sold/unsold) — mobile's pending/cancelled collapse away; documented in `sellerAuctionModel.ts:5-9` |

---

## 4. Top Caveats

1. **No proxy/max-bid grammar anywhere on web — despite the backend already accepting it.** `placeAuctionBid` (`services/auctions.ts:102-108`) drops `maxBidGbp`; the web contract (`contracts/auction.ts`) has no field; `BidPanel` offers only flat increments + a 3-step ladder. Mobile ships "Set maximum bid" (`BidSheet.tsx:577-615`). This is eBay's foundational mechanic and Whatnot's default — the single highest-value gap in the department.
2. **No in-show bidding at all.** The web live room is browse-and-bag; Whatnot/TikTok/Posh make the show *the* auction venue, and mobile already has the lot engine (`LiveLotDock`, `placeStreamBid`, `settleLot`, `closesAt`/`extensionCount`). Web viewers can't bid, hosts can't start a lot auction — pins are inert product cards.
3. **Ended grammar is thin vs mobile.** Web resolves won/lost/unsold correctly but misses reserve-not-met, cancelled, second-chance offers, and payment-deadline countdowns (`AuctionPostEndBanners`, `AuctionTerminalResult`, `marketApi.ts` `reservePriceGbp`, `seller_accepted_below_reserve`). Won auctions have no urgency to complete payment.
4. **Countdown honesty is good but the last 10 minutes flatten.** Cards collapse to "Ending soon" under 10 min (`AuctionCard.tsx:38-40`) instead of showing seconds — exactly where eBay/Whatnot urgency peaks. The detail clock does tick seconds (1s `useNowTick`). Urgency tones are correct.
5. **Watch/unwatch is durable and honest** — localStorage Set + server union-seed in live mode; guests hit the auth wall rather than silently failing. The caveat: Watching appears on both the board scope and my-bids tab (duplicated, consistent), and no watcher counts exist anywhere.
6. **Live latency honesty is exemplary** — disclosed scripted chat, "chat isn't connected" in live mode, Demo badge on host stage, server viewer counts verbatim, replays read-only. Keep this posture when real sockets land.
7. **Host pin→viewer propagation is genuinely wired** in fixture mode (shared zustand store — product pins *and* pinned chat notes reach open overlays mid-show), but **session-scoped only**: a viewer who opens after the host pinned sees the same store — correct — while a *reload* dissolves everything, and live mode has no pins endpoint so the rail renders empty (honest absence, not a fake).
8. **Giveaways, sudden-death, flash sales, pre-bids, sell-together, quick-list: all absent** — and giveaways/sudden-death are absent from mobile too, so they're roadmap items rather than parity bugs. Sudden-death is interesting because our anti-snipe *is* the opposite policy; offering both clock types is the Whatnot grammar.
9. **Small copy bug:** board header says "Six-hour windows" (`page.tsx:115`) while create offers 3/6/12/24h (`create/page.tsx:21-26`) — the rules line lies about the actual contract (`AUCTION_WINDOW_MS` is a default, not the envelope).
10. **Fixture-mode bid races are optimistic-only**: `usePlaceBid` commits locally then `tick(350)` — no server rejection path exercised in fixture mode beyond auth/seller checks; the "server rejections carry a message" path only exists live. Fine for demo, but the error UX is untested against real rejections.
