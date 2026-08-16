# Deep blueprint — Wallet, Seller Operations, Notifications

These are utilitarian surfaces. Their flagship quality comes from **decisiveness and calm**, not editorial decoration.

---

# WALLET

## 1. Wallet home

First viewport:
```
Wallet
Available
1ZE 124.80
≈ £...

[Add money] [Withdraw] [Convert]

Pending / holds summary if non-zero

Recent activity
...
```

If balance empty:
one calm empty state + Add Money.

No generic finance hero card.

---

## 2. Balance anatomy

Only show sub-balances when relevant:
- Reserved for orders;
- Redemption in progress;
- Pending deposit;
- Unsettled sale proceeds;
- Holds.

If all zero, do not render a zero-valued breakdown table.

Tap `Balance details` if needed.

---

## 3. Convert

Phase 3.1 dedicated screen is frozen.

5-stage flow can be represented as route/state, but don't show a 5-dot progress indicator unless steps genuinely need orientation.

### Amount
Amount input + available.

### Review
From.
To.
Rate/reference.
Fee.
You'll receive.

### Authenticate
Use biometric/system prompt.

### Execute
Quiet spinner.

### Receipt
Reference + values + Done.

Receipt is document-like.

---

# SELLER HOME

## 1. Attention first

Seller's first question is:
`What do I need to do today?`

Examples:
- Ship 2 orders.
- Reply to 3 buyers.
- 1 listing failed verification.
- Auction starts today.

Create one Needs attention section.

No red badge on every seller module.

---

## 2. Main seller destinations
Flat rows/grid:
- Listings;
- Orders;
- Earnings;
- Analytics;
- Auctions.

This is one of the few places a compact utility grid may be justified, but avoid icon-circle repetition.

---

# SELLER ANALYTICS

## 1. Replace 8-card wall

Current remote analytics creates eight metric cards.

New:
```
£1,240
Revenue · 30 days
+12% vs previous period

[trend chart]

Sold 14     Views 2.4k     Saves 220

Top listings
...
```

If previous-period trend unavailable:
do not invent +/− comparison.

## 2. Primary metric selection
Default revenue/sold depending seller maturity.

Views are diagnostic, not usually the main outcome.

## 3. Actionable interpretation
Only show if evidence exists:
`3 listings have high views but no saves`
Tap -> filtered listings.

This is more valuable than decorative metrics.

---

# TOP LISTINGS

Use thumbnail.

Row:
```
[img] Prada loafers
      1,420 views · 88 saves
      Sold £190
```

Recognition is visual.

---

# NOTIFICATIONS

## 1. One taxonomy

Current screen can show filters:
All/Orders/Items/Reviews/Prices/Auctions
and sections:
Orders/Social/System.

Choose one.

Preferred default:
time/priority stream:
- Needs attention
- Earlier

Optional filter sheet if high volume.

---

## 2. Needs attention
Examples:
- You were outbid.
- Ship by tomorrow.
- Payment failed.
- Verification requested.
- Resolution updated.

These get action CTA.

Social events:
aggregate.

---

## 3. Row geometry

Commerce:
```
[item] You were outbid on ...
       £450 is now leading · 3m
                            Bid >
```

Social:
```
[avatars] @a and 4 others liked ...
          2h
```

System:
simple icon/text.

Do not force all through one generic notification card.

---

# 4. Mark read

Opening routed object can mark read.

Unread should not require manual management for ordinary use.

`Mark all read` in overflow.

---

# 5. Cross-system attention policy

Define severity:
- critical transaction;
- action required;
- important update;
- social/info.

Map to:
- push;
- in-app;
- badge;
- feed row.

Avoid every event incrementing every badge.

---

# 6. Anti-AI visual rules

Wallet:
no gradients for balance.

Analytics:
no metric-card wall.

Notifications:
no six filter pills by default.

Seller:
no “growth score.”

Use exact operational verbs.

---

# QA

Wallet:
- zero;
- normal;
- pending;
- reconciliation break;
- Convert.

Seller:
- new seller;
- active high-volume;
- no analytics;
- failure.

Notifications:
- only social;
- only transaction;
- mixed 100+;
- quiet hours;
- unread.

Flagship pass = user can identify next action without interpreting a dashboard.
