# Performance and perceived speed

## Principle
A flagship UI feels fast because geometry is stable and feedback is immediate.

## Feed
- one active video player;
- prefetch next media, not entire feed;
- stable keys;
- FlashList/masonry recycler correctness;
- media dimensions known before render;
- no image decode causing tile jump.

## Creator
- keep canvas gesture updates on UI thread;
- history commits on gesture end;
- don't serialize full document on every drag frame;
- pre-render video poster frames;
- unload invisible video players.

## Chat
- pagination without reflow;
- composer not rerendering full message list;
- attachment upload state isolated;
- keyboard 60fps target.

## Auction
- countdown should not rerender entire page each second;
- isolate timer;
- polling updates only changed state;
- no haptic/animation from background updates.

## Product
- media first;
- parallel supporting queries;
- secondary sections should not block first meaningful paint.

## Perceived-speed anti-patterns to eliminate
- fixed 350/400/800ms refresh completion after data already settled;
- artificial progress percentages without server meaning;
- skeleton for content already cached;
- entrance animation delaying interaction;
- full-screen loading for a secondary request.

## Metrics
Collect:
- TTI;
- first media render;
- scroll dropped frames;
- image error rate;
- search first-result latency;
- composer keyboard latency;
- bid submit-to-confirm;
- publish submit-to-view;
- checkout pay-to-order confirmation.

## Acceptance
Use p50/p95 targets and verify on a mid-range Android device, not only simulator.
