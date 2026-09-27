# r3-fixB — Trading/Wallet live-mode truth repair

**Status:** complete — all 5 fixes landed. Strict `tsc` clean on changed files; eslint clean.

## What shipped

### P0 — 1ZE pocket no longer fabricated in live mode
A real endpoint exists: `GET /wallet/1ze/:userId/position` (backend `index.ts:24624`, same canonical read mobile's `getIzePosition` uses). Wired it in.

- `components/wallet/useWalletData.ts` — `WalletData.ize` is now `IzePocket | null`. Live branch fetches snapshot + transactions + `fetchIzePocket` (`/wallet/1ze/:userId/position?fiatCurrency=GBP`) in parallel. Mapping: `settled = userIze`, `reserved = reservedForOrders`, `pending = unsettledSaleProceeds + pendingDeposit`. Any failure → `null` (absent > fabricated). Fixture mode unchanged (`IZE_POCKET_SEED`).
- `components/wallet/WalletView.tsx` — the 1ZE pocket row renders only when `data.ize != null`; a failed live read shows the real GBP pocket and simply omits 1ZE. Convert entry points (section link + hero button) are hidden in live via `CONVERT_AVAILABLE`, mirroring `TOP_UP_AVAILABLE` — ConvertView already self-gates with the same honest copy.
- `components/wallet/WalletBalanceHero.tsx` — `onConvert` is now optional; the quick-action grid adapts (3/2/1 cols).
- `components/wallet/ConvertView.tsx` — strict-null guards on all `ize` reads. Fixture-only surface (live early-returns before it), so guards are type-level only.
- `components/coown/asset/TradePanel.tsx` — buys now gate on the **real** pocket: `wallet.ize == null` → disabled with "Your 1ZE balance couldn't be loaded — buys are unavailable" (no fake balance, no dead-end Convert link in live). The "1ZE available" line renders only when the pocket exists; the "Convert GBP" affordance is hidden in live mode.
- `components/trading/useCoOwnTrading.ts` — fixture settlement + availability checks null-guard the pocket (`wallet_unavailable` throw when absent).

### P0 — corporate-action votes are real in live mode
Endpoints exist: `GET`/`POST /co-own/corporate-actions/:actionId/vote(s)` (backend `coOwn.ts:1334`, `:1482`), mirroring mobile `fetchGovernanceVotes`/`castGovernanceVote`.

- `lib/api/services/coown.ts` — added `fetchGovernanceVotes` (tally summary + `myVote` + server-computed `eligibility`) and `castGovernanceVote` (POST `{assetId, vote}`). Also fixed `fetchCoOwnCorporateActions` to prefer the wire's `votingDeadline` over the shared mapper's `closesAt` fallback chain (mapper is out of scope; without this a live open vote could read as closed).
- `lib/hooks/coown-queries.ts` — new `useCorporateActionVotes(actionId)` + `corporateActionVotesKey`, enabled only in live mode (fixtures keep their own tallies).
- `components/coown/asset/ActivityTab.tsx` — actions render through a new `CorporateActionCard`. Live: optimistic vote → POST → invalidate votes+actions queries; refusal reverts the optimistic vote and toasts the server's reason (`parseApiError`). Eligibility gates buttons with the server's reason verbatim (`"You must hold units of this asset to vote"`, `"Voting opens at the record date"`), guests see "Sign in to vote". **Lock bug fixed:** `closed = status !== 'open' || closesAt <= now` disables controls regardless of `voted`, with honest "Voting closed" copy. Tally counts show `—` while the live read is in flight rather than the mapper's `0`. Fixture mode keeps the session-local one-tap vote.

### P1 — syndicate fixtures can't render as real in live mode
No syndicate endpoints exist anywhere in the backend (`backend/api/src` — confirmed; only an unrelated comment match). Since `components/syndicate/**` is outside my file scope, the surface is gated at the routes:

- `lib/hooks/syndicate-queries.ts` — `fetchSyndicates` returns `[]` in live (never seeds fixtures); `update()` no longer seeds a cold cache in live; `contribute` already refused with `live_unavailable`.
- New `app/co-own/syndicate/SyndicateLiveNotice.tsx` — client notice component ("Syndicates aren't available in this build — group-buy pools ship with the syndicate backend connection", action → `/co-own`), mirroring ConvertView's gate.
- `app/co-own/syndicate/{page,[id]/page,create/page,history/page}.tsx` — all four routes render the notice when `DATA_MODE === 'live'`; `[id]/generateMetadata` no longer leaks fixture pool names into live metadata.
- `components/coown/CoOwnHubView.tsx` — the "Syndicates" nav link is hidden in live mode (dead-end link → notice page would be chrome debt).

### P1 — cancel no longer releases unheld reserve
`components/trading/useCoOwnTrading.ts` — a session order only holds book depth and a 1ZE reserve when it was a **limit** order with resting units (`orderExecution.ts: restingUnits` is `0` for market/protected, so `reserveGbp` is `0`). The release path is now gated on `order.orderType === 'limit'`: book-level release and buy-reserve release only run for resting orders. A partially-filled market/protected cancel now just flips status — it can no longer shave other orders' reserves or phantom-remove book depth. Sell-unit return is unchanged (all sell order types lock the full request at placement, so unfilled units always return).

### P2 — cost basis is fee-inclusive
`useCoOwnTrading.ts` position writes now blend `(fillGrossGbp + fillFeeGbp)` into `avgEntryPriceGbp` (new position and blend paths), so reported P&L is net of the 1% buy fee — no longer overstated.

## Verification

- `cd web && npx tsc --noEmit` — **0 errors in changed files**; 14 pre-existing errors remain (13 × missing generated `lib/i18n/locales/*` modules, 1 × `components/support/TicketThread.tsx` — both owned by other workstreams/pre-existing).
- `npx eslint` on all 16 changed files — clean, no output.

## Concerns / notes for the parent

1. **`ize: null` semantics** — a failed `/wallet/1ze/:userId/position` read degrades to "pocket absent" (row hidden, buys disabled, sells still allowed since the server owns settlement). If you'd rather hard-fail the whole wallet (mobile's posture), flip `fetchIzePocket`'s catch into a rethrow — one-line change.
2. **`useCorporateActionVotes` fires one GET per action card** in live mode (N+1 per asset detail). Actions per asset are few; if that's a problem, a bulk `/votes` endpoint doesn't exist — would need a backend change.
3. **`components/syndicate/**` is outside my scope** — I gated at the route layer instead of editing the views. `PoolActions`/`syndicateActions.ts` write paths are unreachable in live (page gate + empty query data + `contribute`'s `live_unavailable`), but if the constraint loosens, adding `DATA_MODE` guards inside `withdraw`/`dissolve`/`executePool` would be belt-and-braces.
4. **`components/layout/DepartmentNav.tsx`** still links to `/co-own/syndicate` in live mode (not my file) — the link lands on the honest notice page, so it's safe but could be hidden for polish.
5. Backend `POST /vote` only accepts `action_type === 'governance'` — non-governance live actions render disabled with the server's reason string, which is the honest outcome.
