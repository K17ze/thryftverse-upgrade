# Accessibility, Performance & Device Robustness

## Touch targets

Release target:
- iOS: ≥44×44 pt for all core interactive hit regions;
- Android: ≥48×48dp for touch controls;
- web: WCAG 2.2 AA target-size requirements minimum, with premium controls generally larger.

Visible icon can be smaller than the hit area.

## Screen reader

Every transactional page must announce in this order:
1. status;
2. deadline/ETA;
3. item;
4. next action;
5. consequence/protection where relevant.

Do not make the screen reader traverse decorative dividers and icons.

## Dynamic type

Test:
- default;
- large;
- accessibility large.

Rules:
- buttons can grow vertically;
- labels wrap rather than truncate consequences;
- sticky footer cannot cover content;
- price/title layouts reflow;
- chips that cannot wrap become horizontal scrollers with accessible alternatives.

## Contrast

Meet WCAG/OS guidance. More importantly, never make **status meaning depend on colour alone**. Use text/icon/position.

## Reduced motion

Existing support is positive. Ensure:
- no required information conveyed only by animation;
- shared transitions have nonanimated fallback;
- success/failure state remains perceivable.

## Keyboard / desktop

- visible focus;
- logical tab order;
- Escape closes sheets/dialogs;
- Enter/Space activation;
- hover is supplemental;
- sticky footer width constrained;
- product detail adopts two-column layout when appropriate, not a stretched phone stack.

## Loading

- initial data: skeleton matching final geometry;
- refresh: keep stale content when safe, show subtle refreshing state;
- mutation: action-level loading, not full-page block;
- provider operation >1s: explain the operation;
- never blank the order because parcel events failed.

## Lists

Continue FlashList/virtualisation policy:
- stable keys;
- memoised item renderers;
- image caching;
- avoid nested uncontrolled virtual lists;
- retain scroll position.

## Images/media

- decode to display size;
- progressive/cached loading;
- predictable aspect ratio;
- preserve media index on navigation return;
- video does not auto-play unexpectedly in transaction screens.

## Network resilience

Test high latency, packet loss and intermittent offline:
- no duplicate orders/labels/refunds;
- no impossible local state;
- mutation retries idempotent;
- stale data clearly timestamped;
- reconnect revalidates capabilities.

## Device matrix

At minimum:
- compact iPhone;
- current large iPhone;
- compact Android;
- tall Android;
- foldable/medium window;
- tablet;
- desktop/web narrow and wide;
- dark/light;
- text scaling;
- reduced motion.

## Observability

Client error events include:
- screen;
- order ID hash;
- state revision;
- action ID;
- provider error code;
- connectivity state;
- app version;
- no sensitive address/payment values.
