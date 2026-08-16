# Seller Hub + Profile / Storefront Operating System V2

# Product separation

Do not mix:
1. public identity;
2. public storefront;
3. private seller operations;
4. private buyer intent/saves;
5. analytics.

They require different navigation and visual grammar.

# My Profile

Owner identity should preview what another person understands about the user.

Recommended authored/public tabs:
```text
Listings | Looks | About
```
Later, only when domain-real:
```text
Shop | Looks | Collections | Reviews
```

`Saved` is private intent and should be reachable via Closet/Saved/Wishlist utilities, not equal to authored identity tabs.

# Seller Hub mission

One question:
> What does the seller need to know or do right now?

Not:
> Which seller features exist?

# Authoritative overview model

Create a server-backed aggregate:

```ts
interface SellerHubOverview {
  generatedAt: string;

  money: {
    availableGbp: number;
    processingGbp: number;
    onHoldGbp: number;
    nextPayoutAt?: string;
  };

  tasks: Array<
    | { type: 'ship_order'; count: number; oldestDueAt?: string }
    | { type: 'respond_offer'; count: number }
    | { type: 'reply_question'; count: number }
    | { type: 'listing_issue'; count: number }
    | { type: 'verification'; count: number }
    | { type: 'dispute'; count: number }
  >;

  inventory: {
    active: number;
    drafts: number;
    paused: number;
    sold30d: number;
  };

  performance?: {
    period: '7d' | '30d';
    grossSalesGbp: number;
    feesGbp: number;
    refundsGbp: number;
    netSalesGbp: number;
    listingViews: number;
    orders: number;
  };
}
```

No frontend approximation of financial KPIs.

# First viewport

```text
Seller Hub                           […]

£182.40
Available
Next payout · Tue 18 Aug

Needs you
Ship 2 orders before 4pm            >
Review 3 offers                     >
Complete 1 listing                  >

[ Create listing ]
```

No hero card is required. Money and tasks carry hierarchy.

# Secondary content

### Inventory
```text
Active 14     Draft 2     Paused 1
Manage listings >
```

### Store
```text
Preview storefront >
Collections >
Drops >
Policies >
```
Only show real destinations.

### Performance
One compact summary:
```text
30 days
£1,240 net sales       18 orders
View analytics >
```

### Standing
Only if real and useful:
```text
Trusted Seller
0 late shipments · 98% response
```

# Storefront

Public storefront is visual merchandising:
- identity;
- inventory;
- collections;
- Looks;
- trust;
- policies.

Seller operations should allow:
- featured listing ordering;
- pinned collection;
- drop scheduling;
- announcement;
- holiday mode;
- fulfilment policy;
- return/bundle policy.

# Seller policy templates

Create reusable:
```ts
SellerFulfilmentPolicy
SellerReturnPolicy
SellerOfferPolicy
```

Listings select a default and may override per listing.

# Acceptance

Fail if:
- >2 major bordered panels above fold;
- KPI values come from local listing arrays rather than authoritative order/payment data;
- nonzero orders-to-ship are not visible;
- payout state is buried;
- storefront is only a list of settings;
- fake/unimplemented store tabs are visible.

Pass when one glance answers:
- money;
- urgent tasks;
- inventory;
- primary create action.
