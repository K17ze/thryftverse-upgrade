# Deep blueprint — Auction end-to-end

Auction should be visually and psychologically different from fixed-price retail.

The central variables are:
- time;
- price;
- viewer position;
- next action.

---

# 1. Auction Home

## Current source improvements to preserve
- single canonical browse state;
- one lifecycle rail;
- server facets;
- active filter chips;
- filter draft/apply model.

Do not regress these.

## Current visible overload
Header can expose:
- Search;
- Filter;
- Create Auction;
- Seller Centre;
- Activity.

This is an operational sitemap in a buyer header.

### New buyer header
```
Auctions                   search  filter  ...
```

Overflow:
- My bids/activity
- Sell by auction
- Seller centre

When attention exists:
an outbid/ending state may surface below header.

---

# 2. Lifecycle compositions

Do **not** render Live/Upcoming/Results/Watching through the same universal cards.

## Live

### Hero/runway
Use only if:
- a real promoted/important item exists;
- or live inventory is sufficiently dense.

Hero facts:
- image;
- current bid;
- time remaining;
- bids;
- optional viewer state.

No seller/location/category/badges in hero unless essential.

### Secondary live grid
Tile:
- image;
- title;
- current bid;
- countdown.

Viewer state can replace secondary line:
`You're leading`
`Outbid`

---

## Upcoming

This is schedule psychology.

Use chronological grouped rows/cards:
```
Today
[image] Prada 2005 bag
        Starts 19:30
        42 watching        Watch
```

Do not use live countdown urgency color.

Pre-bid only if supported.

---

## Results

Ledger, not discovery gallery:
```
[image] title
        Sold £480 · 28 bids
        Yesterday
```

Viewer:
`Won` / `Didn't win`

Result state does not need large media except when opened.

---

## Watching

Personal attention list:
priority order:
1. outbid live;
2. ending soon live;
3. leading;
4. upcoming;
5. ended.

This is not a chronological generic feed.

---

# 3. Countdown behavior

## >24h
`2d 4h`

## 1h–24h
`5h 22m`

## 10m–1h
`42m`

## <10m
`08:42`

## <1m
`00:37`

Only the latter windows earn stronger visual urgency.

Avoid:
- pulsing red from hours away;
- haptic each second;
- global rerender each second.

---

# 4. Auction Detail

## Live viewport
```
[media]
Title
Current bid           £420
Ends in               08:42
You                    Outbid

[ Bid £430+ ]      [ Buy now £600 ]
```

If no Buy now:
Bid gets full width.

Trust below.

## Upcoming
```
Starts Fri, 19:30
Starting bid £...
[ Watch / Notify me ]
```

## Ended
```
Sold for £...
Winner state
[View order] if viewer won
```

Do not leave disabled live controls.

---

# 5. Bid sheet

The bid sheet should feel like a controlled financial commitment, not a keyboard popup.

Show:
- item title/thumb small;
- current bid;
- minimum next;
- input;
- total/fees if applicable;
- confirmation.

Example:
```
Current bid     £420
Your bid        £450
Fee               £0
--------------------
Maximum payable £450
```

If automatic max-bid exists:
explain once.

CTA:
`Place £450 bid`

Error:
`Bid wasn't placed. Your balance wasn't charged.`

---

# 6. Viewer state

Canonical:
- `not_bid`
- `leading`
- `outbid`
- `won`
- `lost`

Each state alters:
- copy;
- color;
- attention;
- action.

Do not simply add another badge to the same layout.

---

# 7. Bid activity

Inline:
3–5 recent rows.

Rows:
```
Bidder •••9     £440      2m
You             £430      4m
```

Use privacy masking consistently.

Full history:
sheet/full screen.

---

# 8. Reserve price

Reserve state is factual:
- Reserve met
- Reserve not met
- No reserve if useful

One line.

Do not build a separate card.

---

# 9. Fairness and clock truth

Current server-clock architecture is important.

When stale/resync:
- stop showing authoritative-looking second countdown;
- label Updating;
- disable irreversible bid until preflight refresh if necessary.

The visual system must reflect backend truth, not hide it.

---

# 10. Reference psychology

Whatnot’s current auction interaction keeps bidding mechanics direct and makes clock/action central. Thryftverse does not need to copy swipe-to-bid, but it should copy the **attention hierarchy**.

eBay supports deep filters and auction format, but filter depth belongs before opening the auction; live detail remains simpler.

---

# 11. Anti-AI audit

Remove:
- repeated state cards;
- “auction insights” decorative module;
- redundant live badges;
- five header actions;
- category/format labels already implied by route.

Use:
- number;
- time;
- image;
- state;
- action.

---

# 12. QA

Test simultaneous:
- server clock crosses start;
- clock crosses end;
- user bids at final second;
- outbid push returns to bid sheet;
- Buy Now races another buyer;
- reserve changes;
- offline;
- background/resume;
- currency display mode.

Screenshot before/after all lifecycle states.

The auction is not flagship unless the user can understand their live state at a glance without reading a paragraph.
