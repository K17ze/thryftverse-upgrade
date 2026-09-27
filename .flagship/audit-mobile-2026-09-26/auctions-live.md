# Audit — Auctions / Live / Posters (mobile) — 2026-09-26

## Verdict
This department is far ahead of typical mobile surfaces: the auction detail is a genuine eBay-grade transaction surface (server clock, staged bid sheet with idempotency + unknown-outcome reconciliation, masked bid ledger, full lifecycle coverage), live streaming degrades honestly against the real LiveKit/backend contract, and posters carry real Instagram story grammar. The gaps vs web/competitors are concentrated in the live viewer (no pinned-product rail, no reactions) and in MyBids (a real pagination defect).

## Findings

### AL-01 — Live viewer has no pinned-product rail with quick-add [P1]
- Screens: `frontend/src/screens/LiveStreamViewerScreen.tsx`, `frontend/src/components/livestream/LiveLotDock.tsx`
- Evidence: The only commerce surface in the viewer is `LiveLotDock` (LiveLotDock.tsx:117–199) showing the single current lot with Bid / Buy-now. There is no strip of the other products pinned to the show and no quick-add path — a viewer must wait for a lot to reach the table to act on it.
- Web parity: `web/src/components/live/LiveProductRail.tsx` renders the pinned-product strip ("Featured in this show") where each card resolves a real listing and carries a "Bag" quick-add writing to the persisted bag store; `LiveViewerOverlay.tsx` documents "pinned product rail" as core chrome.
- Competitor: Whatnot/eBay live grammar — the pinned rail is the primary commerce surface; quick-add during the show is the conversion mechanic.
- Root cause: Mobile models live commerce only as sequential lots (`currentLot`); the "other pinned items" contract is not surfaced on the viewer.
- Fix: If the backend session contract carries the scheduled/pinned lot list (`lots` already exists seller-side via `useSellerLotControls`), render a horizontal pinned rail above `LiveLotDock` with thumb + price + "Bid"/"Bag" per item; hide it when the contract carries only the active lot rather than fabricating cards.
- Acceptance: Viewer can see and act on ≥2 pinned items without leaving the stage; rail absent (not empty) when contract has no pinned items.

### AL-02 — Live viewer has no reactions [P1]
- Screens: `frontend/src/screens/LiveStreamViewerScreen.tsx:178–276`, `frontend/src/components/livestream/LiveStreamTopChrome.tsx`
- Evidence: The bottom overlay is chat → lot dock → composer; there is no reaction affordance (no heart/emoji send, no floating reaction layer). Grep across `components/livestream` finds no reaction implementation.
- Web parity: `LiveViewerOverlay.tsx` includes "heart reactions in a right action column" and `useLivePresence.ts` feeds a "reaction trickle".
- Competitor: Instagram Live / Whatnot — the heart column is the ambient engagement signal; its absence makes the stage feel dead relative to chat volume.
- Root cause: Reaction events not in the viewer's realtime subscription surface.
- Fix: Add a compact reaction affordance in the right-side chrome (or beside composer) emitting a `live.reaction` event; render incoming reactions as a bounded floating layer; omit entirely (not disabled) if the contract doesn't support it.
- Acceptance: Tapping heart produces a visible reaction for other viewers within one realtime round-trip; a11y label present; reduced-motion renders no float animation.

### AL-03 — MyBids "Active" tab corrupts pagination across merged feeds [P1]
- Screens: `frontend/src/screens/MyBidsScreen.tsx:148–163, 223–227`
- Evidence: `'active'` fires `getMyAuctionBids('leading', cursor)` and `getMyAuctionBids('outbid', cursor)` in parallel with the *same* cursor, then `setNextCursor(leadingResult.nextCursor ?? outbidResult.nextCursor ?? null)`. A leading-feed cursor is not valid for the outbid feed — the next page either skips outbid rows, duplicates leading rows, or silently truncates the longer feed. Sort order of the merged page is also undefined (two independent feeds concatenated, not interleaved by end time).
- Web parity: `web/src/app/auctions/my-bids/page.tsx` uses four separate tabs (Outbid/Winning/Won/Lost), each a single keyed feed — no merged-cursor problem.
- Competitor: eBay "Bids & offers" — losing an outbid row to a bad cursor is a trust defect on a money surface.
- Root cause: Two independently-paginated resources fused into one cursor slot.
- Fix: Either split Active into separate Leading/Outbid tabs matching web, or track per-feed cursors and only request more from the feed that still has one.
- Acceptance: Loading more on Active never drops or duplicates rows across the two feeds; `Ending soonest` sort applies to the fully loaded set or is moved server-side.

### AL-04 — Auction countdown bar is a full-bleed red band for the entire last hour [P2]
- Screens: `frontend/src/components/auction/AuctionCountdownBar.tsx:25–60`
- Evidence: When `liveMsToEnd < 60min`, the bar renders `backgroundColor: colors.danger` full-width under the media stage with inverse text — the heaviest chrome on the screen, sustained for an hour. It also never differentiates "Ending soon" (<10m) from merely "live".
- Web parity: Web `BidPanel` keeps the countdown as a ticking text element inside the transaction rail, not a color-field banner.
- Competitor: eBay VI research (arxiv 2510.01198) places urgency as a *signal over the picture panel*, not a banner strip; eBay only escalates colour in final minutes.
- Root cause: Binary urgency threshold (1h) mapped to the strongest surface treatment.
- Fix: Keep the hairline countdown row neutral; escalate to the danger treatment only in the `final` stage (MM:SS, <10m per `AuctionCountdown` grammar), matching the chip component's own staged labels.
- Acceptance: <1h reads as "Ending soon" neutral chrome; red appears only in final minutes; no layout shift at the threshold.

### AL-05 — Host chat moderation lacks message-level pin/hide [P2]
- Screens: `frontend/src/components/livestream/LiveSellerLivePhase.tsx:99–195`
- Evidence: Long-press moderation offers mute/unmute/kick on the *viewer* only. The host cannot pin a message to the top of chat or hide a single message without sanctioning the user — the two lightest moderation tools.
- Web parity: `web/src/components/livehost/HostChatPanel.tsx` keeps `pinnedId` state and renders a pinned message bar with per-message pin toggle (lines 36–93, 134).
- Competitor: Whatnot/TikTok Live — pinned comment is the host's main merchandising tool ("condition notes on the pinned pieces").
- Root cause: Moderation API surface (`moderateLiveStreamViewer`) is user-scoped only; no message-scope action wired.
- Fix: Add pin/hide actions to the long-press sheet calling the message-scoped endpoints if they exist (viewer `reportLiveChatMessage` proves message-scoped routes exist); render the pinned message pinned to the chat list top on both host and viewer.
- Acceptance: Host can pin one message; it renders pinned for host and viewers; unpin restores normal flow.

### AL-06 — MyBids row restates its own verdict twice [P2]
- Screens: `frontend/src/screens/MyBidsScreen.tsx:263–318`
- Evidence: Each row renders icon + state label ("You're outbid"), then a "Result" meta column repeating "Won"/"Lost" for terminal rows (lines 292–299) — the state label already says Won/Lost — plus a "nextAction" text + chevron that repeats what the row's own tap does. Label-everything: state badge, two price columns, "Time", "Result", next-action, and an action chip in one ~80px row.
- Web parity: `MyBidRow` on web carries state once, price, and deadline — no restated result column or next-action caption.
- Competitor: eBay bid rows show item, your bid vs current, time, and one action — the object is the label.
- Root cause: Each metadata question got its own labelled sub-column instead of a hierarchy.
- Fix: Drop the "Result" meta column (state label covers it); drop the `nextAction` caption + chevron (the row is already a button); keep state, your-bid/current, and deadline.
- Acceptance: Row shows ≤4 information elements; state read once.

### AL-07 — Anti-snipe exists twice: client-simulated vs server contract [P2]
- Screens: `frontend/src/store/useStore.ts:321–365, 1160–1178`; `frontend/src/utils/auctionDetailLogic.ts:881–885`
- Evidence: `useStore` simulates anti-sniping locally — `ANTI_SNIPE_WINDOW_MS`/`ANTI_SNIPE_EXTENSION_MS` (5 min) mutating `extendedEndMs` in `auctionRuntime` for the tradeHub path — while the real auction contract carries `auction.antiSniping.extensionSeconds` from the backend, surfaced verbatim in the rules sheet ("Proxy bidding · Ns anti-sniping"). Two different constants for the same mechanic; the local path can extend an auction the server does not, and vice-versa.
- Web parity: Web derives extension purely from fixture/contract data in `BidPanel`.
- Competitor: eBay — the extension rule is a server invariant; a client-computed end time is dishonest the moment it diverges.
- Root cause: Legacy local-first auction runtime predating the real `marketApi` contract.
- Fix: Single source of truth — read extension from `auction.antiSniping`; remove or quarantine `extendedEndMs` to demo/mock paths that clearly mark themselves.
- Acceptance: No UI surface displays an end time extended by client-side math against a server-sourced auction.

### AL-08 — Countdown stage inferred by regexing the formatted string [P3]
- Screens: `frontend/src/components/auction/AuctionCountdown.tsx:65–79`
- Evidence: `resolveStage` classifies urgency by regex on the display text (`/^\d{1,2}:\d{2}$/` → final, `/^\d{1,3}m\b/` → moderate). The 'urgent' stage is unreachable via text inference (only via explicit `stage` prop), and any formatter change or locale string silently re-maps stages — e.g. a localized "45 min" falls through to `plenty`.
- Fix: Pass the numeric stage/`msToEnd` into the component (callers already compute it) instead of reverse-parsing rendered text.
- Acceptance: Stage derives from time, not text; 'urgent' reachable; locale-safe.

### AL-09 — PosterHighlightViewer fetches the full highlight list to resolve one id [P3]
- Screens: `frontend/src/screens/PosterHighlightViewerScreen.tsx:68–91`
- Evidence: `fetchPosterHighlightById(highlightId)` internally lists all of the user's highlights and finds the match — acknowledged in the code comment as a workaround for a missing `GET /poster-highlights/:id` route.
- Fix: Land the single-highlight endpoint; the deep-link (`PosterHighlightViewer` route) is already public-facing via `PosterArchiveScreen` and notifications.
- Acceptance: Highlight viewer issues one request; list fetch removed.

## Non-findings (verified good)
- **BidSheet** (`components/ui/BidSheet.tsx`): staged flow entry→review→submitting with server re-validation at each transition, idempotency key per attempt, `unknown_outcome` reconciliation polling `lookupAuctionBidByIdempotencyKey`, `recoverable_conflict` for buy-now race — this exceeds the web composer and matches eBay's bid-confirmation grammar.
- **Masked bid ledger**: `anonymizeBidder` (auctionDetailLogic.ts:1134) + top-bid tint + "YOU" badge in `AuctionBidHistorySheet` — eBay-parity masked history.
- **Anti-snipe disclosure**: rules sheet quotes the real `extensionSeconds` constant (auctionDetailLogic.ts:885) — honest, not fabricated copy.
- **Outbid loop**: `viewerState === 'outbid'` renders "Minimum to lead" row (AuctionBidPanel.tsx:105–118) and MyBids deep-links with `openBidSheet: true` + pre-filled amount — one-tap re-bid, matching web.
- **Live state machine**: connecting/error/ended/removed/scheduled are all distinct honest screens (`LiveStreamStateScreens`), replay only offered when `recordingUrl` exists; replay screen has processing/not-recorded/error states (LiveStreamReplayScreen.tsx:9–13).
- **LiveKit honesty**: no video surface is faked — stage captions state connecting/waiting/unavailable (LiveStreamViewerScreen.tsx:127–132, 193–199); seller publish failure degrades to an explicit "Video unavailable" caption (LiveSellerLivePhase.tsx:148–157).
- **Live dock countdown**: server `closesAt` wins over local hint; absent deadline shows no fabricated timer (LiveLotDock.tsx:78–84).
- **Viewer chat**: report via long-press, muted composer state, kick → removed screen; host has mute/unmute/kick with backend-seeded muted set.
- **LiveShoppingHome**: categories derived from contract (hidden when absent), reminder affordance self-hides on 404 (`LiveRemindersUnavailableError`), last-good summary retained under refresh error, skeletons match layout geometry, scheduled→live→ended rail coverage.
- **Poster stories**: full Instagram grammar — progress segments, tap/hold-pause, swipe between accounts, auto-advance timers, reply bar, reactions, sticker interactions (poll/quiz/question/style vote), shoppable tags fetched per story with click tracking, 3-line caption clamp, view recording with dedupe, prefetch of next frame/story, background-pause on AppState.
- **PosterArchive**: All/Active/Archived/Highlights filters with counts, client search, skeleton grid, error + empty states, delete confirmation sheet, relative-date grammar.
- **AuctionHome**: scope rail + facet-driven filter sheet with honest result count (only shown when fully loaded), offline banner over cached content, attention strip, skeleton/error/empty branches — reduced header to search+filter per spec.
- **Countdown a11y**: rate-limited VoiceOver announcements at meaningful thresholds only (AuctionCountdown.tsx:24–49); `accessibilityRole="timer"`.
