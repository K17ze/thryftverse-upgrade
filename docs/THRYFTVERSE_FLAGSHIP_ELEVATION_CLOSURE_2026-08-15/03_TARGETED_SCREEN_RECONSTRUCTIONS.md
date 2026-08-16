# Targeted Screen Reconstructions

# A. Manage Listing

**File:** `frontend/src/screens/ManageListingScreen.tsx`

## Current defects
- media plus overlapping bordered information card;
- multiple later cards for health, offer preferences and state;
- several equivalent action controls;
- management, promotion, offer policy and destruction share one flat stack;
- Boost/offer success require backend-truth verification.

## New IA
```text
Manage listing
├── Media + identity
├── Current state + primary next action
├── Buyer activity/performance
├── Edit listing
├── Price & offers
├── Delivery
├── Format / auction
├── Promotion (only if real)
└── More → pause/end/delete
```

## First viewport
```text
[Back]        Manage listing        […]

[media]
Nike Air Max 95
£185
Active · 1 offer · 34 saves

[ Edit listing ]
Price & offers                         >
Delivery                               >
```

No floating white card over media. Use flat identity and one strong CTA. Destructive controls belong at terminal/overflow level.

---

# B. Change Password

**File:** `frontend/src/screens/ChangePasswordScreen.tsx`

Remove:
- security posture hero card;
- card around form;
- separate note card;
- bordered sessions card.

Target:
```text
Change password

Use a unique password you don’t use elsewhere.

Current password
[field]

New password
[field]
requirements appear progressively

Confirm new password
[field]

[ Change password ]

Other security
Active sessions                       >
Two-factor authentication             >
```

Use a flat canvas, subtle fields, one primary action, plain navigation rows.

---

# C. Co-Own Asset Detail

**File:** `frontend/src/screens/AssetDetailScreen.tsx`

Current problem: market detail, holder state, chart, allocation, valuation, bid/ask, order book, alerts, due diligence, rights and risk compete vertically.

New five-layer architecture:

1. **Identity** — media/title/category/unit price/market state.
2. **Personal action** — position if holder, availability if not, Buy/Sell.
3. **Trust/story** — maximum 3 trust facts + narrative.
4. **Market** — one chart + last/bid/ask/allocation; `Advanced market` for depth/order book/NAV.
5. **Diligence** — one canonical dossier route for provenance, custody, valuation, rights, risk, audit docs.

First screenshot must explain what the asset is, what it costs, whether it is available, what the user owns, and what they can do — without microstructure.

---

# D. New Group

**Files:** `CreateGroupChatScreen.tsx`, `profileApi.ts`

Frontend already has debounce/loading/retry/results/selection. It calls:
```http
GET /users/search?q=...
```

Repository audit did not surface a matching backend route. Verify `backend/api/src/index.ts`; if absent, implement.

Target API:
```ts
GET /users/search?q=&limit=&cursor=
→ { items: [{id, username, displayName, avatar, relationship, mutualCount}] }
```

Server filters self, blocked/deactivated/non-searchable users.

Ranking:
1. exact username;
2. username prefix;
3. display-name prefix;
4. substring;
5. relationship/recent DM;
6. stable tie-break.

Visual:
- autofocus;
- recents before typing;
- soft search field;
- flat result rows;
- trailing checkmark;
- selected compact avatar rail;
- keyboard stays open while multi-selecting.

---

# E. Seller Hub

**File:** `SellerHubScreen.tsx`

Current composition is a card ladder: hero, attention panel, verification panel, bordered metric grid, CTA, bordered tool groups.

Rebuild around:
```text
Seller Hub

£182.40
Available
Next payout Tue

Needs you
Ship 2 orders before 4pm             >
Review 3 offers                      >
1 listing needs attention            >

[ Create listing ]

7 active   2 sold this week   1 draft

Storefront                            >
Shipping policies                    >
Analytics                            >
```

Business metrics must be authoritative. Do not call sums of listing prices “Revenue” or `sold/views` “Conversion” unless the domain definition is real and timeframed.

---

# F. My Profile

Current:
```text
Listings | Looks | Saved | About
```

Remove `Saved` from the identity tab rail.

Recommended until real public Collections exist:
```text
Listings | Looks | About
```

Private utility lives in Closet/Saved/Wishlist via owner utility navigation.

If public Collections become real:
```text
Shop | Looks | Collections | Reviews/About
```

---

# G. Sell Shipping

Current:
```text
Shipping method
[ Standard ] [ Express ]

Who pays
[ Buyer pays ] [ I pay (free) ]
```

Replace with one summary row:
```text
Delivery
Small parcel · Buyer pays · 2–4 days       >
```

Opening it configures package, real service, payer policy and advanced options. Full architecture is in `06_LISTING_SHIPPING_AND_FULFILMENT_V2.md`.
