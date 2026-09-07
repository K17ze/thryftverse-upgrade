# Co-Own flagship repo map

## User flow

`CoOwnHub` → `AssetDetail` → `Trade` → `TradeConfirm` → `CoOwnOrderHistory`

Supporting surfaces are `Portfolio`, `MarketLedger`, `AssetDueDiligence`, `DistributionHistory`, `Buyout`, and `CoOwnIssue`.

## Data flow

- Discovery and detail contracts: `backend/api/src/routes/coOwn.ts` → `frontend/src/services/marketApi.ts`.
- Authenticated holdings: `backend/api/src/index.ts` `/users/:userId/co-own/holdings` → `fetchCoOwnHoldings` → `coOwnPortfolio.ts` → `PortfolioScreen`.
- Order book: `/co-own/assets/:assetId/orderbook` plus realtime deltas → `useCoOwnOrderBookStream` → `AssetDetailScreen` and `TradeScreen`.
- Orders and settlement: reserve → place → matching/settlement → market history and order lookup.
- Issue reporting: `CoOwnIssueScreen` → `POST /co-own/assets/:assetId/issues` → `coown_asset_issues` + compliance audit.

## Ownership boundaries

- Backend owns price, depth, reservation, order status, holdings and trust evidence.
- Frontend renders server projections and fail-closed states; it does not infer cash-out value from a mark or client cache while online.
- Public market projections omit counterparty identity.
