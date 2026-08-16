# Seller operations, listings and analytics

## Code surfaces inspected / affected

- `frontend/src/screens/MyListingsScreen.tsx`
- `frontend/src/screens/InventoryManagementScreen.tsx`
- `frontend/src/screens/SellerAnalyticsScreen.tsx`
- `frontend/src/screens/SellerAuctionCentreScreen.tsx`

## Current diagnosis


Seller tools are functionally broad but risk generic SaaS-dashboard styling. SellerAnalytics is a concrete example: hero card, period pills, eight metric cards, top-performer card rows.

A mobile marketplace seller does not need eight equally emphasized KPIs.


## User psychology / product job


Seller job hierarchy:
1. What needs action now?
2. What sold / must ship?
3. Which listings need editing?
4. Is performance improving?
5. What should I do next?

Analytics should create decisions, not decorate metrics.


## Flagship target composition


Seller Home:
- Needs attention.
- Orders/ship.
- Listings.
- Earnings.
- Analytics.

Analytics:
- one selected period;
- primary outcome/trend;
- 3–4 KPIs;
- top listings;
- actionable insight.


## Detailed implementation map


1. Replace metric-card mosaic with a flat KPI band/rows plus one actual chart/trend.
2. Select primary metric based on seller context (revenue/sales/visibility), not always total views.
3. Do not derive precision-heavy conversion rates from tiny sample sizes without context.
4. Client fallback metrics remain clearly reduced-confidence or hidden if materially misleading.
5. Top performers include image thumbnail; seller recognizes object faster than title.
6. Seller Auction Centre uses lifecycle/action rows, not generic cards.
7. My Listings supports search/filter/bulk edit but bulk mode is explicit.
8. “Needs attention” uses exact action verbs: Ship, Reply, Update, Verify.
9. Seller analytics suggestions derive from evidence and do not say “AI”.


## Micro-detail pass


- One accent metric; rest neutral.
- Period selector text/underline or compact control, not 3 brand pills.
- Avoid entrance animation stagger on every KPI.
- Use sparklines only with real timeseries.


## Acceptance / screenshot QA


Pass:
- first analytics screen answers “how am I doing?” and “what should I do?”.
- no 8-card dashboard wall.


## Reference crosswalk


- eBay Seller Hub: operational center across listings/orders/performance/payouts.
- Depop: seller ranking relies on accurate item relevance, not gamified profile metrics.
