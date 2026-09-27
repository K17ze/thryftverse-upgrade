# PKG-01 — Auction payment transition + Mollie webhook fail-closed

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (branch feat/product-detail-contract-media-device-closure, HEAD 76c0733). Source audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md (read it for context if needed).

## Findings to close

### FIN-01 (Critical) — `backend/api/src/routes/auctions.ts:252-393`
Winner payment endpoint authenticates the winner then DIRECTLY sets paid/settled, inserts a paid order and posts ledger entries — with no provider capture or verified payment. Frontend `frontend/src/hooks/useAuctionDetail.ts:476-490` calls the pay endpoint with only an idempotency key.

### FIN-09 (Medium) — `backend/api/src/routes/auctions.ts:303-307,366`
Payment idempotency key is only part of constructed order ID; an already-successful retry hits the settled guard and fails instead of replaying the authoritative stored result.

### SEP20-FIN-10 (High) — `backend/api/src/lib/paymentProviders.ts:524-561` + handler `backend/api/src/index.ts:30412-30520,30633+`
`normalizeMollieEvent` initializes status/metadata/money from the caller payload, attempts provider retrieval, swallows errors and continues using the payload (`:545-547`), and skips retrieval if payload lacks an ID. Verifier returns verified:true either way. With API key but no webhook secret, a forged paid-status payload can reach settlement when retrieval fails.

## Authoritative reference (researched 2026-09-21)
Mollie's official webhook contract: the webhook POST delivers ONLY the payment `id`; the server MUST fetch the payment via `GET /payments/{id}` and act on the provider-returned status. "Since the status is not transmitted in the webhook, fake calls to your webhook will never result in orders being processed without being actually paid." — docs.mollie.com/reference/webhooks. For the new Webhooks system, X-Mollie-Signature HMAC + Webhook Events API payload verification.

## Required implementation
1. **Auctions**: introduce pending → verified-paid transition. The winner-pay endpoint creates/reuses a payment intent through the existing payment-provider abstraction (study how normal checkout creates intents — find the canonical path in index.ts/routes and REUSE it), marks the auction `awaiting_payment`, and only transitions to paid/settled + order insert + ledger post inside the same flow that verified provider confirmation arrives (webhook or verified return). Winner and inventory ownership semantics must be preserved. Duplicate winner requests must replay the stored result, not error.
2. **Mollie**: when no webhook secret is present, require a syntactically valid payment ID AND successful provider retrieval; derive status, money and intent linkage EXCLUSIVELY from the retrieved payment. Provider outage/retrieval failure → retryable failure, NO state transition, no payload fallback. When a signature secret IS present, verify signature first (existing path) — keep that working. Also validate amount/currency/intent binding from provider data, not payload.
3. **Frontend caller**: `useAuctionDetail.ts` must handle the new pending/processing response — show awaiting-confirmation, not paid; poll or listen for the authoritative transition per existing patterns in that hook.

## File ownership
- EXCLUSIVE: `backend/api/src/routes/auctions.ts`, `backend/api/src/lib/paymentProviders.ts`, `frontend/src/hooks/useAuctionDetail.ts`, any NEW test files you create.
- LEASED REGIONS of `backend/api/src/index.ts`: only lines ~30400–30660 (Mollie webhook processing). Do NOT touch any other region of index.ts — other agents own other ranges.
- Read-only references allowed: any file.

## Constraints
- No new dependencies. Match existing code style (TypeScript, existing provider abstraction, existing idempotency + outbox helpers — read `src/lib/` first).
- Windows host, no docker/psql. Verify with `npx tsc --noEmit -p tsconfig.json` from backend/api (whole-project typecheck; tolerate PRE-EXISTING errors elsewhere if any, but zero new errors from your files) and focused node tests.
- Write regression tests that FAIL on the old behavior: (a) forged paid webhook with failed provider retrieval produces no transition; (b) successful verified retrieval produces exactly one settlement; (c) duplicate winner-pay returns stored result. Put them under `backend/api/src/__tests__/` using existing mock patterns.
- Do NOT run the full test suite (it has pre-existing failures). Do NOT commit — leave changes in working tree.

## Report
Write full details to `.flagship/reports/pkg-01-report.md`: what you changed (file:line), the design, test names + commands + results, and any concerns. Return only: status (DONE/DONE_WITH_CONCERNS/BLOCKED), files changed, one-line test summary.
