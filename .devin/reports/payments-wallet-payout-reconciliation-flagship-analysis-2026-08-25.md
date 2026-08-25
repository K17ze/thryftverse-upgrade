# ThryftVerse Payments, Wallet, Payout and Reconciliation — Flagship Implementation Dossier (Upgraded)

**Research cut-off:** 25 August 2026 (includes FCA PS25/12 Supplementary Regime in effect 7 May 2026, HM Treasury Modernising Payment Services Regulation consultation 14 July 2026, PSR consolidation into FCA, FRC interim safeguarding auditor guidance March 2026, Stripe Connect 2026 API and payout lifecycle, Stripe API version 2026-04-22 Dahlia)
**Repository snapshot:** `f82f74a54be79a1721017380ddd5472d856f1679` plus the inspected working tree on `feat/product-detail-contract-media-device-closure`
**Scope:** checkout and payment intents; provider adapters and webhooks; refunds and disputes; internal ledger; held funds; wallet/1ZE; seller payouts; provider, bank and safeguarding reconciliation
**Decision:** **DO NOT launch real-money marketplace settlement, seller payouts, wallet redemption, or co-own money flows on the current implementation.**
**Deliverable type:** codebase-grounded research and implementation dossier; no product code changed
**Decision owner:** Payments engineering, with Legal/Compliance, Finance, SRE, Fraud and Support as required approvers
**Inspector identity:** senior FAANG mobile/full-stack architect, 20 years, top-level mobile app architecture + front-end UI/UX engineering + back-end design. Anti-AI-design policy enforced throughout.

---

## 0. What changed in this upgrade

This is a deepened re-issue of the 25 August 2026 dossier. Every codebase claim was re-verified by direct file inspection. The following material is new or substantially expanded:

1. **FCA PS25/12 Supplementary Regime — in effect 7 May 2026** — the nine-month implementation period is over. The new rules require daily safeguarding checks, monthly reporting for payment firms, annual audits by qualified auditors (with an exemption for firms holding less than £100,000 in customer funds), and better wind-down planning. CASS 10A and CASS 15 chapters have been updated. The FRC published interim guidance for safeguarding auditors in March 2026, with a dedicated assurance standard expected in 2027. This is not future guidance — it is current law.
2. **HM Treasury Modernising Payment Services Regulation consultation — 14 July 2026** — the government's approach to modernising payment services and e-money regulation, including tokenised payments, Open Banking, agentic payments, and integration with the UK's core financial services regulatory framework. Consultation closes 6 October 2026. This directly affects ThryftVerse's 1ZE tokenisation and co-own asset plans.
3. **PSR consolidation into FCA** — the government intends to abolish the Payment Systems Regulator and consolidate its functions within the FCA via primary legislation. This changes the regulatory contact point and consumer-protection framework for payment systems.
4. **Stripe Connect 2026 API and payout lifecycle** — the Stripe API version 2026-04-22 (Dahlia) is current. The payout lifecycle (`pending → in_transit → paid → failed → canceled`) is the authoritative state machine. Transfer creation (`transfer.created`, `transfer.reversed`, `transfer.updated`) is distinct from bank payout. The Balance Settings API manages payout schedules for Accounts v2. This directly constrains PAY-13 (transfer labelled as paid).
5. **Deeper evidence ledger** — every defect line number re-confirmed against the inspected tree. Additional defects found around the `NUMERIC(12,2)` float-adjacent money type (PAY-17), the `code` vs `account_code` column mismatch (PAY-12 re-confirmed), and the gross-credits-only balance calculation (PAY-18).
6. **Deeper ledger redesign** — concrete `money_journals` / `money_journal_lines` schema with DB-enforced `debit=credit` per journal, unique posting keys, integer minor units, and immutable posted rows. Journal examples expanded with FX-linked journals.
7. **Deeper webhook inbox** — durable state-aware inbox with raw-body verify-once, lease/replay lifecycle, and provider-object monotonic application ordering.
8. **Deeper reconciliation** — three independent planes (provider facts, internal facts, bank/safeguarding facts) with concrete break taxonomy and close invariants.
9. **Deeper regulatory perimeter** — FCA PS25/12 daily checks, monthly reporting, annual audits, wind-down planning, FRC auditor guidance, HM Treasury consultation on tokenised/agentic payments, PSR consolidation.

---

## 1. Executive finding

The repository contains serious payment-engineering work: server-derived order totals, scoped payment idempotency, provider adapters, a ledger vocabulary, delivery-triggered release, payout review, dispute records, webhook tables and reconciliation jobs. Those foundations are useful, but they do not yet form a controlled money system. I personally re-verified every claim in §3 against the inspected tree on 25 August 2026.

The launch blockers are structural:

1. **A buyer can call the active payment-intent refund endpoint for their own succeeded payment** (`index.ts:31433` — `authUser.userId === intent.user_id`). That route lacks policy authorization, a remaining-refundable guard and request idempotency.
2. **Stripe webhook deduplication records receipt before economic processing** (`index.ts:32368-32388`); a crash after the insert causes retries to return 200 without replay.
3. **The retry sweep re-verifies a JSON-reserialized payload with empty headers** (`index.ts:33001` — `{}`), so a signed Stripe event cannot be faithfully retried.
4. **Ledger entries are appended individually and paired only by convention** (`005_payments_settlement_foundation.sql:182-194`). There is no journal header, database-enforced zero-sum invariant or unique posting key. Amounts are `NUMERIC(12,2)` — float-adjacent, not integer minor units.
5. **Seller reserve release is unbalanced** — the reserve portion is double-debited from `seller_payable` but only once credited from `escrow` (`index.ts:5612-5756`).
6. **Reconciliation compares internal payment-intent rows with internal ledger rows** (`reconciliation.ts:100-250`), not provider reports and bank movements.
7. **The active payout schedule sweep queries a non-existent ledger-account column** (`index.ts:28168` — `code` instead of `account_code`) **and sums credits without debits** (`index.ts:28171` — `direction = 'credit'` only).
8. **Stripe Connect transfer creation is labelled paid** (`index.ts:29912-29973`) although connected-balance transfer and bank payout are distinct states per Stripe's 2026 API.
9. **Wise can be advertised as configured but has no active payment/refund adapter branch** (`countryCapabilities.ts:311-333` vs `index.ts:6626-6911`).
10. **Customer copy makes escrow/safeguarding-style claims** whose legal and evidential basis is unresolved — and the FCA PS25/12 Supplementary Regime is now in effect with daily checks, monthly reporting and annual audits.

> Provider and bank facts describe external movement. Immutable balanced journals describe ThryftVerse obligations. Reconciliation proves they agree. No mutable balance, UI state or webhook receipt may become a competing source of truth.

---

## 2. Evidence discipline and production boundary

### 2.1 Classification

| Marker | Meaning |
|---|---|
| **[V]** | Verified repository fact — directly observed in the cited file and line range at this snapshot by the author. |
| **[E]** | External requirement/guidance — supported by an official regulator, platform or standards source linked in §22. |
| **[I]** | Engineering inference — a failure mode derived from the code; validate through runtime/provider tests. |
| **[L]** | Legal validation required — a funds-flow characteristic that may change obligations. This is not legal advice. |

Line numbers are snapshot evidence. Search the named symbol after edits.

### 2.2 Active versus aspirational code

The running API is predominantly `backend/api/src/index.ts`.

- Active reconciliation, payout, payment, webhook and refund endpoints are registered at `index.ts:11615-12031`, `28114-30312`, `30448-33070` and `35497-35663`.
- `backend/api/src/routes/ops.ts` contains a newer leased retry concept, but no active import/registration was found in `index.ts`. It is not a compensating control.
- `backend/api/src/routes/dlqAdmin.ts` is also not active in the current composition.

Acceptance evidence must hit a running route, not an unregistered module or migration.

---

## 3. P0 defect register (re-verified)

| ID | Verified evidence | Failure mode | Severity | Required disposition |
|---|---|---|---|---|
| PAY-01 | `index.ts:31433` — buyer self-refund (`authUser.userId === intent.user_id`) with no policy authorization | Intent owner or admin can enter provider refund path; buyer self-refund bypasses policy | Critical | Policy-owned refund command; no buyer-direct provider mutation |
| PAY-02 | `index.ts:31361-31466` — no refund idempotency key, no remaining-refundable guard | Duplicate/concurrent refunds can over-refund | Critical | Operation record, scoped key and amount reservation |
| PAY-03 | `index.ts:32368-32388` — dedup insert before economic transaction | Crash after insert causes retries to return 200 without replay | Critical | Durable state-aware inbox |
| PAY-04 | `index.ts:33001` — retry passes `{}` empty headers | Re-verification of reserialized JSON with empty headers fails signature check | Critical | Verify raw bytes once; retry normalized/retrieved event |
| PAY-05 | `005_payments_settlement_foundation.sql:182-194` — flat `ledger_entries` with no journal header, no `debit=credit` invariant, no unique posting key, `NUMERIC(12,2)` amounts | No enforced double-entry invariant; float-adjacent money type | Critical | Balanced immutable journal with integer minor units |
| PAY-06 | `index.ts:5612-5756` — escrow debited `subtotalGbp`, seller_payable debited `heldInReserveGbp` then credited only `creditedToSellerGbp` | Reserve release is unbalanced; net seller_payable credit ≠ escrow debit | Critical | Correct posting and invariant tests |
| PAY-07 | `index.ts:8136-8219` — paid payout debits `withdrawal_pending` and credits `withdrawable_balance` | Credits withdrawable balance instead of cash/provider clearing | Critical | Credit provider/bank cash clearing |
| PAY-08 | `index.ts:35608-35640` — unknown refund followed by full ledger reversal | Unknown remains pending inquiry; no success posting | Critical | Unknown stays pending; no reversal until terminal |
| PAY-09 | `index.ts:5418-5529` — refund reversal is order-keyed/full | Partial/concurrent refund unsafe | Critical | Refund-operation postings and proportional allocation |
| PAY-10 | `reconciliation.ts:100-250` — "gateway" total is internal `payment_intents` | Compares internal rows, not provider reports | Critical | Provider/ledger/bank reconciliation |
| PAY-11 | `reconciliation.ts:343-434` — query starts from intents, left-joins ledger | `missing_intent` cannot occur despite the type | High | FULL OUTER JOIN independent populations |
| PAY-12 | `index.ts:28168` — queries `code = 'seller_payable'` but schema uses `account_code` | Query fails; column does not exist | Critical | Fix column name; canonical balance view |
| PAY-13 | `index.ts:29912-29973` — Connect transfer settles request as `paid` | Transfer ≠ bank payout per Stripe 2026 API | Critical | Distinguish transfer/payout states |
| PAY-14 | `countryCapabilities.ts:311-333` vs `index.ts:6626-6911` — Wise selectable without create branch | Advertised but unimplemented | High | Registry only exposes certified adapters |
| PAY-15 | `frontend/src/services/walletApi.ts:411-442` — `confirmPaymentIntent` defaults simulated state to `succeeded` | Release hazard: simulated success in production client | Critical | Remove from production client surface |
| PAY-16 | `index.ts:31200-31329` — admin manual terminal confirmation without maker-checker | Single-admin terminal state override | Critical | Provider-owned terminal state; test-only command |
| PAY-17 | `005_payments_settlement_foundation.sql:187` — `amount_gbp NUMERIC(12, 2)` | Float-adjacent money type; rounding errors accumulate | Critical | Integer minor units with ISO currency |
| PAY-18 | `index.ts:28164-28171` — balance sums `direction = 'credit'` only, no debit subtraction | Gross credits reported as available balance | Critical | Net balance: credits minus debits |

---

## 4. Capability and provider matrices

| Capability | Current evidence | Rating | Launch requirement |
|---|---|---|---|
| Server-owned charge | Order lock/derivation, `index.ts:30655-30803` | Strong foundation | Property tests for promotions, shipping, currency |
| Payment idempotency | Hash mismatch, `30566-30623`; Stripe key, `6706-6709` | Partial | Persisted provider-success/DB-failure recovery |
| Unknown checkout | Client models unknown and polls | Good foundation | Retrieve path and recovery SLO |
| Provider coverage | Five create branches, `6682-6892` | Partial | Per-adapter certification; Wise disabled |
| Refund authorization | Owner-or-admin, `31433-31440` | Unsafe | Returns/dispute/policy-owned authorization |
| Refund idempotency | Inconsistent paths | Unsafe | Required operation ID and provider key |
| Webhook durability | Two receipt/outbox concepts | Unsafe integration | One lease/replay lifecycle |
| Ledger | Accounts and line types, `NUMERIC(12,2)` | Partial | Balanced journals, integer minor units, posting rules |
| Seller release | Delivery trigger | Unsafe accounting | Correct journal and per-order liability |
| Payout request | Verification, thresholds, idempotency | Partial | Canonical balance/concurrency proof |
| Payout execution | Stripe Connect transfer/manual | Not bank-payout complete | Terminal bank evidence |
| Reconciliation | Daily and per-intent internal checks | Internal-only | Provider, bank, safeguarding |
| Safeguarding UI | Fail-closed profile evidence | UI foundation | Actual legal/account evidence + FCA PS25/12 compliance |
| Multi-currency | Canonical migration plus legacy GBP | Partial | Minor units and FX/settlement model |

| Provider | Create | Refund | Webhook | Payout | Certification |
|---|---:|---:|---:|---:|---|
| Stripe | Yes | Yes | Unsafe inbox lifecycle | Connect transfer only | Not certified |
| Razorpay | Yes | Yes | Handler exists | Manual/unspecified | Not certified |
| Mollie | Yes | Yes | Handler exists | Manual/unspecified | Not certified |
| Flutterwave | Yes | Yes | Handler exists | Manual/unspecified | Not certified |
| Tap | Yes | Yes | Handler exists | Manual/unspecified | Not certified |
| Wise | Advertisable | No branch | Incomplete | Incomplete | Disable |
| Mock | Development | Development | N/A | N/A | Unreachable in release |

Flutterwave creation uses `payments@thryftverse.app` rather than buyer identity at `index.ts:6812-6818`. Confirm provider receipt/fraud implications.

---

## 5. End-to-end traces and target states

### 5.1 Checkout

Current path:

```text
CheckoutScreen → service → POST /payments/intents → authenticate → lock order → compute amount → gateway → provider call → local intent/order commit → provider UI → webhook/poll → order/ledger
```

Verified strengths:

- Canonical money plus legacy compatibility at `index.ts:30448-30512`.
- Scoped idempotency/payload mismatch at `30566-30623`.
- Locked order, server amount and fulfilment checks at `30655-30803`.

Critical sequence: the DB transaction begins before provider I/O and remains open through it at `30628-31110`. Provider success followed by local commit failure is ambiguous and external latency extends locks.

Target state machine:

```text
created → provider_submission_pending → requires_customer_action → processing → succeeded
provider_submission_pending/processing → unknown_outcome → provider_inquiry → processing/succeeded/failed/cancelled
created/action_required → cancelled/expired
```

Persist the operation before I/O, commit, call provider with operation ID as idempotency key, persist provider ID, then atomically settle domain state, journal and outbox after authoritative fact.

### 5.2 Webhook inbox

Current Stripe path inserts `webhook_events` outside the economic transaction (`index.ts:32368-32388`) and returns on duplicate. Retry reconstructs JSON without original headers (`index.ts:33001`). Migration 132 describes a better inbox, but active code does not use it.

**[E — Stripe 2026]** Stripe documents duplicates and provides no ordering guarantee. Apply by provider-object monotonic facts, not arrival order.

Target state machine:

```text
received → leased → normalizing → applying → succeeded
received/leased/applying → retry_wait → leased
retry_wait → dead_letter
```

Duplicate handling:

- `succeeded`: 200 no-op with prior result;
- `retryable`: preserve/accelerate recovery;
- `stale lease`: recover after expiry;
- `invalid signature`: reject before trusted-domain persistence.

Receipt fields: provider, provider_account_id, provider_event_id, event_type, encrypted raw body/headers, body hash, status, lease owner/expiry, attempts, next attempt, error code, normalized object, journal, received/completed times.

### 5.3 Refund

Two competing active paths exist:

- intent refund (`index.ts:31361`): owner/admin, provider I/O in transaction, no policy/key/remaining guard;
- order admin refund (`index.ts:5418`): remaining calculation and unknown status, but full ledger reversal even when unknown.

Target state machine:

```text
requested → policy_authorized → provider_submission_pending → submitted → succeeded
submission/submitted → unknown_outcome → provider_inquiry → submitted/succeeded/failed
requested/authorized → rejected
```

Under an order lock:

```text
sum(succeeded refunds) + sum(reserved in-flight refunds) ≤ captured amount − chargebacks already allocated
```

A customer cancellation creates a policy request, never a direct provider call.

### 5.4 Payout

**[E — Stripe Connect 2026]** The Payout object's `status` field reflects: `pending` (created, waiting for bank submission), `in_transit` (submitted to bank), `paid` (arrived at external account), `failed` (couldn't complete), `canceled` (canceled before bank submission). Transfer creation is distinct from payout. Webhook events: `payout.created`, `payout.paid`, `payout.failed`, `payout.canceled`, `transfer.created`, `transfer.reversed`, `transfer.updated`.

Current:

```text
seller request → profile/velocity/balance → seller_payable to withdrawal_pending → admin review → Stripe transfer/manual reference → paid/failed
```

Target:

```text
requested → risk_review_required/approved → funds_reserved → provider_submission_pending → provider_accepted → in_transit → paid
submission → unknown_outcome → inquiry
accepted/in_transit → failed
paid → returned with compensating journal
```

Facts must distinguish `transfer_created`, `connected_balance_available`, `payout_created`, `payout_in_transit`, `payout_paid`, `payout_failed` and `payout_returned`. **`paid` is reserved for bank terminal evidence** — Stripe's `payout.paid` webhook, not `transfer.created`.

### 5.5 Wallet and 1ZE

`WalletScreen.tsx:592-626` correctly renders safeguarded evidence fail-closed when supplied, but runtime fixtures can still seed `safeguarded=true`. `CheckoutScreen.tsx:1778` says "funds held in escrow until you confirm," while backend release includes parcel/automated policies. These are truth and perimeter risks.

**[L]** Do not launch redemption or transferable £1-par 1ZE until counsel confirms e-money/payment-service treatment, insolvency/redemption terms and safeguarding under FCA PS25/12. Co-own asset tokenization requires separate securities/CIS/custody/financial-promotion analysis, and the HM Treasury July 2026 consultation on tokenised payments may change the perimeter.

---

## 6. Ledger redesign

### 6.1 Invariants

1. **Integer minor units** plus ISO currency — never `NUMERIC(12,2)`.
2. Every posted journal has at least two lines and **debits=credits per currency**.
3. No mixed-currency journal; FX uses linked journals and execution record.
4. One **unique posting key** per tenant/domain/event/version.
5. Posted journals **immutable**; correction is reversal plus replacement.
6. Liability cannot go negative absent explicit account policy.
7. **Provider I/O never while ledger locks are held.**
8. **Unknown outcome never posts success.**
9. Cached balances are **rebuildable projections**.
10. Customer-visible money traces to journal and provider facts.

### 6.2 Schema

```sql
-- Migration: 154_money_journal_kernel.sql

CREATE TABLE money_accounts (
  id BIGSERIAL PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('platform','user','provider')),
  owner_id TEXT NOT NULL,
  account_code TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  normal_side TEXT NOT NULL CHECK (normal_side IN ('debit','credit')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_type, owner_id, account_code, currency)
);

CREATE TABLE money_journals (
  id BIGSERIAL PRIMARY KEY,
  posting_key TEXT NOT NULL UNIQUE,           -- tenant/domain/event/version
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  effective_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  reversal_of_id BIGINT REFERENCES money_journals(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  principal TEXT                                -- human-readable description
);

CREATE TABLE money_journal_lines (
  id BIGSERIAL PRIMARY KEY,
  journal_id BIGINT NOT NULL REFERENCES money_journals(id) ON DELETE RESTRICT,
  account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('debit','credit')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  line_code TEXT NOT NULL,
  external_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DB-enforced invariant: debits = credits per journal per currency
CREATE OR REPLACE FUNCTION enforce_journal_balanced()
RETURNS TRIGGER AS $$
DECLARE
  imbalance BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM money_journal_lines
    WHERE journal_id = NEW.journal_id
    GROUP BY currency
    HAVING SUM(CASE WHEN side = 'debit' THEN amount_minor ELSE 0 END)
         <> SUM(CASE WHEN side = 'credit' THEN amount_minor ELSE 0 END)
  ) INTO imbalance;
  IF imbalance THEN
    RAISE EXCEPTION 'Journal % is not balanced (debits <> credits per currency)', NEW.journal_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_balanced
  AFTER INSERT OR UPDATE ON money_journal_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_balanced();

-- Immutable posted journals
CREATE OR REPLACE FUNCTION prevent_journal_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'posted' AND NEW.status = 'posted' THEN
    RAISE EXCEPTION 'Posted journals are immutable. Use reversal + replacement.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_immutable
  BEFORE UPDATE ON money_journals
  FOR EACH ROW EXECUTE FUNCTION prevent_journal_mutation();

CREATE TABLE money_operations (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL CHECK (operation_type IN
    ('create_intent','confirm','capture','refund','payout','transfer','dispute','adjustment')),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  scoped_idempotency_key TEXT NOT NULL,
  scoped_idempotency_hash BYTEA,
  state TEXT NOT NULL CHECK (state IN
    ('created','submitted','succeeded','failed','unknown_outcome','reversed')),
  unknown_since TIMESTAMPTZ,
  provider TEXT,
  provider_object_id TEXT,
  provider_object_type TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aggregate_type, aggregate_id, scoped_idempotency_key)
);

CREATE TABLE balance_projections (
  account_id BIGINT NOT NULL REFERENCES money_accounts(id),
  currency CHAR(3) NOT NULL,
  total_debit_minor BIGINT NOT NULL DEFAULT 0,
  total_credit_minor BIGINT NOT NULL DEFAULT 0,
  balance_minor BIGINT GENERATED ALWAYS AS (total_debit_minor - total_credit_minor) STORED,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, currency)
);
```

### 6.3 Journal examples

Assume £100 item (10,000 minor), £4 shipping (400), £6 commission (600). Capture £104.00 (10,400 minor):

| Account | Debit | Credit |
|---|---:|---:|
| provider_cash_pending | 10,400 | 0 |
| buyer_order_liability | 0 | 10,400 |

Settlement with £2.10 fee (210 minor):

| Account | Debit | Credit |
|---|---:|---:|
| provider_cash_available | 10,190 | 0 |
| processor_fee_expense | 210 | 0 |
| provider_cash_pending | 0 | 10,400 |

Fulfilment allocation:

| Account | Debit | Credit |
|---|---:|---:|
| buyer_order_liability | 10,400 | 0 |
| seller_reserve_liability | 0 | 940 |
| platform_commission_revenue | 0 | 600 |
| shipping_payable | 0 | 400 |
| seller_payable | 0 | 8,460 |

Reserve release: debit `seller_reserve_liability` 940; credit `seller_payable` 940.

Payout request: debit `seller_payable` 9,400; credit `payout_pending_liability` 9,400.

**Bank-confirmed payout** (Stripe `payout.paid` webhook): debit `payout_pending_liability` 9,400; credit `provider_cash_available` 9,400.

Payout returned: debit `provider_cash_available` 9,400; credit `seller_payable` 9,400.

Partial refund £25 (2,500 minor) before allocation: debit `buyer_order_liability` 2,500; credit `provider_cash_refund_payable` 2,500. After allocation, reverse policy-defined portions proportionally and persist rounding. Do not key a full-order reversal by order ID.

---

## 7. Unknown-outcome matrix

| Operation | Ambiguity | Honest state | Recovery | Never |
|---|---|---|---|---|
| Create intent | Timeout after request | Checking payment | Retrieve by operation/key | New unrelated intent |
| Confirm/capture | Client closes during SCA | Action required/checking | Retrieve + webhook | Trust client callback |
| Refund | Timeout after submit | Refund requested, checking | Retrieve/same-key retry | Post success journal |
| Payout | Timeout after submit | Processing, bank pending | Retrieve transfer/payout | Label paid |
| Webhook apply | Worker crash | Receipt retryable | Lease expiry/posting key | Pre-mark processed |
| Reconciliation | Input unavailable | Incomplete | Re-fetch | Green close |
| Admin command | Response lost | Check command ID | GET command | Repeat with new ID |

Every mutation returns `operationId`, `state`, `safeToRetry` and `statusUrl`.

---

## 8. Reconciliation architecture

### 8.1 Current proof boundary

`reconciliation.ts:100-250` calls internal succeeded `payment_intents` "gateway" totals and compares internal ledger. It cannot find:

- external transactions absent from both;
- provider fees/refunds/disputes/payouts omitted locally;
- unfunded local success;
- settlement timing;
- reserves;
- FX;
- bank mismatch.

The per-intent query at `reconciliation.ts:343-381` starts from intents and left-joins ledger, so ledger-only `missing_intent` cannot occur despite the type.

### 8.2 Independent planes

1. **Provider facts:** balance transactions, charges, captures, refunds, disputes, transfers, payouts, fees and availability.
2. **Internal facts:** operations, orders, journals and projections.
3. **Bank/safeguarding facts:** statements, settlement deposits, payout debits, returns, fees/interest.

Persist immutable raw object/hash, normalized row, cursor/window, provider account, imported time, available-on, currency, gross/fee/net and corrections.

### 8.3 Matching and breaks

Primary match: provider account + object/transaction ID. Secondary: amount, currency, time window, operation metadata, batch. Fuzzy matching only proposes.

Break taxonomy: `missing_internal`, `missing_provider`, `amount_mismatch`, `currency_mismatch`, `status_mismatch`, `fee_mismatch`, `duplicate_internal`, `duplicate_provider`, `timing_expected`, `payout_batch_mismatch`, `bank_missing`, `safeguarding_shortfall`, `stale_unknown`.

Each is a case with owner, severity, due time, evidence, resolution command and adjustment journal.

### 8.4 Close invariants

- Opening provider balance + inflows − outflows ± adjustments = closing.
- Pending/available/reserve positions match provider.
- Liabilities are covered under approved safeguarding calculation.
- Every terminal provider transaction has one operation and posting set.
- Every journal is unique/balanced.
- Paid payouts equal provider/bank terminal outflow.
- Any ingestion/subtask failure makes run incomplete. The catch at `index.ts:11650-11654` cannot return green.

---

## 9. Regulatory perimeter (deepened)

### 9.1 FCA PS25/12 Supplementary Regime — in effect 7 May 2026

**[E]** The FCA's PS25/12 Supplementary Regime took effect 7 May 2026 after a nine-month implementation period. The new rules require:

- **Daily checks** to ensure the right amount of money is being safeguarded;
- **Monthly reporting** for payment firms;
- **Annual audits** by qualified auditors (exemption for firms holding less than £100,000 in customer funds);
- **Better wind-down planning** so customers receive their money back sooner;
- CASS 10A and CASS 15 chapters updated with detailed requirements;
- Updated SUP sourcebook with new auditor obligations.

**[E — FRC, March 2026]** The Financial Reporting Council published Interim Guidance on Payment and E-Money Safeguarding Assurance Engagements to support auditors during the transition. A dedicated safeguarding assurance standard is expected in 2027 after public consultation.

**[I]** ThryftVerse's reconciliation must produce daily safeguarding checks comparing internal liabilities against safeguarded account balances. Monthly reporting must be automated. Annual audit evidence must be retrievable. Wind-down planning must be documented. The current internal-only reconciliation (PAY-10) cannot meet these requirements.

### 9.2 HM Treasury Modernising Payment Services Regulation — 14 July 2026

**[E]** HM Treasury published a consultation on modernising payment services regulation on 14 July 2026 (closes 6 October 2026). Key proposals:

- Integrating payment services and e-money regulation with the UK's core financial services regulatory framework;
- Regulating stablecoins for payments under the new regulated activity for stablecoin issuance;
- Exploring how regulation should adapt to payments conducted by AI agents;
- Providing the FCA with new powers to regulate Open Banking;
- Bringing forward legislation to cut administrative burdens for stablecoin payments.

**[L]** This directly affects ThryftVerse's 1ZE tokenisation and co-own asset plans. The consultation explicitly addresses tokenised payments and agentic payments — both relevant to ThryftVerse's AI agent and co-own features. Legal counsel must track this consultation and its outcomes.

### 9.3 PSR consolidation into FCA

**[E]** The government intends to abolish the Payment Systems Regulator (PSR) and consolidate its functions within the FCA via primary legislation. The PSR and FCA are taking steps to enhance coordination and ensure operational readiness.

**[I]** The regulatory contact point for payment systems issues will change. Consumer protection frameworks for payment systems will be unified under the FCA. ThryftVerse should track this consolidation and update its compliance contacts and obligations accordingly.

### 9.4 Legal validation required

Counsel/compliance must approve:

- entities, provider contracts, merchant/agent/creditor roles;
- whether funds remain provider-controlled or enter ThryftVerse accounts;
- whether any escrow/trust exists;
- 1ZE e-money/payment-instrument, redemption, expiry and insolvency treatment;
- co-own security/CIS/custody/financial-promotion perimeter;
- safeguarding method/accounts/reconciliation/wind-down under PS25/12;
- refunds, disputes, negative balances and Connect liability;
- SCA, complaints, Consumer Duty, AML/sanctions, tax;
- country-specific customer copy;
- tokenised payments and agentic payments under the HM Treasury consultation.

No safeguarded, escrow, protected, insured, instant or paid claim may render from a default. It needs approved configuration and evidence.

---

## 10. Flagship UX

### 10.1 Customer money UX

- One dominant amount/status, not equal rounded cards.
- Plain timelines and hairlines; containment only for real grouping/state.
- Amount and expected date before provider jargon.
- Unknown as amber "Check status," never red failure/green success.
- Separate available, pending delivery, reserve and in-transit.
- Consequence-first destructive confirmations.
- Shared domain-state copy.
- Large text, screen-reader order and non-colour indicators.
- No card-on-card composition; flat canvas with hairline separators.
- One radius grammar, one icon family, one press feedback.

### 10.2 Operator UX

- Queue ordered by consumer harm and value.
- Header with business date, provider, entity, currency, run state/import-through.
- Paired provider/internal evidence and highlighted difference.
- Explicit resolution reason and journal preview.
- Maker-checker for adjustments, payout overrides and shortfall close.
- Proposal/approval/evidence audit rail.
- No generic "Approve" without amount, beneficiary, destination fingerprint and effect.
- No success toast until command status confirms.

---

## 11. SLOs, observability and validation

| Service | Initial objective | Page |
|---|---|---|
| Payment create | 99.95% accepted within 2 s excluding provider action | fast burn |
| Unknown recovery | 99.9% in 10 min; 100% surfaced | oldest >10 min |
| Webhook receipt | 99.99% durable before 2xx in 1 s | insert failure/lag |
| Webhook apply | 99.9% terminal facts in 5 min | p99 >5 min |
| Journal | 100% balanced/unique | any violation |
| Payout freshness | 99.9% under 5 min | paid without terminal evidence |
| Daily close | 100% by agreed T+1 | missed/shortfall |
| Customer balance | zero confirmed incorrect | any occurrence |
| Safeguarding daily check | 100% complete daily | any missed check |

Dimensions: entity, provider/account, operation type, currency, state, error, business date. Never log PII, bank data, full payloads or secrets.

Required tests:

- conservation, rounding, concurrency, reversal, projection rebuild;
- reserve 0/10/100%, partial refunds, dispute win/loss, payout return;
- enabled-provider action-required, duplicate/out-of-order webhook, retrieve, refunds, disputes, payout states and API-version fixtures;
- kill after provider acceptance, after inbox receipt, after domain commit and during lease;
- 100 duplicates in reverse order;
- delayed/missing report, duplicate bank row, DST/skew and provider rate limit;
- buyer cannot call money admin commands; admin role alone cannot bypass approval;
- mock provider unreachable in release;
- daily safeguarding check produces correct reconciliation or incomplete flag.

---

## 12. Staged rollout

### Stage 0 — stop unsafe paths

Disable buyer-direct refund (PAY-01); redemption/co-own money pending perimeter; Wise/uncertified payouts (PAY-14); production simulate/confirm (PAY-15); payouts when reconciliation inputs are incomplete.

### Stage 1 — operation and journal kernel

Add operations/balanced journals (`154_money_journal_kernel.sql`), integer minor units (fix PAY-05/PAY-17) and shadow dual-post; fix reserve/refund/payout rules (PAY-06/PAY-09); fix balance calculation (PAY-12/PAY-18).

Exit: 30 days shadow traffic, zero unexplained variance, rebuild proven.

### Stage 2 — durable inbox

Raw-body verify once, lease, provider retrieve and atomic apply (fix PAY-03/PAY-04). Migrate unresolved receipts and remove reconstructed-signature retry.

Exit: crash/duplicate/order suite loses no event.

### Stage 3 — controlled refund/payout

One refund command and reservation (fix PAY-01/PAY-02), bank-payout facts (fix PAY-13), adapter certification and maker-checker (fix PAY-16).

Exit: every terminal state has provider and journal evidence.

### Stage 4 — three-way reconciliation/safeguarding

Independent provider reports, bank feed, break cases, close and approved evidence (fix PAY-10/PAY-11). Daily safeguarding checks per FCA PS25/12.

Exit: repeated T+1 close within SLO, no unexplained aged break, daily safeguarding check passes.

### Stage 5 — canary

Internal → low-value invite → one provider/currency → controlled payout. Kill switch per provider/country/currency/operation.

Rollback disables new commands but continues inquiry/reconciliation; never deletes journals.

---

## 13. Stack decisions and non-goals

**Decisions:**

- PostgreSQL remains accounting truth with DB constraints.
- Transactional inbox/outbox before a broker.
- Provider adapters expose normalized facts, capabilities and retrieve.
- OpenTelemetry-style opaque correlation across operation/provider/journal/break.
- Immutable provider reports in controlled object storage.
- Typed deny-by-default policy first; Rego/Cedar only when complexity justifies.

**Non-goals:**

- no blockchain for double-entry;
- no universal event sourcing;
- no Kafka solely for webhook volume;
- no fuzzy auto-adjustment;
- no admin dashboard as a substitute for controls;
- no provider-count vanity;
- no wallet polish before truth.

---

## 14. Hard acceptance gates

- [ ] Buyer-direct provider refund impossible (PAY-01 fixed).
- [ ] Every money mutation has idempotency, persisted operation and unknown recovery (PAY-02 fixed).
- [ ] Every journal is DB-balanced, unique and immutable (PAY-05 fixed).
- [ ] Integer minor units, no `NUMERIC(12,2)` (PAY-17 fixed).
- [ ] Reserve, partial refund, dispute and payout properties pass (PAY-06/PAY-09 fixed).
- [ ] No provider call while money/order locks are held.
- [ ] Webhook crash, duplicate and out-of-order tests pass (PAY-03/PAY-04 fixed).
- [ ] Retry never reconstructs a signature.
- [ ] Registry cannot advertise an unimplemented adapter (PAY-14 fixed).
- [ ] Paid means bank-payout terminal confirmation (PAY-13 fixed).
- [ ] Reconciliation independently ingests provider and bank facts (PAY-10/PAY-11 fixed).
- [ ] Incomplete runs cannot be green/unpause payouts.
- [ ] Schedule sweep uses canonical balance and correct column name (PAY-12/PAY-18 fixed).
- [ ] Release artifact cannot simulate success (PAY-15 fixed).
- [ ] Perimeter, safeguarding and copy approved under FCA PS25/12.
- [ ] Daily safeguarding checks automated and auditable.
- [ ] Operator permission, approval and audit gates pass (PAY-16 fixed).
- [ ] Native UI covers loading, action-required, unknown, failed, reversed and paid.
- [ ] Applicable impact-tolerance tests are signed off.

---

## 15. Primary-source research ledger

| Source | External point used |
|---|---|
| [FCA — PS25/12 Changes to safeguarding regime](https://www.fca.org.uk/publications/policy-statements/ps25-12-changes-safeguarding-regime-payments-and-e-money-firms) | Supplementary Regime rules, daily checks, monthly reporting, annual audits, CASS 10A/15, effective 7 May 2026. |
| [FCA — Safeguarding requirements](https://www.fca.org.uk/firms/emi-payment-institutions-safeguarding-requirements) | Safeguarding method, accounts, reconciliation, wind-down. |
| [FCA Handbook — CASS 15](https://handbook.fca.org.uk/handbook/cass15) | Detailed safeguarding requirements for e-money. |
| [FCA — Operational resilience, 14 July 2026](https://www.fca.org.uk/firms/operational-resilience) | Important-service mapping/testing within impact tolerances for payment/e-money entities. |
| [FRC — Interim Guidance on Safeguarding Assurance, March 2026](https://www.frc.org.uk/news-and-events/news/2026/03/frc-publishes-interim-guidance-to-support-safeguarding-auditors-during-transition-to-the-fcas-new-supplementary-regime/) | Auditor guidance for PS25/12 transition, dedicated standard expected 2027. |
| [HM Treasury — Modernising Payment Services Regulation, 14 July 2026](https://www.gov.uk/government/consultations/modernising-payment-services-regulation) | Tokenised payments, Open Banking, agentic payments, regulatory framework integration, consultation closes 6 October 2026. |
| [HM Treasury — UK fintech backed to embrace future payments technology, 21 April 2026](https://www.gov.uk/government/news/uk-fintech-backed-to-embrace-future-payments-technology) | Stablecoin regulation, AI agent payments, FCA Open Banking powers. |
| [GOV.UK — PSR consolidation into FCA](https://www.gov.uk/government/consultations/a-streamlined-approach-to-payment-systems-regulation-consultation/outcome/a-streamlined-approach-to-payment-systems-regulation-consultation-response) | Abolish PSR, consolidate functions within FCA via primary legislation. |
| [FCA — Strong Customer Authentication](https://www.fca.org.uk/firms/strong-customer-authentication) | SCA continues under UK payments framework. |
| [FCA — Payment/e-money regulations](https://www.fca.org.uk/firms/payment-services-regulations-e-money-regulations) | Regulatory perimeter for payment services and e-money. |
| [Stripe — Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | Idempotency key semantics, provider-success/DB-failure recovery. |
| [Stripe — Webhooks](https://docs.stripe.com/webhooks) | Duplicate events, no ordering guarantee, signature verification. |
| [Stripe — Payout lifecycle](https://docs.stripe.com/connect/add-and-pay-out-guide) | Payout status: pending → in_transit → paid → failed → canceled; webhook events. |
| [Stripe — Transfers API, 2026-04-22 Dahlia](https://docs.stripe.com/api/transfers) | Transfer object, transfer.created/reversed/updated events, transfer/payout split. |
| [Stripe — Balance Settings API](https://docs.stripe.com/api/balance-settings) | Payout schedule management for Accounts v2, delay_days. |
| [Stripe Connect — Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers) | Platform charge decoupled from connected-account transfer. |
| [Stripe Connect — Dispute responsibility](https://docs.stripe.com/connect/disputes) | Dispute liability allocation. |
| [Stripe — Balance transaction types](https://docs.stripe.com/reports/balance-transaction-types) | Reconciliation transaction types. |
| [Stripe — Payout reconciliation reports](https://docs.stripe.com/reports/select-a-report) | Provider report ingestion for reconciliation. |
| [Osborne Clarke — New UK payments safeguarding rules, May 2026](https://www.osborneclarke.com/insights/new-uk-payments-safeguarding-rules-take-effect-further-fca-review-come) | Nine-month implementation, CASS 10A/15, post-repeal regime deferred, FCA review after bedding-in. |

Technical claims were checked against official regulator/platform sources available on 25 August 2026. No competitor marketing source is used as a regulatory requirement.

---

## 16. Final status

**RESEARCH COMPLETE — IMPLEMENTATION BLOCKED BY P0 ACCOUNTING, WEBHOOK, REFUND, PAYOUT, RECONCILIATION, SAFEGUARDING AND REGULATORY GATES.**

This status is deliberately not production-ready. The dossier defines the evidence required to change it. The FCA PS25/12 Supplementary Regime is now in effect (7 May 2026) with daily checks, monthly reporting and annual audits. The HM Treasury consultation on modernising payment services regulation (14 July 2026) directly affects 1ZE tokenisation and agentic payments. The PSR is being consolidated into the FCA. The ledger lacks a DB-enforced double-entry invariant, uses float-adjacent `NUMERIC(12,2)` amounts, and the payout sweep queries a non-existent column. No real-money flow may launch until every gate in §14 passes.
