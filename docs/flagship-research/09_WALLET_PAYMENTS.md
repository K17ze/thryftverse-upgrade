# 09 — Wallet, Payments, Withdraw, Earnings & Postage

**Flagship research dossier — ThryftVerse native mobile app**
**Department scope:** WalletScreen, WalletActivityScreen, WalletConvertScreen, WithdrawScreen, PaymentsScreen, BalanceHistoryScreen, AddBankAccountScreen, SavedAddressesScreen, AddressFormScreen, PostageScreen, SellerEarningsScreen, DistributionHistoryScreen, `components/wallet/*`
**Date:** August 2026

---

## 1. 2026 Competitor Benchmark

The 2026 fintech wallet landscape has converged on a small set of hard-won conventions. The most useful references for ThryftVerse are not crypto wallets — they are the managed-payout surfaces that marketplace sellers already trust with real money: eBay Managed Payments, Stripe Express, Payoneer, and the consumer neobanks (Revolut, Monzo, Wise) that have set the visual bar for balance presentation.

### 1.1 Balance hierarchy — one number dominates

Every benchmark wallet in 2026 leads with a single, unambiguous "available now" figure. eBay's Payments tab separates **Processing funds** from **Available for payout** with a clear two-tier hierarchy and never blends them into a single headline. Revolut and Monzo show the spendable balance as the largest typographic object on the screen, with sub-balances (pots, pending, reserved) receding below. The Mara Bureau analysis of 50 fintech products (2026) found that the strongest wallets use **one dominant number, one eyebrow label, and a single secondary line** — anything more above the fold competes with the user's primary question: *"How much can I actually use?"*

The counter-example is the UPI-on-wallet case study (Das, March 2026), where stakeholders pushed to show FASTag balance, UPI balance, and a combined total simultaneously. The design team rejected this: showing three balances on one payments page confused which balance would actually be debited at checkout. The lesson is directly relevant to ThryftVerse, which currently shows `available`, `settledClaim`, `reservedForOrders`, `redemptionInProgress`, `otherHolds`, `pendingDeposit`, `unsettledSaleProceeds`, and `withdrawable` on a single scroll.

### 1.2 Activity clarity — one ledger, grouped by day, direction-first

The 2026 consensus on transaction history is unanimous across Mara, Skins Factory, and Eleken guides: **one canonical ledger, grouped by day, with direction communicated by icon and colour before the user reads a word**. eBay's Payments tab is the canonical marketplace example — every money movement (sale, refund, payout, fee, hold) appears in a single timeline with clear credit/debit colour coding. Revolut's approach groups by day with sticky section headers and uses filled glyphs for inflows, outline glyphs for outflows.

The critical insight from the iGaming cashier UX research (iGamingPaymentGateway, 2026) is that a withdrawal is a **9-state machine**, not a single screen: initiation → method confirm → amount entry → risk review → player confirm → processing → settled → failed → retry. Each state needs its own visible posture. ThryftVerse's WithdrawScreen already implements a `form → confirm → success` state machine, which is good, but the intermediate states (processing, partial failure, retry) are thinner than the benchmarks demand.

### 1.3 Trust signals — placed at the moment of fragility, not in a footer

The Mara 50-product analysis found that **in 41 of 50 fintech products, trust signals (encryption notices, regulatory registrations, partner bank logos) appeared in the footer or on a dedicated security page**. In fewer than a third did they appear at the specific moment where trust is most fragile — the document upload, the first transaction confirmation, the bank-account-linking step. The finding is unequivocal: trust in fintech is not a page, it is a moment-by-moment condition.

The Skins Factory guide (2026) reinforces this: *"Trust is a design decision, not a legal disclaimer… It gets answered by layout density, typography weight, colour precision, and the quality of every micro-interaction."* The duiverse analysis adds that **consistency across every screen functions as a security signal** — inconsistent formatting or confirmation patterns quietly erode trust in how money is being handled. Numbers representing money need identical formatting everywhere: same decimal precision, same currency display, on every screen.

### 1.4 Withdrawal friction — the right amount, in the right place

The 2026 consensus is that **friction on high-stakes actions is a trust mechanism, not a UX failure**. The Skins Factory guide: *"A wire-transfer confirmation screen with a one-second delay and a clear summary isn't bad UX. It's a signal that the system is being appropriately careful with consequential actions. The mistake isn't the friction. It's where it's applied."* Friction on routine tasks (checking a balance, logging in) is a failure; friction on transfers, account changes, and large withdrawals is correct.

eBay's payout flow is the most relevant marketplace benchmark. As of August 2025, qualified private sellers receive funds within 24 hours; business sellers get daily/weekly/fortnightly/monthly scheduled payouts to a linked bank account. The flow is: **Processing funds → Available for payout → Funds sent → bank clearance (1–3 days)**. Each stage has its own label and its own clock. On-demand express payouts (≈30 minutes) are available to eligible sellers on slower schedules. The key UX principle: the seller always knows which stage their money is in and whether to wait or to act.

### 1.5 The "my money" feeling — labour illusion and witnessed completion

The Aufaitux payment-experience research (2026) identifies a counterintuitive principle: **a transaction that completes too quickly can feel like it failed**. Money is invisible — you cannot see it leave or arrive. The interface carries the full weight of making the transaction feel real. Harvard researchers call this the "labour illusion": we trust services more when we can see the work being done. The best payment surfaces show a brief, visible processing state with a clear transition to a receipt — not an instant jump that leaves the brain nothing to hold onto.

---

## 2. Psychology & Principles

### 2.1 Financial trust as a moment-by-moment condition

Trust in a financial product is not established once at onboarding and then assumed. The Mara research and the UXmatters principles (2026) both frame trust as a **state that must be re-earned at every consequential moment**: revealing a balance, initiating a withdrawal, linking a bank account, confirming a conversion. Each of these is a point where the user's subconscious question — *"can I trust this with my money?"* — gets re-asked. The answer is delivered by layout density, typography weight, colour precision, micro-interaction quality, and the presence of substantiating evidence (safeguarding partner, regulatory reference, evidence URL) at the exact moment of doubt.

### 2.2 Mental accounting — users segment money by purpose, not by ledger

Thaler's mental accounting theory (1985, 1999), validated in the 2026 app-based investor study (Bengaluru, n=472), shows that people do not treat money as fungible. They maintain mental accounts: "spendable now", "pending from sales", "reserved for orders", "money I've already withdrawn". A flagship wallet must **mirror these mental accounts honestly** — showing the user's own categorisation back at them, not forcing everything into one number that hides the structure they care about. The corollary: too many sub-balances overwhelm; the right number is the number the user actually reasons about (typically 3–4: available, pending, reserved, withdrawable).

### 2.3 Loss aversion — withdrawals feel like losses, conversions feel like risk

The 2026 behavioural-finance research found Gen Z exhibits 2.3× higher loss-aversion intensity than Gen X in app-based investing. Losses loom approximately 2.25× larger than equivalent gains (Kahneman & Tversky, 1979). For ThryftVerse this has two direct implications:

1. **Withdrawals feel like losing money**, even though the user is gaining it in their bank account. The flow must compensate with a clear, confident receipt that reframes the outflow as a gain ("£X is on its way") rather than a loss ("£X withdrawn").
2. **Conversions (1ZE → fiat) feel like risk** because the user is exchanging one asset for another at a floating rate. The rate timestamp, the fee disclosure, and the review step are not bureaucratic — they are the trust scaffolding that makes the user willing to execute.

### 2.4 Transparency and the "my money" feeling

The Sue Behavioural Design analysis (2026) identifies that saving/transferring money requires "accepting the felt loss of a transfer" and "trusting a new platform with money that feels very real". The flagship wallet must cultivate the **"my money" feeling**: the user must feel ownership and control at all times. This means: balances are always current (or honestly marked as stale), privacy eye is available, every movement has a receipt, every hold has a reason and a release date, and the user can always see where their money is in its journey.

### 2.5 Progressive disclosure of sensitive data

Financial details (full bank account number, card PAN, payout account IDs) should be **progressively disclosed**: masked by default, revealed on explicit user action (tap to reveal), and re-masked on navigation away. This is both a security principle (shoulder-surfing protection) and a trust principle — the user feels in control of their own data. The current `balanceHidden` privacy eye on WalletScreen is the right pattern; it should be extended consistently across all surfaces that display sensitive financial identifiers.

---

## 3. Current ThryftVerse Audit

### 3.1 WalletScreen.tsx — strong foundation, sub-balance overload

**Strengths:**
- Biometric gate before revealing any wallet content (`WalletScreen.tsx:56-59`, `:244-262`) — correct trust placement per Mara research.
- Flat balance hero with largest text on screen (`:409-453`), tabular-nums, privacy eye toggle (`:413-425`).
- Real balance hydration from `getIzePosition`, `getWalletSnapshot`, `getSellerWalletBalances` (`:108-112`) — no fabricated balances.
- Safeguarding disclosure with evidence/terms links (`:604-641`) — substantiated trust signal, not theatre.
- Reconciliation banner (`:390-393`) and offline banner (`:389`) — honest state communication.
- Loading skeleton matches final layout (`:265-308`).

**Defects:**
- **Sub-balance overload.** The screen renders up to 8 distinct sub-balance rows: `available`, `reservedForOrders`, `redemptionInProgress`, `otherHolds`, `pendingDeposit`, `unsettledSaleProceeds`, `withdrawable`, plus a `settledClaim` total (`:536-585`). This violates the Mara finding that strong wallets use one dominant number and a single secondary line. The user cannot answer "how much can I use?" at a glance once they scroll past the hero.
- **"Settled claim" terminology is opaque.** The label "Settled claim" (`:538`) is internal accounting language, not the user's mental account. The user thinks "my 1ZE" or "my balance", not "settled claim".
- **Two parallel balance systems.** The 1ZE sub-balances (`CoOwn1ZeBalance`) and the seller wallet balances (`sellerBalances` with `availableGbp`/`pendingGbp`/`heldInReserveGbp`) are shown as separate sections (`:523-534`, `:536-585`) without a unified hierarchy. The user sees two different money stories on one screen.
- **Recent activity is duplicated.** `WalletTransactionHistory limit={20}` is embedded on the wallet home (`:600`) AND the full version lives on `WalletActivityScreen`. This is acceptable (preview + full), but the preview has no "see all" affordance above the list header — the "See all" link is a small text button (`:597`) that competes with the list.

### 3.2 WalletActivityScreen.tsx — clean but minimal

**Strengths:**
- Single canonical ledger with ALL/1ZE/FIAT filter chips (`:28-32`) — matches the 2026 consensus.
- Delegates to `WalletTransactionHistory` which groups by day and uses direction-aware icons (`WalletTransactionHistory.tsx:32-42`, `:104-108`).
- Hairline-selected filter chip grammar (`:62-87`).

**Defects:**
- **No search, no date range, no amount filter.** The 2026 benchmarks (Revolut, Monzo, eBay) all offer search and date filtering on transaction history. ThryftVerse only offers asset-type filters.
- **No transaction detail view.** Tapping a transaction row does nothing (`WalletTransactionHistory.tsx:110-123` — the row is a `View` with `accessibilityRole="text"`, not a `Pressable`). The user cannot see the full breakdown of a single transaction (reference, fee, counterparty, settlement time).
- **No export.** Marketplace sellers need to export transaction history for accounting. This is a dead capability in the current surface.

### 3.3 WalletConvertScreen.tsx — solid flow, visual inconsistency

**Strengths:**
- Full 5-step state machine: amount → review → authenticating → executing → receipt (`:51`, `:477-780`).
- Biometric authentication before execution (`:160-169`).
- Live fee calculation with rate timestamp (`:534-565`).
- Receipt with full conversion details (`:695-738`).
- Error state with retry/cancel (`:744-779`).

**Defects:**
- **Visual inconsistency with the rest of the wallet.** This screen uses a custom `SafeAreaView` + `StatusBar` header (`:424-448`) instead of `FlagshipHeader` used by every other wallet screen. It uses `Elevation.subtle` shadows on cards (`:938`, `:1020`, `:1162`) while WalletScreen uses flat canvas + hairlines. This violates the duiverse finding that **consistency across every screen functions as a security signal**.
- **Step indicator uses numbered dots** (`:277-335`) — a pattern not used elsewhere in the wallet department, adding visual noise.
- **No "max" button** on the amount input — the user must manually type their full balance, a friction point on a high-stakes action.
- **Hardcoded 2% fee rate** (`CONVERT_FEE_RATE = 0.02`, `:49`) — not sourced from the backend, so the displayed fee could diverge from the actual charged fee. This is a truthfulness risk per AGENTS.md §11.

### 3.4 WithdrawScreen.tsx — real integration, friction gaps

**Strengths:**
- Biometric gate (`:85-88`, `:485-504`).
- Real Stripe Connect integration with onboarding link, status polling, and payout account creation (`:250-309`).
- Country capability policy enforcement (`:195`, `:197-205`, `:401-408`).
- FX quote for non-GBP payouts (`:412-420`).
- Idempotency key per payout request (`:432`, `:444`).
- Success receipt with reference, amount, currency, estimated arrival (`:531-600`).
- Confirmation step with full summary before execution (`:604-673`).

**Defects:**
- **No "max" button** on amount entry — same friction as convert.
- **Estimated arrival is hardcoded "3–5 working days"** (`:586`, `:659`, `:698`) regardless of payout method, currency, or region. eBay varies this by rail (instant debit card vs. bank ACH). This is a truthfulness gap if the actual arrival differs.
- **Fee is hardcoded to £0.00** (`:656`: `formatFromFiat(0, 'GBP', ...)`). The confirmation step shows "Fee: £0.00" which may be true today but is a fabricated value if the backend ever introduces withdrawal fees. This should come from the backend, not be hardcoded.
- **No payout status tracking after submission.** The success screen says "We'll notify you when the payout is processed. You can track the status in your wallet activity" (`:593-595`), but there is no dedicated payout-status surface. The user must find the payout in the general activity ledger, which does not show processing/sent/cleared stages.
- **`getDefaultWithdrawDisplayAmount` auto-fills the amount** (`:91-93`) to the full available balance. This is dangerous — a single tap on "Review withdrawal" could initiate a full-balance withdrawal. eBay requires explicit amount entry for on-demand withdrawals.

### 3.5 PaymentsScreen.tsx — card management, trust note placement

**Strengths:**
- Biometric gate (`:50-53`, `:263-282`).
- Real backend sync of payment methods (`:64-102`).
- Card brand detection with brand-coloured icons (`:55-62`).
- Default method management with optimistic update and rollback (`:124-145`).
- Trust note: "Thryftverse stores provider references and limited display details, not card numbers or security codes" (`:451-456`).

**Defects:**
- **Trust note is at the bottom of the screen** (`:449-457`), exactly the "footer placement" that the Mara research identifies as the misplaced-trust-signal anti-pattern. It should appear at the Add Card moment, not after the user has already added cards.
- **Card-on-card composition.** The "Primary Method" card (`:349-400`) contains a nested `AnimatedPressable` "Manage" action (`:372-380`) — a card inside a card with no distinct state boundary. This violates AGENTS.md §4 "No card-on-card composition".
- **`useBalance` toggle** (`:405-415`) controls whether "Thryftverse Balance" is applied to purchases, but this setting lives only in local store (`paymentPreferences`). There is no indication the backend is aware of this preference. If the backend checkout does not read this flag, the toggle is a fabricated control per AGENTS.md §11.
- **No card expiry display.** The card row shows label and details but no expiry date, so the user cannot tell when a card is about to expire.

### 3.6 BalanceHistoryScreen.tsx — weak hero, no pagination

**Strengths:**
- Real transaction hydration from `listUserTransactions` (`:55-74`).
- Direction-aware icon and colour mapping (`:20-36`).
- Loading and empty states (`:86-95`).

**Defects:**
- **Hero card shows "N transactions" and "Last N records"** (`:104-110`) — a redundant count that tells the user nothing useful. The 2026 benchmarks show net flow (total in minus total out) or available balance as the hero metric.
- **Hardcoded limit of 50, offset 0** (`:64`: `listUserTransactions(currentUser.id, 50, 0)`) — no pagination, no "load more". A seller with 200 transactions can only see the first 50.
- **No transaction detail view.** Same as WalletActivityScreen — rows are non-tappable.
- **Duplicate ledger.** This screen shows commerce transactions (`listUserTransactions`) while WalletActivityScreen shows wallet ledger entries (`getWalletLedger`). The user has two history screens with different data, different icons, different labels, and no clear relationship between them. This is the duplicate "History/Activity terminology" that the WalletActivityScreen header comment (`:8-12`) explicitly says should be removed.

### 3.7 AddBankAccountScreen.tsx — fabricated local save

**Strengths:**
- Country capability check before showing the form (`:84`, `:163-170`).
- Sort code formatting (`:75-80`).
- Field validation (`:82`).

**Defects:**
- **Fabricated local save on network error.** `handleSaveBank` (`:94-140`) catches network errors and calls `savePaymentMethod(localPaymentMethod)` with a locally-constructed method, showing "Bank account saved locally. Backend sync unavailable." (`:128-129`). This is a **fabricated persistence** per AGENTS.md §11 — the bank account is not actually saved anywhere the withdrawal system can use it. The user believes they have a payout method; they do not.
- **`userId` fallback to `'u1'`** (`:109`: `currentUser?.id ?? 'u1'`) — a hardcoded fake user ID that could submit a bank account under the wrong user if `currentUser` is null. This is a fabricated ID per AGENTS.md §11.
- **No biometric gate** — this screen handles bank account details but does not require re-authentication, unlike Wallet, Withdraw, and Payments screens.
- **"Bank-level encryption" trust note** (`:253-258`) is generic marketing copy, not a substantiated signal (no partner name, no regulatory reference).

### 3.8 SavedAddressesScreen.tsx — solid list, store-fallback risk

**Strengths:**
- Full state machine: loading / populated / empty / error (`:30`).
- Real backend sync with refresh (`:62-109`).
- Default address badge and selection (`:197-210`).
- Delete confirmation with optimistic removal and rollback (`:115-170`).
- Skeleton matching final layout (`:298-309`).

**Defects:**
- **Store-fallback on backend failure** (`:98-103`): if the backend fails, the screen falls back to showing the single `savedAddress` from local store as "populated". This could show a stale or deleted address as if it were current — a truthfulness risk.
- **Card-on-card in address cards** (`:201-253`): each address is a card containing a header row with badge + actions, then a body. The header actions (Edit text, trash icon) sit inside the card with no state boundary — the card is both a display surface and an action container.

### 3.9 AddressFormScreen.tsx — strong form, edit-via-create-then-delete

**Strengths:**
- Full field validation with inline errors (`:119-140`, `:507-580`).
- UK postcode autocomplete suggestion (`:200-222`).
- Dirty-state guard with discard confirmation (`:264-290`).
- Keyboard-aware scroll with field-to-field navigation (`:468-689`).
- Country picker bottom sheet (`:720-727`).

**Defects:**
- **Edit is implemented as create-new-then-delete-old** (`:333-363`) because "no PATCH available" (`:334`). This means a failed delete leaves the user with two addresses (the old one and the new one), and the toast honestly admits this (`:359-361`). But the bigger issue: if the create succeeds and the app crashes before the delete, the user has duplicate addresses. This is an architectural debt that should be fixed at the API layer (add PATCH), not compensated for in the UI.
- **`isDefault: true` hardcoded** in `addressInput` (`:329`) — every new/edit address is forced to default, removing the user's ability to have a non-default address. This is a fabricated control: the "default" concept exists in the UI but the user cannot actually choose.

### 3.10 PostageScreen.tsx — carrier list, dead trust style

**Strengths:**
- Real carrier hydration from country capabilities (`:55-87`).
- Carrier selection with radio buttons (`:156-174`).
- Free shipping and bundle discount toggles (`:180-201`).

**Defects:**
- **`deliveryTrust` and `deliveryTrustText` styles are defined but never used** (`:283-299`) — dead code indicating a trust signal was planned and removed, leaving no trust signal on the postage surface.
- **Carrier prices are "from" prices** (`:168-170`) — the actual postage cost for a specific item is not shown here, which is correct (this is a preferences screen), but the "from" label could mislead a seller into thinking these are fixed costs.
- **No link to the postage cost calculator** — the footer note says "Override postage for individual items when listing" (`:204-207`) but there is no navigation to the listing flow from this screen.

### 3.11 SellerEarningsScreen.tsx — strong release schedule, no detail drill-in

**Strengths:**
- Real seller wallet balances from `getSellerWalletBalances` (`:67-75`).
- Available / Pending / In-reserve three-column summary (`:159-190`) — matches mental accounting.
- Per-order release schedule with exception/disputed status handling (`:226-265`).
- "Releases in Nd" countdown (`:227-235`).
- Withdraw CTA on available proceeds (`:192-205`).

**Defects:**
- **No tap-through to order detail.** Each schedule item (`:238-263`) is a `View`, not a `Pressable`. The seller cannot tap a pending item to see the order, the buyer, the delivery status, or the dispute details.
- **No total earnings (lifetime or period).** The summary shows current balances but not cumulative earnings — a metric every marketplace seller wants.
- **No filter by status** (pending vs. exception vs. disputed) — a seller with 50 pending orders and 2 disputes cannot isolate the disputes.

### 3.12 DistributionHistoryScreen.tsx — DRIP enrollment, raw asset IDs

**Strengths:**
- Real distribution hydration from `fetchCoOwnDistributions` (`:68-85`).
- DRIP enrollment with optimistic update and rollback (`:102-117`).
- Per-distribution detail: units at record, per-unit amount, reference, status (`:250-271`).
- Total received summary (`:119`, `:165-173`).

**Defects:**
- **Raw asset IDs displayed to users** (`:196`: `assetId.slice(0, 20)…`) — internal identifiers shown as the asset name. This is a truthfulness/UX failure: the user sees `asset_abc123def456ghi…` instead of "Rolex Submariner 2024".
- **DRIP toggle uses raw `Switch`** (`:204-211`) instead of the `SettingsCell` toggle pattern used elsewhere — visual inconsistency within the department.
- **No filter by asset or date range** — a user with distributions across 10 positions sees one flat list.

### 3.13 components/wallet/WalletTransactionHistory.tsx — direction-aware, non-tappable

**Strengths:**
- Direction-aware icon colour: inflows success, outflows textPrimary, neutral brand (`:104-108`).
- Day-grouped sections with sticky headers (`:44-55`, `:126-130`).
- Skeleton rows matching final layout (`:132-147`).
- Offline banner and error retry (`:149-162`).

**Defects:**
- **Non-tappable rows** (`:110-123`) — the single most requested capability in 2026 transaction UX. Every benchmark allows tap-to-detail.
- **No pagination / infinite scroll** — fetches a fixed `limit` (default 100) with no load-more.
- **Relative time only** (`:117`: `formatRelativeTime`) — no absolute date fallback, so old transactions show "2 months ago" instead of "15 Jun".

### 3.14 components/wallet/AddMoneySheet.tsx — real Stripe flow, receipt gap

**Strengths:**
- Two real funding sources: card/Apple Pay via Stripe PaymentSheet, and fiat balance via `buyIze` (`:127-258`).
- Idempotency key per top-up (`:146-152`).
- Live fee calculation with `LOAD_IZE_FEE_RATE` (`:103-107`).
- Receipt state with success icon (`:294-313`).

**Defects:**
- **Card receipt says "pending confirmation"** (`:216-218`) but the sheet closes immediately — there is no persistent pending state the user can return to. If the Stripe webhook is delayed, the user sees "pending" in the sheet, closes it, and has no way to check whether it settled.
- **`LOAD_IZE_FEE_RATE` imported from `tradeFlow`** (`:52-54`) — a shared constant, but not fetched from the backend per-transaction. Same truthfulness risk as the convert fee.
- **No "max" button** on amount input.

---

## 4. Micro Improvements

1. **Add "Max" buttons** to every amount-entry surface: `WalletConvertScreen` amount input (`:507`), `WithdrawScreen` amount input (`:745`), `AddMoneySheet` amount input (`:376`). One-tap fill to available balance, with the amount still editable.

2. **Make transaction rows tappable** in `WalletTransactionHistory.tsx` (`:110-123`) — wrap the row in `Pressable`, navigate to a new `TransactionDetail` screen showing full breakdown (reference, fee, counterparty, settlement timestamp, related order).

3. **Remove the auto-fill full-balance default** in `WithdrawScreen` (`:91-93`). Default to empty amount, requiring explicit entry. A full-balance withdrawal should be a deliberate choice, not a tap-away default.

4. **Move the PaymentsScreen trust note** (`:449-457`) to the `AddCardSheet` moment — display "Thryftverse stores provider references, not card numbers" inside the add-card flow where trust is fragile, not at the bottom of the populated payments screen.

5. **Flatten the PaymentsScreen primary card** (`:349-400`) — remove the nested `AnimatedPressable` "Manage" action and make the whole card tappable with a single chevron, eliminating card-on-card.

6. **Replace "Settled claim" terminology** in `WalletScreen.tsx` (`:538`, `:556`) with user language: "My 1ZE" or "Total 1ZE". Keep the sub-balance rows but collapse the non-zero ones into a single expandable section rather than always rendering all 8.

7. **Add card expiry display** to `PaymentsScreen` card rows — show "Expires 08/27" under the card details so the user can proactively update expiring cards.

8. **Add absolute date fallback** to `WalletTransactionHistory.tsx` (`:117`) — show relative time for <7 days, absolute date for older.

9. **Replace raw asset IDs** in `DistributionHistoryScreen.tsx` (`:196`) with asset names fetched from the position data.

10. **Add search and date filtering** to `WalletActivityScreen.tsx` — a search bar and a date-range picker in the header, matching the 2026 benchmark pattern.

11. **Hardcode removal: source fees from backend.** `CONVERT_FEE_RATE` (`WalletConvertScreen.tsx:49`) and the `£0.00` withdrawal fee (`WithdrawScreen.tsx:656`) must come from the backend quote, not constants. This is an AGENTS.md §11 truthfulness requirement.

12. **Add biometric gate to `AddBankAccountScreen`** — it handles bank account details and should require re-authentication like every other sensitive financial surface.

13. **Remove the `'u1'` fallback** in `AddBankAccountScreen.tsx:109` — if `currentUser` is null, block the save and show a sign-in prompt.

14. **Remove the fabricated local save** in `AddBankAccountScreen.tsx:128-129` — on network error, show an honest error and retry, not a fake "saved locally" success.

15. **Unify `WalletConvertScreen` header** to use `FlagshipHeader` instead of the custom `SafeAreaView` + `StatusBar` (`:424-448`), and remove `Elevation.subtle` shadows in favour of flat canvas + hairlines to match the rest of the wallet department.

---

## 5. Macro Improvements

### 5.1 Unified wallet architecture — one balance hierarchy, two ledgers

The current wallet has two parallel balance systems (1ZE sub-balances and seller GBP balances) and two parallel history screens (`WalletActivityScreen` via `getWalletLedger` and `BalanceHistoryScreen` via `listUserTransactions`). The flagship architecture should be:

- **One balance hierarchy** on `WalletScreen`: a single "Available now" hero (the spendable number), a single "Pending" section (all pending money: pending deposits, unsettled sale proceeds, in-reserve), and a single "Reserved" section (all held money: reserved for orders, other holds). Merge the 1ZE and seller-GBP views into one unified hierarchy with currency-aware formatting. The user has one money story, not two.
- **Two ledgers, clearly named:** "Wallet activity" (1ZE + fiat money movement via `getWalletLedger`) and "Payout history" (commerce transactions via `listUserTransactions`). Rename `BalanceHistoryScreen` to `PayoutHistoryScreen` (its header already says "Payout history" at `:80`, so the route name is the only mismatch). Cross-link them: a payout in wallet activity should link to the payout-history entry, and vice versa.

### 5.2 Trust layer — substantiated signals at moments of fragility

Implement a systematic trust-signal placement audit across the department:

- **At balance reveal** (WalletScreen): safeguarding partner name + evidence URL (already present at `:604-641`, keep).
- **At add-money** (AddMoneySheet): "Stripe-secured payment" with Stripe logo at the confirm step.
- **At withdraw** (WithdrawScreen): "Verified payout profile" with payout partner name at the confirm step (`:604-673`). Currently the destination label is `${payoutAccount.gatewayId} · ${payoutAccount.currency}` (`:606`) — replace the internal `gatewayId` with a human-readable partner name ("Stripe" / "Payoneer").
- **At add-card** (AddCardSheet / PaymentsScreen): "We store provider references, not card numbers" — move from footer to the add moment.
- **At add-bank** (AddBankAccountScreen): replace "bank-level encryption" with the actual safeguarding partner and regulatory reference.
- **At conversion** (WalletConvertScreen): rate timestamp is present (`:557-564`) — add "Reference rate sourced from [provider]" with the provider name.

Every trust signal must be **substantiated** (partner name, regulatory reference, or evidence URL), not generic ("bank-level encryption", "secure").

### 5.3 Activity clarity — tappable rows, detail screen, pagination, export

Build a `TransactionDetailScreen` that any transaction row can navigate to, showing:
- Full amount breakdown (gross, fee, net)
- Reference / provider payout ID
- Counterparty (buyer/seller name or "Platform")
- Settlement timestamp and status
- Related order / listing (with link to order detail)
- Rate applied (for conversions)

Add infinite-scroll pagination to `WalletTransactionHistory` (currently hardcoded `limit=100`). Add CSV/JSON export for seller accounting — a real marketplace need that no current screen addresses.

### 5.4 Withdrawal safety — staged status tracking, explicit amount, real fees

- **Build a payout-status surface.** After a withdrawal, the user should be able to track: Requested → Processing → Sent → Arrived (or Failed). Model this on eBay's four-stage flow. The current "track the status in your wallet activity" (`:593-595`) is insufficient because the activity ledger does not show these stages.
- **Remove the auto-fill full-balance default** (`:91-93`).
- **Source the fee and estimated arrival from the backend** per payout method and region, not hardcoded constants.
- **Add a "Withdraw all" explicit action** (separate button) if the user wants to withdraw everything, with a confirmation step that shows the full amount prominently.

### 5.5 Postage and addresses — complete the trust and navigation loop

- **Add the `deliveryTrust` signal** that is currently dead code (`PostageScreen.tsx:283-299`) — show carrier reliability, tracking availability, and estimated delivery windows as substantiated signals, not empty styles.
- **Add a PATCH address endpoint** at the API layer so `AddressFormScreen` can edit in place rather than create-then-delete (`:333-363`).
- **Let the user choose `isDefault`** rather than hardcoding `isDefault: true` (`:329`).

---

## 6. Flagship Acceptance Criteria

1. **WalletScreen first viewport:** one dominant "Available now" number (40pt+, tabular-nums), one eyebrow label, one secondary line (local-fiat equivalent or pending summary). No more than 3 sub-balance rows visible without scrolling. Privacy eye present and functional.

2. **Every transaction row is tappable** and navigates to a `TransactionDetailScreen` with full breakdown (amount, fee, reference, counterparty, settlement, related order).

3. **Every amount-entry surface** (Convert, Withdraw, AddMoney) has a "Max" button that fills to available balance.

4. **WithdrawScreen never auto-fills the full balance.** The amount field defaults to empty; the user must enter or use "Max".

5. **Withdrawal fee and estimated arrival are sourced from the backend** per payout method, not hardcoded constants. The confirmation step shows real values.

6. **A payout-status surface exists** showing Requested → Processing → Sent → Arrived stages, accessible from the withdrawal receipt and from wallet activity.

7. **Trust signals are present at every moment of fragility:** balance reveal (safeguarding partner + evidence), add-money (Stripe-secured), withdraw (verified payout partner), add-card (provider-reference-not-PAN), add-bank (safeguarding partner + regulatory reference), convert (rate provider + timestamp). No generic "bank-level encryption" or "secure" badges.

8. **No fabricated persistence.** `AddBankAccountScreen` does not save locally on network error. No `'u1'` fallback. Every save either succeeds on the backend or shows an honest error with retry.

9. **No card-on-card composition** anywhere in the department. `PaymentsScreen` primary card is flattened. `SavedAddressesScreen` address cards are flattened.

10. **All financial identifiers are progressively disclosed:** masked by default, revealed on tap, re-masked on navigation. Bank account numbers, payout account IDs, card details.

11. **One canonical wallet ledger** (`WalletActivityScreen`) with search, date filtering, infinite scroll, and CSV export. `BalanceHistoryScreen` is renamed to `PayoutHistoryScreen` and cross-linked.

12. **`WalletConvertScreen` uses `FlagshipHeader`** and flat canvas + hairlines, consistent with every other wallet screen. No `Elevation.subtle` shadows. No custom `SafeAreaView` header.

13. **`SellerEarningsScreen` schedule items are tappable** and navigate to the order detail. Total earnings (lifetime) is shown in the summary.

14. **`DistributionHistoryScreen` shows asset names**, not raw IDs. DRIP toggle uses the `SettingsCell` pattern for visual consistency.

15. **Every fee rate is sourced from the backend** per transaction, not from frontend constants (`CONVERT_FEE_RATE`, `LOAD_IZE_FEE_RATE`, `£0.00` withdrawal fee).

16. **`AddBankAccountScreen` has a biometric gate**, matching Wallet, Withdraw, and Payments screens.

17. **`AddressFormScreen` uses a PATCH endpoint** for edits, not create-then-delete. The user can set `isDefault` explicitly.

18. **`PostageScreen` has a substantiated trust signal** (carrier tracking, delivery windows) — the dead `deliveryTrust` styles are either implemented or removed.

---

## 7. Priority & Sequencing

### Phase 1 — Truthfulness & safety (must ship first)
1. Remove fabricated local save in `AddBankAccountScreen` (`:128-129`); remove `'u1'` fallback (`:109`); add biometric gate.
2. Remove auto-fill full-balance default in `WithdrawScreen` (`:91-93`).
3. Source fees and estimated arrival from backend in `WithdrawScreen` (`:656`, `:586`) and `WalletConvertScreen` (`:49`).
4. Replace raw asset IDs with asset names in `DistributionHistoryScreen` (`:196`).
5. Remove store-fallback in `SavedAddressesScreen` (`:98-103`) — show honest error, not stale data.

### Phase 2 — Trust layer & consistency
6. Move PaymentsScreen trust note into `AddCardSheet`; replace generic "bank-level encryption" in `AddBankAccountScreen` with substantiated partner reference.
7. Replace `gatewayId` with human-readable payout partner name in `WithdrawScreen` confirm step (`:606`).
8. Unify `WalletConvertScreen` to `FlagshipHeader` + flat canvas; remove `Elevation.subtle` shadows.
9. Flatten card-on-card in `PaymentsScreen` primary card and `SavedAddressesScreen` address cards.

### Phase 3 — Activity clarity & detail drill-in
10. Build `TransactionDetailScreen`; make `WalletTransactionHistory` rows tappable.
11. Add infinite-scroll pagination to `WalletTransactionHistory`.
12. Add search and date filtering to `WalletActivityScreen`.
13. Make `SellerEarningsScreen` schedule items tappable to order detail; add lifetime earnings.
14. Rename `BalanceHistoryScreen` route to `PayoutHistoryScreen`; cross-link with wallet activity.

### Phase 4 — Wallet hierarchy & payout status
15. Unify `WalletScreen` balance hierarchy: one hero, one pending section, one reserved section. Collapse sub-balance overload.
16. Build payout-status surface (Requested → Processing → Sent → Arrived).
17. Add "Max" buttons to Convert, Withdraw, AddMoney amount inputs.
18. Add CSV/JSON export to wallet activity and payout history.

### Phase 5 — Postage & addresses
19. Add PATCH address endpoint; refactor `AddressFormScreen` edit flow.
20. Let user choose `isDefault` in `AddressFormScreen`.
21. Implement or remove `deliveryTrust` styles in `PostageScreen`; add carrier tracking and delivery-window signals.

---

*End of dossier. This document is a research input to the flagship upgrade programme, not a completion artifact. Implementation follows the AGENTS.md §10 loop: study → identify highest-impact improvements → implement → render → criticise → correct → render again.*
