# Zero-Known-Gap Acceptance Matrix

No “flagship complete” label until every P0/P1 required row is green.

## Journey

- [ ] Buyer-selected shipping service is visible to seller after purchase.
- [ ] Service remains correct after app restart and on a second device.
- [ ] Seller can reach exact shipping task from Order Detail in one primary action.
- [ ] Seller can reach same task from order list, chat strip and notification.
- [ ] No integrated-shipping happy path requires generic manual `Mark shipped`.
- [ ] Seller sees ship-by deadline and consequence.
- [ ] QR and/or printable label is shown according to provider capability.
- [ ] Seller sees practical drop-off instruction.
- [ ] Carrier first scan updates canonical state.
- [ ] Buyer sees in-product tracking with ETA/progress/carrier/events/package.
- [ ] Buyer inspection flow appears after delivery.
- [ ] Early receipt confirmation is not the normal in-transit primary CTA.
- [ ] Issue/return/refund flow has explicit state and deadline.
- [ ] Seller payout state is visible and server-derived.

## State integrity

- [ ] Exactly one canonical client capability resolver.
- [ ] Backend remains authority for allowed transitions.
- [ ] All status-changing mutations idempotent.
- [ ] Duplicate carrier/payment webhooks harmless.
- [ ] Out-of-order carrier events cannot regress state.
- [ ] Cancel/dispatch race has deterministic result.
- [ ] Order carries state revision/version.
- [ ] Purchased shipping snapshot is immutable/auditable.
- [ ] Label ID persists independently of expiring access URL.
- [ ] Multi-device state converges.

## Action architecture

- [ ] Maximum one `primary_next` per action cluster.
- [ ] Primary action label describes outcome.
- [ ] Destructive actions are separated.
- [ ] Hidden overflow does not contain the real primary transactional action.
- [ ] Orders/Chat/Detail/Seller Hub use same action vocabulary.
- [ ] Disabled action has reason when ambiguity exists.
- [ ] Consequential actions explain money/protection effects.

## Visual

- [ ] No unexplained nested card-on-card surfaces.
- [ ] No permanent border that can be replaced by spacing/hierarchy.
- [ ] Primary content visually dominates UI chrome.
- [ ] Radius roles are tokenised.
- [ ] Icon family/weight is consistent.
- [ ] Primary button elevation is intentional, not automatic.
- [ ] Dark mode hierarchy remains calm.
- [ ] Product detail media remains the dominant first viewport.
- [ ] Sticky footer does not visually fight nearby content.

## Accessibility

- [ ] iOS core targets ≥44×44 pt.
- [ ] Android core targets ≥48×48dp.
- [ ] Web meets WCAG 2.2 AA target-size rules.
- [ ] Screen-reader order tested manually.
- [ ] Dynamic type tested at accessibility sizes.
- [ ] Reduced motion tested.
- [ ] Keyboard/focus tested on web/desktop.
- [ ] Status does not depend on colour alone.
- [ ] Consequence copy is not truncated.

## Recovery

- [ ] Invalid buyer address.
- [ ] Label provider timeout.
- [ ] Label provider outage.
- [ ] No printer.
- [ ] QR rejected.
- [ ] Parcel size mismatch.
- [ ] No first scan.
- [ ] Carrier delay/exception.
- [ ] Delivered-but-missing.
- [ ] App killed after payment.
- [ ] App killed after label generation.
- [ ] Offline mutation.
- [ ] Return-label failure.
- [ ] Refund pending/failure.
- [ ] Payout failure.

## Device/performance

- [ ] compact iPhone;
- [ ] large iPhone;
- [ ] compact Android;
- [ ] tall Android;
- [ ] medium/foldable;
- [ ] tablet;
- [ ] web narrow;
- [ ] web wide;
- [ ] light/dark;
- [ ] low bandwidth/latency fault injection.

## Usability acceptance target

For scripted first-time tests, users should be able to answer without Help:
- “What do I do next?”
- “When must I do it?”
- “Which carrier/service do I use?”
- “Where is the label/QR?”
- “How will tracking update?”
- “When do I get paid / when are funds released?”
- “What do I do if something goes wrong?”

A release fails if the answer requires remembering checkout, guessing from status, or discovering a hidden overflow action.
