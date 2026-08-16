# Wallet, Checkout and Orders

## Code surfaces inspected / affected

- `frontend/src/screens/WalletScreen.tsx`
- `frontend/src/screens/WalletConvertScreen.tsx`
- `frontend/src/screens/CheckoutScreen.tsx`
- `frontend/src/screens/MyOrdersScreen.tsx`
- `frontend/src/screens/OrderDetailScreen.tsx`

## Current diagnosis


Wallet task separation is strong and Phase 3.1 freezes dedicated Convert. Checkout is technically robust but carries a large state machine: order creation, payment sheet, SCA, pending state, wallet balance, address/payment/shipping capability errors and multiple sheets.

The visual task is to make complex payment infrastructure feel calm.


## User psychology / product job


Money UI requires:
- exact amount;
- what happens next;
- trust;
- reversibility/status.

Users become less confident when the interface exposes infrastructure state unless it changes their action.


## Flagship target composition


Wallet:
- available balance;
- primary Add/Withdraw/Convert;
- activity.

Checkout:
- item;
- delivery;
- payment;
- concise total;
- buyer protection;
- Pay.

Orders:
- status;
- object;
- next action.


## Detailed implementation map


1. Wallet home removes secondary financial explanation from first viewport.
2. Convert remains dedicated 5-step; review screen is the decision point.
3. Checkout internal stages map to user states:
   - Preparing payment;
   - Confirm with bank;
   - Confirming;
   - Done/Pending/Failed.
4. Do not show low-level intent/polling concepts.
5. Cost breakdown defaults compact, expands in sheet.
6. Buyer protection appears once near total/pay action, not multiple strips.
7. Address/payment selectors are flat rows.
8. Wallet-balance toggle shows exact effect on amount immediately.
9. Pending payment has durable Order/Payment status route; never trap user on spinner.
10. Order list is image/status/action oriented; no card-per-order if flat grouping works.
11. Seller payout detail uses ledger rows and tabular numbers.


## Micro-detail pass


- Finance uses neutral palette; success green only for completed state.
- Large balance is typographic, not inside gradient card.
- Receipt uses document hierarchy, not celebration screen.


## Acceptance / screenshot QA


Pass scenarios:
- card;
- wallet partial;
- wallet full;
- SCA;
- pending;
- failure;
- offline;
- unavailable shipping.

No ambiguous “success” before server settlement.


## Reference crosswalk


- eBay/marketplace checkout expectation: transparent total + logistics.
- Apple/Android payment conventions: platform-native authentication/payment sheet where possible.
