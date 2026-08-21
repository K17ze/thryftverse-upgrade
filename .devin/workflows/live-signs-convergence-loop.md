# Live-Signs Convergence Loop

> **Authority:** This is the canonical execution workflow for every **functional** change in ThryftVerse — backend↔frontend wiring, data truth, cross-surface propagation, production readiness. It is the functional counterpart to the Visual Flagship Convergence Loop (`.devin/workflows/visual-flagship-convergence-loop.md`). AGENTS.md §37 makes this binding.
>
> **One-line summary:** A screen that renders but is not wired to a real endpoint, not verified against live data, not propagated across coupled surfaces, and not covered by its full state machine is a prototype, not a product. One functional surface at a time → wire it live → verify against the live endpoint → propagate → cover every state → harden → critique for lies → sign off.

---

## 0. Why this exists

The Visual Flagship Convergence Loop governs *how the app looks*. It already exposed the failure mode of department-wide mass visual commits: large diffs, impressive commit messages, no proportional visual jump.

The same failure mode exists on the **functional** axis, and it is more dangerous because it is invisible. A 40-screen visual pass can look impressive in a commit log while every screen still renders mock data, every mutation stays local, every trust badge is asserted by the frontend, and every coupled surface desyncs. The app "works" in TypeScript and "looks flagship" in a screenshot, but it is not a product — it is a prototype with flagship makeup.

This loop exists because the commits that actually moved ThryftVerse from prototype to product were not the mass visual waves. They were the focused, end-to-end functional closures:

- `46a17968` — bugs found by **hitting live endpoints**, not by TypeScript: a SQL parameter mismatch that 500'd Buy Now, public routes blocked by preHandler auth, migration columns without defaults.
- `0afcdf6a` — a seed script so the app rendered **real data**; a SQL double-comma bug that made `/auctions` 500; mock fallback confined to dev, honest error in prod.
- `0d2fb8b2` — **cross-surface propagation**: auction win marks the listing sold; auction/co-own creation pauses the listing; `useEffect` → `useFocusEffect` so screens re-fetch on focus.
- `c113dd1b` — `FOR UPDATE` transactions to prevent double-sell races; 401 → logout → redirect; setTimeout cleanup.
- `84e289f7` — "every trust signal evidenced by a backend row; fail-closed — null means no render, no badge without tier."
- `211b5f7e` — realtime `seq`+`v`, atomic orderbook snapshots, idempotent unknown-outcome recovery UI.
- `5debc0ce` — fabrication removed: fake loyalty perks, fake reward amounts, fake email promises deleted.

The pattern: **live signs come from end-to-end closure of one functional surface, not from mass visual passes.** The implementation unit for functional truth is one surface's full data path, not one department.

---

## 1. The loop

```
For one functional surface:
  1. TRACE       → map the full data path: DB → API → serializer → hook → state → UI (and back)
  2. WIRE        → connect the UI to the real backend endpoint; no production mock fallback
  3. SERVE       → ensure the backend can actually return real data (migration / endpoint / seed)
  4. VERIFY LIVE → hit the live endpoint; confirm real rows render; not just TypeScript
  5. PROPAGATE   → every coupled surface reflects the mutation; re-fetch on focus
  6. STATE-COVER → loading / empty / error / offline / partial / unknown-outcome — all honest
  7. HARDEN      → transactions, idempotency, race conditions, auth, privacy, resource cleanup
  8. CRITIQUE    → cold critic: "does this surface lie? fabricate? desync? leak? race?"
  9. SIGN OFF    → live endpoint verified + no fabrication + propagation confirmed + states honest
```

A functional surface is not done until step 9. A pattern is not generalized until one surface has passed step 9.

---

## 2. The live-signs test (replace "it works")

"It works" is not testable. "TypeScript passes" is not a live sign. Translate vague functional claims into **observable live-signs outcomes**:

```text
- A real GET /endpoint returns real rows that the UI renders (not mock data, not hardcoded).
- A mutation POST/PATCH persists to the DB and is reflected on every surface that shows that entity.
- A 401 on a protected route expires the session and redirects to auth — no stale state, no silent retry loop.
- An unknown-outcome (network drop after send) shows "Check result" + safe retry with the same idempotency key, never a fake success.
- A trust badge renders only when a backend row evidences it. Fail-closed: null = no render, no badge without tier, no TBC without reason.
- A race condition that could double-sell / double-create / double-charge is closed by a transaction with FOR UPDATE (or equivalent row lock).
- A setTimeout / setInterval / subscription is cleaned up on unmount — no leak.
- A public route is reachable unauthenticated; a protected route is not.
- A listing paused by an auction/co-own stays paused everywhere; a listing sold by an auction win is sold everywhere.
- A realtime event carries seq + version so a reconnect can detect gaps and refetch canonical state.
```

These are testable against the live backend. "It works" is not.

---

## 3. The data-path trace (step 1)

Before writing anything, trace the full path per AGENTS.md §2. Do not work from the screen alone.

```
DB table → migration → route handler → SQL query → serializer/contract → API client → hook → store/state → UI component
```

For each layer, record:
- the source-of-truth owner (which layer owns this field/state)
- what is genuinely wired vs. mocked/hardcoded/fabricated
- which surfaces read this entity (propagation surface set)
- which mutations write this entity and whether they are transactional/idempotent
- the auth/privacy projection (who is allowed to see what)

A change made without tracing the data path is not functional work — it is a guess that typechecks.

---

## 4. Wire, serve, verify live (steps 2–4)

### Wire
Connect the UI to the real endpoint. Production code must not fall back to mock data when the API fails — it must surface the error honestly. Mock fallback is a **dev affordance** (`ENABLE_RUNTIME_MOCKS`), never a production truth.

### Serve
If the endpoint does not exist or returns no data, the surface is not live. Before claiming the surface is wired:
- add the migration if the table/column is missing
- add the route handler if the endpoint is missing
- add the seed data if the database is empty (the app must render real data on a fresh backend, not a blank screen)

A screen wired to an endpoint that returns `[]` forever is indistinguishable from a broken screen. Seed data is part of the deliverable for any new entity.

### Verify live
TypeScript passing is necessary, not sufficient. The verification standard is: **hit the live endpoint and confirm real rows render.** Run the backend against real Postgres/Redis and exercise each P0 endpoint. The commits that found the worst bugs (`46a17968`, `0afcdf6a`) found them this way — never via typecheck.

Record the live verification:
```text
GET /listings        → 12 rich listings with images + dimensions
GET /auctions        → 5 auctions with bids + images + brands
POST /auctions/:id/buy-now → creates order + returns orderId
GET /co-own/assets/:id     → custodyCoverageGbp=5000, appraisalValueGbp=350
```

If you cannot run the backend live, mark `IMPLEMENTED — LIVE ENDPOINT VALIDATION PENDING` and state exactly which endpoints need live verification. Do not claim `COMPLETE — TARGET MET` without a live endpoint check.

---

## 5. Propagate (step 5)

A real product is coherent across surfaces. The most common prototype tell is a mutation that succeeds in one place and desyncs everywhere else.

For every mutation on the worked surface:
- identify the **propagation surface set** — every screen that reads the mutated entity
- after a successful mutation, invalidate the relevant queries and re-fetch (`refreshListings()`, query invalidation, store update)
- replace `useEffect` data loading with `useFocusEffect` on screens that must re-fetch when the user navigates back to them
- ensure backend mutations that affect other entities also update those entities in the same transaction (e.g. creating an auction pauses the underlying listing; winning an auction marks the listing sold)

Anti-pattern: a listing edited on `EditListingScreen` that doesn't appear updated on `MyListingsScreen` until a 55-second polling cycle. That is a prototype, not a product.

---

## 6. State coverage — including unknown-outcome (step 6)

AGENTS.md §14 requires loading/empty/error/offline/partial states. The live-signs loop adds one state that prototypes always miss: **unknown-outcome**.

When a mutation request is sent and the network drops before the response arrives, the client does not know whether the operation succeeded. This is not an error and it is not a success. It is **ambiguous**.

- Never show a success state for an ambiguous outcome. That is a fabricated success (AGENTS.md §11).
- Show a distinct unknown-outcome treatment: a warning-colored state, a "Check result" action, and an explanatory hint that retrying is safe because the same idempotency key will not double-execute.
- The backend must support this: idempotency keys on every money/creation mutation so a safe retry returns the original result.

This is the difference between "the app pretends it worked" and "the app tells the truth about uncertainty."

---

## 7. Harden (step 7)

Production readiness for the worked surface:

- **Transactions:** any mutation that reads-then-writes a row (ownership check → insert → status change) must be wrapped in a single transaction with `FOR UPDATE` on the read row. A race between the check and the write is a double-sell / double-create bug.
- **Idempotency:** every money/creation mutation accepts an idempotency key; replaying the same key returns the original result, never a duplicate.
- **Auth:** public routes are listed in `isPublicRoute`; protected routes are not. A 401 on token-refresh failure logs the user out and redirects to auth — no stale session.
- **Privacy:** cross-user access returns 403; unauthenticated access returns 401; aggregate projections never leak user IDs, entry prices, or P&L. Add a privacy projection test for any new entity that exposes holdings/bids.
- **Resource cleanup:** every `setTimeout`/`setInterval`/subscription/refresh timer is tracked in a ref and cleared on unmount.
- **Realtime ordering:** every event publish carries `seq` + `v`; a `/realtime/seq` endpoint lets reconnects detect gaps and refetch canonical state.

---

## 8. The cold critic (functional)

The same agent must not wire → verify → approve its own functional work. The functional reviewer is a **cold critic** that receives only:

```
the data-path trace + the live endpoint responses + the state matrix + the propagation surface set
```

— not commit messages, not "all requirements completed," not "TypeScript passes."

It answers only:
- Does any surface render mock/hardcoded/fabricated data in production mode?
- Does any mutation stay local and fail to propagate to coupled surfaces?
- Does any trust badge render without a backend row evidencing it?
- Does any money/creation mutation lack idempotency or a transaction guard?
- Does any state fabricate success on an unknown-outcome?
- Does any route leak data to an unauthorized viewer?
- Does any timer/subscription leak on unmount?
- Would a live endpoint hit expose a 500 that TypeScript hid?

Then the coding agent reworks from that criticism. This separation is mandatory for any surface that claims functional completion.

---

## 9. Definition of done (live-signs)

```text
TypeScript 0 errors + tests pass
  = engineering-ready. NOT functional completion.

Functional completion for a surface requires:
  - the UI renders real data from a live endpoint (not mock, not hardcoded).
  - the live endpoint has been hit and returns the expected rows (recorded).
  - every mutation propagates to its full surface set (re-fetch on focus / query invalidation / cross-entity transactional update).
  - the full state matrix is honest, including unknown-outcome (no fabricated success).
  - every trust signal is evidenced by a backend row (fail-closed).
  - money/creation mutations are transactional + idempotent.
  - auth + privacy projections are correct (with a test for new entities).
  - no timer/subscription leak.
  - live-endpoint critic pass.
```

When the backend cannot be run live, use `IMPLEMENTED — LIVE ENDPOINT VALIDATION PENDING` and list the endpoints awaiting live verification. Do not claim `COMPLETE — TARGET MET` without a live endpoint check.

---

## 10. Anti-patterns (process failures)

- Shipping a UI screen that calls an endpoint that does not exist yet, with a production mock fallback hiding the gap.
- Claiming completion when TypeScript passes but the live endpoint 500s (the `46a17968` class of bug).
- A mutation that succeeds locally but does not propagate to coupled surfaces (listing sold here, still active there).
- A trust badge / status pill asserted by the frontend without a backend row (the pre-`84e289f7` class of lie).
- A success state shown when only local temporary state changed, or when the outcome is ambiguous.
- A race condition left open between a check and a write because "it's an edge case" (the pre-`c113dd1b` double-sell).
- A feature with only the happy path — no error, no offline, no unknown-outcome.
- A `setTimeout`/refresh timer not cleaned up on unmount (the pre-`c113dd1b` memory leaks).
- A mass visual pass across 40 screens that leaves every screen on mock data and calls it an "upgrade."
- The same agent wiring, verifying, and approving its own functional work.

---

## 11. Priority order

Work functional surfaces where the code proves the largest truth gap — the surfaces that look done but are not live:

```
1. Money surfaces (checkout, wallet, payouts, buy-now, auction settlement) — fabrication here is the most damaging.
2. Trust surfaces (co-own dossier, buyer protection, seller verification, KYC) — badges without backend rows are lies.
3. Discovery / feed surfaces — must render real data, not mock catalogues.
4. Creator surfaces — publish/edit must persist; analytics must be real.
5. Cross-surface propagation hotspots — anywhere a mutation in one place desyncs another.
6. Remaining CRUD / utility surfaces.
```

Money and trust are first because a fabricated success or a race condition there has real-world consequences, not just UX embarrassment.

---

## 12. Relationship to existing rules

- AGENTS.md §2 (deep system research, top-down/bottom-up trace) — this loop is the *execution* of that research for functional work.
- AGENTS.md §11 (truthful UI) — this loop enforces it: fail-closed, backend-row-evidenced, no fabricated success.
- AGENTS.md §22 (completion standard — "no fake success or fake data remains") — this loop defines the live-signs bar that satisfies it.
- AGENTS.md §37 (live-signs convergence — binding) — the charter section that makes this loop authoritative.
- `.devin/workflows/visual-flagship-convergence-loop.md` — the visual counterpart. Visual convergence is necessary but not sufficient; a surface must pass **both** loops to be called complete. A flagship-looking screen backed by mock data is not done.
- `.devin/workflows/research-driven-upgrade-loop.md` — the research methodology. For functional surfaces, the "codebase trace" stream (§research streams) must produce the data-path trace in §3 of this file.
- `.devin/release-gates.md` — the gate definitions. A live-signs gate (no production mock fallback, no fabricated success, propagation verified) is part of release readiness.
