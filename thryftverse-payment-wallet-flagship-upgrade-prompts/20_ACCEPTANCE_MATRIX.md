# Flagship Payment and Wallet Acceptance Matrix

Use this as a hard gate. “Pass” requires linked evidence, not an assertion.

| ID | Requirement | Evidence required | Gate |
|---|---|---|---|
| PAY-P0-01 | No Thryftverse-owned input/state receives PAN or CVV | source scan, proxy trace, mobile test | P0 |
| PAY-P0-02 | Saved methods are provider token/payment-method projections | SetupIntent/CustomerSession sandbox evidence | P0 |
| PAY-P0-03 | Money uses canonical integer units and explicit currency | schema, type tests, provider traces | P0 |
| PAY-P0-04 | Test simulation routes absent from production route table | production build route test | P0 |
| PAY-P0-05 | All live webhooks fail closed and use current signature specification | provider replay evidence | P0 |
| PAY-P0-06 | Idempotency key is bound to request hash | API conflict and concurrency tests | P0 |
| LED-P0-01 | Every journal balances per asset at database commit | DB rejection test and property suite | P0 |
| LED-P0-02 | Committed journals/postings are immutable | DB permission/trigger tests | P0 |
| LED-P0-03 | One canonical source reconstructs every balance | genesis rebuild comparison | P0 |
| WAL-P0-01 | Available balance excludes pending/reserved/frozen value | ledger examples and API contract | P0 |
| WAL-P0-02 | Concurrent actions cannot overspend | high-contention integration test | P0 |
| WAL-P0-03 | General 1ZE redemption is not claimed while disabled | API/UI copy audit | P0 |
| CHK-P1-01 | Server owns pricing and funding plan | tamper tests | P1 |
| CHK-P1-02 | Split tender reserves wallet and settles atomically | end-to-end failure matrix | P1 |
| PSP-P1-01 | Every enabled method/country is contracted, configured, sandbox-proven and live-approved | capability dossier | P1 |
| PSP-P1-02 | Visa, Mastercard, Amex and wallets render from provider capability | device/provider tests | P1 |
| CON-P1-01 | Merchant-of-record and charge model ADR approved | signed ADR/legal review record | P1 |
| CON-P1-02 | Transfer and bank payout are distinct states | schema, webhook tests | P1 |
| PAYOUT-P1-01 | “Paid” only follows authoritative external payout success | provider payout webhook evidence | P1 |
| PAYOUT-P1-02 | Failed/returned payout restores or quarantines funds exactly | journal and sandbox test | P1 |
| REF-P1-01 | Partial refunds reverse only exact refunded economics | multiple partial refund test | P1 |
| DSP-P1-01 | Disputes journal provisional/final exposure and deadlines | provider fixture/sandbox evidence | P1 |
| REC-P1-01 | Internal journal reconciles to provider balance transactions | daily run with zero unexplained variance | P1 |
| REC-P1-02 | Provider/bank resources reconcile to customer liabilities where applicable | external reconciliation evidence | P1 |
| RISK-P1-01 | KYC/risk/limits are enforced transactionally | policy and concurrency tests | P1 |
| SEC-P1-01 | Secrets, bank data and provider payloads are redacted/encrypted | security test/report | P1 |
| OPS-P1-01 | Kill switches, dead-letter replay and incident runbooks tested | game-day report | P1 |
| MKT-P2-01 | Commerce, auction and Co-Own use the canonical journal/holds | trace matrix | P2 |
| QA-P2-01 | Provider sandbox full lifecycle passes | artefact bundle | P2 |
| QA-P2-02 | Live canary reconciles with no unexplained principal break | signed go/no-go record | Launch |

## Scoring rule

- Any failed P0 item = production blocked.
- P1 items must pass for the affected feature/corridor.
- P2 items must pass before broad launch.
- “Not applicable” requires written architecture/legal justification and reviewer approval.
