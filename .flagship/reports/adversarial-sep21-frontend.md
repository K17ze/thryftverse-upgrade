# Adversarial Review — Sep-21 Frontend Repair Wave

**Date:** 2026-09-21 (adversarial re-verification pass)
**Reviewer mode:** READ-ONLY. No source files modified.
**Scope:** `ThryftVerse-Validation-and-Upgrade-Report-2026-09-21.md` Appendix A
S21-01..S21-05 + SEP21-FIN-A (frontend half), against the uncommitted repair wave
at HEAD `b4cf0b53`.
**Prior reports under test:** `repair-sep21-p2-auction-pay.md`,
`repair-sep21-p6-frontend.md`, `repair-sep21-p8-moodboard.md`.

## Verdict: PARTIALLY VERIFIED — 5 of 6 fixes confirmed; S21-02 retains a live dishonest-state defect

| Finding | Verdict | Worst residual severity |
|---|---|---|
| SEP21-FIN-A (auction PaymentSheet) | **VERIFIED** | — |
| S21-01 (checkout financial tier) | **Verified with residuals** | Low |
| S21-02 (editorial destination) | **DISPROVED — partial fix** | **Medium** |
| S21-03 (delayed-write identity) | **VERIFIED** (front + back) | — |
| S21-04 (moodboard atomic enqueue) | **VERIFIED** | Low (acknowledged residual) |
| S21-05 (settings identity snapshot) | **VERIFIED** | Low |

Tests executed live: `moodboardAtomicBatch.test.tsx` 6/6 pass,
`paymentSheetFlow.test.ts` 8/8 pass, `s21FrontendRepairs.test.tsx` 17/17 pass.

---

## Finding 1 — S21-02 residual: published editorials beyond the fixed first page falsely render "no longer available" (MEDIUM — fix incomplete)

**Claim under test:** tap the shown article → reach its actual readable content;
removed/private editorial → honest recovery.

**What was fixed (confirmed):**
- `frontend/src/screens/GalleriaEditorialScreen.tsx` (new) resolves
  `route.params.editorialId` and renders hero/title/standfirst/byline/body
  paragraphs with honest loading/error/missing states.
- Route registered: `navigation/types.ts:544` (`GalleriaEditorial:
  { editorialId: string }`), `:727` (`ROOT_STACK_ROUTES`),
  `AppNavigator.tsx:482` (lazy `getComponent`), `linking.ts:128`
  (`galleria/editorials/:editorialId` deep link).
- `UnifiedDiscoveryScreen.tsx:515–517` and `GalleriaScreen.tsx:96–99` navigate
  with the real `editorialId`; `GalleriaHeroEditorialCard` /
  `GalleriaEditorialListItem` gained real `onPress` reading actions.
- Removed/unpublished piece → "This story is no longer available" + "Explore
  the Galleria" — honest for genuinely missing pieces.

**The defect:** resolution is `fetchGalleriaEditorials()` →
`fetchJson('/galleria/editorials?limit=24')` → `.find(id)`:

- `frontend/src/services/galleriaApi.ts:468` — single request, `limit=24`,
  **no pagination loop**, no `hasMore`/cursor handling.
- `backend/api/src/routes/galleria.ts:303–305` — `app.get('/galleria/editorials',
  async () => { const limit = 24; const offset = 0; ... })` — the handler
  **ignores the request entirely**; `?limit=`/`?offset=` are decorative. The
  endpoint can never return anything but the 24 newest published pieces.
- `GalleriaEditorialScreen.tsx:53–57` — `find` miss → `{ status: 'missing' }`
  → lines 107–121 render **"This story is no longer available. It may have
  been removed or unpublished by our editors."**

**Repro:** publish 25+ editorials; send a deep link
(`thryftverse://galleria/editorials/<id-of-25th-newest>`) — e.g. from a push
notification or shared link. The piece is `status='published'` and exists; the
screen tells the user it was removed. The `missing` state is indistinguishable
from "not on page 1", so the honest-state claim fails for any live piece older
than the front page.

**Why it's medium, not high:** in-app surfaces (discovery hero, Galleria list)
draw from the same 24-item fetch, so in-app taps are self-consistent; the false
"missing" requires a deep link / external reference to an older piece, and
requires >24 published editorials to exist. But the repair registered a public
deep-link route, and the audit's acceptance was "removed/private editorial has
recovery" — the current code cannot tell "removed" from "not in the only page
it ever fetches".

**Fix direction:** a real `GET /galleria/editorials/:id` (404 vs 200
disambiguates removed from beyond-page), or paginate the list fetch until found
or exhausted. The report's own note ("a dedicated endpoint would remove the
fan-out cost") understates this: the cost is not just fan-out, it is a false
negative presented as authoritative truth.

---

## Finding 2 — SEP21-FIN-A: VERIFIED (frontend + backend)

**Frontend — `useAuctionDetail.ts:485–598`, every sheet outcome walked:**

- `paid`/`failed` terminal → immediate honest states (`:510–522`).
- `pending` + no `intent.id` → `fetchDetail()`, return (`:531–534`) — backend
  always includes `intent` on pending (`auctions.ts:1414–1422,1445–1453`), so
  this is a defensive no-op, not a trap.
- Sheet-config fetch → `isMountedRef` guard `:543`; present `:544`.
- `PAYMENT_SHEET_UNAVAILABLE`/`PAYMENT_INTENT_FINAL` → falls to authoritative
  polling (`:547–552`) — correct for non-Stripe rails / raced-terminal intents.
- Other thrown errors (init/presentation/network, `PAYMENT_CUSTOMER_MISMATCH`)
  → rethrown → outer catch shows error, **idempotency key retained** so the
  next tap replays the live intent (`:553–556`). Never claims success.
- `cancelled` → "Payment not completed — your win is still reserved", key kept
  (`:563–567`) — honestly unpaid, no optimistic state.
- `completed`/`unavailable` → `waitForPaymentIntentSettlement` (`:569`) →
  succeeded/failed/still-pending all honest (`:575–591`).
- Unmount guards at `:543,:558,:573`; intent stays live server-side and the
  webhook settles independently — nothing stranded.

**Shared service — `services/paymentSheetFlow.ts`:** `initPaymentSheet` params
identical to canonical checkout (`:87–109`); `presentPaymentSheet` maps
Canceled → `'cancelled'`, other errors → throw (`:116–123`).
`useCheckoutPaymentFlow.ts:901–916` delegates to the same service — no
divergent copy. `git show HEAD:routes/v2.ts` confirms the sheet endpoint
pre-existed; the new code consumes it.

**Backend — `routes/v2.ts:411–511` `POST /v2/payments/intents/:intentId/sheet`:**
- Ownership: `!row || row.user_id !== userId` → 404 (`:449`).
- Gateway/secret: `gateway_id !== 'stripe_americas' || !client_secret ||
  !provider_intent_ref` → 409 `PAYMENT_SHEET_UNAVAILABLE` (`:453`).
- Terminal: succeeded/failed/cancelled → 409 `PAYMENT_INTENT_FINAL` (`:461`).
- Stripe customer binding: provider intent's `customer` must equal the user's
  `getOrCreateStripeCustomer` id → 409 `PAYMENT_CUSTOMER_MISMATCH` (`:475–489`).
- Auction intents minted via `app.inject` to canonical `POST
  /payments/intents` (`auctions.ts:437–461`), which attaches the Stripe
  customer and stores `client_secret` (`index.ts:29480–29507,29563–29599`) —
  so the binding check passes for the auction path.

No optimistic paid, no stranded state. `paymentSheetFlow.test.ts` 8/8 pass.

---

## Finding 3 — S21-01: VERIFIED for the footer; residual unmigrated money/action text (LOW)

**Verified:**
- `theme/typography.v2.ts:294–299` — `financial: 2` tier added; doc table
  `:289–292` correctly scopes it to money/action content.
- `CheckoutFooter.tsx` — all 16 `maxFontSizeMultiplier` call sites use
  `MAX_FONT_SCALE.financial` (grep: zero non-financial caps in the file);
  `walletBtn` is `minHeight: 56` (`:351`) not fixed `height`; total row wraps
  (`flexWrap: 'wrap'` `:284`); `flexShrink` + `gap` on summary rows.
- `CheckoutScreen.tsx:746` — `paddingBottom` driven by measured
  `footerHeight` (`:108`, `:986` `onHeightChange={setFooterHeight}`), legacy
  300pt only as pre-layout fallback.
- Lint test `s21FrontendRepairs.test.tsx:183–201` genuinely asserts
  `financial` use + no literals + `minHeight`.

**Residuals (LOW):**
- Sibling checkout money text still carries ad-hoc literal caps, e.g.
  `CheckoutBalanceSection.tsx:45–46` — `maxFontSizeMultiplier={2}` +
  `numberOfLines={1}` on the balance amount: at 200% a long balance
  ("£1,234.56 available") **truncates** instead of reflowing (screen-reader
  label carries the full text, but sighted large-text users see an ellipsis on
  a money figure). Same literal-`2` pattern in `CheckoutVerificationSection`,
  `CheckoutTrustCluster`, `CheckoutGuardState`, `CheckoutHeader`, etc. — none
  are in the `CAMPAIGN_TOUCHED` lint list (`stateTruthfulnessRepairs.test.tsx:
  1187–1207`), so the named-tier convention is not enforceable there. Cap
  *value* is correct (2), so this is a policy/completeness residual, not the
  1.3 regression the audit flagged.
- The audit's broader requirement — "the old shared text components must
  migrate to an actual accessibility policy" — is unmet: `components/ui/
  Text.tsx:48,72,152,180,204,228,263,289,343` still hardcodes 1.5/1.8/2
  literals. P6's report scoped only the footer; the repo-wide migration the
  audit asked for did not happen.
- Extreme-scale edge: the footer is `position: 'absolute'` bottom-anchored and
  not scrollable (`CheckoutFooter.tsx:236–247`). At 200% on a small phone with
  all rows + two CTAs, summary rows can be pushed off the top edge
  unreachably. Pay controls remain bottom-anchored/reachable — acceptance met,
  but worth a native check.

---

## Finding 4 — S21-03: VERIFIED (frontend capture + backend retraction)

**Every delayed path uses the captured identity:**

- Capture: `actorUserId: useStore.getState().currentUser?.id ?? null` at
  action time — `UnifiedDiscoveryScreen.tsx:434` (not-interested), `:454`
  (show-fewer). `pendingHides` entries carry the notice (`:254–256,435–440`).
- 4s timer → `persistNotInterested` → `markItemNotInterested(..., { userId:
  notice.actorUserId })` `:324–327`.
- Unmount flush → `:410–414`.
- Retry → `:380–381`.
- Raced-undo compensation → `undoItemNotInterested(..., { userId:
  notice.actorUserId })` `:332`, `:385`.
- No path reads the live user at fire time.

**Service enforcement — `recommendationFeedbackApi.ts:108–128`:**
`resolveActorUserId` drops the write (`dropped: true` + `feed_feedback_dropped`
metric) when `getCurrentUserId() !== actor.userId`; guest-captured (`null`)
never attributes to a later sign-in; no-actor callers resolve live (immediate
taps — `DiscoverScene.tsx:317,325` correctly pass no actor, writes fire
synchronously). `settleFeedbackNotice` clears the notice on `identity_changed`
so A's outcome never renders on B's screen (`UnifiedDiscoveryScreen.tsx:
297–303`).

**Backend half also landed:**
- `recommendationIntent.ts:219–228` — item-scope `usual`/`add` restore deletes
  committed `not_interested` interactions **in the same transaction** as the
  mutation insert.
- `recommendations.ts:992–1011` — read-side ordering backstop: a restore
  mutation timestamped ≥ the newest hide supersedes the exclusion (NOW() is
  transaction-start, so restore wins the in-flight race); `report_content`
  rows are never retracted.
- `resolveAuthenticatedUserId` (`index.ts:1689–1706`) rejects body/path userId
  ≠ token user — a misraced write can't misattribute even if the client check
  were bypassed.

Tests in `s21FrontendRepairs.test.tsx:207–239` genuinely fail on pre-fix code
(pre-fix functions ignored the actor param and would submit under the live
session → `fetchJson` called → assertion fails). Verified logically and by
run (17/17 pass).

---

## Finding 5 — S21-04: VERIFIED (atomic batch + lock + honest unreconciled)

- `moodboardOutbox.ts:77–96` — `enqueueMoodboardOperationBatch` inserts all
  ops inside **one** `db.transaction()`; mid-batch throw rolls back.
  `enqueueMoodboardOperation` is a single-element wrapper (`:62–66`) — one
  write path. Grep confirms **zero** remaining per-op enqueue callers outside
  the module.
- `useMoodboardBoard.ts:399–418` — `submitBoardOps` batches via the atomic
  API; enqueue throw → `'failed'` + `syncStatus='error'` — no durable prefix.
- History lock spans reconcile: `useMoodboardHistory.ts:141–155` (undo) and
  `:159–173` (redo) hold `applyingRef` through `applyEntry` AND the
  `await reconcileAfterFailedInverse()` — released in `finally` after both.
- Honest `'unreconciled'`: `flushOutbox` tracks `lastReconcileOk`
  (`useMoodboardBoard.ts:248,262`) and returns `'unreconciled'` instead of
  `'applied'` when the post-drain fetch fails (`:301–307`); `reconcileBoard`
  flags `syncStatus='error'` + retryable conflict detail on fetch failure
  (`:216–225`).
- Empty-queue stomp fixed: `pushedAny` gate (`:254,260,309–313`) — a flush
  that pushed nothing returns `'applied'` **without** writing `'synced'`, so
  it can't mask a just-set `'error'`.
- Test transaction mock genuinely rolls back
  (`moodboardAtomicBatch.test.tsx:90–102` snapshot/restore on throw) and
  asserts zero durable rows (`:401–403`) + `rollbacks===1` (`:403`) + a
  post-reconnect `drainMoodboardOutbox()` pushing nothing (`:407–409`). The
  test would catch a per-op regression (prefix row would be durable →
  `pendingRows` non-empty). Live run: 6/6 pass.

**Residual (LOW, acknowledged by P8):** the no-DB online fallback
(`useMoodboardBoard.ts:421–443`) still submits op-by-op; a mid-batch network
failure can leave a server-side prefix. Mitigated by reconcile-under-lock +
`'unreconciled'` honesty; a server batch endpoint would close it fully.

---

## Finding 6 — S21-05: VERIFIED (identity-tagged snapshot + focus refetch)

`useSettingsScreenData.ts` walk of all orderings:

- Snapshot state is `{ userId, balance, failed }`; render-time scope
  `snapshot.userId === currentUser?.id` (`:126`) — A's amount can never render
  under B, including the render between identity change and effect cleanup.
- Epoch guard (`:56,60,64,79`) — a late response from A's fetch cannot write
  after B's fetch bumped the epoch.
- Identity effect on `currentUser?.id` (`:88–92`); sign-out leaves the stale
  snapshot invisible (`scoped = null`), never rendered.
- `useFocusEffect` refetches with `useStore.getState().currentUser?.id` read
  **at fire time** (`:99–105`) — focus during a switch fetches B, not A.
- Malformed/non-finite `availableGbp` → `failed`, never £0 (`:65–76`).

**Residual (LOW):** `FOCUS_REFETCH_DEBOUNCE_MS = 5_000` (`:36,103`) suppresses
a refetch when the user returns within 5 s of the last fetch — a sub-5-second
top-up/withdrawal round trip shows the pre-mutation balance until the next
focus event. Documented as matching `useRefetchOnFocus` convention; stale window
is bounded and honest (the card just shows the old number, not a wrong-owner
one).

---

## Method notes

- All file/line evidence read end-to-end against the working tree
  (uncommitted wave on HEAD `b4cf0b53`); `git diff HEAD` used to confirm the
  changed hunks for `useAuctionDetail.ts` and `UnifiedDiscoveryScreen.tsx`.
- `git show HEAD:backend/api/src/routes/v2.ts:411` confirms the sheet endpoint
  pre-existed the wave — the frontend repair correctly consumes an existing
  validated endpoint rather than adding a new one.
- Live test runs: `npx vitest run` on `moodboardAtomicBatch` (6/6),
  `paymentSheetFlow` (8/8), `s21FrontendRepairs` (17/17).
- No real device/Stripe/Postgres exercised — same limit as the repair reports.

## Bottom line

**VERDICT: PARTIALLY VERIFIED.** The wave genuinely fixes FIN-A, S21-03
(front and back), S21-04, and S21-05, and substantially fixes S21-01. The
strongest open defect is **S21-02 Finding 1 (Medium)**: the editorial reader's
"missing" state cannot distinguish a removed piece from a published piece past
the hardcoded 24-item first page, so a live story can be reported as "no longer
available" — a dishonest state on a registered deep-link route. S21-01's
footer fix is real but the audit's repo-wide accessibility-policy migration
(shared `ui/Text.tsx` caps, non-linted checkout siblings, truncating balance
label) is unfinished.

**Counts:** 6 findings checked → 4 fully verified, 1 verified-with-low-
residuals (S21-01), 1 partially disproved (S21-02). **Worst severity: MEDIUM**
(Finding 1).
