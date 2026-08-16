# Tests, CI and Native Evidence Audit

## Current result

- Frontend typecheck passes.
- Seven targeted product-detail test files pass with 228 tests.
- The complete frontend test suite fails: 19 files and 97 tests failed.
- Backend build passes.
- Backend unit/service suite reports 173 passed and 9 skipped.
- Database/integration surfaces are among the skipped tests.
- The product-detail final report is empty and no complete native screenshot matrix was found.

## Why targeted green is insufficient

The targeted product tests primarily read source files and assert strings, component names or code patterns. They are useful architectural guardrails. They cannot prove:

- hierarchy and crop;
- tap/swipe/pinch behaviour;
- active-index preservation;
- video buffering/backgrounding;
- dock obstruction;
- large-text layout;
- dark-mode aesthetics;
- actual API-state rendering.

## Required test pyramid

### Contract tests

- Validate every detail response against a versioned schema.
- Reject unknown/invalid media and state combinations.
- Ensure nullable values remain nullable.

### Backend integration

- Real PostgreSQL transactions for Buy Now, bidding and Co-Own matching.
- Concurrency, idempotency replay and outbox/inbox tests.
- Object-level authorization and privacy tests.
- Media publish/reorder/freeze/takedown tests.
- Policy quote version/expiry tests.

### Frontend runtime

- Render each family against realistic API fixtures.
- Assert capability-driven controls and denial reasons.
- Simulate realtime events, gaps, reconnect and resnapshot.
- Test mixed media and viewer index continuity.
- Test partial secondary-request failures.

### Native end-to-end

- Navigate from discovery into each detail type.
- Complete permitted buy/bid/order flows.
- Exercise terminal and failure recovery.
- Run with real layout engine and native video.

### Visual regression

- Deterministic fixtures and captured states at required widths.
- Light/dark, normal/large text, reduced motion.
- Mask only nondeterministic areas, never the main transaction state.

## CI gates

No product-detail closure merge when:

- the complete frontend suite is red;
- applicable backend integration tests are skipped;
- schema drift exists;
- screenshot manifest is incomplete;
- accessibility check has critical findings;
- dependency/security policy fails;
- final report contains “TBD” for a required state.

## Evidence naming

`<family>__<role>__<state>__<width>__<theme>__<text>__<motion>.png`

Example:

`auction__bidder__live-outbid__390__dark__large__reduced.png`

Every image must map to an acceptance ID and exact fixture/version.

