# ThryftVerse — fresh validation, verification and cross-reference upgrade report

**21 September 2026 — read-only audit**  
**Branch:** `feat/product-detail-contract-media-device-closure`  
**Reviewed HEAD:** `b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5`  
**Comparison baseline:** `76c0733f8fca7424ad5bfb51c81d2a71a36e866f`  
**Change:** one pushed commit; 198 files changed, 26,625 insertions, 2,178 deletions, including tests and documentation.

This report validates the latest push, not the previous checkout. It separates source-level closure, executed local tests, conditional defects, and missing deployment/device evidence. It includes current official competitor research and the supplied visual references. No application code was edited, no deployment was performed and no financial or destructive recovery operation was attempted.

**Reading map:** [Decision and scores](#1-executive-decision) · [Executed validation](#2-fresh-validation-results) · [Priority defects](#4-highest-priority-remaining-or-newly-exposed-gaps) · [Competitor research](#5-cross-reference-research-what-further-quality-actually-requires) · [Visual references](#6-visual-reference-and-anti-ai-design-review) · [Screen packages](#7-screen-by-screen-next-upgrade-packages) · [ML/AI](#8-mlai-maturity-infrastructure-is-ahead-of-demonstrated-intelligence) · [Verification plan](#9-production-verification-plan) · [Tickets](#10-prioritized-next-tickets). Appendices A–D contain the detailed frontend, financial, backend/ML and infrastructure closure matrices.

## 1. Executive decision

**This upgrade is materially stronger than the preceding one.** It addresses original failure paths rather than merely adding adjacent features. The old statement that all financial and frontend findings remain open no longer applies. Payment intents, wallet reservations and idempotency, Co-Own settlement accounting, moderation holds, import transport, search fallback, frontend request identity and deployment definitions have substantive repairs.

**Public financial release remains a NO-GO.** Several replacement paths still have important gaps: auction payment initiation does not complete the normal Stripe client flow; a settled Co-Own trade can authorize another public transfer; migration ordering can prevent the vector repair from running; a session advisory lock conflicts with transaction pooling; recovery and signing still lack operational evidence. Native aesthetic parity remains unverified.

The practical next milestone is an **evidence-backed release candidate for a bounded launch scope**, not another broad feature expansion. The implementation is moving toward that milestone, but source fixes should not be presented as successful production execution.

### Readiness assessment: 57/100, up from 44/100

This is an evidence-weighted engineering judgment for the full requested product scope, **not 57% of tasks complete, a success probability, or permission to deploy**. Unresolved financial, recovery and deployment gates override the aggregate. The same overall weights as the preceding audit are retained; native visual quality is not assigned an invented score.

| Dimension | Weight | Previous | Current | Reason for movement or limit |
|---|---:|---:|---:|---|
| Visual composition/system | 15% | 60 | 60 | Authored system exists; no new valid native comparison evidence |
| Interaction/state engineering | 15% | 65 | 75 | Many real race/recovery repairs; Undo, offline batching and accessibility remain |
| Money/trading correctness | 20% | 25 | 50 | Original mechanisms repaired; auction/accounting and cross-path policy defects still block release |
| Core backend implementation | 15% | 55 | 65 | Moderation/search/import improvements; integration and topology boundaries remain |
| Security/privacy controls | 10% | 38 | 60 | Fail-closed publication, verification and configuration improve; restore/erasure proof remains |
| ML/AI demonstrated maturity | 5% | 30 | 32 | Retrieval plumbing improves; no new proven learned serving quality |
| Release/operations | 10% | 25 | 48 | Worker, backup and signing definitions repaired; live recovery/governance unverified |
| Verification strength | 10% | 38 | 50 | Stronger production-hook tests; mandatory real-DB/device proof missing |
| **Weighted overall** | **100%** | **43.60 → 44** | **57.40 → 57** | **Full-scope public financial release: NO-GO** |

Separate department assessments, using the same prior department formulas: **frontend 70/100** (previous 64), **backend 57/100** (previous 40), **ML/AI 32/100** (previous 30). Frontend = 50% implementation 82 + 25% architecture 80 + 15% accessibility 60 + 10% demonstrated native validation 0. Backend = 30% domain implementation 70 + 30% money 50 + 20% security 60 + 20% operations 45. Native validation zero means evidence absent, not that the rendered app has zero quality. These are coarse comparative assessments; decimals show reproducibility, not measurement precision.

Frontend revalidation closes **14 of 19 original source findings**, leaves four partial and one open/regressed. Twelve original financial mechanisms are corrected, one has corrected normal conversion but residual validator mismatch, and one is partial. The six original backend safety/configuration mechanisms are repaired in traced source. Those counts are not a denominator for complete product readiness.

### Closure labels

| Label | Meaning |
|---|---|
| Source-fixed | The specific earlier failure mechanism is removed in current code; necessary live/provider/device proof may still be outstanding |
| Locally verified | A relevant test or non-destructive probe ran on this exact checkout, with its scope stated |
| Partial | A repair exists, but a sibling path, integration boundary or failure mode remains |
| Open | The relevant failure mechanism or capability gap remains |
| Not verified | Evidence was unavailable; this is not automatically a defect or proof of absence |

The department appendices provide individual dispositions and current source anchors. Do not interpret a source-fixed row as certification of the entire department.

## 2. Fresh validation results

Existing dependencies were reused because both package lockfiles were unchanged. Backend package scripts changed. Local Node was 24.19.0. No Docker, psql or adb executable was available, and no native application or real PostgreSQL/Redis/provider deployment was exercised. A dummy database URL was used only where import-time configuration required one; it did not supply an integration database.

| Check | Fresh result | Meaning and comparison |
|---|---|---|
| Frontend typecheck, 8 GiB Node heap | **PASS** | Static types are consistent |
| Backend typecheck | **PASS** | Static types are consistent |
| Frontend full Vitest | **130 files: 129 pass, 1 fail. 2,244 tests: 2,241 pass, 1 fail, 2 skip** | Previous 2,138 pass, 2 fail, 2 skip; date failure resolved, screenshot-directory failure remains |
| Backend Vitest with dummy DATABASE_URL | **15 files, 327 tests PASS** | Previous 14 files, 275 tests; no real database inference |
| Backend Node tests without DATABASE_URL | **1,034 tests: 999 pass, 35 fail** | Several failures occur before tests because required configuration is absent |
| Backend Node tests with dummy DATABASE_URL, 10-second per-test bound | **1,411 tests: 1,407 pass, 3 fail, 1 cancelled** | Most former failures close; remaining assertion failures and an environment-dependent timeout described below |
| Previously failing notification/seller/review group | **PASS** | Reran the actual three test files; this is narrower than all backend functionality |
| Production invariant suite | **0 pass, 0 fail, 12 skipped; exit 0** | PostgreSQL unavailable. Absolutely not 12 successful financial invariants |
| Support routing eval via Node loader | **16/16 PASS** | Same limited deterministic routing scope as before; no generated-answer or tenant-isolation proof |
| ML Python unit suite | **11/11 PASS** | Baseline logic and metrics, not learned-model quality |
| Visual release scanner | **FAIL: 50 P0, 36 P1, 130 warnings** | Unchanged automated classifications; not 50 independently confirmed critical incidents |
| Production residue scanner | **PASS: 0 errors, 134 warnings** | Unchanged warning count; not zero unfinished work |
| Design-token lint | **PASS** | Does not validate rendered size, contrast or accessibility |
| Icon grammar scanner | **Exit 0: 1,492 warnings, 14 informational notes across 592 files** | One more warning; report-only success is not style-policy closure |
| Golden parity | **Exit 2, no usable baseline pair** | No real fixture/integration captures; tracked README files do not provide image evidence |
| Release-config script | **FAIL, 5 messages** | Some checks still refer to the old signing configuration; distinguish checker drift from actual workflow findings |
| Exact-HEAD GitHub Actions query | **0 runs returned at review time** | No retrieved CI execution evidence for this commit |

### 2.1 What the remaining tests actually tell us

The frontend failure is [visualRegressionPlan.test.ts:253](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/visualRegressionPlan.test.ts#L253), which expects actual/expected/diff screenshot directories. The top-level twelve golden PNGs remain unchanged 1×1 placeholders. Do not “fix” this by creating empty directories and declaring visual validation complete. Generate real approved device captures, then make the capture and comparison conventions agree.

The two backend country-policy assertions expect gateway lists that omit `oneze_internal`, while current code includes it. This is a contract/test disagreement requiring a deliberate regional-capability decision. The audit does not assume the test expectation is inherently correct or that the implementation is necessarily authorized in every region.

[infraOps.test.ts:22–29](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/infraOps.test.ts#L22-L29) compares a returned Promise to zero without awaiting the asynchronous `publishRealtimeEvent`. This is a test defect/contract drift, not evidence that realtime delivery itself fails. Correct the asynchronous assertion and isolate transport effects.

The upload-finalization test exceeded the explicit 10-second audit bound. This configured run used an unavailable dummy database and did not provide real infrastructure. Investigate with its documented fixtures and dependencies before labeling it an application timeout regression. The 70-second outer process bound was not reached; the runner completed and reported results.

### 2.2 Verification-strength improvement and remaining limits

The new tests include meaningful production hook and helper calls. That is better than relying only on source-string checks. Nevertheless, mocked SQL cannot prove real locks, constraints, migration order or isolation. The real database suite mixes direct production primitive calls with duplicated SQL/state-machine logic; those latter tests prove the copied logic, not necessarily the active HTTP handler.

The invariant suite deliberately skips if PostgreSQL cannot be reached. That is acceptable for an optional local check, but a mandatory release gate must additionally assert a nonzero executed count and zero skipped mandatory cases. An exit code alone cannot establish coverage.

Support evaluation remains routing-only. It calls the routing service and checks issue type, handoff and allowed-tool membership. It does not execute cross-user resource access, real tool mutations, model output or citation checks. Keep that distinction in dashboards, release documentation and claims about AI safety.

## 3. Important closures worth preserving

Reproduction entry points: frontend `npm run typecheck` and `npm test`; backend `npm run typecheck`, the Vitest suite and `npm test`; routing eval `node --import tsx scripts/run-eval-suite.ts`; database invariants `node --import tsx --test --test-force-exit --test-timeout=10000 src/integration/productionInvariants.test.ts`. The configured backend harness used `UNIT_TEST_TIMEOUT_MS=10000` and a dummy database URL ending in `127.0.0.1:1/audit`; it was deliberately not a working database. For meaningful database acceptance, use a disposable real PostgreSQL/PgBouncer fixture with required extensions and enforce zero mandatory skips. Do not copy the dummy URL into a release workflow.

The exact statuses and qualifications appear in the appendices. The following are substantial implementation gains, not just rewritten comments:

- Auction payment no longer simply declares the winner paid. It creates/reuses a payment intent and ties settlement to verified state. This closes the former unpaid-settlement shortcut, but exposes the client initiation gap described below.
- Mollie handling no longer treats server API-key presence as sufficient authentication of request-supplied paid status after failed retrieval.
- Wallet commands now have stronger transactional idempotency, reservation-aware spendability and ledger-leg constraints. Co-Own/DRIP use segment-aware helpers and rate context rather than the original direct balance mutation pattern.
- Missing issuer wallets and contractual lockups receive enforcement in the financial path. Alert activation identity, nullable references and receipt atomicity have been addressed.
- Listing moderation review/failure now produces a held state; the old fail-open publication branch is repaired in the reviewed paths.
- Rekognition request construction uses supported input shapes, and remote import transport uses a shared pinned/deadline-aware path rather than the earlier split unsafe implementation.
- Search credentials are reconciled, successful writes are mirrored into fallback, model lineage/rank handling improves, and search rechecks current public visibility.
- Search pagination and reset identity, cached-refresh presentation, wallet/status truth, public Q&A capabilities, replay resource races and moodboard outcome propagation have concrete repairs.
- Production worker commands now target compiled code; backup startup/environment and release definitions have material corrections.

These changes warrant a significantly better implementation assessment than the last review. They do not remove the need to test their composition: provider → payment state → auction/order → accounting → receipt; or queue → search task → visible result → user feedback.

## 4. Highest-priority remaining or newly exposed gaps

### 4.1 Auction Pay is safer, but the normal Stripe journey is incomplete

[frontend/src/hooks/useAuctionDetail.ts:475–550](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/hooks/useAuctionDetail.ts#L475-L550) receives an intent, handles terminal status and otherwise calls `waitForPaymentIntentSettlement`. It reads the possibility of a client secret but never initializes/presents Stripe PaymentSheet or confirms that intent. [frontend/src/services/checkoutPaymentIntent.ts:18–65](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/services/checkoutPaymentIntent.ts#L18-L65) polls and may open a next-action URL; it does not collect a payment method or perform initial confirmation. The Stripe creation path in [backend/api/src/index.ts:6578–6597](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/index.ts#L6578-L6597) does not itself confirm the intent.

Consequently, the normal new Stripe intent can remain awaiting a payment method/confirmation while the app polls for a transition nobody initiates. A provider-hosted redirect is a different path and must not be used as proof the Stripe path works. Standard checkout already has explicit PaymentSheet interaction; reuse a canonical payment orchestration contract rather than intersecting an incomplete legacy response type locally.

**Required proof:** winner taps Pay, sees the appropriate native/hosted flow, cancels, retries, completes SCA if requested, receives verified success and exactly one order/settlement. Capture the provider sandbox trace and native recording. A webhook unit test alone will not catch this missing client step.

### 4.2 A settled Co-Own trade should not authorize another payment

The new `assertP2pTransferContextAuthorized` in [backend/api/src/lib/walletMoneyPath.ts:610–714](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/walletMoneyPath.ts#L610-L714) requires an actual settled trade and correct participants. That is stronger than trusting an arbitrary context string. But the settled trade has already moved consideration through delivery-versus-payment. The public transfer authorization can permit a further transfer for that same trade because the original settlement did not consume a `wallet_ize_transfers` context record.

The check also retains the older `ceil((notional + fee) × 1000)` conversion, which does not use the new FX settlement context, and its recipient logic must not redirect a platform fee to the seller. The sender still initiates this extra payment; this is not a claim that one user can arbitrarily debit another user's wallet.

**Required design decision:** reject public `coOwn_trade` transfers entirely when the settlement primitive owns those movements, or make a genuine unpaid obligation with immutable amount/currency/recipient/settlement-leg identity the authorization source. Enforce one economic effect across all routes, not merely one use within the P2P table.

### 4.3 The migration repair must be reachable

Migration 330 introduces bigint arithmetic for decoding signed vectors, but migration 326 is unchanged. A database upgrading from before 326 with installed pgvector and pre-existing negative float components can fail in 326 before reaching 330. An additive correction is appropriate for already-applied migrations, but it does not by itself repair this historical upgrade path.

**Required proof:** run both empty installation and populated upgrades from before 326 and from after 326. Include negative vectors, multiple model versions and the no-extension→extension-install transition. Preserve checksum/audit discipline with an explicit repair procedure; do not casually rewrite deployed migration history.

### 4.4 Search reindex exclusion conflicts with production pooling

The new reindex lock uses a PostgreSQL session advisory lock on a `dbPool` client. Both supplied production compose configurations connect API/workers through PgBouncer transaction pooling. Holding the application's client object does not pin the underlying PostgreSQL session between transactions. Lock acquisition and release can occur on different sessions; session ownership and mutual exclusion are therefore not established by this implementation in that topology.

PgBouncer explicitly lists session-level advisory locks as incompatible with transaction pooling. Use a dedicated direct/session connection, or an appropriately designed durable lease with owner token, expiry, fencing and renewal. Do not substitute a long-lived transaction around slow external indexing without evaluating operational consequences. [PgBouncer feature compatibility](https://www.pgbouncer.org/features.html)

**Required proof:** concurrent admin and scheduled reindex across two processes, lock-holder crash, lease expiry/recovery and older-build swap prevention using the actual deployed pool topology.

### 4.5 Moderation must be safe and operational

Fail-closed publication is the right correction. It also means a missing provider configuration can hold every listing. The root compose requires a moderation provider selection but does not forward the explicit Sightengine or AWS credential variables to the relevant API/worker services. The reviewed Rekognition adapter explicitly requires those AWS variables rather than relying on default role credential resolution; a deployment override or adapter change would be needed for a different arrangement. Rekognition's text path remains unsupported, so choosing it for image moderation is not a complete listing-text solution.

The own-object image loader also calls `transformToByteArray` before its size check, without an abort deadline on that branch. A size check after buffering is not a bounded download. Fix stream-time limits and test slow or oversized owned objects as well as remote imports.

**Required proof:** selected provider configuration succeeds from the final container; approved text publishes; rejected content blocks; outage/review holds; held items reach a staffed decision/retry queue; recovery does not require manual database edits. Keep fail-closed behavior while completing the operational path.

### 4.6 UI recovery and accessibility still need refinement

Several previous defects now close, but these refinements remain material:

- Recommendation Undo after persistence/in-flight save is not necessarily the inverse of the recorded negative interaction. Resetting preference to usual does not remove the historical hard exclusion used by retrieval.
- Moodboard operation batches may partially enter the offline queue before a later enqueue fails. Returning failed while retaining the history entry does not cancel the already-durable prefix.
- Editorial cards now navigate, but generic navigation to Galleria without article identity does not prove the selected article can be read in full.
- Checkout's important amount/fee/button text now uses a shared utility cap of 1.3, where several previous caps were 2. Naming a restrictive cap improves consistency, not accessibility. Reflow should preserve readability of important financial text.
- Native evidence is still absent. Tests of props, helpers and renderer trees cannot demonstrate target size, crop handles, keyboard behavior, typography, contrast or smoothness.

The frontend appendix provides source anchors and exact acceptance scenarios. The benchmark is task completion under realistic conditions, not a screenshot that fits because text scaling was suppressed.

### 4.7 Search freshness telemetry currently measures submission, not visibility

[backend/api/src/lib/searchSync.ts:340–351](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/searchSync.ts#L340-L351) records success and indexing lag immediately after `adapter.index`. In [backend/api/src/lib/searchAdapter.ts](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/searchAdapter.ts), that call awaits `addDocuments` submission, not terminal task completion, and may resolve through local fallback after remote failure. Meilisearch document operations are asynchronous; acknowledgment does not mean the result is searchable. [Meilisearch tasks](https://www.meilisearch.com/docs/capabilities/indexing/tasks_and_batches/async_operations)

This instrumentation is useful but its claim is too strong. Record submitted, completed, failed and fallback outcomes separately; retain task ID and mutation version. Measure end-to-end visible lag when the task completes or a versioned probe confirms visibility. A stalled task queue should make freshness unhealthy rather than leave a reassuring submission metric.

### 4.8 Backup inventory is better, but erasure proof is not complete

The previous time-only purge claim has been replaced with inventory checks. Remaining limitations include backup content time versus object upload time and versioned objects. A backup snapshot can contain pre-erasure data while its upload finishes after erasure, so `LastModified <= erasedAt` is not a sufficient content predicate. Current-object listing also cannot establish the absence of noncurrent versions. S3 deletion can leave recoverable older versions or delete markers depending on configuration. [S3 versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)

Use a manifest containing snapshot boundaries, object/version IDs, retention class and erasure handling. Define recovery-time suppression if immutable backup retention is part of the chosen policy, and have that policy reviewed. Do not label data purged based solely on a partial object listing.

### 4.9 Auction accounting and automated trading need one shared policy

Verified auction capture now creates a real paid order, but only after canonical settlement has already skipped its order branch because the intent has no order ID. The legacy auction ledger helper then clears escrow immediately and selects an IZE-denominated seller account while posting GBP-default entries. This is a concrete accounting mismatch, not merely missing test evidence. Bind an order before capture and use canonical hold/release semantics, or prove equivalent auction-specific accounting. The financial appendix traces the active caller and exact currency defaults.

DRIP checks asset availability but does not run the manual route's reconciliation halt, active-exit and eligibility/capability policies. Automated purchases must obey the same pre-settlement restrictions as manual purchases. Resolve whether lockup means secondary resale restriction or a full primary-purchase pause: current primary and DRIP paths disagree. Also test two opposite counterparties trading across different assets; actor-wallet prelocking can defeat the later helper's sorted lock order and cause avoidable deadlocks.

### 4.10 Restore guard and rollback controls still need correction

The improved restore guard parses URL authority, but connection query parameters can override the actual host. A safe extracted-helper test accepted a decoy authority with a query host equal to the source database; the installed PostgreSQL connection parser resolves the latter. No restore was executed. Require a positively authorized disposable target and compare actual connection semantics before any destructive step; database-name substrings alone are inadequate.

The rollback workflow's republish option now prints instructions to use another workflow, then reports execution success without performing that rollback. Remove the misleading success or implement approved delegation. Normal release signing now passes a private-key path correctly in source: the stale local checker's legacy variable warning must not be misrepresented as proof that this repair failed. Remaining gates are actual cryptographic/native evidence and consistent publisher authorization/concurrency.

## 5. Cross-reference research: what further quality actually requires

Official pages below were revisited on 21 September 2026. They document visible product/service behavior, not private competitor architectures or independently measured reliability. Availability differs by region, device and account. Supplied screenshots are visual references, not live policy evidence.

| Reference product/service | Relevant public evidence | Next ThryftVerse upgrade | Evidence to call it competitive |
|---|---|---|---|
| eBay commerce | An accepted offer and a secured paid purchase are different states. [Best Offer](https://www.ebay.com/help/buying/buy-now/making-best-offer?id=4019) | Complete the auction tender flow and unify payment truth in chat, detail, order and receipt | Paid/cancelled/pending/failed/SCA/lost-response journeys on devices with provider sandbox evidence |
| eBay trader research | Product Research uses actual sold-price history and filtered market metrics. [Product Research](https://www.ebay.com/help/selling/selling-tools/product-research?id=4853) | Evidence-rich comparable detail: sample count, dates, condition, fees, shipping, FX and uncertainty | Traders distinguish asking from achieved price and identify poor comparables; backtest thin-market abstention |
| Depop marketplace trust | Protection, support, account security and unshipped-order cancellation are part of the service. [Depop safety](https://www.depop.com/safety/) | Complete the purchase→delivery→issue→refund support loop, not just trust labels | Disputed, missing and damaged orders reach authoritative resolution and ledger reconciliation |
| Vinted commerce conversation | Held payment and resolution are documented transaction behavior. [Vinted safety](https://www.vinted.co.uk/safety) | Persistent item/offer/order context in chat with correct deadlines and safe next action | User can explain status and available remedy without hunting across contradictory screens |
| Pinterest visual search | Region/object selection and refinements lead to corresponding results. [Visual search](https://help.pinterest.com/en/article/use-visual-search-features) | Turn the repaired crop interaction into high-quality, lineage-correct retrieval | Human-labeled crop benchmark; relevant available products; honest filter-only fallback |
| Instagram messaging | Official DM features emphasize editing, organization and receipt control. [DM updates](https://about.fb.com/news/2024/03/instagram-dm-updates/) | Stable reading position, discoverable message actions, clear delivery state and privacy controls | Long native conversations survive keyboard/media changes, reconnect, retry and multiple devices |
| Snapchat social coordination | Plans links conversation, invitations and revisitable details; in-chat creation was described as forthcoming. [Plans announcement](https://newsroom.snap.com/making-plans-irl) | Later, use a small authenticated pickup/inspection appointment object where traders need it | Consent, safe location handling, cancellation and persistent transaction context; not a generic social expansion |
| Stripe/Mollie integration | Payment status must come from verified provider processes. [Stripe webhooks](https://docs.stripe.com/webhooks), [Mollie status](https://docs.mollie.com/docs/handling-payment-status) | Finish provider-to-client and provider-to-ledger boundaries for each supported gateway | Replay/out-of-order/wrong-intent/amount mismatch and provider outage tests through active handlers |
| Expo release integrity | Private-key signing and client certificate verification are concrete steps. [Code signing](https://docs.expo.dev/eas-update/code-signing/) | Prove every publish/rollback path produces an accepted signed update | Native accepts valid update, rejects tampered/wrong-key update and recovers through controlled rollback |

### 5.1 Do not build a collage of competitors

The opportunity is a coherent trader experience: discover → compare evidence → discuss → transact → resolve → save knowledge for next time. Social content should improve trust, taste, relationships and informed decisions along that journey. Co-Own should remain a distinct, carefully permissioned financial proposition rather than inheriting casual purchase language from ordinary resale.

The strongest future differentiators are condition evidence tied to media; honest comparable prices; useful private collections and notes; commerce-native chat; efficient seller drafts/bulk operations; and explainable, reversible discovery. None requires fake users, fabricated inventory, invented liquidity, unsupported AI confidence or a decorative trading dashboard.

### 5.2 Proposed comparative usability study

Recruit a small mixed group of buyers, occasional sellers and active traders. Run the same representative tasks on ThryftVerse and the relevant reference product. This is a proposed research protocol, not a study already conducted.

Measure completion, wrong turns, time to understand total cost, confidence in item condition, recovery after a failed action and ability to explain the current transaction state. Record causes, not merely preference ratings. Test users should not be told which version was recently upgraded.

Use tasks such as: find an item from a cropped image; compare two condition grades; send and revise an offer; resume a failed payment; ask about a defect; organize saved items; find a return deadline; identify available versus reserved wallet money. For Co-Own, additionally test understanding of rights, fees, liquidity, lockup and distribution status. Do not extrapolate a small qualitative study into statistically proven market superiority.

## 6. Visual-reference and anti-AI design review

All 20 supplied reference images were available and re-inspected through local contact sheets. Current app screenshots were not available as valid native captures. Therefore the comparisons below define authored design targets; they do not claim the latest app already matches or fails every visual detail.

| Supplied references | Transferable quality | Next review focus |
|---|---|---|
| 01, 06, 07: account/settings | Flat rows, comprehensible groups, useful financial entry, restrained chrome | Searchable settings destinations; identity-safe values; clear account/destructive boundaries |
| 02: edit profile | Dominant identity object, intentional fields and saving state | Upload/dirty/error/keyboard flow; no hidden Save or lost edits |
| 03, 08: profiles | Clear identity and actionable statistics before media | Buyer/owner modes; meaningful For sale navigation; evidence-based reputation |
| 04, 05, 10: discovery/editorial | Media-led hierarchy with deliberate variation | Useful first viewport, genuinely reachable stories, sponsorship distinction and preserved position |
| 09, 11, 14: saved collections | Covers communicate intent and privacy | Clear private/shared states, meaningful cover selection and robust empty/deleted states |
| 12: inbox | Dense readable threads with hierarchy for unread and previews | Names/preview truncation, keyboard/search, screen-reader order and stable realtime updates |
| 13: item-aware messaging | Product and transaction context stay close to the conversation | Offer lifecycle, full total, buyer protection and blocked/unavailable capabilities |
| 15, 17, 18, 19: commerce detail | Gallery, seller, price, condition, fulfilment and actions form one decision | Condition-tagged media, reliable tender, readable totals and secondary recommendations |
| 16: product art direction | Product silhouette and variants are presented intentionally | Choose contain/cover by role, preserve focal content and accessible gallery navigation |
| 20: immersive content | Content dominates with concise actions | Look/poster save/share/product truth, low-bandwidth behavior and unavailable tagged items |

### 6.1 Anti-AI design means authored behavior as well as appearance

Avoid repeated equal-weight cards, unexplained badges, generic gradients, duplicate headings and excessive introductory copy. Each viewport should have one primary object and a clear next action. Apply containment when it explains grouping or interaction, not simply because a reusable Card exists.

The repaired code is an opportunity to refine whole states rather than only success screenshots. Pending payment must look unresolved; cached search should retain useful results while explaining freshness; an unsuccessful Undo must not disappear behind a toast; unverified cash must not read as available money. Truthful copy is a design requirement.

Keep a restrained type hierarchy, optical icon consistency, meaningful motion and deliberate media crops. Do not solve dense layouts by preventing users from enlarging financial text. WCAG's resize-text guidance is a useful benchmark for the intended 200% review target; native conformance still needs platform-specific testing. [Resize text guidance](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)

React Native exposes semantic accessibility actions, but their presence alone does not prove a screen-reader can complete the flow on both platforms. Validate focus order, announcements, alternatives to drag and all modal exits on devices. [React Native accessibility](https://reactnative.dev/docs/accessibility)

### 6.2 Required native evidence set

Capture Home/Explore, Search, Visual Search, PDP, Checkout, Auction winner, Inbox, Chat, Profile/Saved, Settings, Moodboard and Co-Own detail/trade confirmation. For each launch-critical route retain: first viewport, primary overlay, one realistic error/partial state, large text, keyboard where relevant, light/dark where supported and screen-reader completion.

Use a smaller and larger phone on iOS and Android, real content and a reproducible seed. Review reference and result at thumbnail and normal scale. Record hierarchy, useful density, readability, media treatment, reachable controls, motion and recovery. The target is not a pixel copy of competitors; it is a recognizable ThryftVerse design with comparable clarity and care.

## 7. Screen-by-screen next-upgrade packages

These are focused requirements, not an assertion that every capability below is absent. Source-fixed behavior should be preserved while completing the remaining contract and gathering native evidence.

| Surface | Next quality package | Acceptance |
|---|---|---|
| Home / Explore | Finish preference Undo semantics; preserve recommendation-versus-search distinction; genuine editorial identity | Undo before, during and after save survives refresh/remount; selected article is actually readable |
| Text search | Verify new epoch protection through context switching; preserve retries and result position | Slow old page cannot enter new query; real search outage remains distinct from true empty |
| Visual search | Validate crop controls natively and improve retrieval quality beyond histogram matching | Screen reader completes crop; reset never resurrects old results; displayed provenance matches actual candidate set |
| Product detail | Verify blocked/sold/paused capability consistency across sheets, public Q&A and deep links | State changes while a sheet is open never leave an invalid mutation active |
| Checkout | Reflow important text; verify actual wallet tender calls and capability changes | 200% text remains readable; named tender opens the expected supported payment flow |
| Auction winner | Integrate PaymentSheet/confirmation and authoritative refresh | Complete default Stripe payment, hosted redirect, cancellation, SCA, timeout and replay |
| Offers | Versioned offers and stale acceptance recovery remain consistent across chat/detail/order | Competing acceptance never creates contradictory order/payment state |
| Inbox / conversation | Native reading-anchor and attachment lifecycle validation | Incoming burst, delayed media, keyboard and reconnect do not jump history or duplicate sends |
| Profile / closet | Preserve repaired statistic action and bounded reorder; evaluate large inventory usability | Intended item can be located/reordered and persisted without unbounded media mounting |
| Saved collections | Authored covers, private/shared clarity and deleted-object handling | Cross-user reads honor visibility; optimistic save reconciles after failure/restart |
| Sell / edit listing | Make moderation hold actionable and recoverable | Seller sees reason category and next step; approved retry publishes once; review does not become a dead end |
| Seller hub | Prioritize pending operational work over decorative KPIs | Each figure has denominator/time context; action resolves actual work and refreshes related views |
| Live home / viewer | Validate repaired reconnect snapshot with real transport and changing lots | No stale bidding after reconnect; refreshed summary does not erase useful cached state |
| Replay | Validate resource identity, URL renewal and native lifecycle | Switching recording never plays stale media; expiry refresh and app background behavior work |
| Moodboard | Make undo/redo command batches atomically durable or explicitly compensatable | Failure on operation two cannot silently drain operation one later as a failed full undo |
| Looks / poster | Media-first interaction with real linked-item availability | Removed/sold items are understandable without breaking creator content |
| Wallet | Reconcile available/reserved/settled views to one accounting contract | Cross-path holds, refunds and transfers yield consistent balances and provenance |
| Portfolio / Co-Own | Clear rights/lockup/liquidity/valuation and distribution evidence | Users distinguish ownership, order, settlement and funded distribution; no false cash or return claim |
| Alerts / notifications | Activation history, preference and deep-link consistency | Trigger/re-arm/dedup and notification action form a complete lifecycle |
| Settings / privacy | Verify identity reset and malformed-success behavior with real account switching | No previous account value flashes; unavailable differs from zero; private amounts stay private |
| Support / returns | Case timeline with real decision, evidence and escalation | Request, approval and actual provider refund remain distinct and auditable |
| Model registry / admin | Make serving versus shadow versus metadata explicit | Promotion proves the intended caller loaded the expected artifact or honestly stays non-serving |

## 8. ML/AI maturity: infrastructure is ahead of demonstrated intelligence

This push improves safety and retrieval plumbing. It does not introduce a proven trained embedding pipeline, benchmarked recommendation champion or production-quality valuation/fraud model. The embedding worker still generates placeholder zero vectors; visual search remains histogram-based; source-field copying is not OCR/vision extraction; a model registry row is not active inference.

Keep model claims granular. Identify heuristic baseline, trained shadow, trained serving model, third-party provider and human review separately. Health must describe the serving champion, not infer it from a loaded shadow artifact.

| Department | Next implementation/validation | Minimum useful measurement |
|---|---|---|
| Visual retrieval | Real encoder, nonzero finite vectors, model/preprocessing/dimension isolation | Labeled object/crop Recall@K and relevance, availability, latency and memory |
| Recommendations | Preserve candidate lineage, rank and eligibility; meaningful reversal of negatives | Temporal holdout, cold-start slices, diversity, seller exposure and successful-trade outcomes |
| Valuation/comparables | Actual sold evidence, condition adjustment, fees/FX, confidence and abstention | Backtest error and interval coverage; thin-market failure examples |
| Fraud | Separate rule and shadow decisions; calibrated human-review thresholds | Precision/recall at review capacity, false-positive slices and delayed-label handling |
| Moderation | Provider contract, bounded media reads, staffed review/appeal and recovery | Critical recall, review age, provider outage recovery and appeal reversal rate |
| Support assistant | Real authenticated retrieval, scoped tools and grounded answers | Cross-user adversarial tests, unsupported claims, unsafe action attempts and handoff success |
| Extraction | Actual providers with per-field provenance and editable suggestions | Field accuracy, abstention and correction burden; never invent calibrated confidence |
| Vendor integration | Actual producer/consumer wiring and delivery lease recovery | Sandbox send→provider ID→webhook→case update, replay and abandoned-delivery recovery |
| AI cost | Explicit soft threshold versus hard reservation budget | Concurrent burst, Redis loss, failed completion and billable-path reconciliation |

The earlier soft daily-budget and cost-unit findings remain relevant if unchanged. A post-completion spend counter can overshoot under concurrent admissions; the telemetry contract should not call micro-USD cents. Fix operational truth before marketing these controls as exact platform limits.

For quality rollout, freeze dataset/version/time split, compare against a simple baseline, shadow first, then use a controlled cohort with rollback. Do not optimize engagement alone at the expense of relevant inventory, buyer remedies or fair seller distribution. Publish measured results rather than increasing confidence labels.

## 9. Production verification plan

### Stage A — finish boundary defects

Complete auction client payment; remove duplicate Co-Own payment authority; review auction accounting/escrow; repair migration reachability; use a pooling-compatible reindex lease; make moderation provider deployment complete; fix moodboard batching and persistent Undo; reflow important text. Every fix needs a regression that fails on the current defective path, not just a new helper test.

### Stage B — run the actual production topology

Build the final API and worker images. Start them with the intended database pool, Redis, search, object storage and selected providers. Verify compiled worker start and an observable effect from each critical queue. Exercise migrations against empty and populated snapshots with all target extensions. Confirm configuration reaches the process that uses it.

Do not treat local development startup as proof of final-image startup. Do not treat a required environment-variable declaration as a working provider connection. Do not use production data or credentials for destructive test setup.

### Stage C — prove economic and asynchronous invariants

Run active routes and production services against real PostgreSQL. Cover same-key concurrency, different-key competing buyers, cancelled/expired reservations, insufficient available funds, non-unit FX, segment parity, missing counterparty, duplicate/out-of-order provider callbacks, lost response and retry, restart after commit, and outbox reclaim.

Require balanced money/unit journals, exactly one economic effect, valid state transitions and trustworthy user-visible receipts. Include provider sandbox and native flow evidence. A copied SQL test is supplementary, not a substitute for calling the active route/service.

### Stage D — native reference quality

Run the evidence set in section 6. Replace placeholder goldens with approved captures. Repair the visual pipeline convention and ensure screenshots compare meaningful content, not blank images. Use independent critique of actual results, preserving accessibility rather than shrinking content to fit.

### Stage E — recovery, security and release

Produce a backup, verify checksum/encryption, upload/download it and restore into a specifically authorized disposable database. Check schema, records and financial invariants; record snapshot age and restoration time. Test correct handling of versioned backup objects and erasure policy.

Prove signed update, invalid-signature rejection, correct channel/runtime mapping and rollback on native builds. Exercise alerts and the chaos harness with mandatory checks executed, not skipped. Record exact commit/image digest, applied migrations, flags, provider modes and device versions.

### Stage F — bounded monitored launch

Choose geography, categories, payment providers and financial capabilities deliberately. Keep unsupported capabilities disabled server-side and remove dead-end UI. Have staffed support/moderation and incident ownership, a rollback decision, measured capacity and a privacy/rights review appropriate to the actual product. This report is not legal authorization or classification of Co-Own.

## 10. Prioritized next tickets

| Priority / owner | Ticket | Closure evidence |
|---|---|---|
| P1 payments/mobile | Complete auction Stripe initiation and shared payment contract | Device-to-provider-to-order success, cancellation, SCA and replay |
| P1 financial backend | Prevent settled Co-Own context from authorizing another payment | Complete trade then attempt context transfer; no second debit/fee misrouting |
| P1 finance/accounting | Reconcile auction escrow, seller entitlement and currency units | Payment→held funds→fulfilment/refund→payout journal with no fictional conversion |
| P1 trading policy | Apply halt, exit and eligibility checks to DRIP; resolve primary lockup policy | Automated/manual parity under halt, suspension, lockup, exit and retry |
| P2 trading concurrency | Enforce transaction-wide lock order and safe retries | Opposite counterparties on two assets cannot create an unhandled deadlock |
| P1 database | Repair vector migration path before 326 and after 326 | Actual populated upgrade matrix, checksums and recovery procedure |
| P1 search/platform | Replace session lock through transaction pool | Concurrent multi-process reindex and crash recovery on actual topology |
| P1 trust/platform | Complete moderation credentials/text provider and bounded own-object reads | Final-container provider test, stream limits and held-item recovery |
| P1 creator/offline | Atomic or recoverable moodboard batches | Fail enqueue/send of second operation; no hidden partial later mutation |
| P1 mobile/accessibility | Restore readable scalable checkout essentials | Native large-text completion with no clipped total or hidden primary action |
| P2 discovery | Make persisted preference Undo a real inverse | Undo during/after request survives refresh, remount and other device |
| P2 editorial | Route to the selected article/content identity | Open correct full content and return to same feed position |
| P2 search/observability | Measure completed indexing and visibility lag | Delayed/failed tasks show correct status and alert, fallback is separate |
| P1 platform/privacy | Complete backup manifest/version/erasure semantics | Pre-erasure snapshot uploaded later and noncurrent-version cases cannot falsely report purge |
| P1 recovery/release | Harden actual restore target identity and truthful rollback execution | Query overrides rejected; authorized disposable restore and verified rollback |
| P1 QA/release | Real database, final-image, provider and native gates | Zero skipped mandatory cases, exact-head CI and retrievable evidence artifacts |
| P2 ML/data | Benchmark one real serving model before broad AI expansion | Versioned dataset, baseline comparison, shadow/rollout/rollback report |

P1 here means a launch-blocking or high-priority correctness gap in the relevant enabled scope. It is not the visual scanner's unrelated P0/P1 classification. A restricted launch may exclude a department only with server-enforced isolation and honest product scope.

## 11. Evidence needed for the next review

Bring the exact commit and final artifact identity; successful mandatory CI; real PostgreSQL/PgBouncer migration and concurrency results; provider sandbox payment/refund traces; final-worker queue effects; backup restore report; signed native update/rollback proof; and actual reference-comparison screenshots/recordings. For ML, add measured held-out quality and serving-version evidence.

The next audit should verify those results instead of repeating a large feature inventory. The central question is now: **do the repaired components remain correct when they interact under failures, retries, concurrency and real device constraints?**

## 12. Scope and limitations

This is a deep review of changed/high-risk paths and previously named findings, not formal verification of every line or a penetration test. Current official sources were consulted for comparisons and technical semantics; no competitor purchase or private architecture assessment was performed. No iOS/Android visual score is invented. Detailed appendices below contain current source evidence, qualified closure matrices, remaining defects and department-specific acceptance tests.


## Appendix A. Frontend closure matrix and detailed next upgrades

### Judgment

This is a meaningful closure pass. Many previously identified state defects now have direct fixes and production-hook tests. Credit the exact behavior repaired rather than repeating the previous “all open” assessment. Remaining priorities are the reduced accessibility scaling introduced by the new typography policy, incomplete editorial navigation, truthful late Undo behavior, and robust partial moodboard persistence. Native visual/interaction quality remains unverified.

Closure count across the 19 prior findings: **14 source-closed, four partial, one open/regressed**. Source-closed means the reported code path has been repaired; it does not mean the feature has passed native usability, real-provider, or end-to-end validation. FRESH-04 native payments in particular still requires actual provider/device verification.

Executed validation results: frontend typecheck passed; full suite 130 files with 129 passing and one failing, 2,244 tests total (2,241 pass, one fail, two skipped). Remaining reported failure concerns screenshot directories; golden gate exits 2. The validation run confirms original 12 screenshot artifacts remain 1×1, so they do not constitute native visual proof. The validation run also confirms visual audit 50 P0 / 36 P1 unchanged and icon audit 1,492 warnings / 14 informational findings. Treat scanner labels as tool findings to triage, not independently confirmed runtime severities. The previously failing distribution-date case passes after the calendar-date fix.

### Prior FRESH findings

| ID | Verdict | Evidence and remaining verification |
|---|---|---|
| 01 Live cached-refresh blank body | Closed in source | [screens/LiveShoppingHomeScreen.tsx:367–369](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/LiveShoppingHomeScreen.tsx#L367-L369) separates initial error from cached content; cached summary continues rendering. The screen also guards overlapping loads around `198–225`. Test retained content after failure, successful retry, and old finisher not clearing new refreshing state. |
| 02 Search request identity | Closed for reported query/filter race | [hooks/discovery/useDiscoverySearch.ts:113–125](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/hooks/discovery/useDiscoverySearch.ts#L113-L125) establishes epoch; pagination around `245–299` checks it before results/error/finalizer writes. [__tests__/discoverySearchRequestIdentity.test.tsx:118,159,198](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/discoverySearchRequestIdentity.test.tsx#L118) exercises delayed previous-query page, filter change, and out-of-order initial requests. Account identity is not included in this effect; session lifecycle is a separate verification requirement. |
| 03 Invisible page error | Closed in source | Separate page error and retry hook; [screens/UnifiedDiscoveryScreen.tsx:567–568](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/UnifiedDiscoveryScreen.tsx#L567-L568) wires them; [components/discovery/DiscoverySearchResultsView.tsx:300–316](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/discovery/DiscoverySearchResultsView.tsx#L300-L316) exposes retry with retained results. Hook test at [discoverySearchRequestIdentity.test.tsx:241](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/discoverySearchRequestIdentity.test.tsx#L241) covers failed page. Check native footer placement and repeated retry/dedup. |
| 04 False branded-wallet action | Original defect closed in source; real payment verification required | [screens/CheckoutScreen.tsx:976–980](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/CheckoutScreen.tsx#L976-L980) now gates platform support and fail-closed capability and passes separate wallet handler/eligibility. [components/checkout/CheckoutFooter.tsx:137–174](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/checkout/CheckoutFooter.tsx#L137-L174) invokes wallet callback. [hooks/checkout/useCheckoutPaymentFlow.ts:837–890](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/hooks/checkout/useCheckoutPaymentFlow.ts#L837-L890) calls native confirmPlatformPayPayment instead of card PaymentSheet. Test actual native provider flow, accepted-offer order, cancellation, stale total, and settlement. Do not infer successful payments from source/typecheck. |
| 05 Paused position sheet | Closed in source | [screens/PortfolioScreen.tsx:215](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/PortfolioScreen.tsx#L215) uses `formatPositionStatusLabel`; [components/portfolio/portfolioViewModels.ts:145](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/portfolio/portfolioViewModels.ts#L145) derives label from authoritative formatter. Validate paused/open-with-reserved/closed rows and sheets together. |
| 06 Profile statistic no-op | Closed in source | [screens/MyProfileScreen.tsx:140–152](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/MyProfileScreen.tsx#L140-L152) selects listings and scrolls to measured tab content; `335–338` provides measurement callback. StorefrontTabs returns a fragment, so content layout is in outer scroll content, not an extra wrapper-relative coordinate. Native verify cover offsets and large text rather than inventing a coordinate bug. |
| 07 Unbounded reorder render | Structural defect closed | [components/myprofile/ClosetGrid.tsx:62–64](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/myprofile/ClosetGrid.tsx#L62-L64) always caps inline preview; dedicated modal at `78–113` contains scrolling FlashList. Native verify 1,000-item memory/frames, save error, Android back while saving, and accessible reorder controls. A FlashList declaration alone is not measured performance proof. |
| 08 Editorial dead end | Partial | Hero now pressable and generic Galleria destination wired at [UnifiedDiscoveryScreen.tsx:480–486](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/UnifiedDiscoveryScreen.tsx#L480-L486). But no editorial ID is passed and Galleria still shows static title/byline/excerpt cards. See S21-02. |
| 09 False condition-photo label | Closed by truthful fallback | [components/itemdetail/ItemDetailItemDetails.tsx:88–98](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/itemdetail/ItemDetailItemDetails.tsx#L88-L98) now opens index 0 with “View all photos”; no arbitrary last-photo-as-evidence claim. Tagged condition evidence remains a future enhancement, not a prerequisite for this fix. |
| 10 Discovery freshness attribution | Closed in source | [UnifiedDiscoveryScreen.tsx:611–612](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/UnifiedDiscoveryScreen.tsx#L611-L612) passes module failures plus listing error; DiscoveryFeedView renders named module retries in relevant positions. [discoveryFailureAttribution.test.tsx](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/discoveryFailureAttribution.test.tsx) is relevant runtime coverage. Verify combinations including every optional module failed while listings succeed. |
| 11 Settings identity/malformed balance | Partial closure | [hooks/settings/useSettingsScreenData.ts:33–57](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/hooks/settings/useSettingsScreenData.ts#L33-L57) clears previous value on identity-effect execution and validates finite availableGbp, removing malformed-success→zero. Still no focus/mutation refresh in this hook, and clearing in useEffect does not strictly prevent one render of old value under new identity. Key snapshot state by user ID if retained-hook isolation is required. Ordinary navigation remount may prevent visible leakage; not observed. |
| 12 Font scaling | Open; regression in touched checkout | Named tiers replace literals but utility is 1.3, heading 1.5, content 2 ([theme/typography.v2.ts:289–292](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/theme/typography.v2.ts#L289-L292)). Amounts/fees/totals/payment labels previously capped at 2 now use utility 1.3. Shared Text.tsx still has many 1.5/1.8 caps. Naming is not accessibility closure. See S21-01. |

### Prior S20 findings

| ID | Verdict | Evidence |
|---|---|---|
| 01 Visual reset race | Closed in source | [hooks/visualsearch/useVisualSearchResults.ts:58–63](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/hooks/visualsearch/useVisualSearchResults.ts#L58-L63) invalidates controller and epoch; reset around `209–222` calls it before clearing; photo removal/replacement and unmount also invalidate. New visualSearchResults hook tests cover late-response behavior. |
| 02 Visual fallback provenance | Closed in source | [useVisualSearchResults.ts:139–189](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/hooks/visualsearch/useVisualSearchResults.ts#L139-L189) tracks itemsFromCache and clears visualMatching, region queryScope, API facet counts; marks filter_only/partial. Thus metadata follows displayed collection. Optional UX refinement: offer fallback explicitly when a precise crop has no matches instead of automatically substituting. |
| 03 Crop accessibility actions | Closed at code contract | [components/visualsearch/VisualSearchRegionCropper.tsx:413–430](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/visualsearch/VisualSearchRegionCropper.tsx#L413-L430) supplies values, actions, and handlers for frame/corners. Verify actual VoiceOver/TalkBack move/resize, step sizes, bounds announcements, and cancel/confirm on device. |
| 04 Moodboard failed inverse consumed | Main defect closed, durability edge open | Typed SubmitBoardOpsOutcome, applied/queued-only history advancement, reconcile on failed/conflict/forbidden. [moodboardHistoryOutcome.test.tsx:143–221](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/moodboardHistoryOutcome.test.tsx#L143-L221) mounts production history hook against outcome stubs. Partial storage enqueue and concurrent reconciliation still need integration coverage (S21-04). |
| 05 Feed-control persistence/undo/scope | Partial | New notices distinguish saving/session/failed, retry exists, early Undo cancels pending timer; explicit search now bypasses hidden IDs ([UnifiedDiscoveryScreen.tsx:469–478](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/UnifiedDiscoveryScreen.tsx#L469-L478)). Late Undo does not actually remove backend interaction exclusion; delayed jobs lack captured account ownership. See S21-03. |
| 06 Blocked-seller public Q&A | Closed in source | ItemDetailSheets now propagates blocked flag; [components/product/ListingQA.tsx:157](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/product/ListingQA.tsx#L157) guards submit and `232–240` replaces composer with explicit relationship note. Public evidence stays readable. Test blocked while sheet open and server-enforced relation races. |
| 07 Replay response identity/URL retry | Closed in source | [screens/LiveStreamReplayScreen.tsx:197–229](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/LiveStreamReplayScreen.tsx#L197-L229) guards load/error/unmount by epoch; retry `263–277` fetches fresh payload and handles null/no-recording truth. [liveStreamReplayRace.test.tsx:178,211](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/liveStreamReplayRace.test.tsx#L178) verifies stale session response and new URL on retry. Actual playback/background/audio remains native verification. |

### Current priority findings

#### S21-01 — Typography policy reduces money/action accessibility (high)

[theme/typography.v2.ts:271–287](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/theme/typography.v2.ts#L271-L287) says fixed chrome clipping is why caps must stay, with utility 1.3. The checkout diff replaces prior multiplier 2 with that tier on item/delivery/protection amounts, total, breakdown affordance, and Apple/Google/card button labels ([components/checkout/CheckoutFooter.tsx:93–126,153,173,213](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/checkout/CheckoutFooter.tsx#L93-L126)). This changes functional content from 200% maximum to 130%. A structural lint asserting “uses named tier” will pass while the user loses readable sizing.

Requirement: distinguish decoration from financial and action content; allow the latter to scale and reflow. Fix fixed-height layout or use adaptive layout rather than restricting OS accessibility size. Inspect the absolute footer on narrow phones with 200% text, system maximum supported text, long translated labels, and large amounts. Total and fees must remain fully readable; pay controls reachable; screen-reader order unambiguous. The old shared text components must migrate to an actual accessibility policy, not merely named smaller caps.

#### S21-02 — Editorial opens another teaser, not the named story (medium)

[UnifiedDiscoveryScreen.tsx:480–486](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/UnifiedDiscoveryScreen.tsx#L480-L486) claims the Galleria home presents the same piece in full, but no piece identifier is passed. [components/galleria/GalleriaHeroEditorialCard.tsx:21–47](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/galleria/GalleriaHeroEditorialCard.tsx#L21-L47) is a noninteractive View with title/byline, while [GalleriaEditorialListItem.tsx:59–61](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/galleria/GalleriaEditorialListItem.tsx#L59-L61) truncates the excerpt and has no reading action. The reported no-op has improved to real navigation, but a title+read-time promise still does not lead to a complete story.

Requirement: add a supported full editorial destination identified by ID or explicitly present this control as “Explore Galleria” without suggesting it opens a particular article. Acceptance: tap the shown article, reach its actual readable content, back preserves discovery position, removed/private editorial has recovery. Do not label the destination complete solely because navigation.navigate exists.

#### S21-03 — Late Undo cannot undo recommendation suppression; delayed jobs lack account ownership (medium-high)

Early Undo is real: [UnifiedDiscoveryScreen.tsx:329–340](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/UnifiedDiscoveryScreen.tsx#L329-L340) cancels the four-second timer before mutation. After saving starts, however, completion at `308–312` compensates with `undoItemNotInterested`, which only writes item-direction usual ([services/recommendationFeedbackApi.ts:193–208](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/services/recommendationFeedbackApi.ts#L193-L208)). The original `not_interested` interaction is never retracted. Backend [backend/api/src/routes/recommendations.ts:916–920](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/recommendations.ts#L916-L920) independently adds every such interaction to excludedListingIds; usual in the intent ledger does not erase that exclusion. Consequently the UI removes local hidden ID and refetches, yet the server can still suppress the item. Compensation failures are discarded too.

Additionally pendingHides stores listing/attribution/timer, not originating user ID ([UnifiedDiscoveryScreen.tsx:245–253,399–409](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/UnifiedDiscoveryScreen.tsx#L245-L253)). The service resolves current user when delayed job executes ([recommendationFeedbackApi.ts:127](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/services/recommendationFeedbackApi.ts#L127)), and unmount flush invokes the same current-user service ([UnifiedDiscoveryScreen.tsx:372–388](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/screens/UnifiedDiscoveryScreen.tsx#L372-L388)). A logout/account switch during the grace window can drop or misattribute the choice depending on lifecycle. This is a source-level identity hazard, not an observed cross-account mutation.

Requirement: offer Undo only while it is exact, or implement authoritative reversal semantics that supersede the interaction exclusion. Bind queued jobs to original identity; never re-resolve ownership from a later session. Acceptance: Undo before timer, during successful write, during partial two-write success, and during compensation failure; logout/switch within four seconds; verify recommendation output, not merely local toast or ledger record.

#### S21-04 — Moodboard partial enqueue can outlive a reported failed command (high data integrity)

Typed outcomes fix the old stack advance bug. But [components/moodboard/useMoodboardBoard.ts:351–370](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/moodboard/useMoodboardBoard.ts#L351-L370) still enqueues operations one at a time. If enqueue 1 succeeds and enqueue 2 throws, catch returns failed; already durable prefix remains and can drain later. History keeps the entry and reconciles to the current server, but that fetch does not include the prefix that will apply on reconnect. This is neither fully rejected nor fully queued and cannot be represented truthfully by the current simple outcome.

The history lock is also released in finally before failed-inverse reconciliation runs ([components/moodboard/useMoodboardHistory.ts:140–152](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/moodboard/useMoodboardHistory.ts#L140-L152) and analogous redo). Another operation can begin while the reconcile fetch is pending and then be overwritten by its response. `reconcileBoard` itself catches fetch errors and leaves local optimistic state ([useMoodboardBoard.ts:191–207](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/components/moodboard/useMoodboardBoard.ts#L191-L207)), so failed reconciliation is not a rollback.

Requirement: atomically enqueue a command batch or track a command ID and durable prefix with recoverable completion. Keep command/reconcile ordering explicit. Tests: fail second storage write; reconnect; retry same undo; assert no late partial edit or duplicate; fail reconciliation while offline; invoke second undo/normal edit while reconcile is pending. Current history outcome tests mock submitBoardOps result and do not exercise actual SQLite enqueue boundaries.

#### S21-05 — Settings freshness is still a separate unfinished requirement (medium)

The snapshot is loaded only on currentUser.id change. Returning from a withdrawal/top-up/earnings update with same identity does not trigger this hook's fetch. A null reset in an effect removes stale ownership after commit, but an identity-tagged value is needed to guarantee render-time isolation.

Requirement: use identity-scoped query ownership and relevant focus/mutation invalidation. Acceptance: current account changes balance elsewhere, returns to Settings, sees fresh or explicitly stale amount; retained A→B hook never emits A's amount as B's value. Preserve the new malformed-response validation.

### Test-quality progress and gaps

The suite now contains better targeted runtime coverage than Sep20. [discoverySearchRequestIdentity.test.tsx](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/discoverySearchRequestIdentity.test.tsx) tests real hook races with deferred requests; [visualSearchResults.test.tsx](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/visualSearchResults.test.tsx) tests real hook state/provenance; [liveStreamReplayRace.test.tsx](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/liveStreamReplayRace.test.tsx) mounts replay with competing session responses; [stateTruthfulnessRepairs.test.tsx](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/stateTruthfulnessRepairs.test.tsx) exercises overlapping live loads and forward moodboard outcome behavior. These directly match reported failures and deserve credit when the executed suite confirms passing.

Limits still matter:

- Moodboard history tests prove the consumer's response to stubbed applied/queued/failed, not atomic durable storage or real transport outcome propagation.
- Branded-wallet capability policy tests plus source-string wiring checks do not prove native tender confirmation, provider amount/currency correctness, cancellation, or settlement recovery. Test the production handler around mocked Stripe confirmation, then device/sandbox provider flow.
- Named-cap lint at [stateTruthfulnessRepairs.test.tsx:1186–1209](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/__tests__/stateTruthfulnessRepairs.test.tsx#L1186-L1209) protects a coding convention; it cannot demonstrate readable 200% text and now permits the accessibility regression above.
- Footer retry tests must verify the callback really repeats the failed page and preserves list position/saved state; having a string “Retry” is insufficient.
- Recommendation controls need a real interaction+intent+retrieval test; isolated toast or mutation assertions miss late Undo's hard exclusion.
- Public Q&A needs both rendered capability and server rejection tests; disabling the primary dock alone was insufficient in the previous revision.

The calendar-date failure from Sep20 is also addressed intentionally: [utils/dateFormat.ts](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/utils/dateFormat.ts) now has calendar-date semantics with UTC formatting, and CoOwnDistributionCalendar calls the helper. Validate explicit Chicago/UTC/positive-offset zones and invalid/date-only/instant inputs; do not conflate business calendar dates with ordinary activity timestamps.

### Next quality pass

1. Resolve S21-01, S21-03, and S21-04 first: they affect readability, trust in controls, and durable editing correctness.
2. Finish editorial destination and settings freshness; retain all correctly repaired state distinctions.
3. Exercise complete journeys: delayed search→PDP→native-wallet checkout→pending/receipt; discovery hide→undo→revisit; profile reorder→save failure/retry; moodboard edit→offline undo→restart/reconnect; live cached refresh→replay URL expiry/retry.
4. Native visual review on iOS/Android, narrow/large phone, light/dark, normal/200% text, reduced motion, keyboard, and screen reader. Look for first-viewport media dominance, one useful primary action, restrained separators rather than repeated cards, honest empty/stale/error copy, reachable controls, media crop fidelity, safe-area geometry, and preserved scroll position.
5. Only then revise hierarchy/spacing per reference. This source pass cannot establish that the product now matches Instagram/Pinterest/Depop polish or that new reference screenshots are exceeded. No native render evidence was produced by this source-inspection workstream.

Section 7 provides the cross-department screen-family upgrade inventory. This document narrows the next pass around verified closures and concrete remaining defects rather than restarting the entire design plan.

## Appendix B. Financial, auction and Co-Own closure matrix

### Decision and material change

**The upgrade substantially fixes the previous findings; the old claim that all fourteen financial findings remain open is now wrong.** Twelve have their original mechanism corrected in active source. FIN-02's normal trading conversion is corrected, but a separate P2P context validator retains the old parity assumption; FIN-08 is only partially corrected because it authorizes an extra payment against an already-paid trade. Release still needs the concrete follow-ups below, especially usable auction payment, fully connected auction escrow/accounting, and transaction-wide concurrency tests.

### Revalidation of every previous FIN finding

| Finding | Current disposition | Current source evidence and limits |
|---|---|---|
| FIN-01: auction marked paid without payment | **Original direct mutation defect fixed in source** | [backend/api/src/routes/auctions.ts:707](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/auctions.ts#L707) creates/reuses canonical payment intents; `:121-258` requires succeeded intent, server-written winner binding, payer, authoritative amount and seller eligibility before settlement. Verified webhook invokes it within transaction at [backend/api/src/index.ts:31412-31430](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/index.ts#L31412-L31430). Creation alone no longer writes paid. See new auction completion/escrow issues below; not a full release certification. |
| FIN-02: GBP treated as USD 1ZE | **Normal trade/DRIP conversion fixed; residual validator mismatch** | [backend/api/src/lib/pricingEngine.ts:761-814](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/pricingEngine.ts#L761-L814) resolves currency context and divides GBP by anchor value × FX. [backend/api/src/lib/coOwnTransfer.ts:225-245](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/coOwnTransfer.ts#L225-L245) and DRIP `:288-311` use this; multi-fill placement resolves once at [routes/coOwn.ts:3727-3731](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/coOwn.ts#L3727-L3731). Rate provenance is recorded in wallet metadata. [walletMoneyPath.ts:699-704](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/walletMoneyPath.ts#L699-L704) still incorrectly uses GBP×1000 for P2P context validation, covered below. Persisted quote lifetime/repricing and historic correction still need operational acceptance. |
| FIN-03: other debits consume order reservations | **Reviewed active paths corrected in source** | New [walletMoneyPath.ts:245-349](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/walletMoneyPath.ts#L245-L349) locks wallet/reservations and computes/enforces spendable funds. Active guards appear in internal checkout `index.ts:7586`, burn `:22031`, conversion `:22420`, P2P `:23148`, withdrawal acceptance `:23767`, and DRIP [coOwnDripExecutionHandler.ts:358-384](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L358-L384). Co-Own excludes its own placed order through helper. `applyWalletLedgerDelta` itself remains gross-balance-only, so future callers must retain the explicit guard; do not label all future paths inherently protected. See lock-order issue below. |
| FIN-04: concurrent idempotent transfer duplicates debit | **Claim mechanism fixed in source** | [walletMoneyPath.ts:440-596](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/walletMoneyPath.ts#L440-L596) atomically inserts pending claim before effect, serializes on unique key, checks hash and completes response in same transaction. Transfer claims before mutation at `index.ts:22957`; analogous active paths updated. Real PostgreSQL concurrent route acceptance remains necessary; helper tests alone do not demonstrate whole-route correctness. |
| FIN-05: Co-Own bypasses segments | **Normal forward mutation fixed in source** | [coOwnTransfer.ts:369-424](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/coOwnTransfer.ts#L369-L424) calls `debitCoOwnOnezeUnits`/`creditCoOwnOnezeUnits`; [coOwnSettlement.ts:423-624](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/coOwnSettlement.ts#L423-L624) couples canonical wallet mutations to purchased/earned segments and origin events. DRIP calls the same helpers at [coOwnDripExecutionHandler.ts:440-479](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L440-L479). Historical parity repair is a classification policy, not proof original provenance was recovered. |
| FIN-06: DRIP debits with missing issuer wallet | **Fixed in source** | DRIP [coOwnDripExecutionHandler.ts:330-351](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L330-L351) checks issuer wallet before debit and records explicit failure. Credit helper throws on missing wallet, so transaction rolls back. Migration 336 supplies ledger-leg uniqueness backstop; requires migration deployed. |
| FIN-07: lockup disclosure not enforced | **Original resale bypass fixed in source** | Shared command guard [coOwn.ts:669-727](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/coOwn.ts#L669-L727), reserve `:3180`, place `:3712`, and settlement backstop [coOwnTransfer.ts:218](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/coOwnTransfer.ts#L218) enforce effective end date (including month fallback). Scope now also blocks primary buys; see policy consistency concern below. |
| FIN-08: arbitrary closed-loop context | **Partially fixed; replace with narrowed open issue** | `index.ts:3861-3872` calls domain context authorization. [walletMoneyPath.ts:624-755](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/walletMoneyPath.ts#L624-L755) verifies trade exists, settled, participants and amount; platform_reward requires admin. Migration 333 makes committed context single-use. However an already-paid DvP trade is being used as authorization for another payment. |
| FIN-09: auction retry never replays | **Original settled-retry failure corrected in source** | [auctions.ts:760-798](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/auctions.ts#L760-L798) checks authorization then replays paid order. `:824-855` reuses a live intent; server binding plus migration 334 unique live (auction,winner) reduces concurrent duplicate attempts. Provider creation/binding races still deserve end-to-end fault injection, not just mock tests. |
| FIN-10: unsigned Mollie payload trusted on lookup failure | **Fixed in source** | [paymentProviders.ts:590-664](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/paymentProviders.ts#L590-L664) requires valid ID/successful retrieval for unsigned callbacks, derives data only from retrieved object and throws retryable verification error instead of fallback. Webhook maps retryable failures at `index.ts:31089`. Authenticated signed/stored replay path is explicitly distinct. |
| FIN-11: null tradeId rejected by alert drain | **Fixed in source** | [outboxDrainHandler.ts](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/outboxDrainHandler.ts) alert schema now accepts nullable optional trade ID and mark provenance; evaluator returns null with explicit reference source. No longer rejects legitimate no-trade marks. |
| FIN-12: rearmed alert collides with old dedup | **Fixed in source** | Migration 331 adds activation_seq. Evaluator re-reads it under row lock ([coOwnAlertEvaluatorHandler.ts:189-205](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/coOwnAlertEvaluatorHandler.ts#L189-L205)) and keys outbox by alert+activation at `:248-249`; drain propagates activation into notification key. PATCH increments activation on rearm. |
| FIN-13: standalone DRIP failure receipt not atomic | **Fixed in source** | [coOwnDripExecutionHandler.ts:768-794](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L768-L794) now obtains one client, BEGINs, conditionally updates failure, appends receipt on that client, COMMITs; failures ROLLBACK. |
| FIN-14: low balance receipt falsely says cash paid | **Fixed in source** | [outboxDrainHandler.ts:1065-1082](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/outboxDrainHandler.ts#L1065-L1082) now says reinvestment skipped because available 1ZE was too low, no units purchased, any existing cash unchanged. Worker records observed spendable/required evidence [coOwnDripExecutionHandler.ts:365-375](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L365-L375). No longer claims an unobserved credit. |

### Actionable remaining/new findings

#### SEP21-FIN-A — High: auction Pay creates a Stripe intent but never presents or confirms payment

**Evidence:** [frontend/src/hooks/useAuctionDetail.ts:490-533](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/hooks/useAuctionDetail.ts#L490-L533) receives intent, including clientSecret, then only calls `waitForPaymentIntentSettlement(intent.id, ...)`. [frontend/src/services/checkoutPaymentIntent.ts:18-65](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/services/checkoutPaymentIntent.ts#L18-L65) only GETs status and optionally opens nextActionUrl; it does not attach a payment method or confirm a Stripe intent. Backend `index.ts:6578-6597` creates Stripe PaymentIntent with automatic methods and optional payment_method but no `confirm:true`. The normal checkout flow correctly calls `initPaymentSheet` and `presentPaymentSheet` at [frontend/src/hooks/checkout/useCheckoutPaymentFlow.ts:902,931](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/src/hooks/checkout/useCheckoutPaymentFlow.ts#L902).

**Trigger/impact:** a normal Stripe auction winner taps Pay. Intent remains requires_payment_method (no method sent by this caller) or requires_confirmation (saved method); no PaymentSheet opens, and polling cannot produce the missing confirmation. User gets pending messages while unable to finish purchase through this UI. This is an active caller failure introduced by replacing fake payment with real intent handling.

**Fix/acceptance:** hand off to the canonical payment UX with client secret/customer context and PaymentSheet/confirmation, then poll authoritative completion. Run native winner checkout with fresh card, saved card, 3DS, cancel, failed card, retry and app resume; exactly one captured intent/order must result. Do not repair by reintroducing optimistic paid state.

#### SEP21-FIN-B — High: settled Co-Own trade authorizes an additional P2P payment, using obsolete FX

**Evidence:** [backend/api/src/lib/walletMoneyPath.ts:610-714](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/walletMoneyPath.ts#L610-L714) intentionally accepts only a `settled` trade, validates its buyer/seller and computes expected units as `(notional_gbp + fee_gbp) * 1000`. Live transfer calls this at `index.ts:3861-3872` then later performs sender/recipient wallet mutations. But real DvP [backend/api/src/lib/coOwnTransfer.ts:337-424](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/coOwnTransfer.ts#L337-L424) already inserts settled trade and transfers wallet funds in the same transaction. It does not insert a `wallet_ize_transfers` row, so the validator's prior-use query at [walletMoneyPath.ts:735-753](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/walletMoneyPath.ts#L735-L753) finds no consumed transfer context for that DvP execution.

**Trigger/impact:** buyer supplies a real completed trade ID and old-parity amount to P2P transfer; first extra payment can be accepted despite the trade having already been fully funded. Migration 333 prevents repeating that P2P context, but does not prevent the first second-payment against original DvP. The old parity calculation also disagrees with newly fixed trading FX, and credits the recipient the entire transfer rather than canonical seller-net leg. This is not arbitrary wallet theft: caller still controls sender and needs funds; it is broken closed-loop economic authorization/provenance and duplicate economic consideration.

**Fix/acceptance:** disallow public P2P payment for already-settled DvP trades, or introduce a real unpaid obligation whose settlement is atomic with transfer and trade state. Do not treat evidence that payment already happened as authorization to pay again. Test an ordinary real DvP trade followed by direct transfer with same context: reject before debit. Test non-unit GBP/USD, fee handling, concurrent retries, real participants and nonexistent/mismatched contexts.

#### SEP21-FIN-C — High: verified auction payment still bypasses normal commerce escrow and currency accounting

**Evidence:** auction intent creation forwards `channel:'commerce'` without `orderId` ([auctions.ts:356-375](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/auctions.ts#L356-L375)). Canonical commerce settlement only enters order/escrow branch when `updatedIntent.order_id` exists (`index.ts:7456`). Auction helper creates its paid order afterwards ([auctions.ts:297-321](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/auctions.ts#L297-L321)) and invokes legacy `postAuctionSettlementLedgerEntries` instead of normal order settlement. That helper ([backend/api/src/lib/workerRuntime.ts:474-605](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/workerRuntime.ts#L474-L605)) credits escrow with winning bid, immediately debits all of it for seller-net and platform fee, and chooses a seller `ize_wallet` account denominated `IZE` (`:498-505`) while writing entries with only amountGbp and no explicit currency (`:551-576`). `appendLedgerEntry` defaults currency to GBP at `:365`. No wallet/segment credit or GBP→1ZE conversion occurs in this helper.

**Impact:** successful provider capture now has real money behind it, but its resulting auction order does not traverse the standard commerce hold, settlement/provisioning and seller-credit accounting. Escrow is cleared immediately at payment, and account currency and entry currency disagree. This is narrower and more evidenced than a blanket claim that all auction payments remain fake. The exact downstream payout symptom depends on which balance reader consumes the account; production reconciliation and fulfilment tests must establish it.

**Fix/acceptance:** create/bind canonical auction order before payment (with intended shipping/address/protection terms), then route verified capture through canonical commerce settlement, or implement explicitly equivalent auction hold/release semantics with currency-correct postings. Verify captured auction → escrow held → fulfilment → delivery/protection hold → payout; refund/dispute before delivery keeps seller from cashing out. Assert ledger entry currency matches account currency and balances reconcile to provider capture at non-unit FX.

#### SEP21-FIN-D — Medium: canonical multi-wallet locking is defeated by the route's earlier actor-wallet lock

**Evidence:** placement already locks the initiating actor wallet at [backend/api/src/routes/coOwn.ts:3733-3740](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/coOwn.ts#L3733-L3740). Later [coOwnTransfer.ts:255-264](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/coOwnTransfer.ts#L255-L264) locks both counterparties in sorted wallet-ID order. A sorted helper cannot reorder locks already held by its caller.

**Schedule:** user A's incoming order on asset X locks wallet A; user B's incoming order on asset Y locks wallet B. Both match resting orders owned by the other user. Each later needs both wallets; one waits for B, the other for A. Different asset locks do not serialize these two transactions. PostgreSQL resolves deadlock by aborting one otherwise valid order. This does not establish balance corruption; it establishes avoidable money-path failure despite documented lock-order guarantees.

**Fix/acceptance:** define one transaction-wide acquisition order including asset/order/wallet/reservation/holding locks, gather/lock counterparties before actor-specific wallet locks where feasible, and implement bounded safe retries for serialization/deadlock errors. Test actual concurrent order routes on two assets with opposite counterparties, not only the extracted transfer helper in isolation.

#### SEP21-FIN-E — Medium: lockup fix applies contradictory policy to primary issuance and DRIP

`coOwn.ts:704-710,3180-3191,3712-3724` pauses/rejects all order sides while lockup active. [coOwnTransfer.ts:214-218](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/coOwnTransfer.ts#L214-L218) always asserts resale permission even when `enforceSellerHolding:false` is the primary-pool issuance case. The stored lockup contract describes secondary resale restrictions ([279_coown_wave11_contracts.sql:23-26](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/db/migrations/279_coown_wave11_contracts.sql#L23-L26)). DRIP meanwhile can still buy available primary units; it checks is_open but does not call this lockup guard.

If lockup is meant to restrict resale while allowing subscriptions, initial investors cannot buy through normal issuance while DRIP can. If it is intended to pause all purchases, DRIP bypasses it. Resolve product policy explicitly and enforce a shared distinction between primary issuance, secondary transfers, buyout and DRIP. Acceptance: future lockup with available primary units has consistent, intentional results for normal primary buy and DRIP, while secondary sell remains blocked; expiry reopens intended capabilities.

#### SEP21-FIN-F — High: DRIP still bypasses trading halt and market/compliance checks

The DRIP worker checks `asset.is_open` ([coOwnDripExecutionHandler.ts:193-225](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L193-L225)), price, supply/headroom, wallets and balances, then calls segment debit/credit. It does not evaluate reconciliation halt, active corporate exit, market eligibility or wallet settlement capability. Manual placement actively evaluates these ([coOwn.ts](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/coOwn.ts) shared market status and eligibility/capability checks around `:3697-3887`). Segment-aware helpers do not add those policy checks.

Thus a periodic DRIP pass can trade while global reconciliation has paused manual trading, or after a user becomes ineligible. This is not a claim that the external distribution funding exists; conditional on an eligible settled distribution row, this code executes the bypass. Require one shared pre-settlement policy for manual and automated purchases, revalidated transactionally; record truthful skipped/retryable outcomes. Acceptance: reconciliation halt, suspended/blocked recipient and active exit each prevent automated wallet/share effects under the same rules as normal placement. Test unhalt/resolution without double reinvestment.

### Improvements worth retaining

- Real payment intent integration, server-only binding metadata sanitization, unique live auction attempt and paid-result replay are meaningful security improvements. They should be kept while fixing completion/escrow wiring.
- New extracted Co-Own transfer primitive enables tests against production logic rather than copied matching algorithms. Rate context shared across a transaction eliminates original per-fill GBP/USD parity assumption.
- Wallet idempotency claims are transaction-coupled; reservation-aware spendable helper is used across reviewed debit paths; seller credits identify earned provenance.
- Ledger-leg unique index (336) now makes deterministic DRIP transaction ID a real database replay backstop. Historical duplicate rows intentionally block migration and require reconciliation rather than silent deletion.
- Alert activation sequence with lock-time reread, nullable reference/provenance, and receipt outbox atomicity directly fix previous cross-layer contract defects.
- Migration 337 adds bounded retries for state-dependent DRIP failures; missing FX is retryable. Confirm deployment, monitoring and operator requeue policy rather than equating migration source with operational readiness.

### Validation scope

This financial workstream performed source tracing and diff review, not additional suite execution; full-suite results are recorded in section 2. New files [auctionPaymentSettlement.test.ts](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/auctionPaymentSettlement.test.ts), [walletMoneyPathReservations.test.ts](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/walletMoneyPathReservations.test.ts), [coOwnDripSettlement.test.ts](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/coOwnDripSettlement.test.ts), [coOwnAlertLifecycle.test.ts](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/coOwnAlertLifecycle.test.ts) and [coOwnOutboxDrain.test.ts](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/coOwnOutboxDrain.test.ts) are materially better focused coverage. Their pass/fail result must be taken from the actual run in section 2. Mocked DB/provider tests do not prove cross-route lock order, native PaymentSheet completion, applied migrations or live financial conservation.

Release evidence should prioritize real-DB route races, native auction payment, captured-payment escrow/refund/payout, non-unit FX and segment reconciliation, automated-trade halt policy, plus migration application/duplicate reconciliation. Legal/custody rights, distribution funding and reserve adequacy remain operational evidence questions rather than facts established by source comments.

## Appendix C. Backend, search, moderation and ML verification

### Overall assessment

This change closes several previously concrete defects in the real serving paths. Rekognition now sends supported image fields; create/edit publication holds failed/review text; the catalogue importer now uses the shared pinned, deadline-bound transport; root compose removes the ML host port and requires secrets; search credentials have a shared alias resolver; successful index writes/deletes now mirror into a primed fallback; recommendation anchors/neighbours carry one model lineage and preserve distance ordering through the asset-to-listing join.

The remaining release blockers have shifted. The replacement SQL decoder is correct but cannot rescue an upgrade that first fails in unchanged migration 326. The new session advisory reindex lock is incompatible with the shipped transaction-pooling topology. Root compose forwards a moderation provider name but no provider credentials, which combines with the new fail-closed text gate to hold legitimate publication. ANN metadata is corrected inside the helper but remains misleading at its recommendation caller. Training/inference capabilities, vendor integration wiring and soft AI spend controls remain as before.

### Closure matrix

“Closed in source” means the identified defect is repaired in the traced implementation, not that a live provider/deployment has passed acceptance testing.

| Prior finding | Status | Current anchors / judgment |
|---|---|---|
| B1 Rekognition Image.Url serialized away | CLOSED in request construction; new transport concerns below | [lib/moderation/rekognitionProvider.ts:65-75](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/moderation/rekognitionProvider.ts#L65-L75) allows Bytes/S3Object; :470-550 resolves references; :605-614 constructs command; :628 onward sends S3Object with byte fallback. Original unsupported field is gone. |
| B2 failed/review listing text publishes | CLOSED in traced create/edit/status-activation paths | `index.ts:16985-17018` holds active create at risk_pending; :18887-18966 evaluates text/activation, rewrites public status and cancels live lots. [moderationService.ts:137-155](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/moderation/moderationService.ts#L137-L155) centralizes publish/hold/block; :205 onward retries failed once. Nonpublic drafts remain nonpublic and activation reruns moderation. Recovery operations still require validation. |
| B3 active importer DNS check/connect race | CLOSED in catalogue ingress | [lib/media/remoteImport.ts:442-482](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/media/remoteImport.ts#L442-L482) delegates to fetchPinnedRemoteMedia; `safeRemoteMediaFetch.ts:461-496,506-514,661-695` validates DNS, passes pinned dispatcher and revalidates every redirect. Catalogue worker still calls ingestRemoteMedia, so this fixes its actual path. |
| B4 importer body timeout cleared at headers | CLOSED in shared/import path | Shared deadline :618; DNS raced at :661-669; remainder recalculated :676; AbortSignal retained across fetch/body :685-691,761-790. Import :464 uses total legacy connect+read budget. Separate extraction/triage fetchers remain weaker. |
| B5 root ML admin default secret / host port | CLOSED in supplied root production configuration | Root [docker-compose.yml:306](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/docker-compose.yml#L306) onward no longer publishes 8000; prod `:472-484` uses ports !reset[], ENV production and required tokens. [ml-service/app/main.py:63-104](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/ml-service/app/main.py#L63-L104) returns 503 if production token absent. Explicitly configuring a dev token is still possible; missing-token fallback is fixed. |
| B6 search env mismatch | CLOSED across inspected consumers | [meilisearchConfig.ts:19-24](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/meilisearchConfig.ts#L19-L24) resolves KEY then API_KEY; [searchAdapter.ts:250](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/searchAdapter.ts#L250), [vectorSearch.ts:73,109](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/vectorSearch.ts#L73), search config/sync use resolver. Root prod API :248 onward and worker :349 onward forward canonical key with alias/master fallback. Meilisearch SDK constructor rename handled as well. |
| N1 signed float SQL overflow | PARTIAL — decoder repaired; upgrade order still broken | [migrations/330_media_embeddings_bytea_codec_bigint.sql:67](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/db/migrations/330_media_embeddings_bytea_codec_bigint.sql#L67) onward promotes every byte before multiplication. Unchanged 326 still performs failing backfill before 330 can run on affected existing data. See S1. |
| N2 mixed lineages/dimensions in recommendation neighbours | CLOSED for comparison correctness; activation governance remains | [routes/recommendations.ts:970-1019](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/recommendations.ts#L970-L1019) resolves one lineage, restricts anchors and passes full model/version/preprocessor/dimension filter; validates decoded length/finite values. `mediaEmbeddings.ts:473-483` also rejects cross-dimension BYTEA candidates. |
| N3 empty/stale fallback after successful remote writes | CLOSED for demonstrated single-process write/outage sequence; cross-replica limitation remains | [searchAdapter.ts:326-396](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/searchAdapter.ts#L326-L396) mirrors successful and failed writes/removes; `searchSync.ts:388-413` primes directly into local fallback; API boot `index.ts:39370-39377` primes healthy backend processes too. 10,000-row bounded local mirror is still not a complete replicated catalogue. |
| N4 neighbour distance order lost in listing mapping | CLOSED in source | `mediaEmbeddings.ts:282-325` joins ids/distances with ordinality, aggregates minimum distance per listing, orders best distance; recommendations :1021-1048 carries minimum asset distances through mapping and array_position. |
| N5 column existence mislabeled ANN | PARTIAL | `mediaEmbeddings.ts:192-226,438-447` distinguishes index-present ANN capability from exact vector scans. Recommendation caller :1048 still records item_to_item_ann regardless of nearest.method; index existence is not proof query planner actually used it. |
| AI budget hard-cap claims | OPEN, unchanged | [lib/aiUsage.ts:52-74](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/aiUsage.ts#L52-L74) admits against recorded spend without monetary reservation; :205-214 increments only after success, best effort. Concurrent overshoot/reset loss remain. |
| Cost telemetry costMinor scale | OPEN, unchanged | [costTelemetry.ts:174-176](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/costTelemetry.ts#L174-L176) emits raw micro-USD as costMinor alongside USD, whereas currency minor units are cents. costUsd conversion itself is correct. |
| Agent evaluation proves answer/tenant safety | OPEN evidence gap, unchanged harness | [support/evalSuite.ts:455-529](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/support/evalSuite.ts#L455-L529) evaluates routing/tool subset, not executed answers/tools/citations or tenant isolation. Routing test passes must not be represented as model-quality proof. |
| Vendor outbound support synchronization | OPEN wiring gap | Full source caller search still finds processVendorSyncJob definition/export/tests; enqueueVendorEvent only definition. Handler/client unchanged; no newly wired producer/drain. |
| Actual image embeddings / triage / extraction inference | OPEN capability gaps | [mediaEmbeddingHandler.ts:179,302](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/mediaEmbeddingHandler.ts#L179) still generates zero vector unconditionally; moderationTriageHandler :114,192 hardcoded human_review; candidatePipeline OCR/barcode/vision still abstain. |
| ML health truthful champion capability | OPEN | [ml-service/app/main.py:112-115](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/ml-service/app/main.py#L112-L115) still says trained_model when only shadow loaded; recommendation endpoint still uses heuristic champion. |

### Significant residual / new findings

#### S1 — P1 conditional: migration 330 cannot repair migration 326 before it fails

The new migration fixes the arithmetic itself, but its comments incorrectly imply the whole migration path is repaired for every environment. [db/migrate.ts:59-61](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/db/migrate.ts#L59-L61) sorts and iterates migrations; :84-103 executes each pending SQL and records it; :113-119 rolls back/rethrows errors. Unchanged [326_media_embeddings_pgvector.sql:67-70](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/db/migrations/326_media_embeddings_pgvector.sql#L67-L70) evaluates int4 terms; its backfill :105-111 runs before any 330 code. Existing BYTEA rows containing -1.0 (high byte 191) make `191 * 16777216` overflow int4, aborting 326. The runner stops and never executes 330.

Affected case: database currently before 326, pgvector available, real signed embeddings already stored. A clean empty database or a database that successfully ran 326 on zeros can reach 330 and benefit. This is conditional but directly undermines the intended real-model upgrade path. The test [mediaEmbeddingPgvector.test.ts:626-635](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/mediaEmbeddingPgvector.test.ts#L626-L635) intentionally requires 326's buggy arithmetic to remain and assumes fresh databases can always reach the replacement. It does not test the failing upgrade sequence.

Required remedy: a checksum-safe, explicitly ordered repair path that runs before the failing pending backfill (or a reviewed migration-runner compatibility mechanism) while preserving already-applied checksum semantics. Do not simply edit an applied migration. Test three real PostgreSQL upgrade fixtures: pre-326 with signed BYTEA, already-applied 326, and clean database; include pgvector-absent deployment and later enablement. The 330 no-op branch when embedding_vec is absent also does not automatically provision pgvector later, because the migration ledger records skipped files as applied.

#### S2 — P1: new global reindex lease uses session locks through transaction-pool PgBouncer

[lib/searchSync.ts:798](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/searchSync.ts#L798) takes `dbPool.connect()`, :815-819 acquires `pg_try_advisory_lock`, executes the reindex using other dbPool queries, then :861-873 issues `pg_advisory_unlock` and releases the client. Keeping a node-postgres client checked out does not keep a PostgreSQL server session bound through PgBouncer transaction pooling. The session lock can remain on a backend returned to the pool; another logical client can reuse that session and re-enter its lock, or unlock can execute on a different backend and return false. The code ignores unlock's boolean, so no exception is needed for leakage.

Root compose explicitly uses `POOL_MODE: transaction` at :137, with API/worker DATABASE_URL through pgbouncer at :222/:342. MIGRATE_DATABASE_URL goes directly to PostgreSQL for migrations, not this reindex function. Independent configuration inspection confirmed the separate production compose has the same architecture. PgBouncer explicitly lists session-level advisory locks as incompatible with transaction pooling: [official feature compatibility table](https://www.pgbouncer.org/features.html).

This reopens the simultaneous admin/scheduled swap race the new lock was intended to close, and can strand a lock on a pooled server connection. Fix with a dedicated direct/session-pooled connection for the entire lock lifetime, a carefully managed transaction-scoped lock with a truly pinned transaction, or a durable fenced lease. Check unlock result. Validate two simultaneous reindexes through the exact production pooling mode, lock-holder crash, process termination and pool reconnection. Mock-client tests cannot prove session affinity.

#### S3 — P1 deployment functionality: root compose requires provider selection but omits moderation credentials

Root production API/worker now forward required MODERATION_PROVIDER at [docker-compose.prod.yml:281,420](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/docker-compose.prod.yml#L281), but neither root base nor prod API/worker environment forwards `SIGHTENGINE_API_KEY`, `SIGHTENGINE_API_USER`, `AWS_REGION`, `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`. AWS names in this prod file are backup-specific settings and do not inject them into API/worker. There is no env_file forwarding for these services.

[sightengineProvider.ts:86-92](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/moderation/sightengineProvider.ts#L86-L92) explicitly reads the two Sightengine variables and returns unavailable when absent. [rekognitionProvider.ts:133-138](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/moderation/rekognitionProvider.ts#L133-L138) requires all three AWS variables and does not use default role credential resolution. With the supplied compose topology, setting values in the host .env without referencing them in service environment does not put them into the container. A custom deployment override can fix this, but it is not present in the supplied topology.

Consequence after B2's correct safety fix: legitimate active listing writes get failed moderation and persist risk_pending instead of publishing. Even properly configured Rekognition remains image-only: `moderateText` deliberately fails, so using it as the single listing-text provider holds all listing text. Provide a real text-capable provider/configuration separately or require Sightengine for this combined interface. Forward credentials securely, validate required provider-specific settings at boot, and demonstrate approve/reject/review/outage plus operator release in staging. Do not relax the new safety hold to conceal a missing deployment dependency.

#### S4 — P2: new Rekognition own-object byte fallback is not bounded as documented

[rekognitionProvider.ts:401-439](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/moderation/rekognitionProvider.ts#L401-L439) is described as a bounded read. Actual SDK stream path at :423-425 calls `transformToByteArray()` to buffer the entire object and only then checks 5 MiB. `GetObject` at :414-416 has no abort signal; `HeadObject` :368-370 likewise has no caller deadline. `IMAGE_FETCH_TIMEOUT_MS` is only applied to external shared-fetch path at :511-515.

The own-store path is reachable when preflight metadata cannot be verified (:476-501) or provider S3Object access fails (MinIO compatibility fallback :635 onward). An oversized object with unavailable/missing metadata can consume unbounded memory before the size rejection; a stalled own-store body can hold the operation indefinitely relative to the advertised 15-second budget. This is not the old arbitrary remote URL SSRF: references are resolved against the app's configured store. It is a concrete resource-bound failure on the new provider path.

Fix by consuming the SDK stream incrementally with early cancellation at the byte cap, using an AbortController covering Head/Get/body/provider call, and destroying/canceling the body on exit. Test missing or misleading metadata, oversized chunked stream, stalled stream and request cancellation against the actual SDK body interface; a mock returning a small byte array does not exercise memory bounds.

#### S5 — P2: recommendation source still claims ANN for exact and BYTEA fallback

The vector helper now distinguishes `pgvector_exact`, `pgvector_ann`, and `bytea_exact_scan`. [routes/recommendations.ts:1011-1025](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/recommendations.ts#L1011-L1025) reads only hits, discards method, and :1048 unconditionally calls `mergeSource(..., 'item_to_item_ann')`. It gates entry only on vector column :969. Thus when ANN index creation failed but column exists, exact scan results still appear as ANN impressions/source diagnostics. A selected non-512 lineage can take the helper's BYTEA path yet receive the same ANN tag.

Fix by propagating the actual retrieval method into source lineage/diagnostics; if product intends ANN-only serving, gate on that capability and supported dimension. Do not silently present fallback as ANN. Additionally, the helper's indexdef probe proves an index exists, not validity/operator compatibility/query-plan use; use cautious “index available” capability language and real EXPLAIN/latency/recall evidence for execution claims.

#### S6 — P2 reliability: transient DNS failure is classified as permanent SSRF quarantine

The consolidated transport retains another issue: [safeRemoteMediaFetch.ts:475-479](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/safeRemoteMediaFetch.ts#L475-L479) catches any DNS error and returns null. The shared caller at :670-674 classifies null as ssrf_blocked even when it was temporary resolution failure. [remoteImport.ts:418-430](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/lib/media/remoteImport.ts#L418-L430) includes ssrf_blocked in permanent SSRF failures; :477-482 maps it to SSRF_BLOCKED. The catalogue import worker's existing `isSsrfBlock` branch quarantines rather than retrying.

A temporary resolver SERVFAIL/network outage can therefore permanently quarantine legitimate seller media. This behavior existed in parts of the old transport and is not a newly introduced security escape, but transport consolidation does not close it. Separate blocked address, no records, transient resolver failure and deadline outcomes; only actual policy violations should take nonretryable quarantine. Add a mocked temporary DNS failure followed by successful retry as well as real resolver-fault staging validation.

### Remaining capability and operational gaps

- **Model promotion still is not serving activation.** `resolveServingEmbeddingLineage` in `mediaEmbeddings.ts:240-279` selects whichever ready lineage has greatest coverage/newest tie. It does not consult model_artifacts promoted/blocked/retired state. Comparison correctness is improved, but governance should explicitly select an approved champion and permit rollback. Validate retired/blocked model exclusion before introducing real ready embeddings.
- **The actual embedding producer still returns zeros.** A pgvector column, corrected serialization and a valid retrieval caller do not create learned vectors. Keep placeholder rows excluded and do not count N2/N4 closure as image-model delivery. Visual search is still a histogram method; extraction OCR/barcode/VLM and moderation triage remain placeholders.
- **Multi-replica local search remains partial.** Priming and mirroring close the reproduced one-process defect. They do not broadcast writes across API replicas or worker processes; the 10,000-row FIFO cap also truncates catalogue coverage. Current database visibility rechecks for item/all/semantic/autocomplete now prevent many stale non-active results ([routes/search.ts:441,533,610,733](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/search.ts#L441)), an improvement. During outage, replicas can still miss newly created or updated matches; expose coverage/staleness or use SQL fallback.
- **Search catch-up still caps 1000 rows.** `searchSync.ts:664-705` warns but does not paginate through the complete swap window. Settings task completion is now explicitly awaited in acceptance mode, which closes the prior “settings calls accepted but failed asynchronously” concern. Load-test >1000 concurrent changes and require convergence rather than only matching initial document count.
- **Vendor delivery is still not wired.** Producer/scheduler absence, crash-stranded delivering rows and generic vendor envelope concerns from the baseline remain. No source changes in vendor handler/client/adapter close them.
- **Independent weaker media fetchers remain.** The importer/embedding/visual-search shared transport improvements do not automatically rewrite extractionIntelligenceHandler or moderationTriageHandler's own downloadImage implementations. They still clear timeout after headers and buffer arrayBuffer; extraction's hostname check lacks DNS resolution. Direct attacker control of their final verified-media URL is not established, so do not overstate arbitrary-user-URL SSRF. Consolidate them for consistent resource bounds.
- **AI spend/evaluation claims remain unchanged.** aiUsage, costTelemetry and evalSuite have no diff here. Monetary admission uses recorded spend, not reservation; Redis update loss/reset undermines enforcement. Correct costMinor units and validate budget concurrency separately. Routing evaluation does not prove answer correctness/tool authorization. Health continues to equate a loaded shadow with trained serving capability.

### Test-quality assessment and evidence boundaries

The updated tests show meaningful progress: moderation provider tests assert supported request input and refusal cases; importer tests exercise blocked literal/redirect requests and body stalls through mocked fetch; search fallback tests cover healthy writes/recovery deletes; vector tests cover lineage/dimension checks and mapping; lease tests check acquisition failure and unlock control flow.

However:

1. [moderationImportSafety.test.ts:429-454](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/moderationImportSafety.test.ts#L429-L454) tests publish-path wiring via source inspection, not a real transactional create/edit/operator-release route. Its dispatcher test at :600-615 confirms a dispatcher is passed, not that a real socket connects only to the validated address.
2. [mediaEmbeddingPgvector.test.ts:597-635](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/mediaEmbeddingPgvector.test.ts#L597-L635) uses SQL text assertions and a JS transcription of the codec; it does not run the migration chain on PostgreSQL with populated signed vectors. The frozen326 assertion misses S1.
3. [searchReindexLease.test.ts:58-61](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/searchReindexLease.test.ts#L58-L61) fakes advisory lock results. It cannot reveal transaction-pooling/session affinity failure S2. Settings task tests are useful but do not exercise the exact deployed Meilisearch/compose network.
4. The provider tests mock S3 body transforms; boundedness requires an oversized/stalled actual stream test, not just correct rejection of a completed buffer.
5. No test count is invented for this source-inspection workstream. The validation run confirms running the combined suites; use its final observed counts/failures, and keep those distinct from external service evidence. This workstream inspected diffs, source and test quality; combined execution results are recorded in section 2.

No live PostgreSQL migration, AWS/Sightengine call, Meilisearch swap, vendor roundtrip, production network or learned-model quality benchmark was executed in this source-inspection workstream. Workspace source remained unedited. Source closure is not deployed acceptance.

### Prioritized upgrade and validation plan

1. **Make deployment executable with the repaired safety gates.** Forward/provider-validate moderation credentials; split text/image capabilities; retain fail-closed publication. Render merged compose, boot API+worker, and verify real approval plus outage hold/recovery and operator reason visibility.
2. **Repair upgrade ordering and production locking.** Test signed-vector pre326 upgrade before claiming N1 closure. Put reindex ownership on a connection/lease mechanism compatible with transaction pooling, verify unlock result, and race admin+scheduled jobs under real PgBouncer.
3. **Finish one transport policy.** Bound S3 Head/Get/body reads and provider calls, distinguish transient DNS from SSRF, migrate remaining duplicate fetchers. Exercise rebinding, redirects, IPv4/IPv6 forms, slow DNS, stalled/chunked/oversized bodies and cancellation at actual network boundaries.
4. **Finish retrieval truth and safety.** Propagate helper retrieval method into impressions, bind serving lineage to approved model state, keep nonfinite/dimension controls, test blocked/retired models and record actual source distances. Benchmark exact versus indexed query plans and filtered Recall@K before ANN capacity claims.
5. **Make degraded search coverage explicit.** Validate healthy->outage->recovery->delete->outage across two API replicas plus a worker; complete >1000-row swap catch-up; expose partial coverage or provide current SQL fallback. Keep current active-status/database safety checks.
6. **Deliver actual ML only after measurable evaluation.** Deploy a real image encoder, retain lineage/checksum evidence, evaluate labeled retrieval and temporal recommendation/fraud quality against heuristics with calibration, coverage, fairness and latency/error budgets. Promote by explicit registry state and verify rollback. Separate shadow health from champion capability.
7. **Finish operational integration.** Wire vendor producers/drainer with delivery leases, provider-specific sandbox roundtrip and idempotent recovery. Convert AI budget into atomic monetary reservations/reconciliation if hard-cap behavior is promised; normalize telemetry units and expand routing tests into executed authorization/citation/answer evaluations.

## Appendix D. Infrastructure, privacy, recovery and release verification

### Verdict and closure definitions

There is substantial remediation. The prior worker artifact mismatch, standalone token omission, backup-container startup defects, S3 retention prefix bug, release dependency skip, preview/staging mismatch, default restore table-name bug, and silent chaos skips are **fixed in source**. None has live deployment/restore/device proof in this review. Important residual blockers remain: populated migration326 can fail before its repair330, new backup inventory can still certify retained data as purged, restore identity guard remains bypassable, and search reindex's session lock conflicts with configured PgBouncer transaction pooling. Release governance remains partial.

“Source fixed” below closes the exact previous code defect; “partial” means a related failure remains; “unproven” means no operational evidence was obtained, not that runtime failure was observed.

### Revalidation of every previous finding

| Previous finding | Sep21 status / current anchors | Remaining acceptance |
|---|---|---|
| Worker command references omitted src/tsx | SOURCE FIXED. [backend/api/package.json:31](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/package.json#L31) now `node --enable-source-maps dist/workers/index.js`; source variant separate. Docker runtime still copies dist, so command/artifact now agree. Compose uses npm worker:start at root451 / standalone576. | Build/start final image, readiness and representative queue completion/heartbeat. No image execution here. |
| Backup readonly chmod / missing bash / internal-only egress | SOURCE FIXED. Root compose530 installs bash;532 documents/removes chmod;559 invokes bash;582–587 attaches db+backend. Standalone669/671/710/739+ same repairs. | Real startup, cron execution, encrypted upload and restore. Runtime package installation remains an operational dependency, not the previous deterministic blocker. |
| Missing backup key/destination; sole copy deleted without upload | SOURCE FIXED for normal missing/failed-upload paths. Root508 production flag,514–519 required key/bucket/credentials. Standalone647+ environment and691–697 explicit checks. `backend/scripts/automated-backup.sh:44–66` fail closed;142–155 tracks upload success;182–190 retains local artifact when upload absent/failed. | Failure injection and recovery proof. Encryption failure can leave a partial encrypted file: cleanup96–99 treats mere existence as sufficient to delete plaintext; verify recoverable-artifact retention, not just file existence. |
| Scheduled S3 retention targets bucket root rather than prefix | SOURCE FIXED [.github/workflows/scheduled-db-backup.yml:133–149](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/.github/workflows/scheduled-db-backup.yml#L133-L149) builds `$fullKey="$prefix/$key"`, deletes fullKey. | Real aged/current/versioned-object test and lifecycle evidence; workflow still not a restore drill. |
| Purge manifest based solely on120 days | PARTIAL. Real paginated ListObjectsV2 added [backupExpiryHandler.ts:88–110](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/backupExpiryHandler.ts#L88-L110); missing config/inventory failure leaves purged_at null152–205. Current LastModified predicate214–220 still allows false proof; see below. | Snapshot-time manifest, object versions/all backup stores, evidence-based verification and alert delivery. |
| Standalone mandatory API_INTERNAL_SERVICE_TOKEN omitted | SOURCE FIXED [backend/docker-compose.production.yml:331,494](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/docker-compose.production.yml#L331); root239/364 passes required token too. Numerous production env values now wired. | Full effective-environment validation/startup in both deployment definitions. |
| Development/staging Release Train skipped with approval dependency | SOURCE FIXED [release-train.yml:108–113,143–148](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/.github/workflows/release-train.yml#L108-L113) uses always + successful channel resolution + acceptable approval result. Publish177–190 checks gate too; production rollbacks now approval-gated88–91. | Workflow executions for nonprod/prod/rollback/rejected/cancelled cases. |
| OTA key presence never reaches CLI signing input | SOURCE FIXED on normal publish paths. [release-train.yml:218–239](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/.github/workflows/release-train.yml#L218-L239) writes key600, passes private-key-path at rollback250+/publish260+; build-and-deploy, staging-deploy and ota-staged-rollout also materialize/pass key. Native config now uses public certificate presence [frontend/app.config.js:203–251,356–365](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/app.config.js#L203-L251), no private key needed in native binary. | Cryptographic key/certificate match, protected secret, actual signed-device acceptance/rejection and rollback proof. Presence-only check-release-config unchanged; no explicit file cleanup step. |
| Preview binary subscribes wrong staging channel | SOURCE FIXED [frontend/eas.json:63](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/eas.json#L63) staging, staging-deploy112 publishes staging. | EAS server channel/branch mapping and device consumption. |
| Competing tag publishers / release governance | PARTIAL. build-and-deploy v* trigger removed; release-train owns tag publishing. Separate manually triggered publishers still use separate concurrency groups and environments; no shared production lock, no complete CI prerequisite for Release Train. | Prove required CI/approvals on every publisher and actual GitHub settings; consolidate lock/channel policy. |
| Restore defaults coOwn names quoted incorrectly | SOURCE FIXED [postgres-restore-verify.mjs:42–45](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/scripts/postgres-restore-verify.mjs#L42-L45) lowercase defaults;130–136 counts resolved regclass. | Execute real downloaded artifact restore and invariants. No workflow invokes restore:verify. |
| Restore guard matches credentials / raw string equivalence | PARTIAL.152–216 parses authority/database and checks marker only in db; credential-only and explicit default-port cases now rejected. Query host override still accepted; reproduced safely below. | Match actual driver/libpq target semantics, source required/strict allowlist/disposable credentials; reject aliases/overrides before destructive operations. |
| Restore proof incomplete | OPEN. Missing checksum allowed, empty override can produce no probes, counts need not be positive/expected; RTO covers script duration not outage and no RPO age proof. | Required artifact integrity, seeded expected counts/checksums/financial invariants and measured recovery objectives. |
| pgvector integer overflow | PARTIAL.330 adds correct bigint promotion66–69, but unchanged326 runs first and can abort on populated negative embeddings; repair never reached. | Upgrade fixture on actual pgvector server from pre326 with negative512-dim values, plus previously applied/no-extension states. |
| Chaos skips yield green | SOURCE FIXED default scenario semantics [chaos-smoke.mjs:594–607](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/scripts/chaos-smoke.mjs#L594-L607): skipped mandatory checks => INCOMPLETE unless explicit --allow-skips; overall returns nonzero722–735. Probe remains intentionally report-only. | Actual fault/recovery with zero mandatory skips, measured timestamps and alerts. |
| Golden placeholders / failing visual gate | OPEN. Reinspected12 golden PNGs: all70 bytes,1×1, one unique hash. Current strict-gate results appear in section 2. | Native matrix captures/review and comparisons; directory conventions still need alignment. |
| Monitoring evidence | PARTIAL wiring: metrics/slo route admin-gated [health.ts:122–125](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/routes/health.ts#L122-L125), onResponse recording and new metrics/alerts. Existing health check missing secrets still skips, HTTP-only probe may miss degraded states. | Actual alert receipt, worker-stall/backup-age alarms and deployed dashboards. |

### Residual production blockers in detail

#### 1. Migration330 cannot rescue a failure that stops at326 (P1)

[326_media_embeddings_pgvector.sql:67–70](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/db/migrations/326_media_embeddings_pgvector.sql#L67-L70) remains int4 reconstruction; negative float32 high byte≥128 overflows before bigint assignment.326 backfills existing512-dimensional payloads102–108. [db/migrate.ts:58–61](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/db/migrate.ts#L58-L61) orders filenames,99 executes whole migration,110–119 rolls back/rethrows on error. Thus a pgvector-enabled populated deployment that has not applied326 stops before330.330 repairs already-installed decoder66–69 but cannot be reached through failing326. Fresh empty database success is insufficient and comments330:18–21 overstate universality.

Regression test [mediaEmbeddingPgvector.test.ts:525–535](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/__tests__/mediaEmbeddingPgvector.test.ts#L525-L535) explicitly mirrors arithmetic in JavaScript, not SQL.597–639 tests source regex and freezes buggy326. These establish intended arithmetic/immutability, not upgrade viability. Backend CI uses vanilla postgres:16-alpine ([backend-ci.yml:43](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/.github/workflows/backend-ci.yml#L43)), so optional vector branch normally not exercised. Preserve historical migration checksums while adding a supported pre326 remediation/upgrade sequence and real populated upgrade test. 

#### 2. Backup inventory still permits false purge confirmation (P1)

[backupExpiryHandler.ts:214–220](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/workers/handlers/backupExpiryHandler.ts#L214-L220) decides retained-data presence solely by S3 LastModified≤erased_at. A pg_dump snapshot starts before erasure but completes/encrypts/uploads afterward: object LastModified is AFTER erasure although its snapshot contains the deleted user. If older objects rotated away, current predicate confirms purge. Copying retained old backups later likewise changes upload metadata. This is not fixed by a longer waiting period if retention malfunctions.

`ListObjectsV2`93 only lists current versions; deleted-but-retained historical versions/PITR/replicated stores are not inventoried. Versioning/PITR may be disabled, but repository provides no verified restriction; qualify exposure accordingly. Missing LastModified is ignored rather than unknown/fail-closed at215. New logic is stronger than elapsed time and correctly fails closed on missing config/list exception/cap, but `store_inventory_verified`229 still exceeds evidence. Need immutable backup capture start/completion metadata, fail-closed unknowns, complete version/store policy and verification tests (pre-erasure snapshot uploaded after erasure, delete markers, failed inventory, copied artifacts). Worker backup env is wired root445–450/standalone570–575; this is active code, not unused helper.

#### 3. Restore target guard ignores connection query overrides (P1 manual tooling)

Safe read-only reproduction extracted only parseDatabaseUrl/assertScratchTarget into node:vm (did NOT execute main/restore):

- Credential-only marker URL `postgresql://u:test@prod/app`: rejected, correct.
- Source `postgresql://u:p@prod/app_test`, target `postgresql://u:p@prod:5432/app_test`: rejected, correct.
- Same source, target `postgresql://u:p@decoy/app_test?host=prod`: **accepted**. Installed pg-connection-string parser reports actual host **prod**.

Guard152–175 sees only url.hostname/port/path; pg-connection-string search params override host/port (installed module40–42,54–63). Restore passes raw URL to pg_restore98–115 and probe Client, so guard coordinates are not authoritative. A database containing test/staging in its real name can be restored over despite source match, and source is still optional. Host aliases/unparseable source fallback also remain unsupported. Match actual connection semantics or reject authority overrides, require explicitly disposable identity/credentials and source identity. Source/table-name repair deserves credit, but do not claim safe destructive target enforcement.

#### 4. New search lease uses session locks through transaction pool (P1 topology-specific)

`searchSync.ts:791–873` holds a node pool client, pg_try_advisory_lock816, work, pg_advisory_unlock862. Default db pool is configured via DATABASE_URL. Standalone compose202 PgBouncer POOL_MODE=transaction; API287/worker452 point there. Root production similarly uses PgBouncer. Holding node client pins connection to PgBouncer, not a server session across transactions. Session lock can be reacquired reentrantly on same server by another logical client or unlocked on a different server; exclusivity/cleanup not reliable. MIGRATE_DATABASE_URL directs only migration CMD to Postgres, not this reindex lock.

Use direct/session-pooled dedicated DB connection or durable fenced lease, then multi-process simultaneous reindex and crash tests against production pooling mode. Direct PostgreSQL unit/mocked lease tests cannot establish transaction-pool behavior. Related correction: cross-process lease now exists in source, so prior “only per-process concurrency” observation is partially addressed, but production topology remains incompatible.

### Release governance and rollback details

Tag duplication and missing CLI signing input are materially fixed; do not repeat old conclusions wholesale. However release-train concurrency is ref-specific29, build-and-deploy fixed separate group, ota-staged-rollout channel-specific separate group33, rollback workflow no concurrency. Manual publishers can overlap or target same production channel while tag train runs. [.github/settings.yml](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/.github/settings.yml) now uses actual check job names; file presence is intent only, not proof the GitHub settings app applied it. Required contexts do not include all CI Gates or secret scan. Release Train's needs graph still only determine/approval/build, no tests/visual gates prerequisite.

[ota-rollback.yml:71–76](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/.github/workflows/ota-rollback.yml#L71-L76) republish option now only prints instruction to use Release Train; workflow then emits “rollback executed”79–81 despite no action. This is a concrete misleading successful operator flow: remove/deprecate option with nonzero clear outcome or implement approved signed delegation. Embedded rollback path67 uses branch=input.channel, so actual branch/channel mapping needs proof. Environment named production is not automatically identical to production-approval protection.

Key material is no longer passed as EXPO_PUBLIC env to publish/export steps, preferred private secret added; do not claim a secret leak from naming alone. CLI cryptographic validation and native behavior not exercised. Temporary key uses chmod after write rather than umask and no always cleanup; runner isolation protects ordinary jobs, but explicit lifecycle cleanup is appropriate.

**Stale checker versus actual blocker:** [frontend/scripts/check-release-config.mjs:30–46](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/frontend/scripts/check-release-config.mjs#L30-L46) still names EXPO_PUBLIC_OTA_CODE_SIGNING_KEY and checks presence/certificate only. Workflows explicitly bridge preferred EXPO_OTA_CODE_SIGNING_PRIVATE_KEY into that legacy variable for the checker step, then materialize/pass the private key to CLI. Thus the old-variable warning from running this checker locally without release secrets is stale interface/documentation, **not proof the new workflow cannot sign**. Remaining gap is lack of key/certificate cryptographic match/device evidence and inconsistent release governance, not the now-fixed absence of private-key-path.

### Validation/operational evidence strength

- New [.github/workflows/chaos-drill.yml](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/.github/workflows/chaos-drill.yml) schedules **probe only**61–64, intentionally exit0, uploads report. Dispatch prints plan and asserts externally induced post-fault state79–90; no fault injection/recovery or wait for operator action. It is operational diagnostic wiring, not demonstrated chaos readiness. Default no-skips repair is real.
- New secret scan runs Gitleaks PR/main/develop ([secret-scan.yml:7–11,27–31](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/.github/workflows/secret-scan.yml#L7-L11)), full-history checkout25. Workflow claims pinned version but action tag remains mutable; no scan result observed in this source-inspection workstream audit. Not a production release dependency.
- Backend CI still does real fresh migrations/rerun and integration105 sets RUN_INTEGRATION_TESTS=true. [productionInvariants.test.ts:249–254](https://github.com/K17ze/thryftverse-upgrade/blob/b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5/backend/api/src/integration/productionInvariants.test.ts#L249-L254) nevertheless skips if DB unreachable, independent of required flag, so suite green alone must be read with skip counts. It tests actual DB constraints and some real functions, plus duplicated SQL routes; no HTTP/provider proof implied. Actual suite outcomes appear in section 2.
- No restore helper invocation in workflows (targeted search returned none), no Docker final-image startup job in backend CI. Tests and build cannot close image/topology/backup/device claims.
- SLO tracking now active but existing Redis counter design95–104 renews key TTL on every request instead of aging individual buckets; sustained service counters become lifetime totals rather than a true30-day rolling window. This is inherited logic newly exposed/wired; qualify reported error budget until bucketed-window validation, not a reason to dismiss actual new metrics.
- Visual baselines rechecked using PNG header + SHA metadata, no image generation/device capture. Full gate results appear in section 2.

The executed results in section 2 confirm why an exit-zero invariant run with all cases skipped does not establish live database correctness.

### Next gates, prioritized

1. Exercise actual production API/worker images/env/PgBouncer with representative jobs and heartbeat, using direct/fenced reindex lease.
2. Fix/preflight populated pgvector upgrade sequencing; prove SQL upgrade and rollback strategy across prior states.
3. Harden restore authority matching and artifact checks, then encrypted object download→disposable restore→financial/user invariants; validate S3 expiry and erasure across snapshot times/versions.
4. Consolidate publisher lock/CI approval policy; real signed OTA publish/rejection/rollback on subscribed native binaries.
5. Replace goldens with reviewed device captures and complete strict gate/native comparisons.
6. Run authenticated no-skip fault/recovery drills, validate deployed alerts/backup freshness and true rolling SLO accounting.
