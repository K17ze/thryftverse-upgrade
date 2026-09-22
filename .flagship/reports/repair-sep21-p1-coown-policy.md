# Repair — Sep-21 Audit P1: Co-Own settlement policy (FIN-B/D/E/F)

Scope owned: `backend/api/src/lib/walletMoneyPath.ts`,
`backend/api/src/routes/coOwn.ts`, `backend/api/src/lib/coOwnTransfer.ts`,
`backend/api/src/lib/coOwnSettlement.ts`,
`backend/api/src/lib/coOwnEligibility.ts` (new),
`backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts`,
`backend/api/src/index.ts` (P2P transfer context call site),
`backend/api/src/__tests__/walletMoneyPathReservations.test.ts`,
`backend/api/src/__tests__/coOwnDripSettlement.test.ts`.

Status: **complete** — `npx tsc --noEmit` clean, all focused suites green
(see Validation). Not committed.

---

## SEP21-FIN-B — settled coOwn_trade authorized a second public P2P transfer

**Defect:** `assertP2pTransferContextAuthorized` treated a `settled`
`coOwn_trades` row as authorization for a public `/wallet/1ze/transfer`
payment, gated by an obsolete parity check `ceil((notional_gbp + fee_gbp) *
1000)` — the raw GBP×1000 FX assumption that pre-dates the versioned
settlement quote, and it credited the GROSS leg rather than the seller-net
leg. A settled DvP trade is evidence the payment already happened inside the
atomic settlement transaction (`applyCoOwnTransfer` moved both wallet legs and
wrote the trade row in one commit) — it is not an unpaid obligation. Accepting
the trade id let the already-paid consideration fund a SECOND transfer.

**Fix** (`walletMoneyPath.ts:611-653`): the `coOwn_trade` context is refused
unconditionally with `P2P_TRANSFER_CONTEXT_NOT_TRANSFERABLE` before any sender
debit or context-lookup work — fail closed. The trade-participant lookup and
the ×1000 parity calculation are deleted outright. `platform_reward` keeps its
existing admin-caller gate, and the single-use context-consumption check is
unchanged.

## SEP21-FIN-D — actor wallet locked before the full counterparty set was known

**Defect:** `POST /co-own/assets/:assetId/orders` locked the actor's wallet
row immediately after the asset row — before the opposing resting orders (and
their user_ids) were read. `applyCoOwnTransfer` then locked both party wallets
in wallet-id order, but the actor's wallet was already held out of order: two
opposite-direction placements on different assets could ABBA-deadlock (40P01)
when each held its own actor wallet and waited on the counterparty's.

**Fix** (`coOwn.ts:3815-3871`, `coOwnSettlement.ts:147-178`):

- New `lockCoOwnWalletsForUsers(client, userIds)` locks EVERY participating
  wallet in ONE `WHERE user_id = ANY(...) ORDER BY id FOR UPDATE` scan — the
  canonical wallet-id order `applyCoOwnTransfer` /
  `lockWalletRowsForUpdate` use.
- The place route discovers the counterparty set BEFORE any wallet lock: an
  UNLOCKED read of the resting book under the same match predicates as the
  later `FOR UPDATE` scan. The unlocked read is sound because the asset row
  `FOR UPDATE` (taken first) serializes every order insert on the asset —
  cancel/expiry can only shrink the matchable set, so the locked wallet set
  is always a superset of what settlement can touch. `userErasure` and the
  expiry worker only nullify PII / cancel — verified no production writer can
  introduce a new matchable order without the asset lock.
- The participant set is actor + issuer (for buys — a primary-pool fill
  credits the issuer wallet) + every matchable resting-order user_id.
- Transaction-wide order is now uniform: asset → all wallets (id-ordered) →
  reservation row → order rows → holding rows (user-id order inside
  `applyCoOwnTransfer`). `applyCoOwnTransfer`'s own sorted wallet re-lock is
  a no-op on already-held rows, and remains the correct order for callers
  (buyout) that do not pre-lock.
- Reserve route already followed asset → wallet → reservations → holdings;
  unchanged.

## SEP21-FIN-E — lockup policy contradicted the contract

**Defect:** a live lockup folded the whole market to 'paused', blocking
primary issuance buys that draw `available_units` — while the DRIP worker
performed the same primary-pool purchase with no lockup check at all. The
contract (migration 279) binds `lockup_end_date`/`lockup_months` to
SECONDARY-market resale only.

**Fix:**

- `coOwnSettlement.ts:103-133` — new explicit `CoOwnSettlementKind =
  'primary' | 'secondary' | 'drip'`; `assertCoOwnLockupPermitted` gates ONLY
  `secondary` (returns immediately for `primary`/`drip`).
- `coOwnTransfer.ts:192-196` — the settlement primitive is itself the
  backstop: `enforceSellerHolding: true` (a real holder→holder resale) asserts
  'secondary', so a resting order placed before a lockup still cannot settle;
  primary-pool fills (`enforceSellerHolding: false`) assert 'primary'.
- `coOwn.ts` — `resolveCoOwnMarketStatus` now also returns `lockupActive` and
  `availableUnits`. Reserve (3213-3233) and place (3750-3770) reject a live
  lockup with the named `CO_OWN_LOCKUP_ACTIVE` (423) UNLESS the order is a
  buy that can draw the primary pool (`available_units > 0` — the asset is
  then necessarily in `pre_market`/offering, where `buy` capability is
  already true). `secondaryMatchingOpen = trading && !lockupActive` gates
  the resting-book `FOR UPDATE` scan and every secondary fill; the
  primary-pool fill below it still runs for buys.
- DRIP handler (`coOwnDripExecutionHandler.ts:238`) declares kind `'drip'`
  explicitly — permitted during lockup, and now the policy is applied at the
  worker entry rather than assumed.

## SEP21-FIN-F — DRIP bypassed halt / exit / eligibility / capability policy

**Defect:** the DRIP reinvestment worker settled real wallet debits and share
issuance checking only `is_open`/price/supply — it could trade through a 1ZE
reconciliation halt, through an active exit corporate action, and for users
whose market eligibility or wallet settlement capability had since been
revoked.

**Fix — shared policy module** (`coOwnEligibility.ts`, new):

- `evaluateCoOwnTradingPolicy(client, { assetId, buyerUserId,
  orderNotionalGbp, deps })` applies the four gates in the manual route's
  precedence: reconciliation halt → active 'exit' corporate action →
  `evaluateMarketEligibility` → `evaluateWalletCapability('settlement')`.
  It runs on the caller's queryable so the checks revalidate inside the
  settlement transaction under the same locks.
- The halt flag lives in Redis; the reader is injectable (`deps.getHaltState`)
  and defaults to the real Redis flag with the same decode semantics as
  `setOnezeMintBurnHaltState`. A Redis read failure throws
  `CO_OWN_HALT_STATE_UNAVAILABLE` — fail closed, retryable.
- Manual placement calls it inside the transaction at `coOwn.ts:3936` after
  the reservation lock and before any wallet/share effect, preserving the
  existing compliance-audit events (`co-own.order.blocked.eligibility` /
  `.wallet_capability`) and status mapping.
- DRIP calls it at `coOwnDripExecutionHandler.ts:313` before the settlement
  quote. Denials are state-dependent: `reconciliation_halt`,
  `market_ineligible`, and `wallet_capability` go through
  `markDistributionRetryableOrFailed` — distribution stays 'settled',
  `reinvest_attempts` increments, bounded by the existing 288-attempt
  ceiling. `exit_action_active` is terminal for the asset, so the
  distribution is marked `retained_cash` (user keeps the distribution cash —
  same outcome class as insufficient spendable balance). Thrown
  `CO_OWN_HALT_STATE_UNAVAILABLE` joins the transient classification
  alongside `CO_OWN_FX_RATE_UNAVAILABLE` and PG 40001/40P01/55P03/57P03.
- `processCoOwnDripReinvestment(reason, deps)` accepts
  `{ tradingPolicy }` for test injection; production callers omit it.

---

## Validation

- `npx tsc --noEmit` — clean (exit 0).
- `node --import tsx --test src/__tests__/coOwnDripSettlement.test.ts` —
  **16/16 pass**, including new:
  - SEP21-FIN-E: secondary gated, primary/drip permitted under live lockup;
    expired lockup reopens secondary; DRIP buys the primary pool during a
    live lockup.
  - SEP21-FIN-F: halt → retried (stays 'settled', attempts+1, zero wallet/
    share effect) then reinvests exactly once after unhalt; active exit →
    `retained_cash`, no trade, receipt emitted; market-ineligible and
    wallet-capability denials → retried, no debit.
- `node --import tsx --test src/__tests__/walletMoneyPathReservations.test.ts`
  — **13/13 pass**, including the FIN-B regression (settled `coOwn_trade`
  rejected before any debit) and preserved `platform_reward` admin path.
- `walletMoneyPath.test.ts` — **18/18 pass**.
- `coOwnOutboxDrain` + `coOwnAlertLifecycle` + `coOwnSurveillanceContract` +
  `coownVerificationDemands` — **23/23 pass**.
- `checkoutMoneyPathGuards` + `paymentConfirmMetadataSanitization` —
  **31/31 pass**.
- `npx vitest run src/__tests__/coownMatchingProperty.test.ts` —
  **15/15 pass** (vitest dialect file — it is excluded from the node:test
  runner by design and must be run via vitest).

## Notes / boundaries

- No migration required — lockup columns and the corporate-actions table
  already exist; no schema change.
- The FIN-B fix intentionally removes the obsolete `(notional+fee)*1000`
  parity math rather than re-pricing it — a settled trade can never
  legitimately authorize the public route, so there is nothing to price.
- `assertCoOwnTradingPermitted` (throwing variant of the shared policy) is
  exported for callers that only need pass/fail; the two production call
  sites use the denial-object form for audit/status mapping.
- The `index.ts` P2P call site already passed `callerRole` — the context
  authorization change is confined to `walletMoneyPath.ts`.
