# FCA PS25/12 Compliance Checklist — ThryftVerse Payments

**Created:** 25 August 2026
**Status:** AWAITING LEGAL/COMPLIANCE SIGN-OFF
**Scope:** Payments, wallet, payout, and reconciliation system

This checklist tracks the regulatory gates from the flagship analysis report that require legal counsel approval. No real-money flow may launch until every gate is signed off.

---

## 1. FCA PS25/12 Supplementary Regime (in effect 7 May 2026)

### 1.1 Daily safeguarding checks
- [x] **Code:** `runSafeguardingCheck()` in `reconciliation.ts` sums internal liabilities and compares against safeguarded account balance
- [x] **API:** `POST /admin/reconciliation/safeguarding-check` endpoint wired
- [x] **Alert:** Shortfall triggers `safeguarding_shortfall` ops alert
- [ ] **LEGAL:** Counsel must approve the safeguarding method (segregation vs. insurance)
- [ ] **LEGAL:** Counsel must approve the safeguarding account structure
- [ ] **OPS:** Daily check must be scheduled (cron/worker) — not yet automated

### 1.2 Monthly reporting
- [ ] **LEGAL:** Counsel must confirm what monthly reports FCA requires
- [ ] **OPS:** Report generation pipeline not yet built
- [ ] **COMPLIANCE:** Report submission process not yet defined

### 1.3 Annual audits
- [ ] **LEGAL:** Counsel must confirm if ThryftVerse qualifies for the <£100,000 exemption
- [ ] **LEGAL:** If not exempt, engage qualified auditor for annual safeguarding audit
- [ ] **COMPLIANCE:** Audit evidence retrieval process not yet defined

### 1.4 Wind-down planning
- [ ] **LEGAL:** Counsel must approve wind-down plan
- [ ] **LEGAL:** Counsel must confirm customer money return timeline in wind-down
- [ ] **COMPLIANCE:** Wind-down plan document not yet written

---

## 2. Safeguarding perimeter

### 2.1 Fund classification
- [ ] **LEGAL:** Confirm whether funds remain provider-controlled or enter ThryftVerse accounts
- [ ] **LEGAL:** Confirm whether any escrow/trust exists
- [ ] **LEGAL:** Confirm safeguarding method (CASS 10A/15 compliance)

### 2.2 Customer copy
- [x] **Code:** `CheckoutScreen.tsx` — "funds held until you receive your order" (no escrow claim)
- [x] **Code:** `WalletScreen.tsx` — safeguarded badge is fail-closed (only shows when evidence exists)
- [ ] **LEGAL:** Approve all customer-facing money claims (safeguarded, escrow, protected, insured, instant, paid)
- [ ] **LEGAL:** Confirm no claim renders from a default — all require approved configuration and evidence

---

## 3. 1ZE tokenisation

### 3.1 E-money/payment-instrument classification
- [ ] **LEGAL:** Confirm whether 1ZE is e-money, a payment instrument, or neither
- [ ] **LEGAL:** Confirm redemption terms and insolvency treatment
- [ ] **LEGAL:** Confirm expiry rules (if any)
- [ ] **LEGAL:** Confirm safeguarding requirements for 1ZE balances

### 3.2 HM Treasury consultation (closes 6 October 2026)
- [ ] **LEGAL:** Track consultation outcomes on tokenised payments
- [ ] **LEGAL:** Track agentic payments regulation (affects AI agent features)
- [ ] **LEGAL:** Track stablecoin regulation (affects 1ZE if classified as stablecoin)

---

## 4. Co-own asset tokenisation

- [ ] **LEGAL:** Confirm whether co-own is a security/CIS/custody arrangement
- [ ] **LEGAL:** Confirm financial promotion rules apply
- [ ] **LEGAL:** Confirm custody requirements if assets are held
- [ ] **LEGAL:** Confirm consumer protection framework

---

## 5. Provider contracts and roles

- [ ] **LEGAL:** Confirm entity structure (merchant, agent, creditor)
- [ ] **LEGAL:** Confirm provider contracts (Stripe, Razorpay, Mollie, Flutterwave, Tap)
- [ ] **LEGAL:** Confirm refund, dispute, negative balance liability
- [ ] **LEGAL:** Confirm Connect liability allocation

---

## 6. Regulatory contacts

- [ ] **LEGAL:** Update compliance contacts for PSR consolidation into FCA
- [ ] **LEGAL:** Confirm FCA registration/reference number
- [ ] **LEGAL:** Confirm consumer protection framework for payment systems

---

## 7. SCA, AML, sanctions, tax

- [ ] **LEGAL:** Confirm SCA compliance for all payment flows
- [ ] **LEGAL:** Confirm AML/sanctions screening requirements
- [ ] **LEGAL:** Confirm tax treatment for marketplace transactions
- [ ] **LEGAL:** Confirm complaints handling process

---

## 8. Country-specific requirements

- [ ] **LEGAL:** UK-specific customer copy and disclosures
- [ ] **LEGAL:** EU-specific (Mollie) — PSD2/e-money directives
- [ ] **LEGAL:** India-specific (Razorpay) — RBI regulations
- [ ] **LEGAL:** Africa-specific (Flutterwave) — local payment regulations
- [ ] **LEGAL:** Gulf-specific (Tap) — local payment regulations

---

## Code-side compliance gates (COMPLETED)

| Gate | Status | Evidence |
|------|--------|----------|
| Daily safeguarding check function | DONE | `runSafeguardingCheck()` in `reconciliation.ts` |
| Safeguarding check API endpoint | DONE | `POST /admin/reconciliation/safeguarding-check` |
| Three-way reconciliation (provider + bank + internal) | DONE | `runThreeWayReconciliation()` in `reconciliation.ts` |
| Safeguarding shortfall alert | DONE | `safeguarding_shortfall` in `OpsAlertCode` |
| Incomplete reconciliation cannot unpause payouts | DONE | Three-way endpoint checks `incomplete` flag |
| No escrow/safeguarding claim from default | DONE | `WalletScreen.tsx` fail-closed safeguarded badge |
| Honest payout status (paid = bank confirmed) | DONE | `stripePayouts.ts` + `WithdrawScreen.tsx` |
| Maker-checker for terminal status | DONE | `index.ts` PAY-16 fix |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Legal counsel | | | |
| Compliance officer | | | |
| Finance director | | | |
| CTO | | | |
| CEO | | | |

---

**This document is not legal advice. All items marked [LEGAL] require qualified legal counsel.**
