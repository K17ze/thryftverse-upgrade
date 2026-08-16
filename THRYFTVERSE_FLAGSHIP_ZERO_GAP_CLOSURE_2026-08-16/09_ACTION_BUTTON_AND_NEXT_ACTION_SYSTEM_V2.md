# Action Button & Next-Action System V2

## Principle

The button component should render a decision already made by the domain layer. It should not decide business priority itself.

## Replace presentation-only action items

```ts
type ActionSemanticRole =
  | 'primary_next'
  | 'secondary'
  | 'tertiary'
  | 'recovery'
  | 'destructive';

interface ResolvedAction {
  id: string;
  semanticRole: ActionSemanticRole;
  label: string;
  subtitle?: string;
  icon?: React.ReactNode;

  enabled: boolean;
  unavailableReason?: string;

  requiresOnline?: boolean;
  idempotencyKey?: string;
  analyticsKey: string;

  confirmation?: {
    title: string;
    body: string;
    confirmLabel: string;
    consequence?: string;
    destructive?: boolean;
  };

  accessibilityLabel: string;
  accessibilityHint?: string;

  execute: () => Promise<void> | void;
}
```

## Enforced invariants

1. Maximum one `primary_next` in a cluster.
2. Destructive action never becomes primary simply because no other action exists.
3. Recovery action does not visually compete with success path unless user is in an exception state.
4. Disabled action explains why if the reason is not obvious.
5. High-consequence action has outcome-oriented confirmation.
6. Transaction mutation has idempotency and server validation.
7. Label is verb + object/outcome.

## Canonical order action resolver

One function/service must drive:
- Order Detail footer;
- Orders list row CTA;
- Chat transaction strip;
- notification deep-link;
- Seller Hub queue;
- relevant home activity modules.

Pseudo:

```ts
resolveOrderNextAction(order, role) {
  if (order.issue?.open) return resolveCaseAction(order, role);

  if (role === 'seller') {
    if (order.fulfilment.status === 'required')
      return action('dispatch', 'Ship item', 'SellerFulfilment');

    if (order.fulfilment.status === 'label_ready')
      return action('show_qr', 'Show drop-off QR', 'SellerFulfilment');

    if (['carrier_accepted','in_transit','out_for_delivery'].includes(...))
      return action('track', 'Track parcel', 'OrderTracking');
  }

  if (role === 'buyer') {
    if (order.status === 'delivered' || order.inspection?.open)
      return action('inspect', 'Check your item', 'OrderInspection');

    if (order.fulfilment.isTrackable)
      return action('track', 'Track parcel', 'OrderTracking');
  }

  return null;
}
```

## Visual tiers

### Primary
- solid brand/ink depending theme;
- no gratuitous gradient;
- one per set;
- 48–56 visual height if full-width transactional CTA;
- shadow only when needed to separate a floating surface.

### Secondary
- quiet tonal surface or subtle outline;
- same target size;
- never stronger than primary.

### Tertiary
- text/icon row;
- no container unless target needs invisible hit area.

### Destructive
- red text/outline by default;
- solid red only inside explicit destructive confirmation or danger zone.

## Haptics

- light selection for toggles/filters;
- medium for confirmed meaningful local actions;
- success haptic after server-confirmed state transition;
- heavy only for intentionally weighty interactions;
- no haptic on every ordinary primary tap.

## Sticky footer

Current always-visible top divider should become scroll-edge-aware:
- no strong line when footer is visually separated by whitespace;
- hairline/tonal lift appears as content moves underneath;
- safe-area aware;
- keyboard aware;
- width constrained on tablet/desktop;
- no duplicate CTA already visible immediately above.

## Microcopy examples

Bad → better:
- `Mark shipped` → `Ship item` (before label) / `Add tracking & confirm dispatch` (manual)
- `Confirm delivery` → `Check your item` then `Everything is OK`
- `Manage` → `Edit delivery`
- `Continue` → `Review order`
- `Done` → `Save changes`
