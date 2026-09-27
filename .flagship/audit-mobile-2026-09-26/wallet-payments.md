# Audit — Wallet / Payments / KYC (mobile) — 2026-09-26

## Verdict
The department is honest and well-decomposed: every money surface has real skeleton/error/empty coverage, biometric gating, idempotent submissions, unknown-outcome reconciliation, and truthful pending states that never claim "paid" early. The material gaps are web-parity ones — the ledger renders far less information than the payload supports (no running balance, day-groups instead of sticky month rails with nets, no CSV export), the wallet hero lacks the masked payout account line, and there is no payout-methods management surface at all. A nested FlashList inside the wallet ScrollView is an architectural defect, not a polish issue.

## Findings

### W-01 — Ledger understates its own payload: no running balance, day-groups not month rails, no export [P1]
- Screens: `frontend/src/components/wallet/WalletTransactionHistory.tsx`, `frontend/src/screens/WalletHistoryScreen.tsx`
- Evidence: `WalletLedgerItem` carries `balanceAfter`/`balanceAfterDisplay` (`services/walletApi.ts:818-819`) but the row renders only label + relative time + signed amount (`WalletTransactionHistory.tsx:124-152`). Grouping is `formatDayLabel` per-day (`:53-64`), not month. No pending badge, no month net, no CSV export, hard `limit={200}`/`limit={20}` with no pagination.
- Web parity: `web/src/components/wallet/LedgerList.tsx:36-66` renders running balance beneath every amount ("—" while pending), `:90-117` sticky month rails with signed month nets; `HistoryView.tsx:77-89` real CSV export, `:166-175` paged load-more.
- Competitor: every banking/fintech ledger (Cash App, Monzo) shows running balance — it is the ledger grammar.
- Root cause: mobile row grammar was authored before `balanceAfterDisplay` landed; never upgraded.
- Fix: render `balanceAfterDisplay` as muted caption under each amount; group by month with a sticky header showing the month net; add a share-sheet CSV export built from the loaded rows.
- Acceptance: each row shows signed amount + running balance; month headers stick; CSV file downloads/shares.

### W-02 — No payout-methods surface; withdraw destination is `gatewayId · currency · country`, not a recognisable masked account [P1]
- Screens: `frontend/src/screens/WalletScreen.tsx`, `frontend/src/components/withdraw/withdrawViewModels.ts`, `frontend/src/components/withdraw/WithdrawPayoutSection.tsx`
- Evidence: `getWithdrawBankCopy` returns `${gatewayId} · ${currency} · ${countryCode}` (`withdrawViewModels.ts:73-81`) — reads as "stripe · GBP · GB". `providerAccountRef`/`metadata` on `PayoutAccountPayload` (`walletApi.ts:48-59`) are never surfaced. No `Payouts`/`PayoutMethods` route exists in `navigation/types.ts` (only a `payout` contextKind at :434).
- Web parity: `web/src/components/wallet/WalletBalanceHero.tsx:49-60` shows `Barclays •••• 1234 · GBP account` under the balance + a "Payout methods" nav row → `/wallet/payouts` (default selection, add/remove accounts, masked-last4-only).
- Root cause: mobile routes bank capture to Stripe Connect hosted onboarding (correct), but never built the post-onboarding management/identity layer for the connected account.
- Fix: extend the payout-account payload (or read `metadata.last4`/`bank_name`) so the Transfer-to row and hero show `Bank ····1234`; add a lightweight PayoutMethods screen listing connected payout accounts with default/active status.
- Acceptance: a connected account renders as "Bank name •••• last4" in hero + Transfer-to; a Payouts screen exists and lists the connected account.

### W-03 — FlashList with its own fetch + RefreshControl nested inside the wallet ScrollView [P1]
- Screens: `frontend/src/components/wallet/WalletActivitySection.tsx:33`, `frontend/src/components/wallet/WalletTransactionHistory.tsx:225-236`, consumed by `WalletScreen.tsx:237-307`
- Evidence: `WalletActivitySection` embeds `WalletTransactionHistory` — a FlashList with `refreshControl` and an independent `getWalletLedger` fetch — inside the parent `ScrollView` that already has a `RefreshControl`. This is a VirtualizedList-inside-ScrollView (RN logs a warning), two competing pull-to-refresh gestures in one viewport, and a second uncoordinated fetch per mount.
- Web parity: `/wallet` preview renders plain `<li>` rows from the same `buildLedger` source (`WalletView.tsx:55-58,112-117`) — one data path, no nested scroller.
- Root cause: reuse of the full-screen list component as an inline preview.
- Fix: extract a `LedgerRow`/preview variant fed by a shared `useWalletLedger` hook; the wallet preview renders ≤3 static rows + "See all", full list stays on WalletHistoryScreen.
- Acceptance: no nested VirtualizedList warning; one pull-to-refresh; wallet mount issues one ledger fetch.

### W-04 — Wallet hero missing the masked payout account line [P1]
- Screens: `frontend/src/components/wallet/WalletBalanceHero.tsx:34-78`
- Evidence: hero renders "Spendable now" + 1ZE figure + USD-at-par only. No payout destination context anywhere on the wallet home (the seller-earnings row is unrelated).
- Web parity: `WalletBalanceHero.tsx:49-60` — `{bankName} •••• {last4} · {currency} account` directly under the figure, "No payout account yet" when absent.
- Competitor: Cash App/Vinted wallet surfaces always anchor the cash-out destination near the balance — it answers "where does my money go".
- Fix: hydrate the active payout account in `useWalletData` and render the masked account caption under the balance (subject to W-02's payload fix).
- Acceptance: hero shows `Bank ••••last4` when a payout account is active, "No payout account yet" otherwise.

### W-05 — Digital-wallet rows claim "Ready" unconditionally [P2]
- Screens: `frontend/src/screens/PaymentsScreen.tsx:319-341`
- Evidence: Apple Pay / Google Pay rows render `value={t('payments.wallet.ready')}` purely on `allowApplePay/allowGooglePay` policy + `Platform.OS` — no `isPlatformPaySupported`/wallet-provisioning check. On a device without a provisioned Wallet the row still says "Ready".
- Web parity: n/a (native-only surface).
- Fix: gate the "Ready" value on `isPlatformPaySupported()` from `@stripe/stripe-react-native`; fall back to "Not set up on this device".
- Acceptance: unprovisioned device no longer displays "Ready".

### W-06 — Rejected-KYC "Contact support" navigates to the status screen, not support [P2]
- Screens: `frontend/src/screens/KYCVerificationScreen.tsx:391-398`
- Evidence: `accessibilityLabel="Contact support or view status"` / text "Contact support" calls `navigation.navigate('VerificationStatus')` — a status viewer with no support channel. Dishonest action label.
- Fix: route to HelpSupport/Appeal screen, or relabel "View status".
- Acceptance: label and destination agree.

### W-07 — Withdraw form prefills the entire available balance [P2]
- Screens: `frontend/src/screens/WithdrawScreen.tsx:124-127`, `utils/currencyAuthoringFlows.getDefaultWithdrawDisplayAmount`
- Evidence: every mount sets `amount` to the full available balance. On a money-movement surface the destructive-max default makes one-tap drain the wallet the path of least resistance (and hides the input affordance).
- Competitor: fintech withdraw flows default to empty or a suggested partial amount with a "Max" affordance.
- Fix: default to empty with a "Withdraw all" chip that fills the max.
- Acceptance: amount field starts empty; Max chip fills available balance.

### W-08 — Payout history triple-restates "order ledger" [P2]
- Screens: `frontend/src/screens/BalanceHistoryScreen.tsx:146-191`
- Evidence: header title "Payout history" + subtitle "Order ledger" + section eyebrow "ORDER LEDGER" — three restatements of the same label in one viewport (duplicate-headings anti-pattern). Also `hydrate` (68-87) duplicates the anonymous `useEffect` fetch (89-115) verbatim.
- Fix: drop the eyebrow or the subtitle; single-source the fetch into `hydrate` and call it from the effect.
- Acceptance: "order ledger" appears once; one fetch implementation.

### W-09 — Dead bank-form i18n + deep-link-only dead-end screen [P3]
- Screens: `frontend/src/screens/AddBankAccountScreen.tsx`, `frontend/src/i18n/index.ts:1437-1439`
- Evidence: the screen honestly explains bank details are never collected, but `addBank.field.sortCode`/`addBank.placeholder.sortCode`/`addBank.a11y.sortCodeHint` strings still describe a form that no longer exists — copy drift.
- Fix: delete the dead `addBank.field.*` strings.
- Acceptance: no orphan form strings.

## Non-findings (verified good)
- Biometric gates on Wallet, Withdraw, Payments (`WalletScreen.tsx:61-166`, `WithdrawScreen.tsx:62-171`, `PaymentsScreen.tsx:249-276`).
- Withdraw state machine: form → confirm → success + `unknown_outcome` reconciliation (`WithdrawScreen.tsx:99-246`); payout statuses honest — `processing` never claims "paid" (`withdrawViewModels.ts:29-49`); receipt says "Withdrawal requested / Pending review", no fake ETA (`WithdrawSuccessStep.tsx:66-90`).
- Convert + Exchange: server-TTL countdowns, idempotency-keyed quotes, expired-quote auto-refetch with cap, dropped-execute resync via stored quote (`WalletExchangeScreen.tsx:236-453`, `WalletConvertScreen.tsx` step machine) — flagship-grade honesty.
- Card capture is Stripe PaymentSheet — Luhn/brand validation correctly delegated to the provider; only brand+last4+expiry displayed (`AddCardSheet.tsx:105-192`). No raw PAN handling — Luhn non-finding.
- Bank capture is Stripe Connect hosted onboarding — no sort-code field needed in-app; `AddBankAccountScreen` is truthful about it (sort-code validation is a web-fixture-only concern — non-finding).
- KYC: backend-authoritative status, focus + AppState refetch, truthful handoff ("Checking your details" until webhook lands), verified/pending/rejected/expired states all real (`KYCVerificationScreen.tsx`, `VerificationStatusScreen.tsx`); `documentStatus`/`livenessStatus` are real contract fields (`complianceApi.ts:82-87`), not fabricated.
- Money uses `tabular-nums` throughout (`WalletTransactionHistory.tsx:276-282`, `BalanceHistoryScreen.tsx:294-300`, withdraw amounts).
- Empty wallet gate is careful — seller-funds check + seller-fetch-error path prevent a real-balance user seeing "empty" (`WalletScreen.tsx:184-205`).
- Address/payment CRUD with optimistic rollback + confirmation sheets (`PaymentsScreen.tsx:137-208`, `SavedAddressesScreen.tsx`, `AddressFormScreen.tsx` with postcode suggestion + dirty-guard).
