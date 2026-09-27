# r6-fixA — Web wallet ledger live-mode fixture leak (P0)

**Workstream:** wallet/activity (web)
**Scope owned:** `web/src/components/wallet/ledgerViewModel.ts`, `WalletView.tsx`, `HistoryView.tsx`, `useWalletData.ts`
**Status:** FIXED — `eslint` clean on all four files; `tsc --noEmit` clean for owned files (3 pre-existing errors in out-of-scope `src/lib/hooks/pdp-market-queries.ts`, an untracked file from another workstream — see flags).

## Root cause (confirmed)

`buildLedger(sessionEntries, currentAvailable)` unconditionally merged fixture
`TRANSACTIONS` + `SEED_EXTRA` into the ledger and anchored a fabricated running
balance to the live `currentAvailable`. Both views called it without the real
`data.transactions` the hook already fetched in live mode, so every live user
saw demo-identity activity — and the HistoryView CSV export shipped fabricated
rows.

A second, deeper defect surfaced during the trace: the domain `Transaction`
projection (`services/users.ts:165-182`) is unusable for the ledger. The wire
(`UserTransactionApi`, `api/mappers.ts:1012`) carries **unsigned** `amount`
(sign lives in `direction`), `lineType`, `currency`, and a literal
`status: 'posted'` (`backend/api/src/index.ts:36354-36372` — ledger entries are
posted-only facts). The service drops `direction`/`lineType`/`currency` and
blind-casts `source_type` → `Transaction['type']` — debits would render as
positive credits and unknown source types would crash the exhaustive kind
records. `useWalletData` therefore reads the wire shape directly.

## Changes

### `web/src/components/wallet/ledgerViewModel.ts`

- New `WalletLedgerTransaction` interface — the lossless wire projection
  (`id`, `sourceType`, `lineType`, unsigned `amount`, `currency`, `direction`,
  `status`, `createdAt`, nullable `description`).
- `kindForLive(sourceType, lineType, direction)` — classifies live rows onto
  the closed `LedgerKind` union, mirroring mobile `BalanceHistoryScreen`
  precedence (`frontend/src/screens/BalanceHistoryScreen.tsx:26-51`):
  `lineType` checked before `sourceType`; refund → withdrawal/payout →
  seller_payable/earning → fx_conversion → buyer/order_payment →
  fee/commission → topup/deposit; unclassifiable rows fall back to
  money-in/money-out by `direction`.
- `humanizeLineType` — mobile-identical fallback label
  (`seller_payable_release` → `Seller Payable Release`) when the wire
  `description` is null.
- `liveEntry` — maps a wire row to `WalletLedgerEntry`: sign from `direction`
  over `Math.abs(amount)`, `'posted'` → `completed` (settled fact), `balance:
  null` — the live contract carries no running balance and none is
  reconstructed.
- `buildLedger(sessionEntries, currentAvailable, transactions = [])` — gated
  on `DATA_MODE === 'live'` (repo convention, same import as WalletView):
  live returns only real rows + session entries sorted newest-first; the
  fixture path (TRANSACTIONS + SEED_EXTRA + balance walk) is byte-for-byte
  unchanged.

### `web/src/components/wallet/useWalletData.ts`

- `WalletData.transactions` retyped `Transaction[]` → `WalletLedgerTransaction[]`
  (no consumer read the field — verified by grep; `tsc` confirms).
- `fetchUserLedgerTransactions` — fetches `/users/:id/transactions` off the
  wire (`UserTransactionApi`), filters to GBP rows (the fiat pocket is a GBP
  ledger; IZE rows carry `amount_gbp NULL` → would render £0.00 — the 1ZE
  pocket renders separately), maps to `WalletLedgerTransaction` with
  conservative `direction !== 'credit' → 'debit'`.
- Live branch of `fetchWallet` calls it instead of
  `usersService.fetchUserTransactions`; fixture branch projects `TRANSACTIONS`
  into the same shape for parity.
- Fetch failure still propagates to react-query `isError` → error surface,
  no fixture fallback. `fetchIzePocket`'s null-on-failure posture unchanged.

### `WalletView.tsx` / `HistoryView.tsx`

- Both pass `data.transactions` as `buildLedger`'s third arg. Preview, filter,
  net, pagination and CSV export all now run over real rows in live mode.
  Live empty → `LedgerList` 'No transactions yet' empty state; live error →
  existing 'Activity unavailable' / `StateGate` error surface.

## Verified

- `cd web && npx eslint` on the four owned files — clean.
- `npx tsc --noEmit` — zero diagnostics in owned files; the only errors repo-
  wide are in `src/lib/hooks/pdp-market-queries.ts` (not mine, see flags).
- Live mode: no fixture constants reachable from `buildLedger`'s live branch;
  `SEED_EXTRA`/`TRANSACTIONS` only execute under `DATA_MODE !== 'live'`.

## Flags — cross-cutting issues outside my ownership

1. **`web/src/lib/api/services/users.ts:165-182` — `fetchUserTransactions` is
   lossy/unsafe.** Drops `direction` (debits become positive), `lineType`,
   `currency`; casts `source_type` → `Transaction['type']` (values like
   `'order_payment'`, `'payout'` don't belong to the union) and `'posted'` →
   `'completed'|'pending'`. I bypassed it inside `useWalletData`; its owner
   should either return the full wire shape or delete it before another
   consumer trusts it.
2. **`web/src/lib/hooks/pdp-market-queries.ts` (untracked, other workstream)**
   has 3 `tsc` errors — repo-wide `npx tsc --noEmit` is red because of it.
   Not caused by and not fixable within my scope.
3. **Backend `/users/:id/transactions` mixes currencies** (`index.ts:36354`):
   no currency predicate, and returns `amount: Number(row.amount_gbp)` which
   is `0` for IZE-denominated rows. Suggest filtering `la.currency = 'GBP'`
   (or returning native `amount` + `currency`) server-side; the web hook
   filters client-side as a stopgap.
4. **Live history is capped at the first 50 rows** (`limit=50&offset=0`).
   HistoryView's "Load more" only pages the already-fetched window — no
   server pagination is wired. Worth a follow-up if wallet history depth matters.
5. **`fetchWallet(userId?)` fixture fallback on falsy `userId` in live mode**
   (pre-existing): `DATA_MODE === 'live' && userId` false → returns the demo
   wallet. Views gate guests first, but the function contract is leaky — a
   future caller could render fixture balances to a signed-out live user.
6. **`LedgerKind` union is closed by `LedgerList.tsx`'s exhaustive `KIND_META`
   Record** — adding an honest 'other'/'transfer' kind requires owning that
   file. Until then, unclassifiable live rows fall back to topup/withdrawal
   by direction while the description carries the humanized `lineType`.
7. **Live rows render `—` in the balance sub-line** (`LedgerRow` shows the
   balance line unconditionally). Honest per contract, but the row grammar
   may deserve a live-mode variant — `LedgerList.tsx` owner call.
