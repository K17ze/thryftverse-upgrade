# PKG-02 — Canonical wallet money path: reservations, idempotency, context policy

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (branch feat/product-detail-contract-media-device-closure, HEAD 76c0733). Source audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md.

## Findings to close

### FIN-03 (High) — gross-balance-only debit path
`backend/api/src/lib/walletMoneyPath.ts:58-99` computes spendable funds from gross balance only, ignoring reservations/holds. Active transfer uses it (`index.ts:22579-22630`); DRIP checks gross balance (coOwnDripExecutionHandler.ts:260-288 — owned by another package; your job is to make the shared primitive reservation-aware so callers can adopt it). Reservation logic exists only as display/projection at index.ts:23857-23895.

### FIN-04 (High) — transfer idempotency race
index.ts:22445-22459 does an ordinary idempotency READ, mutates after acquiring wallet (:22579-22630), saves response at :22682-22693. `walletMoneyPath.ts:146-215` uses SELECT then INSERT ON CONFLICT DO NOTHING. Two concurrent absent-key reads can both transfer before one response save loses the conflict.

### FIN-08 (Medium) — arbitrary transfer context
index.ts:22340-22369 accepts arbitrary `coOwn_trade`/`platform_reward` context strings; policy helper index.ts:3714-3758 checks presence, not actual domain event/participants/amount/authority.

## Required implementation
1. **One reservation-aware spendable-funds primitive** in `walletMoneyPath.ts` (or a new lib file it re-exports): available = settled balance minus ALL enforceable reservations/holds for that wallet+currency, computed inside the transaction with row locks in stable order. Discover the actual reservations table(s) first (search migrations + code for reservation/hold schema — e.g. Co-Own reservations at coOwn.ts:667-687). The primitive must take a db/tx handle so callers use it inside their transaction.
2. **Claim-before-mutate idempotency** for the public transfer route: inside ONE transaction — INSERT idempotency row (scoped key + request hash + actor + operation) ON CONFLICT → if existing row completed, replay stored response; if in-progress, return 409/conflict; if different payload for same key, reject. Only then perform wallet mutations, then write balanced postings and store response atomically. Use `SELECT ... FOR UPDATE` / advisory-lock pattern already present in the codebase if one exists; otherwise implement the canonical claim transaction.
3. **Context policy**: tighten the transfer context allowlist so `coOwn_trade`/`platform_reward` (and similar privileged contexts) require proof of a real domain event — reference ID exists, participants match, amount matches, caller has authority. System-originated contexts must not be creatable by arbitrary authenticated users.
4. Wire the public transfer handler to use both. Keep response shapes backward-compatible where possible.

## File ownership
- EXCLUSIVE: `backend/api/src/lib/walletMoneyPath.ts`, any NEW lib/test files you create.
- LEASED REGIONS of `backend/api/src/index.ts`: lines ~3700–3770 (policy helper) and ~22340–22700 (transfer handler) and ~23857–23900 (reservation projection, only if needed). Do NOT touch any other region of index.ts.
- Read-only references: anything (esp. coOwn.ts reservations, migrations for schema).

## Constraints
- No new dependencies. Postgres `pg` driver patterns already in repo — match them.
- Balanced postings: every debit has matching credit rows per existing ledger conventions. Do not change ledger schema; use existing kinds.
- Verify: `npx tsc --noEmit -p tsconfig.json` from backend/api (no new errors) + focused node tests you write (e.g. `src/__tests__/walletMoneyPath*.test.ts`) using existing mock/fake-db patterns. Tests must demonstrate: concurrent same-key transfers yield one debit+credit; reservation-covered funds are unspendable; different-payload same-key rejects; forged system context rejects.
- Do NOT run the full suite. Do NOT commit.

## Report
Write to `.flagship/reports/pkg-02-report.md`. Return: status, files changed, one-line test summary.
