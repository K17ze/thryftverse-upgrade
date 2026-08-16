# Executive Zero-Gap Audit

## Provisional score

The user’s **6.5/10** assessment is directionally correct. A code-first audit produces this approximate profile:

| Dimension | Current | Flagship target | Main reason |
|---|---:|---:|---|
| Core visual primitives | 7.8 | 9.5 | Good button/tokens, still too much generic chrome in places |
| Product-detail hierarchy | 7.4 | 9.4 | Strong media work; action and detail hierarchy still needs relentless editing |
| Discovery / content-first feel | 7.4 | 9.5 | Pinterest-like direction exists; must keep chrome subordinate |
| Checkout robustness | 7.6 | 9.5 | Considerable payment/idempotency work; post-order shipping continuity breaks |
| Orders list | 6.8 | 9.4 | Good ledger/search/filter; not yet a true action inbox |
| Order detail | 6.1 | 9.5 | Rich data, but wrong primary-action semantics in shipping states |
| Seller fulfilment | 4.9 | 9.6 | Missing buyer-selected service/destination/deadline as first-class guidance |
| Buyer post-purchase | 6.0 | 9.5 | Tracking exists, but inspection/protection/action semantics need tightening |
| Cross-screen state consistency | 5.4 | 9.7 | Multiple capability/state definitions |
| Error recovery | 6.0 | 9.4 | Several fallbacks exist; many provider-specific failures collapse to generic handling |
| Accessibility primitives | 7.8 | 9.6 | Strong target sizes; needs end-to-end focus/dynamic type/screen-reader verification |
| Overall observed product feel | **6.6** | **9.5+** | Architecture now determines perceived quality more than radius/colour |

These are audit scores, not laboratory measurements. Use the acceptance matrix for objective release decisions.

## The ten highest-value findings

### 1. Guided dispatch is not the dominant seller path
`OrderDetailScreen.tsx` can make **Mark shipped** the primary CTA. The more complete `SellerFulfilment` route is exposed in overflow as **Dispatch item**. A flagship marketplace should do the reverse: the primary action must enter the guided, policy-aware dispatch flow.

### 2. Checkout knows more about shipping than the order does
Checkout resolves a quote with quote ID, carrier, label, price, ETA and tracking properties. `CommerceOrder` keeps only a subset such as carrier IDs/provider, quote price and tracking fields. The buyer’s selected service must survive purchase as an immutable fulfilment snapshot.

### 3. The app has competing action/state systems
`orderCapabilities.ts` defines role-aware capabilities, while `OrderDetailScreen.tsx` independently recomputes `canShip`, `canDeliver`, etc. `SellerFulfilmentScreen.tsx` has a still narrower ship eligibility check. Mature apps do not allow different screens to invent lifecycle rules.

### 4. Integrated shipping behaves too much like manual shipping
For an integrated label, carrier acceptance/first scan should drive shipped/in-transit truth. A generic manual “mark shipped” button should be an exception path, not the main success path.

### 5. “Confirm delivery” is too prominent too early
The buyer can confirm while the parcel is only shipped/in transit/out for delivery. Because the confirmation copy says funds are released, this is a high-consequence action. Carrier-confirmed delivery should normally unlock an inspection/acceptance decision; early confirmation belongs in a recovery/exception affordance.

### 6. Seller guidance lacks the questions users actually have
A seller needs to know:
- what shipping service the buyer paid for;
- whether a QR code or printed label is required;
- where to take the parcel;
- ship-by deadline;
- parcel size/weight limits;
- what must be on/in the parcel;
- whether changing carrier loses protection;
- whether a carrier scan automatically updates the order;
- what to do if label generation, address, printer, QR or drop-off fails;
- when money becomes available.

### 7. “Needs action” should become the organising principle
The Orders page already computes actionability. Elevate it into a task-oriented rail/filter and show deadline + exact next action on the order row. A seller should not have to enter every order to find urgent work.

### 8. Commerce should follow users into chat
Vinted explicitly surfaces tracking in the buyer/seller conversation. Thryftverse should have a restrained transaction strip in Chat showing the current milestone and one contextual action: **Ship item**, **Show QR**, **Track parcel**, **Inspect item**, **Resolve issue**, etc.

### 9. Button quality is mainly semantic now
`AppButton` already has good physical targets and interaction feedback. Remaining “button ugliness” is often caused by:
- too many equally strong actions;
- generic labels;
- persistent borders/elevation;
- destructive/lifecycle semantics mixed;
- full-width CTAs where a compact inline action would be calmer;
- hiding the true primary action in overflow.

### 10. Flagship polish requires subtraction
Do not add more cards, gradients, glass, badges or instructional copy to “improve” the UI. Add information *only* where it removes uncertainty. For everything else, reduce chrome and let media, typography, whitespace and one clear action create hierarchy.

## Product-level target

Every transactional screen must let the user answer in roughly one glance:

1. **What happened?**
2. **What do I need to do next?**
3. **By when?**
4. **What happens to my money/protection?**
5. **What happens if something goes wrong?**
6. **Where do I go to recover?**

If a user must inspect an overflow menu, remember a previous choice, infer a shipping rule, or cross-reference a separate page to answer these, the journey is not closure-grade.
