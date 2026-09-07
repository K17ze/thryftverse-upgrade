# Co-Own implementation decisions

1. Keep one canonical order-book stream hook shared by Asset Detail and Trade. A sequence gap or reconnect always resnapshots.
2. Treat issuer authenticity as pending until platform review; a create request cannot self-attest `verified`.
3. Treat an online history failure as an error, not an empty ledger or complete local cache. Offline cache is shown only with the offline banner.
4. Treat marked value and executable sale proceeds as separate quantities. Empty bid depth renders `No current bids`, never zero cash-out value.
5. Return reserved sell units from the authenticated holdings projection and cap sellable units at settled minus reserved.
6. Public order projections do not return counterparty user IDs. Owner-scoped history remains authenticated.
7. Issue reports are persisted through the API with an immutable audit event; the client keeps the form contents when submission fails.
8. Do not restore recurring-order or tax-document screens that are currently deleted without confirming their replacement contract; dead routes are safer than fabricated financial surfaces.
9. Offering and market states are separate fields; `isOpen` alone cannot express them. `offeringStatus` and `marketStatus` are the canonical lifecycle; `isOpen` retained for backward compatibility only.
10. An exit corporate action closes the market. All mutating handlers (preview, reserve, order, buyout creation) must reject when `hasActiveExitAction` is true. Buyout accept is exempt — holders must be able to accept exit offers.
11. Buyout body schemas must be `.strict()` and the authenticated user must match `bidderUserId`/`holderUserId`. Raw-body actor-key injection is a real impersonation vector.
12. Reservation and final placement must use the same rounding precision (4 decimals). A 2-decimal final check against a 4-decimal reservation rejects just-reserved orders.
13. Preview and reserve must check the reconciliation halt, not just final placement. Users must not reserve funds they cannot place.
14. Appraisal divided by supply is "Appraised value / unit", not "NAV / unit". NAV requires subtracting liabilities and expenses.
15. The performance chart must not fabricate historical marks. Cost-vs-value comparison is honest; a time-series without real historical data is not.
16. Portfolio service must surface partial failures, not silently drop them. A partial flag and failed asset IDs let the UI warn that totals may be incomplete.
17. TradeScreen "Last" price must use `lastExecutionPriceGbp`, not `asset.unitPriceGbp` (reference/offering price). No trades means "No trades yet", not a mislabelled reference price.
