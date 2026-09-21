# ThryftVerse — post-upgrade audit, validation and next-quality plan

**Review date:** 20 September 2026  
**Branch:** `feat/product-detail-contract-media-device-closure`  
**Reviewed commit:** `76c0733f8fca7424ad5bfb51c81d2a71a36e866f`  
**Previous reviewed commit:** `fdd63b8ff339d012699e92be8150fc194e3b9daa`  
**Scope:** React Native/Expo frontend; API, financial and trading workflows; search, ML/AI and moderation; workers, migrations, recovery and releases; supplied visual references and current primary-source competitor research.

This is an independent, read-only audit and implementation plan. No app code was changed, no money was moved, and no deployment or destructive recovery drill was attempted. It replaces the previous readiness judgment for this branch while retaining explicitly revalidated findings. Source-linked department appendices supply the detailed evidence behind the decisions.

## Contents

- [1. Decision: real progress, but not ready for a public financial launch](#1-decision-real-progress-but-not-ready-for-a-public-financial-launch)
- [2. What was validated, and what was not](#2-what-was-validated-and-what-was-not)
- [3. Upgrade verification: what deserves credit](#3-upgrade-verification-what-deserves-credit)
- [4. Current competitor research and what it means for ThryftVerse](#4-current-competitor-research-and-what-it-means-for-thryftverse)
- [5. Supplied reference images: concrete art direction](#5-supplied-reference-images-concrete-art-direction)
- [6. Next screen upgrades — implementation contracts](#6-next-screen-upgrades--implementation-contracts)
- [7. Backend and financial engineering plan](#7-backend-and-financial-engineering-plan)
- [8. ML/AI: upgrade intelligence only after data truth](#8-mlai-upgrade-intelligence-only-after-data-truth)
- [9. Deployment: prove the actual artifact](#9-deployment-prove-the-actual-artifact)
- [10. Ordered upgrade backlog with exit criteria](#10-ordered-upgrade-backlog-with-exit-criteria)
- [11. Launch evidence matrix](#11-launch-evidence-matrix)
- [12. Coverage and limitations](#12-coverage-and-limitations)
- [Appendix A. Financial and Co-Own findings](#appendix-a-financial-and-co-own-findings)
- [Appendix B. Frontend findings and behavioral closure](#appendix-b-frontend-findings-and-behavioral-closure)
- [Appendix C. Backend, search and ML findings](#appendix-c-backend-search-and-ml-findings)
- [Appendix D. Infrastructure and release findings](#appendix-d-infrastructure-and-release-findings)
- [Appendix E. Current screen register: 175 top-level screens](#appendix-e-current-screen-register-175-top-level-screens)
- [Appendix F. Current backend route-module register: 84 modules plus entry point](#appendix-f-current-backend-route-module-register-84-modules-plus-entry-point)
- [Appendix G. Reproducibility and review handoff](#appendix-g-reproducibility-and-review-handoff)


## 1. Decision: real progress, but not ready for a public financial launch

**Evidence-weighted readiness: 44/100, versus 42/100 in the previous audit. Public launch with auctions, wallet transfers and Co-Own enabled remains NO-GO.** This is an engineering judgment about demonstrated readiness, not a percentage of code completed, a probability of success, or a certification. Treat a few points of movement cautiously; the rubric is much less precise than its integer presentation.

The upgrade contains useful work: 32 commits, 260 changed files, 28,183 insertions and 2,768 deletions, including documentation. It adds actual behavior, not just declarations: feed deduplication, chat scroll policy, image-region search, moodboard history, live replay, operational tooling, category validation, search queue wiring and financial notifications. These should be preserved.

However, **all nine financial findings and all twelve frontend findings from the immediately preceding audit remain materially open** at the reviewed commit. The prior infrastructure blockers also remain. Several changes address adjacent capabilities without repairing the original failure path. A receipt cannot repair an unbalanced settlement; a surveillance callback cannot establish spendable balance; an icon migration cannot establish native usability; a new restore script cannot establish recoverability until it safely restores a real backup.

The most important current blockers are:

1. Auction winner payment can directly mark an auction/order paid without collecting or independently confirming payment.
2. Wallet transfers can race on idempotency; general debits do not honor Co-Own reservations; trading bypasses segment accounting; currency conversion and DRIP counterparty conservation remain unsound.
3. Mollie verification has a fail-open branch: with an API key but no webhook secret, failed provider lookup can leave request-supplied payment status authoritative.
4. Production worker commands do not match the final container contents. Backup/release/signing definitions retain known defects.
5. New search/vector/recovery paths have specific correctness gaps, including conditional pgvector migration overflow and restore-table identifier mismatch.
6. Native visual evidence is absent. Twelve committed golden PNGs are still identical 1×1 placeholders, and required fixture/integration baseline directories do not exist.
7. The full test picture is mixed; passing subsets do not establish release readiness.

An internal review build with financial features disabled could be a useful validation vehicle after its own build, privacy and access checks. That is a proposed narrower scope, not a claim that such a build has already passed release gates. Disable sensitive routes and workers server-side as well as hiding UI; frontend flags alone are not isolation.

### 1.1 Score methodology and separate departments

The same overall dimensions and weights used previously are retained. Scores credit demonstrated implementation and validation, and discount absent native/provider/operational proof.

| Dimension | Weight | Previous | Current | Why |
|---|---:|---:|---:|---|
| Authored composition and visual evidence | 15% | 60 | 60 | Icons and composition candidates improved; no current native captures establish the result |
| Interaction/state correctness | 15% | 62 | 65 | Dedup, reading-position policy, replay and history are useful; old and new failure paths remain |
| Money and trading correctness | 20% | 25 | 25 | Schema admission/surveillance gains do not close settlement invariants |
| Core backend completion | 15% | 50 | 55 | More handlers, contracts and worker wiring; integrations and regressions still need proof |
| Security and trust enforcement | 10% | 35 | 38 | Narrow provider/UGC/payout hardening; material webhook/moderation/import gaps remain |
| ML/AI production maturity | 5% | 25 | 30 | Retrieval/governance plumbing improved; quality and serving-model evidence remain weak |
| Release and operations | 10% | 25 | 25 | New tools are not successful deployment/restore evidence; old blockers persist |
| Verification strength | 10% | 35 | 38 | More behavioral tests and routing eval; full suites/gates still fail and CI head has no runs |
| **Weighted total** | **100%** | **41.55 → 42** | **43.60 → 44** | Release blockers override the arithmetic |

| Separate assessment | Score | Meaning |
|---|---:|---|
| Frontend engineering preparedness | **64/100** | 50% implementation at73 +25% architecture at73 +15% accessibility preparation at60 +10% current native evidence at0 =63.75. Broad implementation, incomplete behavioral closure |
| Backend engineering preparedness | **40/100** | 30% domain implementation at60 +30% money correctness at25 +20% security at38 +20% operational readiness at35 =40.1 |
| ML/AI maturity | **30/100** | Serving/evaluation/governance maturity judgment; no benchmark proves competitive relevance or fraud precision |
| Rendered aesthetic parity with references | **Unverified** | A source score cannot legitimately grade actual layouts, gestures, contrast or frame pacing |
| Full financial production release | **Blocked** | Critical state-transition defects and missing operational proof |

These separate scores are not averaged into the overall score. A 100/100 claim would require a bounded launch scope and evidence for every mandatory gate; it would still not mean a complex system is defect-free. Additional features cannot compensate for one uncontrolled money transition.

## 2. What was validated, and what was not

### 2.1 Evidence levels

- **Executed:** a command/probe ran on the pinned checkout; result recorded below.
- **Source-confirmed:** current implementation and relevant callers/contracts were inspected. This can establish a defect but does not prove a deployed exploit or successful provider integration.
- **Conditional:** consequence depends on configuration, data, route reuse or timing described in the finding.
- **Unverified:** no device, live database, provider account, deployment or measurement evidence was available.
- **Proposed:** acceptance criterion or product direction; not an existing capability claim.

No Docker, adb or psql executable was found in the environment. No iOS/Android app was launched; no live PostgreSQL/Redis/provider integration was established. Network and process restrictions also affect some commands. Competitor research covers official descriptions and supplied screenshots, not hands-on purchases or their private backend architectures.

### 2.2 Fresh command results

Frontend/backend package lockfiles were unchanged from the previous installation. Existing installed dependencies were reused. Local Node was 24.19.0; this is not the same runtime as every CI/container definition. Results are not silently generalized across runtimes.

| Check | Fresh result | Interpretation |
|---|---|---|
| Frontend `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck` | PASS | Static type correctness only |
| Backend `npm run typecheck` | PASS | Static type correctness only |
| Frontend `npm test` | **FAIL:120 files; 118 pass,2 fail. 2,142 tests; 2,138 pass,2 fail,2 skip** | Screenshot-directory failure and timezone-sensitive distribution date test |
| Backend `npm run test:vitest` with dummy DATABASE_URL | **PASS: 14 files, 275 tests** | Dummy localhost port1 satisfies import configuration; this is not a database integration run |
| Backend `npm test` without DATABASE_URL | **FAIL: 981 tests; 940 pass, 41 fail** | Mixture of missing-configuration imports and genuine assertion failures; not41 independently proven application defects |
| Focused backend notification/seller/review rerun with dummy DATABASE_URL | **FAIL: 70 tests; 61 pass, 9 fail** | Confirms these failures remain after satisfying DB URL import configuration |
| Support eval via `npm run eval:suite` | Environment-blocked | tsx CLI IPC pipe failed with EPERM; not an application evaluation failure |
| Same eval via `node --import tsx scripts/run-eval-suite.ts` | **PASS: 16/16** | Deterministic routing cases; no model/tool execution or real tenant isolation |
| ML Python unittest suite, existing isolated dependencies | **PASS: 11 tests** | Baseline logic/metrics; no trained-model benchmark or model-provider integration |
| Financial static contracts | **PASS: 5 tests** | Source/schema-string checks for surveillance and ledger kinds |
| Retrieval/vector/search-degradation focused tests | **PASS: 31 tests** | Mock database/static SQL checks; no actual pgvector migration |
| Visual release gate | **FAIL: 50 P0, 36 P1, 130 warnings** | Tool's heuristic labels, not50 independently audited critical incidents; previous 48/38/130 |
| Production residue gate | PASS with 134 warnings | Previous 132 warnings; success does not mean no unfinished work |
| Design token lint | PASS | Narrow policy check, not rendered consistency |
| New icon grammar audit | Exit 0; **1,491 warnings,14 info across 592 files** | Informational success must not be labeled visual-policy closure |
| Golden parity | **Blocked/exit2** | Fixture and integration baseline directories absent |
| Release configuration | **FAIL: 5 findings** | Local signing prerequisites missing and three submission placeholders; remote secret state was not inspected |
| Exact-head GitHub Actions API | **0 workflow runs returned** | No available current-head CI evidence at query time, not proof workflows never run elsewhere |
| Restore/chaos helper syntax | PASS | Syntax only; neither recovery nor fault injection executed |

The first focused backend attempt referenced a nonexistent `notificationTaxonomy.test.ts`; it was corrected to [notificationContract.test.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/__tests__/notificationContract.test.ts) before the 70-test result above. No substantive conclusion comes from that failed command setup.

### 2.3 Interpretation of the remaining test failures

**Distribution date:** the calendar formats UTC midnight timestamps with local `toLocaleDateString('en-GB')`, without an explicit timezone. In the runtime's America/Chicago timezone, the September 15 midnight UTC fixture displays September 14. The test expects15. This is a pre-existing ambiguity, not caused by the newly appended date-range helper. Decide whether record/ex/payable values are civil dates in a defined business timezone or actual instants; implement and test that contract. Merely loosening the regex could conceal a real financial-date error.

**Notification contracts:** the fresh run identifies Co-Own alert and DRIP event types absent from one central declaration, and `smart_sell_decision` without a push category. Another emitter lacks a literal eventType. Source scanning can itself be limited, but independently drifting declarations are a real maintenance concern. Consolidate typed event definitions and verify emitted payload → preference mapping → notification row → push → deep link. Do not assume every failure means every notification is lost.

**Seller performance:** three assertions disagree with boost multipliers. **Review photos:** two route tests receive422 rather than200. These require a business-contract decision and fixture/implementation investigation. The audit does not assume tests or implementation are automatically right. Acceptance must assert the intended current behavior and include authorization/validation cases.

### 2.4 The evaluation suite's important limit

[backend/api/src/support/evalSuite.ts:455–529](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/support/evalSuite.ts#L455-L529) calls the router, checks handoff/issue type and expected tool membership, then constrains tools for high-risk tiers. It does not execute tools, query two users' data, generate responses, validate citations, or inspect prohibited claims in actual model output. Labels such as retrieval, grounding and safety do not expand what the code tests. The16/16 result is useful routing coverage; it is **not** a demonstrated grounded, injection-resistant, tenant-isolated AI assistant.

The next evaluation layer must run a real support request through authorization, retrieval, tool execution, answer generation and escalation, with seeded userA/userB resources and adversarial retrieved content. Measure answer correctness and evidence attribution separately from routing accuracy.

## 3. Upgrade verification: what deserves credit

| Upgrade | Verified progress | What remains before calling it complete |
|---|---|---|
| Discovery deduplication | Production assembler tests cover duplicate listings | Page/query identity, diversity, exhaustion, hidden-item persistence, native scrolling |
| Chat scroll policy | Incoming messages avoid unconditional scroll when reading history | Actual native anchoring under media-size changes, keyboard, pagination and bursts |
| Visual crop | Normalized ROI travels through frontend/backend and response scope | Reset invalidation, honest fallback lineage, accessible adjustment and relevance evaluation |
| Moodboard undo/redo | Real inverse operations, bounded history and board reset | Submission outcome propagation, partial failure, collaboration conflict and crash recovery |
| Live replay | Dedicated screen and honest processing/no-recording/error states | Provider recording availability, URL expiry, lifecycle playback and captions |
| Blocked seller dock | Purchase and direct seller action affordances suppressed | Public Q&A path, open-sheet changes and independent server enforcement |
| Category attributes | Registry, validation helpers and activation/patch callers exist | Real category fixtures, backward-compatible edits and seller correction UX |
| Search operations | Queue/worker and degradation identity added | Working worker image, credentials, complete fallback corpus and reindex concurrency |
| ANN/vector path | Optional migration and nearest-neighbor consumer added | Signed-vector migration, model lineage, ordered retrieval and real embeddings |
| Co-Own surveillance | Actual placement/cancellation callbacks | Crash-safe delivery, meaningful detection evaluation and explicit advisory status |
| Ledger kinds | Migration admits previously missing runtime values | Migration execution and balanced economics; admitting a kind can expose downstream bugs |
| Alert/DRIP receipts | Consumer branches and normal-path outbox writes | Null payload, re-arm dedup, failure atomicity and truthful cash wording |
| AI daily spend | Recorded-spend threshold read before bot request | Reservations for in-flight work, all-provider coverage, recovery/reconciliation |
| Restore/chaos/capacity tooling | Useful scripts and authored operational plans | Safe target checks, real drills, zero mandatory skips and measured capacity |

The correct next milestone is **verified closure**, not another ledger of features marked implemented. Each closure should have one before-fix reproduction, one change at the owning layer, one regression test that fails on the old code, and one appropriate integration/native artifact.

## 4. Current competitor research and what it means for ThryftVerse

The following comparisons use official public sources accessed 20 September 2026. Availability varies by market/account/device. Product announcements are evidence of a documented feature, not evidence of its adoption, reliability or private architecture. No competitor receives an invented numerical quality score.

| Benchmark | Publicly evidenced quality | ThryftVerse implication and acceptance target |
|---|---|---|
| eBay transaction lifecycle | Accepted Best Offers remain distinct from secured purchases; payment is decisive. [eBay Best Offer](https://www.ebay.com/help/buying/buy-now/making-best-offer?id=4019) | Never equate winning/acceptance with paid. Use authoritative payment state in auction, chat, orders and receipts; exercise lost-response and retry behavior |
| eBay trader research | Product Research exposes actual sold prices, time ranges, condition/category filters and market metrics. [eBay Product Research](https://www.ebay.com/help/selling/selling-tools/product-research?id=4853) | Dated comparable cards are progress. Next add sample provenance, comparability, fee/shipping treatment and uncertainty; do not label asking-price averages as realizable value |
| Depop trust | Official safety page describes protected payments, in-app issue resolution, account security and automatic cancellation/refund for late unshipped orders. [Depop safety](https://www.depop.com/safety/) | A stylish feed must connect to enforceable buyer/seller remedies. Show deadlines and actionable evidence; prove settlement/refund and support operations |
| Vinted transaction context | UK safety guidance describes held funds, receipt confirmation and claim handling. [Vinted safety](https://www.vinted.co.uk/safety) | Keep item, offer, total, delivery and issue actions together in commerce chat. Define your own region-appropriate policy; do not copy a claim window without legal/operational support |
| Pinterest visual retrieval | Object/region selection, refinements and shoppable matches form one interaction. [Pinterest visual search](https://help.pinterest.com/en/article/use-visual-search-features) | A crop box is only the input. Results must actually derive from that crop and communicate degraded/filter-only results honestly |
| Pinterest capture/search | Camera/photo entry and object focus support discovery. [Pinterest Lens](https://help.pinterest.com/en/article/pinterest-lens) | Preserve the selected image, recover permissions/errors, allow edit/cancel and return to the same browsing position |
| Instagram messaging | Official DM guidance describes editing, chat pinning and read-receipt controls. [Instagram DM updates](https://about.fb.com/news/2024/03/instagram-dm-updates/) | Prioritize stable conversation behavior, identity, receipts and user control over decorative chat themes. Test the lifecycle of every message and attachment |
| Snapchat social coordination | September 2026 Plans connects invitations, details and revisiting plans; in-chat event creation was described as forthcoming. [Snapchat Plans](https://newsroom.snap.com/making-plans-irl) | For traders, a persistent pickup/inspection appointment object could be valuable later. Do not add generic event features before safe commerce and moderation are complete |
| Native platform quality | Android's core guidance covers usable, stable platform behavior. [Android app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality) | Test navigation/back, configuration changes, permissions, accessibility and interruption recovery on devices; component tests cannot replace this |

### 4.1 What would make the product better for traders

The defensible opportunity is a coherent journey: **discover an item → understand evidence → discuss/offer → pay safely → track/resolve → reuse the knowledge in future buying or selling**. Social content should improve decisions and relationships along that journey. It should not create a parallel universe where an item is sold in one view, actionable in another and financially unsettled behind both.

Recommended differentiators, after reliability gates:

- **Evidence-led condition:** link each defect/measurement to a tagged photo or video; distinguish seller claims, inspection results and buyer observations. Media provenance survives listing edits and disputes.
- **Useful trader memory:** save objects into private/public collections with notes, comparisons and alerts; retain sold references while clearly disabling unavailable commerce actions.
- **Trustworthy valuation:** show comparable count, date, condition match, currency, shipping/fees and range. Abstain when evidence is thin.
- **Commerce-native conversation:** offer revisions, reservation expiry, receipt, pickup plan and support case are first-class, permissioned records surfaced in chat.
- **Seller efficiency:** draft recovery, reusable category fields, bulk operations with per-item outcomes and auditable promotion economics.
- **Explainable discovery:** concise real reasons, reversible preference changes and a distinction between feed personalization and explicit search intent.

Do not promise market superiority until observed user tasks outperform the benchmark on completion, effort, comprehension and trust. Public product descriptions cannot supply those comparative measurements.

## 5. Supplied reference images: concrete art direction

All 20 supplied images were available and inspected through local contact sheets in this review. They are static reference material; screenshot timestamps and labels are not current competitor policy evidence. Personal details visible in the references are not reproduced in this report.

| Reference | Useful lesson | Apply to | Required proof |
|---|---|---|---|
| 01 settings | Flat, readable account rows and clear destructive separation | Settings/account | Complete row hit regions, long values, edit/cancel/save states |
| 02 edit profile | One dominant identity object; fields have deliberate boundaries | EditProfile | Dirty/save/upload/error behavior and keyboard at large text |
| 03 profile hierarchy | Identity, role and useful actions precede secondary detail | Public profile/storefront | Buyer vs owner hierarchy, no unsupported reputation claims |
| 04 discovery | Editorial groupings with real visual content | Explore | Distinct object hierarchy and working destinations |
| 05 editorial commerce | Campaign art leads; shopping follows naturally | Home/editorial | Owned imagery, product availability and tappable narrative |
| 06 settings search | Search and grouped information architecture reduce hunting | Settings | Synonym search, deep linking and no duplicate destinations |
| 07 account balance | Financial entry is easy to find without dominating everything | Account/wallet | Real balance, unavailable/stale state and privacy mode |
| 08 social profile | Media and identity dominate; actions are compact | MyProfile/storefront | Real statistics navigate or remain clearly static |
| 09 boards | Collection cover treatment communicates saved intent | Saved/closet | Real cover selection, private/shared states and empty collections |
| 10 ideas feed | Vary module scale; distinguish sponsored content | Discovery/looks | Sponsorship truth, sane ad frequency and useful next content |
| 11 saved grid | Covers form the main visual language | Saved collections | Predictable cropping and no generic card wrappers |
| 12 inbox | Dense readable thread list with clear unread information | Inbox | Delayed loads, long names, deleted accounts and screen-reader order |
| 13 commerce chat | Item/price/offer context stays attached to conversation | Chat/offer | Server-state cards and stale offer recovery |
| 14 saved privacy | Privacy is understandable near the collection object | Closet | Private/public sharing enforced on backend and cache |
| 15 commerce actions/specs | Action priority and structured evidence are clear | PDP | One primary next action, truthful availability and readable specifications |
| 16 product art direction | Silhouette and variants get space without losing controls | Media stage | Contain/cover/focal choices based on media role, not one global crop |
| 17 gallery/seller | Media, seller and thumbnail navigation cooperate | PDP gallery | Selected image continuity, zoom and low-bandwidth recovery |
| 18 price/fulfilment | Cost, condition and delivery are near the decision | PDP/checkout | Quote freshness, total breakdown and explicit uncertainty |
| 19 related products | Secondary content follows the main decision | PDP recommendations | Relevant inventory, independent module errors and position retention |
| 20 immersive detail | Content dominates; actions are concise and familiar | Look/poster detail | Media controls, save/share truth and graceful unavailable products |

### 5.1 Anti-AI design policy: make it measurable

Here, anti-AI design means rejecting generic assembled interfaces, fabricated facts and indiscriminate decoration. It does not mean avoiding automation in engineering or removing legitimate user-requested AI functions.

**Composition:** each screen must have a clear primary object and task. Home should read as real inventory and people; chat as conversation; editing as a canvas; trading as an evidence-backed decision. Avoid the same stack of equal rounded cards across all departments. Use boundaries when they clarify grouping, selection, input or status.

**Typography:** establish a small semantic hierarchy and test real content. Price numerals, usernames, dates and body copy have different jobs. Avoid unneeded uppercase eyebrows, multiple restatements of a heading, and captions explaining obvious navigation. Do not shrink financial facts simply to preserve a mockup.

**Media:** choose contain for silhouette/evidence where cropping would remove information; choose cover for intentional editorial imagery with focal metadata. Preserve aspect ratio, zoom and index. A last gallery image is not automatically a condition photo. Placeholders must not become the main visual story.

**Controls:** consistent icon meaning and optical size matter more than mechanically replacing every icon import. Give icon-only actions understandable labels, sufficient hit area and correct disabled/pending behavior. An adjustable role without actions is not accessible. A vibrating no-op is not a control.

**Color/status:** use restrained semantic status contrast and verify it on actual rendered backgrounds. Financial truth must not depend on green/red alone. Differentiate pending, failed, unavailable, stale and unknown outcome; never turn missing data into reassuring zero.

**Motion:** animate continuity and consequence, not every mount. Preserve reading position and focus. Reduced motion should retain state feedback. Confirm gestures do not compete with scrolling, crop manipulation or system back.

**Copy:** prefer short direct text with verifiable meaning. “Not reinvested” is different from “cash available.” “Saved on this device” is different from “preference updated.” “Similar colors” is different from “visually similar item.”

**Validation:** capture the first viewport, key overlay and one failure state on actual iOS/Android. Compare the reference and result at thumbnail scale and normal scale. Record what changed in hierarchy, useful density, crop, action priority and recovery. Current source gates and icon warnings show that this policy is not yet demonstrated across the product.

## 6. Next screen upgrades — implementation contracts

These are prioritized work packages, not assertions that every listed screen lacks all listed capabilities. The appendices identify confirmed defects. Each package must first preserve existing working functionality and then close its specific acceptance conditions.

| Screen family | Next frontend work | Coupled backend work | Acceptance evidence |
|---|---|---|---|
| Home/Explore | Remove duplicate objects without breaking pagination; working editorial destination; concise preference feedback with undo | Stable cursor, serve attribution, identity-scoped preference result | Scroll 20 pages, change filters during load, fail a module, return from detail at same position |
| Search/results | Epoch guard all pages, inline retry with retained results, clear filter/sort state | Credential contract, durable fallback strategy, unavailable-result policy | QueryA slow page2 cannot append to queryB; outage never looks like legitimate zero inventory |
| Visual search | Accessible crop, cancellation/reset, truthful result provenance | Consistent ROI transforms and model/version/candidate lineage | Removed image never returns; blank ROI result remains honest; VoiceOver/TalkBack crop completion |
| PDP/gallery | Condition-tagged media; total/availability clarity; all nested actions obey capabilities | Canonical listing capability snapshot with authoritative enforcement | Block/sell/pause changes while sheet open; no contradictory action; media index persists |
| Checkout | Device-supported tenders and exact action mapping; explicit unknown outcome | Idempotent intent creation and verified provider transition | Cancel,3DS/pending, late callback, double tap, app kill and retry produce one purchase |
| Auction detail/winner | Separate won, awaiting payment, paid and failed; receipt only after confirmation | Replace direct paid transition; reservation/expiry and duplicate-event handling | Winner cannot manufacture paid state; failed payment never marks inventory sold |
| Offers/commerce chat | Current version/expiry/total and actionable stale state | Revision ownership, concurrency and state transitions | Competing acceptance and expired counteroffer cannot create duplicate purchases |
| Inbox | Useful dense rows; privacy-aware previews; stable unread grouping | Cursor/realtime gap recovery, mute/block policy | Reconnect and multiple devices converge; removed content handled without navigation dead ends |
| Conversation | Reader-position preservation, attachment recovery and message states | Durable send IDs, dedup/order, upload lifecycle and receipt policy | Incoming bursts while reading history do not jump; retry never duplicates message |
| Profile/storefront | Make For sale statistic meaningful; bounded/virtualized reorder surface | Persisted order/version and stale update conflict | Reorder 1,000 items without mounting entire media set; leave/reopen preserves order |
| Saved/collections | Covers, notes and privacy are understandable; deleted objects remain intelligible | Collection ownership/membership and share permission on every read | Shared link cannot expose private collection; optimistic save survives restart or states failure |
| Sell/edit/bulk | Category-specific guidance, upload recovery and item-level bulk outcomes | Versioned schemas, activation validation, moderation hold and dedup | Legacy listing edit, invalid field, mixed bulk failure and interrupted upload are recoverable |
| Seller hub/analytics | One operational hierarchy; dated metrics and explainable comparisons | Correct event taxonomy and metric denominator definitions | Displayed metric reconciles to sampled source events and business policy |
| Live home | Keep last good summary during refresh error; separate replay from live | Accurate session/recording state | Cached summary+refresh failure remains useful with retry |
| Live viewer/host | Moderation feedback, clear bidding/lot state and interruption recovery | Server host/ban/mute capabilities and authoritative lot clock | Banned viewer cannot bypass via alternate client; host disconnect recovers without stale bidding |
| Replay | Resource epoch, expired URL refresh, captions/lifecycle behavior | Recording authorization, retention, status and refreshed playback URL | Switching session cannot play old media; resume/background/back are tested natively |
| Moodboard/editor | Honest pending/queued/conflict/error history; selection continuity | Explicit command outcomes and recoverable ordered operations | Fail second inverse operation, restart and reconcile without falsely completed undo |
| Look/poster detail | Content-first media, contextual products and concise actions | Deleted/sold item hydration and creator permissions | Shoppable content survives missing tagged products without fake availability |
| Wallet | Available/reserved/pending amounts and dated transaction details | One debit primitive, FX quote, segment conservation and command key | UI totals reconcile to ledger and reservations under concurrent operations |
| Portfolio/asset detail | Authoritative Paused/Closed states, ownership evidence and liquidity limits | Lockup enforcement, custody/rights evidence, distribution funding | Every trade entry rejects lockup; statuses match across row, sheet and detail |
| Co-Own trade confirm | Exact consideration, fees, quote expiry and pending settlement | Same-key serialization, balanced journal, counterparty and unit conservation | Real DB concurrent purchase/cancel/withdraw tests pass |
| Co-Own alerts/distributions | Trigger history and factual cash/reinvestment outcome | Activation-specific dedup, nullable trade ref, atomic receipt and funding ledger | Two re-arms yield two real alerts; failure produces one truthful receipt |
| Settings/account | Flat grouped rows, identity-safe values, searchable destinations | Session ownership, privacy/export/delete contract and stale response isolation | Account switch cannot show prior balance; unavailable is distinct from zero |
| Support/returns | One case timeline with deadlines, evidence and human escalation | Ownership checks, refund permissions, immutable evidence and provider settlement | UserA cannot fetch/mutate userB case; request is distinct from refunded |
| Model registry/admin | Separate restricted operational UI; promote/rollback truth | Real serving version, permissions, evaluation and rollback audit | Registry change is independently observed in serving telemetry, or explicitly stays shadow |

### 6.1 Shared state contract

Every high-value screen should explicitly cover: initial loading; success; true empty; partial success; cached/stale; offline; retryable error; permission denial; deleted/expired resource; submitting; confirmed success; rejected mutation; ambiguous outcome; identity change; app resume. This does not require 13 separate designs. It requires enough distinct behavior that users are never shown success or absence when the system only knows uncertainty.

For writes, use a discriminated result such as applied, durably queued, conflict, forbidden, failed or unknown. A resolved promise must not mean success when the underlying helper swallowed an error. Shared optimistic behavior should carry command identity, reconciliation action and the actual pending state.

## 7. Backend and financial engineering plan

### 7.1 Establish one money boundary

Make the invariant owner a transactional service used by transfers, Co-Own, DRIP, conversions, withdrawals and any promotion/fee debit. Do not independently patch each UI. It must claim scoped idempotency before side effects; bind request hash, actor and operation; lock relevant accounts in stable order; compute spendable funds after all commitments; write balanced postings and segment movements; record quote/version/rounding; transition the domain object; append events; and commit atomically.

External provider calls do not belong inside a long database lock. Model pending external work explicitly, then process verified callbacks/reconciliation idempotently. A timeout is an unknown result to reconcile, not permission to create another financial operation. [Stripe webhook guidance](https://docs.stripe.com/webhooks) is a relevant integration reference for handling asynchronous events; the app's own invariant and cross-provider binding must still be designed and tested.

Core checks:

- Sum of debits and credits balances for every currency/unit, with explicit fee/rounding/suspense accounts.
- Available funds equal the appropriate settled balance less all enforceable reservations and holds.
- Purchased/earned segments reconcile to wallet totals and are updated by all paths.
- Holdings plus issued/retired/reserved supply follow the documented issuance model.
- One command key has one economic effect; mismatched payload replay rejects.
- Paid/settled requires authoritative financial evidence; failure never manufactures a receipt.
- Lockups, eligibility, halted markets and trading permissions are enforced at execution time.
- Every externally visible promise links to an authoritative event or state row.

### 7.2 Co-Own must be a complete department

The code has substantive machinery, but its public proposition exceeds what is presently validated. Before enabling it, establish the entire chain: asset intake and valuation → rights/custody evidence → issuance/supply → eligibility → quote → reserve → execute → settle → own → distribute → exit/dispute. An attractive market screen represents only a small part of that obligation.

Distribution funding is especially important: current documentation acknowledges reliance on external funding without an API producer completing that flow. A DRIP worker cannot prove money was paid into the investor's account. Model declared, accrued, funded, credited, reinvested and failed states distinctly, with immutable references.

Jurisdiction, custody, redeemability and economic rights need qualified review for the actual launch markets and contractual structure. This audit makes no legal classification of the product. Do not show regulated/safeguarded/insured claims merely because corresponding UI fields exist. Obtain documentary evidence and operational sign-off before enabling such claims.

### 7.3 Backend departments that need completion proof

| Department | Current risk/uncertainty | Required proof |
|---|---|---|
| Identity/session | Broad source implementation; no current multi-device/provider execution | Refresh/revocation, account switching, recovery, role changes and deletion with real tokens |
| Inventory/catalog | More schema logic; moderation and concurrent state need proof | Complete category fixtures, stock ownership, sold/paused consistency and upload lifecycle |
| Payments/refunds/payouts | Critical auction/Mollie and money invariants; narrow hardening elsewhere | Provider sandbox capture, refund, dispute, payout, replay and reconciliation traces |
| Shipping/fulfilment | New lost/damaged/customs branches need real scenario coverage | Carrier replay/order dedup, late scans, returns, customs uncertainty and issue routing |
| Co-Own/exchange | Source transactions exist, critical invariant gaps remain | Real concurrent DB tests, supply reconciliation, funding, custody and operational review |
| Social/chat/creator | More interaction tooling; persistence/capability boundaries incomplete | Permission matrix, upload failure, realtime recovery, collaboration and safe deletion |
| Search/recommendations | New serving paths; degradation/provenance/ranking incomplete | Fixed corpus, quality benchmark, outage behavior, reindex atomicity and deletion propagation |
| Moderation/trust | Selected provider shape invalid; review/failure handling needs closure | Real adapter contracts, quarantine path, human queue, appeal and decision trace |
| Support/AI operations | Seed routing passes; full answer/action safety unverified | Tenant isolation, grounded answers, handoff, SLA and audited tool authorization |
| Finance/analytics | More ledgers/dashboards; unit/denominator consistency gaps | Reconciled reports, well-defined currencies, late-event policy and export parity |
| Admin/compliance | Tooling is not trained operational capability | Least privilege, approval separation, audit retention, export/erasure evidence and response drills |
| Infrastructure | Final worker/backup/release defects persist | Exact image startup, migrations, real queues, restore, alerts, signed release/rollback |

## 8. ML/AI: upgrade intelligence only after data truth

There is meaningful scaffolding and new retrieval integration. That is not evidence of Pinterest-level visual retrieval, a production fraud model or a calibrated broker valuation service. Treat each capability separately.

| Capability | What next must be established | Proposed evaluation |
|---|---|---|
| Recommendations | Source/model lineage, eligible candidates, stable rank order, cold-start/fallback | NDCG/Recall on temporal holdout plus availability, diversity, coverage and hide rate |
| Visual retrieval | Real nonzero compatible embeddings; ROI relevance; no false cache attribution | Human-labeled item/condition/category pairs; Recall@K, nDCG, latency and false-match examples |
| Pricing/valuation | Sold evidence and fees/FX/condition comparability | Temporal backtest, absolute error, interval coverage, thin-market abstention and bias slices |
| Fraud | Separate rules from trained shadow/serving models | Precision/recall at review capacity, false positives by cohort, chargeback-delay aware labels |
| Moderation | Valid provider inputs, durable review hold, human adjudication | Adjudicated corpus, critical recall, appeal overturn rate, queue age and outage behavior |
| Catalog extraction | Confidence derives from measured evidence; source fields are not OCR proof | Field precision/recall, correction burden, abstention and provenance by source |
| Support | Safe retrieval/tools/answers beyond routing | Real cross-user probes, adversarial documents, unsupported claim rate and human handoff |
| AI cost | Authoritative recorded cost plus controlled future commitments | Concurrent burst under budget boundary, Redis loss, provider failure and ledger reconciliation |

Do not put all departments behind a single “AI enabled” label. A heuristic result, trained shadow prediction, active trained model and human decision should have different provenance in logs and admin UI. Customer copy should describe the benefit honestly without exposing unnecessary implementation detail.

### 8.1 Specific root-reviewed cost and evaluation gaps

[backend/api/src/lib/aiUsage.ts:54–79](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/aiUsage.ts#L54-L79) reads daily recorded spend and then increments request counters, but does not reserve estimated monetary cost. Multiple requests below the threshold can all proceed and later exceed it. `:204–220` adds completed cost to Redis best-effort and suppresses failures. This is a useful soft threshold, not a strict platform spend ceiling. It needs an explicit overshoot budget, in-flight reservations/reconciliation, durable recovery and coverage of all billable entry points. Do not claim an exact cap solely because the Lua check is atomic.

[backend/api/src/lib/costTelemetry.ts:164–176](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/costTelemetry.ts#L164-L176) returns `costUsd` correctly from micro-USD but places the unchanged micro-USD count in `costMinor` with currencyUSD. The public type describes native minor units. One USD is1,000,000 micro-USD, not1,000,000 cents. Correct the contract to explicit costMicrousd or convert to cents with stated precision. This is a telemetry contract defect; no financial charge error was established from it.

### 8.2 Data and rollout discipline

Version the dataset, feature schema, model, embedding dimensions, training period, evaluation and deployment independently. An embedding's dimensionality alone does not make two models' vector spaces compatible. Apply eligibility and authorization before exposing candidates, preserve rank through hydration, and record degradation reasons.

Use shadow evaluation first, then a controlled cohort with rollback. Promotion needs offline benefit and online guardrails: relevant inventory, completed transactions, returns/complaints, latency, cost and seller concentration. Optimize for useful trading outcomes rather than watch time alone. Freeze datasets and prevent leakage from future sales, refunds or repeated near-duplicate images into training/test splits.

## 9. Deployment: prove the actual artifact

The container/workflow definitions are part of the product. Validate the final image, not a development checkout with tsx and source files available. Start API and standalone worker separately with the intended production configuration; process one job from each launch-critical queue and verify effect and heartbeat.

Repair backups before storing real user and financial data. A successful dump command is insufficient: encrypt, upload, check integrity, download, decrypt, restore into a verified disposable target, reconcile schema and financial records, then measure age and restoration duration. Do not run the new restore helper with destructive options until its target guard is hardened. The source findings show why.

Consolidate release publishers and channel mapping. Passing a presence check for an environment variable is not cryptographic signing. Expo documents a private-key signing step and client certificate verification; retain the key privately and verify native acceptance/rejection behavior. [Expo code signing](https://docs.expo.dev/eas-update/code-signing/)

Define launch service objectives and measure them on representative data. Suggested initial targets below are proposals for review, not benchmark claims about competitors or measured ThryftVerse performance:

| Area | Initial target / gate |
|---|---|
| Financial correctness | Zero unbalanced journals, duplicate financial effects or unauthorized transitions in acceptance suite |
| Core API | Agree and load-test endpoint-specific p95/p99 budgets; initial ordinary read p95 target<500ms excludes media/provider work |
| Mobile interaction | Profile main journeys at 60 Hz; identify missed frame budget and memory growth over 20 minutes |
| Search | Track p95 including hydration and facet work; separate engine outage from true zero results |
| Queues | Bounded oldest-job age and delivery latency by criticality; alert on stalled workers |
| Reliability | Agree availability/error budgets and a burn-rate response; do not infer them from uptime route 200 |
| Recovery | Business-approved RPO/RTO demonstrated using downloaded backups and actual restore checks |
| Safety/support | Time-to-triage and time-to-human-resolution by severity; staffed escalation coverage |
| Release | Exact-commit CI, artifact identity, signed update, rollback and all required device evidence |

## 10. Ordered upgrade backlog with exit criteria

Work is sequenced by dependencies and risk. Owners are suggested roles, not assignments to named people. Estimates should follow reproduction and scope review; this report does not invent a delivery date for unresolved infrastructure/provider work.

| Wave | Work package / owner | Dependencies | Exit evidence |
|---|---|---|---|
| 0 | Define launch scope; disable unsafe financial entry points — product/backend/release | Current findings | Server routes and workers obey scoped flags; disabled deep links show honest state |
| 1A | Auction paid transition and Mollie verification — payments | Provider sandbox | Failed/forged/pending callback cannot settle; verified success and replay produce exactly one result |
| 1B | Canonical wallet reservations/idempotency/segments/FX — financial backend | Ledger contract | Real PostgreSQL concurrency and conservation suite with before/after journals |
| 1C | DRIP/lockup/distribution funding — Co-Own backend/product | 1B and rights/funding specification | Missing counteraccount rolls back; funding evidence and receipt agree; lockup rejects server-side |
| 1D | Final worker image, backup and release definition repair — platform | Disposable staging | Image starts; queues complete; encrypted restore and signed OTA/rollback demonstrated |
| 2A | Search credential/fallback/ANN/migration correctness — search/data | Real PG+pgvector and Meili | Populated migration; outage corpus; model-specific ordered retrieval; reindex consistency |
| 2B | Moderation/import/provider contracts — trust/backend | Provider sandbox | Valid Rekognition input, fail-closed activation, DNS/body deadline and review lifecycle tests |
| 2C | Alert/receipt/notification contracts — backend/mobile | Canonical event registry | Null trade, re-arm, crash-between-writes and deep-link/preference cases all pass |
| 3A | Search/live/checkout/visual state closure — mobile | Correct API contracts | Deferred-response tests and native failure-state recordings |
| 3B | Moodboard/feed/block capabilities — creator/mobile | Explicit mutation outcomes | Partial undo failure recoverable; preference changes truthful; all nested actions consistent |
| 3C | Date, identity, portfolio, reorder and accessibility closure — mobile | Domain date/status contracts | Business-zone dates, account switching, large-data reorder and screen-reader completion |
| 4 | Authored visual pass on eight core journeys — design/mobile | Stable functional states | Reference-linked native captures and independent critique; goldens are real and reviewed |
| 5A | ML quality/economics — ML/data/trust | Stable event/data lineage | Held-out quality reports, serving-version proof, cost limits and rollback |
| 5B | Capacity/chaos/operations/store readiness — platform/security/support | Prior waves | No skipped mandatory drills; measured capacity; store forms/policies match real behavior |
| 6 | Limited cohort launch — release/product | All scoped mandatory gates | Small monitored rollout with rollback threshold and accountable on-call owner |

### 10.1 First ten concrete tickets

1. **Replace auction payment shortcut.** Preserve winner authorization and inventory ownership; introduce real pending→verified paid transition. Test no-provider-confirmation and duplicate winner requests.
2. **Remove unsigned Mollie payload fallback.** Require valid ID and successful provider retrieval where no authentic signature exists. Validate amount, currency, intent and merchant binding.
3. **Claim transfer idempotency before mutation.** Concurrent same-key requests must serialize; replay returns original result and different payload rejects.
4. **Make all debits reservation-aware.** One available-funds calculation must cover transfer, withdrawal, trading and DRIP, including partially filled/cancelled orders.
5. **Unify quote and segment accounting.** Use versioned FX and rounding; update purchased/earned segments with every corresponding balance change.
6. **Compile and start standalone workers in the final image.** Verify the same artifact intended for deployment processes jobs without development dependencies.
7. **Repair backup+restore pipeline.** Fix readonly startup, interpreter, egress, destination/encryption, prefix deletion and safe restore identity; perform a real drill.
8. **Close three old mobile state defects.** Search page epoch+retry, live cached-refresh body, checkout actual device tender support and action semantics.
9. **Close new visual-search/moodboard recovery defects.** Reset abort, provenance-bearing results, accessible crop and explicit submission outcomes.
10. **Create real native reference evidence.** Capture Home→PDP→Checkout, Inbox→Chat, Profile/Saved and Co-Own detail in success/error/large-text states; replace placeholder goldens only with approved captures.

### 10.2 Definition of a closed finding

A ticket is closed only when the offending path is removed or safely constrained; related callers and persisted contracts agree; a meaningful regression fails on the old behavior; necessary integration/native validation passes; and the exact commit/artifact and evidence are recorded. If only source work is done, label it **implemented—runtime validation pending**. If only one route is fixed, keep sibling routes in scope until independently checked.

A policy scanner, source-string assertion or documentation checkbox may support closure, but none is sufficient proof of a financial invariant or native experience.

## 11. Launch evidence matrix

| Gate | Mandatory artifact | Current status |
|---|---|---|
| L01 Scope/flags | Enabled capability list and server-side isolation test | Not established |
| L02 Finance | Concurrent ledger/reservation/segment/FX suite on actual database | Blocked by source defects |
| L03 Payment providers | Successful and adversarial sandbox lifecycle traces | Not established; auction/Mollie defects |
| L04 Migration | Empty and populated upgrade with target extensions and rollback plan | Not run; conditional vector defect |
| L05 Workers | Final-image start, queue effect, heartbeat and restart replay | Source configuration blocker |
| L06 Backup/restore | Downloaded encrypted artifact, verified target, integrity and timed recovery | Source/tooling blockers |
| L07 Native UI | Reviewed captures and journey recordings on iOS/Android | Missing; 1×1 goldens |
| L08 Accessibility | VoiceOver/TalkBack, large text, reduced motion and input alternatives | Unverified; crop action gap |
| L09 Moderation/security | Provider contract, quarantine, authorization and import safety tests | Remaining defects and missing integrations |
| L10 ML/AI | Serving lineage, quality report, safety/tool tests and cost control | Partial scaffolding; not competitive-quality proof |
| L11 Release | Exact-head CI, consolidated signed publish/channel/rollback | No head runs returned; configuration gaps |
| L12 Operations | Measured capacity, alerts, staffed escalation and fault recovery | Docs/helpers only in this review |
| L13 Policy/rights | Region-specific policies, Co-Own rights/custody/funding and qualified review | Not verified |
| L14 Product comparison | Task-based usability benchmark against reference journeys | Not conducted |

## 12. Coverage and limitations

The audit deeply samples changed and high-risk execution paths and revalidates previous named findings. It is not a formal proof of every line, a penetration test, a legal opinion or a guarantee that no other defect exists. The previous report's broad screen/route inventory remains a planning inventory; it should not be read as every screen having been executed.

The department appendices below provide current source anchors, failure mechanisms and acceptance tests. Their source-confirmed findings are more actionable than a blanket statement that the backend is “100% built.” New modules and administrative screens widen capability but also widen the verification burden.

The immediate quality strategy is to complete existing contracts and gather real execution evidence. Once payment, inventory, search, conversation and recovery behavior are dependable, visual refinement can make that dependable system feel as coherent as the supplied references.



## Appendix A. Financial and Co-Own findings


Checkout: `76c0733f8fca7424ad5bfb51c81d2a71a36e866f`. Comparison baseline: `fdd63b8`. Read-only review of active handlers, caller wiring, migrations and focused tests. Current source anchors and required invariants are recorded below.

### Decision

**The upgrade does not close the financial production blockers. All nine prior FIN findings remain open.** It adds useful surveillance, ledger-kind admission, alerts and DRIP receipts, but several new notification paths are incomplete. A notification or risk-event improvement is not a settlement correctness fix.

### Prior FIN finding disposition with current anchors

| ID | Severity | Fresh status | Current evidence |
|---|---|---|---|
| FIN-01 | Critical | Unchanged, open | [backend/api/src/routes/auctions.ts:252-393](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/auctions.ts#L252-L393) still authenticates winner, then directly sets paid/settled, inserts paid order and posts ledger without provider capture/verified payment or wallet debit. File unchanged from baseline. Registered [backend/api/src/index.ts:38296](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L38296). Frontend [frontend/src/hooks/useAuctionDetail.ts:476-490](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/hooks/useAuctionDetail.ts#L476-L490) still calls pay endpoint with only key. |
| FIN-02 | High | Unchanged, open | [backend/api/src/routes/coOwn.ts:654-655](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/coOwn.ts#L654-L655) directly converts GBP notional to 1ZE using ×1000; DRIP [backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts:247-258](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L247-L258) retains milli-GBP assumption. Wallet pricing remains USD-anchored ([backend/api/src/lib/pricingEngine.ts:1-8,567-578](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/pricingEngine.ts#L1-L8); migration [217_atpar_pricing_engine.sql:20-29](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/db/migrations/217_atpar_pricing_engine.sql#L20-L29)). |
| FIN-03 | High | Unchanged, open | Co-Own excludes other reservations locally ([coOwn.ts:667-687](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/coOwn.ts#L667-L687)), but gross-balance-only [backend/api/src/lib/walletMoneyPath.ts:58-99](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/walletMoneyPath.ts#L58-L99) remains unchanged. Active transfer uses it ([index.ts:22579-22630](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L22579-L22630)); DRIP checks gross balance ([coOwnDripExecutionHandler.ts:260-288](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L260-L288)). Wallet reservation search still finds display/projection at [index.ts:23857-23895](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L23857-L23895), not the debit primitive. |
| FIN-04 | High | Unchanged, open | Transfer performs ordinary idempotency read [index.ts:22445-22459](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L22445-L22459), mutates after acquiring wallet later `:22579-22630`, and saves at `:22682-22693`. [walletMoneyPath.ts:146-215](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/walletMoneyPath.ts#L146-L215) still uses SELECT then INSERT ON CONFLICT DO NOTHING. Two concurrent absent-key reads can both transfer before one response save loses the conflict. |
| FIN-05 | High | Unchanged, open | Co-Own directly mutates wallets/ledger [coOwn.ts:694-749](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/coOwn.ts#L694-L749), DRIP [coOwnDripExecutionHandler.ts:288-342](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L288-L342); neither calls segment accounting. [index.ts:3254-3321](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L3254-L3321) still leaves surplus segments intact and repairs deficits as purchased units. Purchased/earned provenance remains divergent after trading. |
| FIN-06 | High | Unchanged, now unblocked by schema fix | DRIP still conditionally credits issuer only `if (issuerWallet)` ([coOwnDripExecutionHandler.ts:320-346](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L320-L346)) then creates settled trade and holdings. Missing issuer wallet leaves buyer debit committed with no issuer/suspense credit. Migration 324 now permits the CO_OWN_DRIP ledger kind, removing a DB failure that previously may have prevented reaching this economic defect. |
| FIN-07 | High | Unchanged, open | Central market capability lookup [coOwn.ts:863-890](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/coOwn.ts#L863-L890) still selects only is_open/available_units and checks exit/halt; future lockup is serialized at `:6279-6280` but not enforced by commands. No lockup reads were added to execution paths. |
| FIN-08 | Medium | Unchanged, open | Public transfer's enum/context checks [index.ts:22340-22369](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L22340-L22369) still accept arbitrary coOwn_trade/platform_reward context; policy helper `:3714-3758` checks presence, not actual domain event/participants/amount/authority. |
| FIN-09 | Medium | Unchanged, open | Auction payment idempotency key is still only part of constructed order ID ([auctions.ts:366](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/auctions.ts#L366)); an already-successful retry fails settled guard `:303-307` rather than replaying authoritative result. |

These conclusions come from current implementation, not simply missing diff hunks. No runtime exploit was attempted. Deployments may disable features or have additional external controls; no such effective compensating control was established from this review.

### New / freshly verified defects

#### SEP20-FIN-10 — High: Mollie webhook hardening still accepts attacker payload when provider retrieval fails

[backend/api/src/lib/paymentProviders.ts:852-875](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/paymentProviders.ts#L852-L875) now rejects configurations lacking both webhook secret and API key. This is a real improvement, but presence of an API key alone is not event authentication. With API key configured and no webhook secret, `normalizeMollieEvent` (`:524-561`) initializes status, metadata and money from caller payload, attempts provider retrieval, then **swallows errors and continues using that payload** (`:545-547`). It also skips retrieval altogether if payload lacks an ID. The verifier returns `verified:true` either way. Independent status retrieval is the relevant reference behavior; see [Mollie payment status guidance](https://docs.mollie.com/docs/handling-payment-status).

Active webhook handler [backend/api/src/index.ts:30412-30427](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L30412-L30427) trusts this verdict; it can resolve an intent from payload metadata `:30484-30520` and processes payment status `:30633` onward. Existing canonical amount validation is conditional on `event.money` and does not establish independent status authentication. A forged paid-status payload with target intent metadata can enter settlement when retrieval fails; credentials configured on the server must not make untrusted request data authoritative.

Required: on unsigned Mollie callbacks require a valid payment ID and successful provider retrieval, deriving status, intent linkage and money exclusively from that response. Provider outage must yield retryable failure with no state transition; do not fallback to payload. Acceptance: API key/no secret, inject failed provider lookup + forged paid payload and assert no payment/escrow/order transition. Test absent ID, wrong ID, missing money and provider metadata mismatch as well.

#### SEP20-FIN-11 — Medium: new alert delivery rejects legitimate fallback-price events

Evaluator [backend/api/src/workers/handlers/coOwnAlertEvaluatorHandler.ts:109-143](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/coOwnAlertEvaluatorHandler.ts#L109-L143) returns `tradeId:null` when no settled trade exists and it uses an asset reference/appraisal price. Event payload at `:219-224` includes that null. New drain schema at [backend/api/src/workers/handlers/outboxDrainHandler.ts:989-998](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/outboxDrainHandler.ts#L989-L998) declares `tradeId: z.string().optional()` (not nullable). Zod rejects the legitimate null event before notification. Alert has already been deactivated and marked triggered within evaluator transaction (`:194-232`), so retries fail without reaching the user.

Required: agree on nullable execution reference for fallback marks (and disclose mark provenance). Acceptance: asset with no settled trades crosses alert threshold; drain event through actual schema/notification handler and verify one delivered alert, no dead letter. Also exercise an actual settled-trade string reference.

#### SEP20-FIN-12 — Medium: newly re-armed alerts cannot emit a second crossing notification

New PATCH logic [backend/api/src/routes/coOwn.ts:1014-1024](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/coOwn.ts#L1014-L1024) clears `triggered_at` on active=true. Evaluator continues deduplication by lifetime alert ID ([coOwnAlertEvaluatorHandler.ts:212-213](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/coOwnAlertEvaluatorHandler.ts#L212-L213)). [backend/api/src/lib/domainOutbox.ts:73-79](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/domainOutbox.ts#L73-L79) conflict returns the old event without rearming/replacing it. New notification handler also uses lifetime alert ID at [outboxDrainHandler.ts:1016](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/outboxDrainHandler.ts#L1016).

Thus re-enable → crossing sets alert inactive/triggered again but resolves to the old processed outbox event; no new delivery. If event retention eventually deletes it, notification dedup still needs a new activation key. The “re-arm semantics completed” documentation is overstated.

Required: persistent activation/trigger sequence or activation UUID in both event and notification dedup keys; retain exactly-once semantics within one activation. Acceptance: trigger→deliver→reactivate→trigger→deliver produces two notifications and distinct immutable trigger records; duplicate sweep within either activation produces one.

#### SEP20-FIN-13 — Medium: permanent DRIP failure receipt is not atomic despite durability claim

In normal transaction paths, receipt append is correctly coupled to state. But catch path calls `markDistributionFailedStandalone` ([coOwnDripExecutionHandler.ts:463-466](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L463-L466)); helper performs `db.query(UPDATE ... status='reinvest_failed')` at `:588-596` and a **separate** `emitDripReceiptEvent(db,...)` at `:598-600`. Pool queries are separate autocommit operations. Crash or outbox insertion failure after UPDATE leaves a terminal failed distribution with no receipt. Next sweep selects only settled rows and never repairs delivery.

Required: wrap standalone failure transition + outbox in one connection/transaction; make durable recovery discover missing receipt if historical rows exist. Acceptance: inject fault between UPDATE and event append and verify both roll back or retry restores one receipt. Tests must include this catch path, not only the normal transaction path.

#### SEP20-FIN-14 — Medium: new retained-cash receipt claims cash exists precisely when balance is insufficient

DRIP marks `retained_cash` upon `balanceUnits < dripDebit1zeUnits` ([coOwnDripExecutionHandler.ts:270-285](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts#L270-L285)). New drain text claims “Distribution paid as cash” and “your distribution stays in your balance as cash” ([outboxDrainHandler.ts:1040-1050](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/outboxDrainHandler.ts#L1040-L1050)). Yet code performs no cash credit in this path; insufficient balance may mean external credit never happened or user already spent it. Updated [backend/api/src/docs/KNOWN_GAPS_COOWN.md:65-69](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/docs/KNOWN_GAPS_COOWN.md#L65-L69) explicitly acknowledges no API distribution credit/settlement producer and reliance on outside funding.

Required: distinguish “not reinvested” from independently evidenced “credited and available cash”; receipt must cite actual distribution payment ledger or say cash funding/availability is unverified. Acceptance: settled distribution metadata with zero wallet balance must not send paid-as-cash/available-balance claims.

### Verified improvements — what can honestly be credited

1. **Wallet ledger schema admission fixed in source:** migration [backend/api/src/db/migrations/324_wallet_ledger_oneze_refund.sql:18-45](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/db/migrations/324_wallet_ledger_oneze_refund.sql#L18) now admits ONEZE_REFUND, CONVERT_TO_FIAT, CREATOR_EARNING_PAYOUT and CO_OWN_DRIP. Previous initial constraint omitted these. This fixes a concrete real-DB constraint blocker if migration is applied. It does not verify economic correctness or deployment migration success.
2. **Advisory Co-Own surveillance wired:** placement [coOwn.ts:4692-4731](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/coOwn.ts#L4692-L4731) and cancellation `:4906-4935` invoke evaluateRisk after commit; dependencies supplied at [index.ts:14049-14068](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L14049-L14068). This is actual wiring, not only event taxonomy. It is explicitly advisory/fail-open, so do not claim prevention of manipulation. No transaction-coupled outbox ensures every committed order reaches surveillance after process crash; idempotent replay can return before evaluation.
3. **Alert delivery branch exists:** new [outboxDrainHandler.ts:989-1020](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/outboxDrainHandler.ts#L989-L1020) handles the event instead of unsupported-type failure. Settled-trade reference lookup has deterministic created_at/id tie-break and is emitted. Partial only, given FIN-11/12.
4. **DRIP receipt exists for normal paths:** transactional success, business failure and retained outcome append domain events; drain branch [outboxDrainHandler.ts:1024-1070](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/outboxDrainHandler.ts#L1024-L1070) and event registry wire notification delivery. Partial only, given standalone atomicity and truth defects.
5. **DRIP tx ID now deterministic:** worker `:289-292` uses distribution ID. This improves traceability; accompanying claim that it alone prevents second debit if state guard is bypassed is false. `wallet_ledger` migration 015 has an ordinary tx_id index (`:48-49`), no unique tx_id constraint found in migrations. Existing distribution row lock/state guard is the actual replay protection; do not report normal replay vulnerability solely because index is nonunique.
6. **Mollie absent-auth configuration fails closed:** verified source improvement [paymentProviders.ts:862-870](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/paymentProviders.ts#L862-L870); incomplete for unsigned callback/provider retrieval failure as above.
7. **Flutterwave hash comparison uses timing-safe helper:** [paymentProviders.ts:882](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/paymentProviders.ts#L882); narrow genuine hardening, not proof of full provider binding.
8. **Stripe instrument surveillance uses provider card fingerprint:** [stripePaymentMethods.ts:332-353](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/stripePaymentMethods.ts#L332-L353) records account/instrument link using fingerprint, fallback pm ID. Advisory projection; no blocking claims.
9. **Documentation becomes more candid:** KNOWN_GAPS_COOWN now identifies external distribution funding, polling and lack of operator requeue. That transparency is useful and also limits what product capability can be claimed.

### Focused verification actually run

Command from `backend/api`:

`node --import tsx --test src/__tests__/coOwnSurveillanceContract.test.ts src/__tests__/ledgerKindContract.test.ts`

Result: **5 tests passed, 0 failed** (two suites). These are static/source/schema-text contracts, not real DB route/provider integration. The surveillance tests match source strings; they cannot establish execution, financial conservation, atomic receipts or notification schema compatibility. No full suite, live DB, provider integration or production transaction was run.

### Required acceptance tranche before release claim

- Collect real auction payment before paid/settled; exercise pending, failure, retry, verified success and lost response.
- Real PostgreSQL concurrent same-key transfer yields one debit and one credit.
- Across reserve, trading, transfer, conversion, withdrawal and DRIP, maintain spendable balance and all commitments; reject spending reserved units.
- Non-unit USD/GBP FX reconciles displayed GBP consideration, 1ZE settlement, fees and ledger with one quote version.
- Trading and DRIP preserve purchased/earned segment parity and enforce contractual lockup on server.
- Missing issuer wallet produces no unbalanced settled DRIP.
- Real outbox consumer tests include null trade reference, re-arming, injected append failure and cash-unavailable receipt.
- Unsigned Mollie webhook with failed provider retrieval never settles; independent provider data is mandatory.

The prior readiness questions remain: authoritative distribution funding, legal/custody rights, reserve/supply reconciliation, deploy-time worker/migration execution, stale maker handling and actual completed settlement/refund/payout evidence. Source implementation cannot answer these operational questions alone.


## Appendix B. Frontend findings and behavioral closure



### Verdict

There is useful functional progress: real moodboard undo/redo operations, replay routing and truthful recording states, crop-aware visual search, feed preference controls, blocked-seller affordance gating, dated sold comparables, and incoming-message scroll restraint. However the previous concrete frontend findings were not closed by this revision. New features also expose failure-path and accessibility gaps. The next pass should prioritize those closures before adding more controls or increasing screen density.

### Revalidation of FRESH-01–12

| ID | Current verdict | Current evidence / exact next action |
|---|---|---|
| 01 Live cached-refresh blank body | Open, high | [screens/LiveShoppingHomeScreen.tsx:350–352](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/LiveShoppingHomeScreen.tsx#L350-L352): error requires no summary; content requires no error. Existing summary + failed refresh matches neither. Preserve cached content and show inline retry. Replay navigation change does not fix this state. |
| 02 Search request race | Open, high | [hooks/discovery/useDiscoverySearch.ts:220–265](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/hooks/discovery/useDiscoverySearch.ts#L220-L265) still appends page responses and sets paging state without an epoch/cancel guard. Query/filter identity must guard every state write. |
| 03 Invisible pagination failure | Open, medium-high | Same hook sets searchError; [components/discovery/DiscoverySearchResultsView.tsx:200–209](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/discovery/DiscoverySearchResultsView.tsx#L200-L209) still shows it only for zero units. Populated branch has no failed-page footer. |
| 04 Branded payment button device support | Open, high | [screens/CheckoutScreen.tsx:644](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CheckoutScreen.tsx#L644) calculates actual device support, but `967–968` still derive showApplePay/showGooglePay only from platform + merchant capability + submission state. Footer uses those booleans and same generic onPay as card. |
| 05 Paused portfolio sheet status | Open, medium | [screens/PortfolioScreen.tsx:212](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PortfolioScreen.tsx#L212) still maps isOpen to Active/Closed instead of authoritative status. Correct row formatter remains, but sheet cannot show Paused. |
| 06 Profile For sale no-op | Open, medium | [screens/MyProfileScreen.tsx:269](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MyProfileScreen.tsx#L269) still vibrates without selecting/scrolling the listing tab. |
| 07 Unbounded reorder grid | Open, medium | [components/myprofile/ClosetGrid.tsx:56,132](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/myprofile/ClosetGrid.tsx#L56) still mounts all items in reorder mode inside non-scrolling FlashList/outer ScrollView. Default preview cap is mitigation, not full closure. |
| 08 Editorial hero noninteractive | Open, medium | [components/discovery/DiscoveryFeedView.tsx:204–225](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/discovery/DiscoveryFeedView.tsx#L204-L225) still presents editorial title/byline/read time inside a View with no destination. New feed-control callback is unrelated. |
| 09 Condition-photo semantic assumption | Open, medium | [components/itemdetail/ItemDetailItemDetails.tsx:80–95](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/itemdetail/ItemDetailItemDetails.tsx#L80-L95) still labels last arbitrary photo as condition evidence whenever multiple images exist. Use tagged evidence or generic photo language. |
| 10 Discovery stale attribution | Open, medium | [hooks/discovery/useDiscoveryContent.ts:29–53](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/hooks/discovery/useDiscoveryContent.ts#L29-L53) tracks module failures; DiscoveryFeedView still renders a generic note. UnifiedDiscovery does not forward listing lastError to the populated feed surface. |
| 11 Settings identity/freshness ownership | Open, conditional robustness gap | [hooks/settings/useSettingsScreenData.ts:33–52](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/hooks/settings/useSettingsScreenData.ts#L33-L52) does not clear balance on retained-hook identity changes and still coalesces a malformed successful snapshot to zero. Typical navigation may remount; no claim that cross-account display was observed. Request failures already show Unavailable. |
| 12 Font scale inconsistencies | Open, native verification required | [components/ui/AppSegmentControl.tsx:141](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/ui/AppSegmentControl.tsx#L141) caps at 1.3; [components/home/HomeFeedHeader.tsx:201,205,294](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/home/HomeFeedHeader.tsx#L201) still caps key text at 1.4/1.5. Shared text retains multiple caps. No native clipping claim can be made from source alone. |

Prior correctly credited fixes still stand: central query-cache purge on logout, signed performer direction, market-status row formatter, measured PDP description overflow, default profile preview cap, and backend discovery cursor wiring. Do not reopen those narrower fixes; address their remaining adjacent paths.

### New and newly exposed findings

#### S20-01 — Visual search reset does not invalidate the pending search (high)

[hooks/visualsearch/useVisualSearchResults.ts:84–90](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/hooks/visualsearch/useVisualSearchResults.ts#L84-L90) assigns request sequence and abort controller to new searches, and completion checks that sequence at `125–126`. But `resetResults` at `210–217` clears state without aborting or advancing the sequence. Image removal changes imageUri to null, and the image-change effect at `194–205` does not run a replacement search for null. A response from the removed image can therefore pass the unchanged sequence check and repopulate results after reset.

Acceptance: start slow image request; remove photo; resolve old request. Status remains idle, no old results/facets/scope return, and no old callback alters a subsequently selected image. Abort plus epoch invalidation must cover reset, identity change, and unmount.

#### S20-02 — Cached visual fallback can inherit false visual/region provenance (high)

[useVisualSearchResults.ts:131–136](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/hooks/visualsearch/useVisualSearchResults.ts#L131-L136) replaces empty/fallback API results with filter-matched cached listings. At `159–166` it still takes `visualMatching`, `similarityMethod`, and `retrievalMeta.queryScope` from the API, not from the actual displayed cached set. If a real visual or region search returns zero rows and cache fallback exists, cached filter-only results can be described as visual/color/region matches. The comment at `146–149` claiming an empty retrieval honestly stays empty is contradicted by the earlier substitution.

Acceptance: API visual=true + queryScope=region + zero results + nonempty cache yields explicitly filter-only fallback, with no visual similarity or crop-scope claim and no API facet counts attached to a different candidate set. Or preserve the real empty result with optional separate fallback exploration. Provenance must travel with the displayed result collection.

#### S20-03 — Crop controls advertise adjustable semantics without adjustment actions (high accessibility)

[components/visualsearch/VisualSearchRegionCropper.tsx:335–353](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/visualsearch/VisualSearchRegionCropper.tsx#L335-L353) makes the frame and four corner handles accessible with role adjustable, but only PanResponder handlers are attached. There are no accessibilityActions/onAccessibilityAction implementations in the component. Naming a drag target does not make it operable through VoiceOver or TalkBack increment/decrement. See [React Native accessibility actions](https://reactnative.dev/docs/accessibility#accessibility-actions).

Acceptance: a screen-reader user can move and resize the region, hear changed bounds or equivalent useful feedback, reset it, and confirm/cancel without touch dragging. Add actual semantic actions or an accessible alternative control mode; test image letterboxing and min-size constraints through both interaction paths.

#### S20-04 — Moodboard history advances after nonpersisted online inverses (high)

[components/moodboard/useMoodboardHistory.ts:105–119](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/moodboard/useMoodboardHistory.ts#L105-L119) optimistically applies undo/redo and awaits submitBoardOps. `124–145` then moves the stack entry. In the no-local-DB branch, [components/moodboard/useMoodboardBoard.ts:333–350](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/moodboard/useMoodboardBoard.ts#L333-L350) catches network failures or breaks on conflict/forbidden, but resolves without an outcome indicating failure. The history hook treats that resolution like accepted/queued success. For a multi-op inverse, only a prefix may have persisted; the whole optimistic inverse is shown and history advances.

Acceptance: distinguish applied, durably queued, conflict, forbidden, and failed. Fail second op of a multi-op undo in DB-unavailable mode; preserve recoverable command state, show honest sync failure, and restore/reconcile actual state instead of marking the full inverse complete. A successful retry must not duplicate or lose operations. Concurrent normal edit during an inverse also needs an explicit tested ordering policy.

#### S20-05 — New recommendation controls do not surface failed persistence (medium)

[screens/UnifiedDiscoveryScreen.tsx:189–206](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/UnifiedDiscoveryScreen.tsx#L189-L206) immediately hides Not interested and ignores its result; Show less only acts if result.persisted is true. [services/recommendationFeedbackApi.ts:116–131,143–169](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/services/recommendationFeedbackApi.ts#L116-L131) intentionally returns persisted:false on failure/anonymous context. Yet the accessibility hint at UnifiedDiscovery `411` promises “stops recommending it.” The user gets no distinction between a session-local hide and a persisted preference, nor an undo affordance. New hiddenListingIds also filters search results (`239–245`), so suppressing a recommendation can remove an exact explicit search result for the same item.

Acceptance: show concise reversible feedback, clearly distinguish locally hidden/queued/saved/failed, and expose retry when persistence failed. Define whether Not interested affects only recommendations or explicit search; do not silently broaden that scope. Test authenticated failure, guest use, reconnect, screen remount, and account change.

#### S20-06 — Blocked seller still has public-question submission entry (medium)

The new PDP gate correctly hides purchase/offer dock and seller follow/message callbacks ([components/commerce/detail/CommerceActionDock.tsx:175](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/commerce/detail/CommerceActionDock.tsx#L175), [components/itemdetail/ItemDetailSellerSection.tsx:69–70](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/itemdetail/ItemDetailSellerSection.tsx#L69-L70)). However existing questions keep the archive entry visible ([screens/ItemDetailScreen.tsx:574–581](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ItemDetailScreen.tsx#L574-L581)); its sheet passes only listingId/currentUserName/isSeller into ListingQA ([components/itemdetail/ItemDetailSheets.tsx:298–302](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/itemdetail/ItemDetailSheets.tsx#L298-L302)). ListingQA renders an ask composer at [components/product/ListingQA.tsx:211–230](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/product/ListingQA.tsx#L211-L230) without a blocked-relationship capability. Thus the communication closure is incomplete even though direct message is gated.

Acceptance: preserve readable public evidence while deriving submit/answer/report capabilities centrally. Blocked users cannot see a dead Ask action; server enforcement remains independently authoritative. Test seller blocked before opening and blocked while sheet is open.

#### S20-07 — Replay load has no stale-response identity guard (medium, route-reuse contingent)

[screens/LiveStreamReplayScreen.tsx:193–217](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/LiveStreamReplayScreen.tsx#L193-L217) fetches by sessionId and applies response without cancellation/epoch checking. The secondary more-replays fetch does include cancellation (`222–236`). Typical `push` creates another instance, so wrong-session overwrite requires route reuse/param update or concurrent load ordering; do not describe it as an observed native bug. Still, the primary resource should be at least as well guarded as its secondary rail. Loading also replaces cached replay with a skeleton and failure clears replay, which deserves intentional refresh behavior.

Acceptance: rapid reused-route changes and delayed responses never play the wrong recording. Signed recording URL expiry gets a refetch, not repeated remount of the same expired URL. Playback retry currently only increments playbackAttempt at `244–249`, so verify URL lifecycle before declaring replay recovery complete.

### Improvements worth preserving

| Area | Source-backed progress | What source/tests cannot establish |
|---|---|---|
| Chat reading position | [hooks/chat/useConversationMessages.ts:597–610](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/hooks/chat/useConversationMessages.ts#L597-L610) only scrolls for reader-at-bottom or own echo using the production helper. Document attachment upload now includes MIME type and filename. | Actual list offset, keyboard effects, incoming bursts, media height changes, and unread-below behavior on native. |
| Moodboard history | Pure inverse/forward operation model, 50-entry cap, deleted-item handling, stack resets per board, shared operation submission, and selection pruning. | Persistence failure semantics, DB-unavailable partial writes, multi-device interleaving, crash recovery of history (stacks intentionally die on unmount), and long-session memory/gesture quality. |
| Visual ROI | Uses normalized coordinates, resets region on new image, updates ref before re-search, and only claims region scope when backend reports it. | Native touch math, orientation changes, screen-reader operation, stale reset and cache-provenance bugs above. |
| Live replay | Home ended sessions now navigate to LiveStreamReplay. Dedicated player with native controls and separate processing/not-recorded/error paths. Secondary rail failure does not replace the main replay. | Actual playback, audio behavior on navigation/background, signed HLS URLs, captions, native controls accessibility, retry behavior, and aspect-ratio composition. |
| Commerce | Blocked-seller dock and callback suppression; sold comparable dates become visible evidence; shared listing fetch source. | Entire capability matrix, public Q&A gate, server block enforcement, order/payment correctness, and truthful unknown seller state. |
| Discovery | Real preference mutations and serve attribution; explanation sheet receives real reason codes/component scores; listing dedup test exercises production assembler. | Persistence feedback, gesture discoverability, accessibility action reachability, result exhaustion, and native density legibility. |

### Test-quality assessment

The new work mixes meaningful behavior tests with weaker closure guards. Test counts should not be translated into feature completeness.

- [__tests__/backendDataPagination.test.tsx:73–133](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/__tests__/backendDataPagination.test.tsx#L73-L133) mounts the production provider and verifies append, dedup, empty-page stop, and loading reset. Useful boundary tests; add overlapping refresh/page response order and context/identity change.
- [__tests__/moodboardHistory.test.ts:80–338](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/__tests__/moodboardHistory.test.ts#L80-L338) tests pure production stack transitions, inverse ops, ordering, and optimistic board application. Useful algorithm tests; it does not mount useMoodboardHistory or exercise submission outcome propagation. Add hook + deferred transport/outbox integration.
- [__tests__/commerceDetailRuntime.test.tsx:337–390](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/__tests__/commerceDetailRuntime.test.tsx#L337) renders production CommerceActionDock with blocked/unblocked inputs. Useful behavior proof for that component; it cannot catch the separate Q&A entry or screen wiring of checkout capability props.
- The added [__tests__/chatRuntimeBehaviour.test.ts:436–450](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/__tests__/chatRuntimeBehaviour.test.ts#L436-L450) checks the actual production boolean scroll helper. That is a useful unit policy check, not a runtime conversation/list anchoring test. Existing sections at `402–432` only construct and exercise local mocks, so they can pass even when the app's actual error/retry path is broken.
- [__tests__/directDetailFlagshipClosure.test.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/__tests__/directDetailFlagshipClosure.test.ts) uses readFileSync and toContain/regex assertions over source. These can protect structural policy, but cannot establish that props have correct values, actions are reachable, styles fit, accessibility works, or network branches behave. Keep them as policy lint, not primary closure evidence.
- Every passing suite must be labeled with its scope. No screenshot/device outcomes were established in this review.

### Full-suite result and date failure diagnosis

Frontend typecheck passed; full suite 120 files: 118 pass, 2 fail; tests: 2,138 pass, 2 fail, 2 skipped. The visual audit reports 50 P0 / 36 P1 and icon audit 1,491 warnings / 14 info across 592 files with exit 0. These tool-labeled severities are automated findings, not verified native visual defects; warnings with zero exit status are not a clean visual signoff.

The distribution-date failure at [__tests__/coownDistributionDepth.test.tsx:447](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/__tests__/coownDistributionDepth.test.tsx#L447) is diagnosed rather than attributed speculatively to the changed date utility. The calendar does not import that utility. [components/coown/CoOwnDistributionCalendar.tsx:63–70](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/components/coown/CoOwnDistributionCalendar.tsx#L63-L70) has an unchanged local formatter: `new Date(iso).toLocaleDateString('en-GB', ...)` with no explicit time zone. In this execution environment `process.env.TZ` is `America/Chicago`; a direct Node check formats fixture `2026-09-15T00:00:00Z` as `14 Sept 2026`, while the test requires day 15. The dateFormat diff only appends formatDateRange and does not change existing formatting functions.

Classification: deterministic timezone-dependent failure, not a new locale-formatting regression established by this diff. It also exposes a pre-existing product semantic risk: record/ex/payable dates must not silently move to the preceding calendar day if their contract represents business dates. Resolve the contract (calendar date vs precise instant and authoritative business zone), format accordingly, and test explicit timezones. Merely loosening the regex or forcing the suite to UTC would hide that product question. The regex's Sep/Sept tolerance is unrelated to the observed one-day shift.

### Ordered next-quality plan

#### P0/P1 behavioral closure before more visual work

1. Fix payment tender visibility/action truth, search page identity and visible retry, and live cached-refresh state. These are pre-existing high-impact defects with deterministic reproduction scenarios.
2. Fix visual reset invalidation and fallback provenance; add accessible crop actions. The new visual feature cannot be complete while removing a photo resurrects it or filter-only results claim image matching.
3. Define explicit moodboard submission outcomes and atomic/recoverable history semantics. Preserve optimistic editing but make save/queued/conflict/failed truth exact.
4. Finish relationship capability propagation across dock, seller row, public Q&A, offer sheet, and deep-link entry. Keep blocked content readable when appropriate while removing unavailable mutations.
5. Make feed controls reversible and persistence-aware; determine recommendation-vs-search scope explicitly.

#### P2 authored surface refinement

- Home/Explore: media should own the first viewport. Validate three-column density on narrow phones and 200% text; do not equate more tiles with better design. One useful filter rail, restrained story insertion, no decorative editorial without a destination.
- Product detail: preserve one seller identity and progressive description. Use semantically tagged condition media; keep total cost and trust facts close to the decision. Eliminate contradictory relationship/status states between nested sheets.
- Checkout: a compact truthful total and one primary payment intent. Expanded fee breakdown belongs where readable; test absolute footer at large text and keyboard sizes. Named tender controls must map to exact actions.
- Inbox/chat: newest useful conversation content leads. Story rail must earn its height. Native verify scroll anchoring with delayed media, read-history incoming bursts, outgoing retry, attachments, keyboard, and app backgrounding.
- Profile/storefront: make statistics act as navigation or static facts, never haptic-only controls. Use a virtualized dedicated reorder view; preserve store identity and compact operational entry points.
- Moodboard/creator: canvas remains dominant; history buttons need reliable pending/disabled behavior, recoverable sync state, and visible consequence when undo cannot apply because a collaborator removed an item.
- Live/replay: media dominates; unavailable recording states remain calm and factual. Verify playback restart/resume policy, native controls, background audio, low bandwidth, captions, and dated metadata.
- Wallet/portfolio/settings: one source of truth for status and money, no manufactured zero, current/freshness context, and privacy hiding all related amounts. Correct paused status in every entry point.

#### Evidence required to close the design audit

Capture native iOS and Android first viewport + key overlays for small/large phone, light/dark, normal/200% text, keyboard open, screen reader, and reduced motion. Run real delayed-response, offline, app-restart, identity-switch, and failed-mutation scenarios. Source inspection and renderer tests establish narrower facts; they cannot certify authored visual hierarchy, 44pt hit targets after layout, contrast, gesture conflicts, frame pacing, or a complete social-trading journey.

Appendix E provides the current screen-family requirements inventory alongside these closure priorities. A screen should be called complete only when its positive state, failure state, all nested actions, and native evidence agree.


## Appendix C. Backend, search and ML findings



### Executive assessment

This delta implements useful retrieval and operating infrastructure: recommendation sources now include followed sellers, affinity and trending; recommendations can call a new pgvector retrieval library; a separate scheduled search-indexing queue builds/switches versioned indexes; people/board search is real SQL with visibility controls; search degradation is now disclosed. These are genuine runtime additions rather than files without callers.

It does not close the previous high-priority moderation, import transport or root-compose ML administration findings. Embedding inference still unconditionally generates zeros; classifier/extraction/triage limitations remain. The new vector upgrade cannot be treated as trained-model completion, and its SQL backfill has an arithmetic defect that zero placeholders hide.

### Prior finding closure matrix

| Prior item | Current status | Current evidence / qualification |
|---|---|---|
| B1 malformed Rekognition Image.Url | OPEN, unchanged | [lib/moderation/rekognitionProvider.ts:63-67,250-254](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/moderation/rekognitionProvider.ts#L63-L67). File unchanged against baseline. [AWS Image API](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Image.html) specifies Bytes or S3Object. Actual installed SDK serialization previously proved Image:{}; no new provider fix appears. |
| B2 listing text moderation fails open | OPEN | Current create [index.ts:16840-16855](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L16840-L16855), edit `:18582-18600`: rejected blocks; review logs; failed proceeds. Service catches into failed at [moderationService.ts:137-158](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/moderation/moderationService.ts#L137-L158); Rekognition text always failed at [rekognitionProvider.ts:277-283](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/moderation/rekognitionProvider.ts#L277-L283). |
| B3 import DNS validation/connect TOCTOU | OPEN, unchanged | [lib/media/remoteImport.ts:238-255,559-584](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/media/remoteImport.ts#L238-L255); active catalogImportMediaHandler still calls ingestRemoteMedia. Fixed shared safeRemoteMediaFetch is still a separate implementation. |
| B4 import read timer cleared at headers | OPEN, unchanged | [remoteImport.ts:569-592](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/media/remoteImport.ts#L569-L592) clears read timer before body reader at :624 onward. Shared helper DNS-await deadline limitation also unchanged. |
| B5 root compose ML admin default secret + exposed port | OPEN, unchanged configuration | [ml-service/app/main.py](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/ml-service/app/main.py) require_admin defaults local-admin-token. Root base compose :300-310 publishes 8000; prod override :293-298 neither removes inherited port nor adds ADMIN_SERVICE_TOKEN. External firewall/deployment overrides unknown. |
| B6 search key variable mismatch | OPEN, failure presentation changed | [lib/searchAdapter.ts:234-237](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/searchAdapter.ts#L234-L237) and [meilisearchConfig.ts:117-120](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/meilisearchConfig.ts#L117-L120) still read MEILISEARCH_KEY; root compose :223-225 passes MEILISEARCH_API_KEY. New catch returns local fallback instead of 500. New env examples document KEY but compose does not forward it. |
| zero embeddings | Infrastructure improved, inference OPEN | [mediaEmbeddingHandler.ts:171-179,302](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/mediaEmbeddingHandler.ts#L171-L179) still unconditional zeros; :309 onward dual-writes BYTEA/optional vector. No ready learned vectors are generated by this embedding worker. |
| no usable embedding consumer | PARTIALLY CLOSED | [routes/recommendations.ts:959-1005](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/recommendations.ts#L959-L1005) actually calls nearestMediaEmbeddings. It is gated on pgvector column plus ready nonzero anchors, so current zero-only producer does not activate useful retrieval. VisualSearch remains histogram-based. |
| legacy import extraction placeholder | Remains source-only | Candidate pipeline unchanged: OCR/barcode/vision abstain; only structured field copying produces candidates. New model artifacts or registry rows do not invoke inference here. |
| moderation triage placeholder | OPEN capability gap | [moderationTriageHandler.ts:114,192](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/moderationTriageHandler.ts#L114) hardcoded human_review model still active. Distinguish this from real-provider image moderation. |
| vendor sync dormant | OPEN | Full source reference search still finds processVendorSyncJob only in definition/export (plus tests), enqueueVendorEvent only definition. No new scheduler/queue or production event producer. Handler/client implementations unchanged. |
| ML health overstates serving mode | OPEN | [ml-service/app/main.py:80](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/ml-service/app/main.py#L80) health reports trained_model for loaded shadow, while :96 onward user-facing champion always heuristic. Entire ML-service directory unchanged. |

No B1–B6 source defect is fully closed by this delta. This statement is about these exact prior findings, not every broader audit item.

### New concrete findings

#### N1 — P1 conditional upgrade blocker: pgvector SQL backfill overflows on negative embedding values

[db/migrations/326_media_embeddings_pgvector.sql:67-70](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/db/migrations/326_media_embeddings_pgvector.sql#L67-L70) computes:

```sql
v_u := get_byte(p_embedding, v_i * 4)
     + get_byte(p_embedding, v_i * 4 + 1) * 256
     + get_byte(p_embedding, v_i * 4 + 2) * 65536
     + get_byte(p_embedding, v_i * 4 + 3) * 16777216;
```

`get_byte` and these integer literals use int4 arithmetic. Assignment into bigint `v_u` happens after expression evaluation. A negative float32 has its sign bit in the most significant byte, so that byte is >=128 and its final product alone is >=2,147,483,648. For -1.0 bytes 00 00 80 BF, the final term is 191*16,777,216 = 3,204,448,256; PostgreSQL raises integer out of range. See [PostgreSQL integer ranges](https://www.postgresql.org/docs/current/datatype-numeric.html). The later sign adjustment at :71-73 is never reached.

The migration invokes this function for every intact 512-dimensional row at :105-111, regardless of placeholder/ready status. With pgvector available and existing signed vectors, the migration/backfill fails rather than upgrading. Current zero placeholders pass, hiding the defect. Severity is conditional on real vectors being present; this is not proof the current zero-only dataset fails migration.

Fix by promoting byte arithmetic to bigint before multiplication/addition. Required validation: execute the actual migration/function on PostgreSQL with positive, negative, signed-zero, subnormal and random finite float32 values and compare decoded values. Current tests only exercise JS Buffer codec and inspect SQL text. No PostgreSQL binary was available in this audit environment; finding is from exact SQL type/overflow semantics, not an executed DB migration.

#### N2 — P2: active ANN recommendations mix incompatible model lineages and dimensions

[routes/recommendations.ts:960-970](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/recommendations.ts#L960-L970) chooses anchor `me.embedding` without model_id, model_version, preprocessing_version or dimensions. DISTINCT ON selects a media binding with order only target_ref_id/sort_order, making multiple embedding versions for the same asset nondeterministic. At :975-978 it invokes nearestMediaEmbeddings with queryEmbedding and limit only, omitting filter.

[lib/mediaEmbeddings.ts:210-227](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/mediaEmbeddings.ts#L210-L227) makes lineage constraints optional. The ANN branch :229-242 therefore compares an anchor against all ready nonzero models/preprocessors in the same vector column. Different models' 512-dimensional spaces are not interchangeable. A ready non-512 anchor is also eligible at the anchor query, and fails dimension matching against vector(512); outer catch :1009-1011 drops the entire source.

Trigger: a real model is introduced, later version is deployed, or multiple lineages coexist as the schema allows. The new path is wired but currently dormant on zeros. Fix: carry full lineage/dimension from an explicitly selected serving model into anchor choice and neighbour filter; query exactly matching lineage; validate vector length/finite values. Test overlapping model versions, mixed dimensions and migration rollout, rather than only a single mocked vector.

#### N3 — P2, offline reproduced: new search fallback has no copy of successfully indexed documents

[lib/searchAdapter.ts:300-312](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/searchAdapter.ts#L300-L312) sends successful writes only to Meilisearch. The fallback receives writes only when there is no client or a request fails. Similarly :315-326 only removes fallback documents on remote failure. Search failure at :345-355 then returns this local index. There is no per-request outage warmup.

The startup warmer ([index.ts:38566-38589](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L38566-L38589)) only runs once and only based on an early retrievalInfo snapshot. If it warms while shared search succeeds, syncListingsToSearchIndex writes remotely again, not to fallback. Healthy shared serving therefore does not establish a fallback corpus. A later outage can return an empty list with ok/degraded instead of the existing listings; conversely stale fallback rows retained during recovery can reappear on a later outage because successful updates/removals do not mirror locally.

Offline reproduction executed at current HEAD using a fake request client, no external service:

```js
import { MeilisearchSearchAdapter } from './src/lib/searchAdapter.ts';
const a = new MeilisearchSearchAdapter({url:''});
a.client={index:()=>({
  addDocuments:async()=>({taskUid:1}),
  search:async()=>{throw new Error('simulated backend outage')}
})};
await a.index({id:'lst_probe',title:'Vintage jacket',description:'A jacket',price:20,
  status:'active',category:'clothing',brand:'probe',sizes:['M'],condition:'good',
  createdAt:new Date().toISOString()});
console.log(JSON.stringify({results:await a.search({query:'jacket'}),retrieval:a.retrievalInfo()}));
```

Observed: `results: []`, `backend: in_memory`, `degraded: true`. Production field visibility is an improvement, but a fallback merely returning an array is not functional continuity. Prefer a bounded SQL fallback with current visibility/status predicates, or maintain a coherent local replica and verify its readiness before serving it.

#### N4 — P2: ANN distance order is lost before source_rank is recorded

In [routes/recommendations.ts:973-979](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/recommendations.ts#L973-L979), ordered neighbour assets are collected. At :982-988, they are translated into listings using `SELECT DISTINCT target_ref_id ... WHERE media_asset_id = ANY(...)` with no ORDER BY or ordinality/distance projection. PostgreSQL does not preserve the input array's order. `similarIds` then follows arbitrary result order. The comment at :995-996 claims array_position preserves ANN rank, but :1000 only preserves this already-lost mapping order. `mergeSource` records :940 sourceRank=index, and impressions persist this as retrieval lineage.

Impact: item-to-item pool/source ordering and analytics lineage do not reflect similarity rank; final ranker may still reorder candidates, so this is not proof all final recommendations are randomly ordered. Carry asset distance/rank through mapping via WITH ORDINALITY or a values table; aggregate a listing's best distance and sort explicitly. Test shuffled database mapping results.

#### N5 — P2: ANN capability metadata checks column existence, not index use

[lib/mediaEmbeddings.ts:229-257](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/mediaEmbeddings.ts#L229-L257) emits method pgvector_ann/degraded false whenever embedding_vec exists. Migration 326 explicitly catches failures to create both HNSW and IVFFlat indexes (:114 onward) and retains exact-neighbour scanning as a valid outcome. Therefore a no-ANN-index deployment still advertises ANN. Even with an index installed, the planner can choose exact scan for a given query. Recommendations calls this source item_to_item_ann based only on column detection at :959.

This is a capability/operational observability defect, not incorrect cosine arithmetic. Report pgvector similarity retrieval separately from proven indexed approximate execution. At minimum probe index availability; evaluate EXPLAIN plans and filtered recall/latency on realistic corpus sizes before claiming ANN capacity.

### Additional design risks requiring targeted tests (not overstated as observed incidents)

- Blue/green catch-up is bounded to first 1000 changed rows ([searchSync.ts:537-575](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/searchSync.ts#L537-L575)) and runs after the swap (:777-779). Higher write volume leaves residual stale entries until next repair. This is explicitly logged, but should be an acceptance threshold rather than a blanket claim that swaps cannot lose updates.
- No distributed lock spans the admin /search/reindex path ([routes/search.ts:688-701](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/search.ts#L688-L701)) and scheduled worker reindex. Per-worker concurrency=1 does not serialize direct admin calls or multiple worker processes. Multiple staging builds can swap older snapshots after newer ones, while pruning is unaware of in-flight builds. A DB/Redis lease should protect full reindex orchestration; test concurrent admin/scheduled runs.
- Reindex settings helpers swallow configuration errors (`searchSync.ts:96 onward`, meilisearchConfig helpers). Verification checks document counts and optional embedder presence, not filterable/sortable/localization setting task outcomes. Search functionality can regress despite count equality. Require task completion and settings parity before swap.
- ANN exact BYTEA fallback validates payload length against row dimensions, but not candidate dimensions against query dimensions; dotProduct deliberately uses the shared prefix ([mediaEmbeddingUtils.ts:59-65](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/mediaEmbeddingUtils.ts#L59-L65)). It can yield meaningless cross-dimension similarities. Current recommendation path only activates with a vector column, so this concern is primarily the library's advertised fallback/future caller contract.
- Candidate listings SQL recomputes 30-day interactions and seller response CTEs separately for baseline, affinity, followed and trending requests (`recommendations.ts:339 onward,816,1021,1037,1052`), mostly sequentially. Validate query plans and p95 at scale; no timing regression is asserted from source alone.
- /search items/all still trusts index item status, and its database lookup checks blocked seller identity rather than active/reach state ([routes/search.ts:421-440,511-519](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/search.ts#L421-L440)). Coupled with stale fallback or post-swap drift this can surface unavailable/removed items. People/boards have stronger direct SQL deleted/visibility checks. Add a current safety projection filter at serving time before treating index consistency as sufficient moderation enforcement.

### Actual runtime wiring and progress credited

- Search routes remain actively registered at [index.ts:38683](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L38683); recommendation routes at :24110.
- New queue `search_indexing` exists in [lib/queues.ts:344,424](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/queues.ts#L344), worker handling :988-1001, explicit standalone wiring [workers/index.ts:173-174](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/index.ts#L173-L174).
- API starts hourly index scheduler at [index.ts:38537](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L38537); `startSearchIndexSyncScheduler` :10129-10149 enqueues hourly and 90 seconds after startup. Worker process receives jobs; queue file supports inline worker fallback handler import too. This is not a dormant handler.
- Reindex handler calls `reindexListingsBlueGreen` ([workers/handlers/searchIndexSyncHandler.ts:36](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/searchIndexSyncHandler.ts#L36)) and throws on !ok, enabling queue retry. Admin route calls the same implementation directly.
- Blue/green staging uses unique time-named index, population, settled/count validation, atomic swapIndexes and retained rollback snapshots ([searchSync.ts:686-790](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/searchSync.ts#L686-L790)). This is materially better than only documenting blue/green deployment, while still requiring the risks above to be addressed.
- Search degradation and backend identity appear in route metadata; readiness/deep-health include search status (`routes/health.ts:78 onward,225 onward`). A degraded search does not fail overall readiness by design. It is therefore not a gate that ensures search can return actual inventory.
- Production config now requires shared search URL or explicit process-local opt-in (`productionReadiness.ts:332 onward`, `searchAdapter.ts:487 onward`). URL presence does not solve missing credential forwarding.
- Scoped people and boards use real parameterized SQL: [routes/search.ts:120-164,173-210](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/search.ts#L120-L164); public board visibility, creator deleted/erased state, people search visibility and bidirectional block exclusion. All-scope reciprocal-rank fusion is deterministic and type-tagged. Its item leg still depends on the configured item backend.
- Recommendations gather 500 recent, up to 100 affinity, 150 followed, 150 trending plus conditional embedding neighbours, merge before user exclusions and bound total to 800 ([recommendations.ts:816,922-1085](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/recommendations.ts#L816)). Positive anchor actions exclude explicit negative actions. This expands retrieval beyond pure recency; it does not make the downstream heuristic trained.
- New auth event graph records device/IP hash links on email signup/password login (`routes/auth.ts:562-628,784 onward,1042 onward`), and remains best-effort so graph failures do not block login. This is surveillance instrumentation; no evidence of a learned fraud classifier following automatically.

### Current ML/model-registry capability truth

| Capability | Current source reality | Required next evidence |
|---|---|---|
| Model registry | Existing artifact metadata/status routes; moderation registry and ML loader unchanged in this delta | Demonstrate promoted artifact loaded by concrete serving caller, checksum/version match, rollback and health reflecting champion |
| Recommendations | Multi-source SQL plus conditional vector candidates, deterministic champion, optional shadow LightGBM | Real temporal held-out NDCG/Recall, user/item cold start, online/controlled comparison, fairness/diversity/latency |
| Embedding pipeline | Zero 512-vectors, placeholder state; optional pgvector dual-write/backfill | Real image encoder, nonzero finite ready vectors, lineage-scoped retrieval and realistic Recall@K |
| Visual search | Color histogram/similarity, no learned image model | Semantic retrieval evaluation before marketing it as learned visual understanding |
| Fraud | Rule-based champion plus optional shadow; more entity links | Labeled temporal PR-AUC/precision/recall at review capacity, calibration and false-positive monitoring |
| Import extraction | Copies structured source fields, OCR/barcode/VLM abstain | Actual providers plus per-field accuracy, abstention coverage, confidence calibration and high-risk rejection tests |
| Moderation | Provider paths exist, Rekognition broken as above, triage placeholder | Real serialization/provider integration and fail-closed/review persistence tests |
| Price forecast/classification | Deterministic mean-trend forecast; classify-image returns 501 | Forecast interval calibration / genuine classifier if required |
| Vendor support delivery | HTTP adapter exists but producer/scheduler wiring absent | End-to-end queued message->provider ID->webhook roundtrip, idempotency, leased delivery recovery |

The comment at mediaEmbeddings.ts:21 claiming no route consumes it is stale: recommendation route now does. Conversely a vector column or registry artifact alone is not evidence of inference being implemented.

### Verification performed and limits

Executed only this focused command at current HEAD:

```sh
node --import tsx --test src/__tests__/mediaEmbeddingPgvector.test.ts src/__tests__/retrievalSourceContract.test.ts src/__tests__/searchAdapterDegradation.test.ts
```

Result: **31 tests passed, 0 failed**, six suites, about one second. This validates pure JS codec roundtrips, fake-DB query contracts, static migration/retrieval wiring expectations and basic degradation behavior. It does NOT execute migration 326 on PostgreSQL, run Meilisearch integration/blue-green task semantics, load a trained model, assess actual relevance, or exercise provider moderation. RetrievalSourceContract is source-text checking; the migration contract checks are likewise static. The fallback test merely accepts an array from unreachable backend, so it does not catch N3.

The new N3 injected-client probe ran separately and returned an empty fallback after successful remote indexing. No provider request, live data, full suite, application edits, or external deployment occurred. `git status --short` remained clean after the audit commands. Existing baseline's offline Rekognition serializer evidence remains applicable because that source and provider behavior are unchanged.

### Recommended next upgrades, in order

1. Close baseline security and moderation blockers in their actual ingress/caller paths: valid Rekognition payload, durable moderation hold on failed/review, pinned importer connection and whole-request body deadline, non-default ML admin secret/unpublished port, unified search credential config.
2. Fix SQL float decoder and test real pgvector upgrade/rollback with signed vectors; enforce model lineage/dimension in neighbour queries and preserve distance order through asset/listing mapping.
3. Make degraded search functionally useful and safety-current; reproduce healthy->outage->recovery->delete->outage with inventory assertions across replicas. Align health with capability to serve rather than existence of an array return.
4. Serialize blue/green orchestration globally; verify completed settings/tasks and paginated catch-up before accepting the rollout. Test high churn, concurrent jobs, failures and rollback.
5. Load an actual image model and benchmark its retrieval with declared model versions; keep truthful placeholders and zero vectors excluded until then. Model registry lifecycle should drive a serving implementation, not just metadata.
6. Use real labeled/time-split recommendation/fraud/extraction evaluations with published baselines and latency/error budgets; retain shadow deployment until measurable lift and guardrails are established.
7. Wire vendor events/draining and recover stale delivering leases before calling it a working vendor integration. Measure queue backlog age and dead-letter recovery with actual sandbox provider roundtrips.

### Coordinated audit additions: spend controls and evaluation claims

The full audit additionally inspected the current source for these issues:

- **AI daily budget is a soft recorded-spend threshold, not a hard reservation budget.** [lib/aiUsage.ts:43-76](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/aiUsage.ts#L43-L76) checks the Redis accumulated spend, then increments request-count quotas without reserving worst-case/estimated money for the admitted request. Concurrent requests below the limit can all proceed and overshoot. Actual succeeded spend is added after the DB ledger write at :205-214; Redis write failures are ignored. A Redis reset therefore loses the enforcement counter unless separately reconciled, and a telemetry read is not evidence the quota counter is rebuilt. Describe it honestly as a soft cutoff or implement atomic monetary reservation/reconciliation across call admission/completion/failure and test concurrent admission plus Redis loss.
- **Cost telemetry has conflicting units.** [lib/costTelemetry.ts:174-176](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/costTelemetry.ts#L174-L176) sets costUsd by dividing micro-USD by 1,000,000, but sets costMinor to raw micro-USD with currency USD; other domains use currency minor units (e.g. GBP pence). A generic consumer interpreting USD minor units as cents misreads the number by 10,000x. Keep costMicros separate or consistently convert costMinor to cents and document rounding; costUsd is already correctly scaled.
- **Evaluation loader success is not model/agent quality validation.** The full audit ran 16 evaluation cases successfully. `support/evalSuite.ts:455 onward` resolves routing and compares routing flags/allowed-tool subsets; it does not execute generated answers or tools, validate real citations, or exercise tenant isolation. This is useful routing regression coverage, not proof of agent answer quality, safe tool execution, model calibration or cross-tenant authorization. The focused 31-test result above is separate from the 16-case routing run.


## Appendix D. Infrastructure and release findings


HEAD: `76c0733f8fca7424ad5bfb51c81d2a71a36e866f`; compared with `fdd63b8`. Working tree clean on entry. Read-only source audit with lightweight syntax and image metadata checks; no infrastructure, provider, Docker, restore or chaos execution. Full-suite results appear in section 2. Paths below are repository-relative.

### Decision

No prior infrastructure/release blocker is closed. The actual Dockerfiles, both production compose definitions, release/signing definitions, scheduled backup workflow, backup shell script, and backup-expiry handler are unchanged between these heads (confirmed with targeted `git diff --name-only`). New operational helpers/docs and search/queue wiring represent partial implementation, not proof of deployability. The new restore helper itself has a deterministic default probe defect and inadequate destructive-target protection.

### Previous findings revalidated

| Finding | Current status and source evidence | Closure gate |
|---|---|---|
| Production worker final image cannot execute its command | OPEN. `backend/api/Dockerfile:17–23` omits dev dependencies and src; package `worker:start` still `tsx src/workers/index.ts` ([backend/api/package.json:30](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/package.json#L30); tsx dev dependency). Root override [docker-compose.prod.yml:271](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/docker-compose.prod.yml#L271), standalone [backend/docker-compose.production.yml:472](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/docker-compose.production.yml#L472) execute it. API workers off at root186/backend293; [backend/api/src/index.ts:38410–38425](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L38410-L38425) respects flag. | Compiled worker command, build/start final image in actual topology, meaningful queue completion and heartbeat evidence. |
| Backup sidecars cannot start/upload as configured | OPEN, unchanged. Root readonly mount324 + set-e329 + chmod332; backend readonly550 + chmod558. Missing bash package vs [backend/scripts/automated-backup.sh:1](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/scripts/automated-backup.sh#L1) shebang. Only internal db network (root372–395; backend604–630) despite apk/S3/webhook egress. Empty encryption/destination permitted and shell helper deletes output even without upload (44–47,140–147). | Immutable image/interpreter, no readonly chmod, explicit egress, required key/bucket, actual encrypted backup→S3→restore and freshness alarm. |
| Scheduled S3 backup expiry removes wrong key | OPEN, unchanged [.github/workflows/scheduled-db-backup.yml:133–141](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/.github/workflows/scheduled-db-backup.yml#L133-L141): lists prefix then removes bucket/basename without prefix; upload77 includes prefix. | Assert exact keys and aged-object removal in test bucket, verify versioning/PITR if used. |
| Backup erasure manifest records unsupported purge success | OPEN, unchanged [backend/api/src/workers/handlers/backupExpiryHandler.ts:79–88](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/workers/handlers/backupExpiryHandler.ts#L79-L88) sets purged after120 days without store inventory. Active worker/queue registration remains. | Evidence-based purge across configured storage; failures retained and alerted. |
| Standalone backend compose missing required internal token | OPEN. No API_INTERNAL_SERVICE_TOKEN/env_file in [backend/docker-compose.production.yml](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/docker-compose.production.yml); config requires it at [backend/api/src/config.ts:339](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/config.ts#L339) via production-throwing requiredSecret69–79. Root definitions do pass it: do not conflate standalone with root override. | Startup of both standalone services with all production validation satisfied. |
| Nonproduction Release Train skipped by dependency graph | OPEN, unchanged [.github/workflows/release-train.yml:84–100,127–130](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/.github/workflows/release-train.yml#L84-L100): skipped approval dependency and no status predicate enabling nonproduction build. | Demonstrate staging/development executions plus approval/failure/cancellation paths. |
| OTA signing gate only tests presence; signing input missing | OPEN, unchanged release gate30–46, app.config211–231/343–350, release-train180–209: env Boolean/certificate present check, no private-key file/argument. Other OTA publishers bypass gate. No evidence private key leaked; signed binary may reject payload rather than accept unsigned update. | Actual cryptographic signing, key/cert matching, all publisher paths consolidated, native acceptance/rejection evidence. |
| Conflicting release pipelines/channel mapping | OPEN. Release train staging maps preview profile but publishes staging; eas.json61–69 subscribes preview. Tag publishes via two workflows with distinct concurrency groups. No CI-gate dependency added to release workflow. External environment protection/channel aliases unknown. | One authoritative release lock/promotion path and proof of CI/approval/channel enforcement. |
| Operational monitoring evidence absent | OPEN/partial. Existing health workflow still skips when secret absent (29–32), webhook absent61–63. New search health reports degraded but HTTP status can stay healthy. No live dashboard/on-call/fault/restore proof. | Exercise alerts against worker stalls, service failure and stale backups; check actual deployed monitoring. |

### New restore helper: partial tooling, two concrete defects

[backend/api/package.json:16](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/package.json#L16) now exposes restore:verify; new [backend/api/scripts/postgres-restore-verify.mjs](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/scripts/postgres-restore-verify.mjs) decrypts, calls pg_restore and probes table counts. No workflow invokes it (`rg` across workflows and operational references); no produced restore report reviewed. Both restore helper and chaos harness passed `node --check` (syntax only).

1. **Default restore verification fails against actual schema (P1).** Defaults lines38–41 use `coOwn_assets/holdings/orders/trades`. Table migrations use unquoted identifiers ([003_market_commerce.sql:73,95](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/db/migrations/003_market_commerce.sql#L73); [026_coown_schema_backfill.sql:4,51,122,139](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/db/migrations/026_coown_schema_backfill.sql#L4); [007_money_layer_hardening.sql:233,250](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/db/migrations/007_money_layer_hardening.sql#L233)), so PostgreSQL stores lowercase names. Probe at119 uses `to_regclass('public.coOwn_assets')`, which resolves lowercase, but count at126 double-quotes the original `"coOwn_assets"`, which cannot resolve that table. This follows [PostgreSQL identifier folding](https://www.postgresql.org/docs/current/sql-syntax-lexical.html). A successfully restored database is therefore reported failed on default probe. Use canonical lowercase/schema-qualified identifiers or resolved regclass identifiers and execute against a fresh restored full schema.

2. **Scratch-only safety is not established (P1 operational tooling).** `assertScratchTarget`136–151 compares raw strings with optional DATABASE_URL and searches the entire connection URL for scratch/restore/drill/staging/test. A production URL can pass because username/password/hostname includes `test`; equivalently targeted URLs with different query strings or aliases bypass string equality. RESTORE_DROP_EXISTING=true sends destructive --clean --if-exists at105–107. This helper is manual, not automatically invoked; exposure requires an operator to use an unsafe target, but the advertised guard does not prevent it. Parse database identity, prohibit source identity after normalization and require explicit disposable target identity/credentials with restricted access; test rejects with marker only in credentials/host and equivalent URLs. Do not run it before hardening and selecting a reviewed disposable DB.

Additional limits: missing checksum sidecar explicitly tolerated76–77; row count may be zero and still passes128/211; empty RESTORE_VERIFY_TABLES after filtering can skip all probes206–213; report measures restore duration216–218 but does not establish backup-age RPO or end-to-end outage RTO. These must be bounded before calling the helper production recovery evidence.

### New migration risk: pgvector path unproven, potential integer overflow

[326_media_embeddings_pgvector.sql:67–70](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/db/migrations/326_media_embeddings_pgvector.sql#L67-L70) reconstructs bytes with `get_byte(...) * 16777216` and only then assigns to bigint v_u. Operands are PostgreSQL integer expressions; high byte>=128 (normal negative float32 values) makes that intermediate exceed signed int32. A declared bigint destination does not promote earlier int operations. This can abort backfill and startup migration on installed-pgvector databases containing negative embedding components. Independently checked in the backend/search review. No DB reproduction performed here. Fix by promoting each byte/arithmetic to bigint before multiply; test actual SQL with positive/negative normals, zero, subnormals and corruption, plus full upgrade with populated embeddings. CI postgres:16-alpine does not inherently exercise optional vector path; migration143–147 intentionally no-ops without extension and records applied. Later installing extension requires explicit upgrade/reapply procedure, since ordinary migration runner skips applied files. Do not infer ANN path works from BYTEA fallback tests.

### New operational/CI work that deserves partial credit

- Push worker now consumes actual limiter ([backend/api/src/lib/queues.ts:558–562](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/queues.ts#L558-L562)); queue registry names corrected in queuePriorities25–59.
- Search indexing queue/worker is now real ([queues.ts:986–1047](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/queues.ts#L986-L1047)) and standalone handler wired. API scheduler starts outside inline-worker flag ([index.ts:38528–38537](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts#L38528-L38537)), correctly enqueuing in standalone deployment. This remains blocked by final image worker-start bug. Queue concurrency1 is per process, not global; comment claiming global serialization is stronger than code when multiple workers deployed. Hourly job ID with removeOnComplete:true also does not permanently deduplicate the whole hour. Validate overlap if multi-replica topology.
- Search production configuration defaults fail closed if no MEILISEARCH_URL; explicit SEARCH_ALLOW_IN_MEMORY bypass logs warning ([productionReadiness.ts:337–347](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/lib/productionReadiness.ts#L337-L347)). Health/deep includes degraded identity ([routes/health.ts:81–101,228–248](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/health.ts#L81-L101)), and uptime monitor no longer reports absent Meili healthy in production. Presence and diagnostic truth improved; outage can still yield HTTP200/degraded, so HTTP-only monitor does not establish degradation alerting.
- CI Gates adds blocking support seed eval ([.github/workflows/ci-gates.yml:304–323](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/.github/workflows/ci-gates.yml#L304-L323); runner [scripts/run-eval-suite.ts:47–85](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/scripts/run-eval-suite.ts#L47-L85) exits on cases/hard-gates). Scope is deterministic routing seed cases, not live LLM, provider, persisted ownership or delivery guarantees. Execution results appear in section 2.
- Surface-density added as explicitly report-only, continue-on-error ([ci-gates.yml:171–192](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/.github/workflows/ci-gates.yml#L171-L192)). It is not a release-blocking quality gate. Release publishers still do not depend on overall CI workflow.
- Capacity/metric/chaos docs and harness are newly authored operational scaffolding, not measured deployment evidence.

### Chaos helper's green status does not prove full drill

[backend/api/scripts/chaos-smoke.mjs:3–7](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/scripts/chaos-smoke.mjs#L3-L7) intentionally prints fault/restore commands; never injects the fault. Credential-required checks skip at85–93. Scenario returns PASS if no failed checks at591, irrespective of skipped checks, and overall ok uses that at698–711. Probe mode always exits0 at681 by design. Thus report can contain PASS/ok:true while authenticated checks remain unverified. It is a useful manual diagnostic but any launch gate must require zero skips, authenticated observations, externally captured fault/recovery timestamps and post-restore checks. No chaos executed in this audit.

### Golden screenshots and executed lightweight checks

All twelve top-level `frontend/src/__tests__/__screenshots__/golden-*-baseline.png` files remain unchanged, 70 bytes, PNG dimensions1×1, identical SHA256 prefix `6b7fa434f92a8b80` (Python stdlib metadata inspection). These are not approved device captures. Actual visual gate has minimum1000 bytes at [frontend/scripts/check-visual-release-gates.mjs:584–603](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/scripts/check-visual-release-gates.mjs#L584-L603); baseline presence alone is insufficient.

Executed `node frontend/scripts/check-visual-release-gates.mjs` at HEAD: **exit1**, scanned2234 files, **50 P0, 36 P1, 130 warnings**. This is the script's heuristic severity classification, not fifty independently audited production incidents. The command result is also recorded in section 2. No app screenshots/emulator captures were produced. Source gate failure is real and new docs do not resolve it. Next gate: capture and review required native routes/themes/device/font matrix, replace placeholders, then rerun source + actual visual comparison. README expects expected/actual/diff subdirectories ([__screenshots__/README.md:6–10](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/__tests__/__screenshots__/README.md#L6-L10)) while release presence checker reads top-level entries557–559; align capture/approval and gate conventions before claiming visual regression coverage.

### Ordered next production gates

1. Repair final API/worker image commands and env wiring; execute real final production topology and core queue jobs.
2. Repair both backup paths and S3 expiry; harden restore helper and run downloaded encrypted artifact restore into disposable database with identity/integrity/financial invariant checks.
3. Upgrade populated PostgreSQL with actual extensions, exercise rollback plan and pgvector backfill.
4. Consolidate release/signing/channel flow and prove native signed OTA update/rollback, CI gating and approval behavior.
5. Replace screenshot placeholders; pass strict source gates and device visual comparisons.
6. Execute authenticated failure/recovery drills with zero skipped mandatory checks; retain evidence of alerts, restoration, measured capacity and service-level objectives.


## Appendix E. Current screen register: 175 top-level screens

This register is freshly enumerated at the reviewed commit. “Changed” means the file changed since the baseline, not that its full dependency chain changed or was validated. Requirements are carried forward and extended from the previous review; these rows do **not** claim every behavior is missing or every screen was executed. Nested sheets and creator surfaces outside this directory also need the shared state contract.

| Screen | File changed | Product refinement / verification focus | Required behavior evidence |
|---|---|---|---|
| [AIAgentIntegrationScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AIAgentIntegrationScreen.tsx) | No | Scope connection permissions and show last successful execution, not merely connected | Revoke a connector during an execution; block further writes and preserve the execution record |
| [AIPhotoEnhancementScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AIPhotoEnhancementScreen.tsx) | No | Keep original and enhanced evidence distinct; never conceal condition flaws | Cancel enhancement and compare original; failed processing cannot replace the original |
| [AIPoweredListingScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AIPoweredListingScreen.tsx) | No | Show source/confidence for suggested fields and require seller confirmation | Incorrect brand/condition suggestions are editable and never publish automatically |
| [AIPreferencesScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AIPreferencesScreen.tsx) | No | Separate personalization consent from assistance preferences | Opt-out persists, is honored by serving paths and survives account/device changes |
| [AboutScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AboutScreen.tsx) | Yes | Show real operator identity, app version and working policy/support destinations | Links work in a release build; no development endpoints or fabricated company claims |
| [AccessibilitySettingsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AccessibilitySettingsScreen.tsx) | No | Honor system accessibility alongside app preferences | Change text/reduced-motion preferences and revisit forms, charts, sheets and camera |
| [AccountControlScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AccountControlScreen.tsx) | No | Explain reversible suspension versus deletion and outstanding obligations | Pending purchases, disputes and balances have defined handling without losing recourse |
| [AccountSecurityRecoveryScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AccountSecurityRecoveryScreen.tsx) | No | Provide recovery paths independent of the lost factor | Lost device recovery cannot bypass stronger identity checks or strand the legitimate owner |
| [AccountSecurityScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AccountSecurityScreen.tsx) | No | Present actual factors and sessions, with clear scope of changes | Reauthentication required for sensitive changes; revocation updates all active sessions |
| [AccountSettingsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AccountSettingsScreen.tsx) | No | Group identity/account controls without repeated hierarchy | Changed email/phone follows verification; unsaved work and backend rejection remain visible |
| [ActiveSessionsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ActiveSessionsScreen.tsx) | No | Show factual device/session metadata and current-session distinction | Revoke another session and verify its next request fails; protect against stale lists |
| [AddBankAccountScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AddBankAccountScreen.tsx) | No | Collect only required data and reveal provider/verification state | Invalid, pending and rejected accounts cannot become eligible payout destinations |
| [AddressFormScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AddressFormScreen.tsx) | No | Use locale-aware address requirements with keyboard-safe save | Long addresses, unsupported regions, validation errors and network retry preserve entered fields |
| [AgeVerificationScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AgeVerificationScreen.tsx) | No | Apply the approved age policy without treating a checkbox as strong proof | Underage/unknown/rejected state restricts the correct features on server and client |
| [AgentLedgerScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AgentLedgerScreen.tsx) | No | Distinguish suggested, approved, executed, failed and compensated actions | Each record links to the actual command/result; retries do not invent extra executions |
| [AppealScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AppealScreen.tsx) | No | Show the contested decision, allowed evidence and next step | Submission retry produces one appeal with a persistent reference and status |
| [ArchivedConversationsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ArchivedConversationsScreen.tsx) | No | Preserve deliberate archive semantics and unread behavior | Unarchive/reconnect does not duplicate threads or expose blocked content |
| [AssetDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AssetDetailScreen.tsx) | Yes | Separate rights, price, appraisal, liquidity and custody evidence | Stale quote, halted asset and unavailable evidence are distinct; no implied guaranteed liquidity |
| [AssetDueDiligenceScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AssetDueDiligenceScreen.tsx) | No | Version documents and identify who supplied/verified each claim | Missing, revoked or updated evidence invalidates dependent trust presentation |
| [AssetLeaderboardScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AssetLeaderboardScreen.tsx) | No | Define ranking basis, period and minimum evidence | Tiny or manipulated trades cannot appear as reliable performance leadership |
| [AuctionDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AuctionDetailScreen.tsx) | No | Use server auction state and payment proof; item remains dominant | Bid race, extension, reserve failure and win payment all converge correctly |
| [AuctionHomeScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AuctionHomeScreen.tsx) | No | Separate live/upcoming/ended states and factual time | Refresh/reconnect does not turn ended auctions into actionable live cards |
| [AuthLandingScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/AuthLandingScreen.tsx) | Yes | One clear identity proposition and accessible auth choices | Provider unavailable and deep-link auth return remain recoverable |
| [BalanceHistoryScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BalanceHistoryScreen.tsx) | No | Show authoritative balance changes with currency and time basis | Reconcile opening balance plus movements to closing balance, including reversals |
| [BiometricLoginScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BiometricLoginScreen.tsx) | No | Use biometric capability as convenience around secure credentials | Enrollment change, fallback, cancellation and lockout do not bypass authentication |
| [BlockedUsersScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BlockedUsersScreen.tsx) | No | Show and enforce the real block scope | Blocked parties cannot use direct API/subscriptions to evade restrictions |
| [BotBuilderScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BotBuilderScreen.tsx) | No | Expose capabilities, limits and consequential-action approval | Draft bot cannot execute; conflicting permissions fail before any action |
| [BotDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BotDetailScreen.tsx) | No | Show actual runtime health, grants and execution outcomes | Unhealthy connector never produces a Ready status or silent skipped action |
| [BotDirectoryScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BotDirectoryScreen.tsx) | No | Distinguish templates from active installed automation | Install confirms permissions; unavailable integrations are clearly disabled |
| [BrowseScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BrowseScreen.tsx) | No | Avoid parallel discovery behavior drifting from canonical search | Category/price state and detail back navigation match supported backend contracts |
| [BulkListingScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BulkListingScreen.tsx) | Yes | Prioritize row-level validity and publish eligibility over summary counts | Mixed-validity batch publishes only authorized valid rows with individual outcomes |
| [BundleBagScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BundleBagScreen.tsx) | No | Keep seller, item availability and combined shipping explicit | One item sold/changed price forces a clear recomputed quote and user decision |
| [BuyerProtectionScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BuyerProtectionScreen.tsx) | No | Explain actual coverage and exclusions linked to the order | Ineligible transaction cannot inherit a universal protection badge |
| [BuyoutScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/BuyoutScreen.tsx) | No | Make consideration, rights transfer and irrevocability explicit | Expired/double acceptance or changed holdings cannot produce duplicate ownership transfer |
| [CatalogImportConsentScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CatalogImportConsentScreen.tsx) | No | State source access and publication scope before ingestion | Withdrawal/revocation prevents new imports while preserving required audit records |
| [CatalogImportItemScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CatalogImportItemScreen.tsx) | No | Show source evidence and editable extracted fields | Missing price/media/condition stays unresolved; unsupported extraction is not fabricated |
| [CatalogImportProgressScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CatalogImportProgressScreen.tsx) | No | Show durable job state and recoverable partial progress | App restart/cancel/retry resumes or terminates the correct import without duplication |
| [CatalogImportReviewScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CatalogImportReviewScreen.tsx) | No | Separate valid, invalid, duplicate and permission-blocked rows | Bulk approve cannot bypass individual validation and source ownership |
| [CatalogImportStartScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CatalogImportStartScreen.tsx) | No | Identify source, connection and expected input formats | Expired credentials and malicious URLs fail safely before publication |
| [CatalogImportSummaryScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CatalogImportSummaryScreen.tsx) | No | Reconcile requested/imported/failed/published counts | Every count opens matching rows; incomplete work is not labeled complete |
| [CategoryDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CategoryDetailScreen.tsx) | No | Use real category schema and inventory | Facet counts and results remain consistent after filter changes and pagination |
| [CategoryTreeScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CategoryTreeScreen.tsx) | No | Provide clear hierarchy without endless nested decorative chips | Selection returns correct taxonomy ID; missing child/renamed categories handled |
| [ChangePasswordScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ChangePasswordScreen.tsx) | No | Protect password changes and session invalidation rules | Wrong current credential, reused reset token and interrupted request remain safe |
| [ChatMediaPreviewScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ChatMediaPreviewScreen.tsx) | No | Distinguish local draft from uploaded/sent attachment | Cancel, permission denial, failed upload and expired media have clear states |
| [ChatScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ChatScreen.tsx) | No | Keep conversation and transaction context coherent | Message retry is deduplicated; offer/payment card changes reflect canonical order state |
| [ChatSettingsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ChatSettingsScreen.tsx) | No | Expose settings according to their actual scope | Mute/privacy changes persist; failed updates visibly roll back |
| [CheckoutScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CheckoutScreen.tsx) | No | One exact financial commitment and truthful tender action | Unsupported platform-pay devices see no misleading button; timeout reconciles one outcome |
| [ClosetScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ClosetScreen.tsx) | No | Maintain useful catalog density and stable list state | Large inventory pages without duplicates; sold/removed items update consistently |
| [CoOwnIssueScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CoOwnIssueScreen.tsx) | No | Explain issued interests, retained ownership and required evidence | Cannot issue beyond authorized supply or before mandatory rights/custody checks |
| [CoOwnPriceAlertsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CoOwnPriceAlertsScreen.tsx) | No | Specify trigger basis and delay/freshness limits | Duplicate ticks do not spam; stale appraisals cannot trigger market-price alerts |
| [CollectionDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CollectionDetailScreen.tsx) | Yes | Show cover, privacy, owner and meaningful item ordering | Deleted/private source and optimistic removal recover without exposing data |
| [ConnectedAccountsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ConnectedAccountsScreen.tsx) | No | Show actual grants and health, with revocation | Revoked account token cannot continue import/publish via queued work |
| [ConnectionListScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ConnectionListScreen.tsx) | No | Use real follow/membership data and privacy | Pagination and block/unfollow update counts and visibility consistently |
| [ConversationInfoScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ConversationInfoScreen.tsx) | No | Summarize participants and commerce context without duplicated controls | Membership/private media reflect latest authorization after changes |
| [ConversationalSearchScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ConversationalSearchScreen.tsx) | No | Keep catalog grounding and capability truth visible | Unavailable stock or price is not invented; fallback results retain query constraints |
| [CorporateActionDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CorporateActionDetailScreen.tsx) | No | Show event terms, record date, eligible interests and consequence | Terms changes are versioned; unsupported or closed actions cannot be submitted |
| [CorporateActionVoteScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CorporateActionVoteScreen.tsx) | No | Make vote weight and finality explicit | Duplicate vote, transfer around snapshot and post-close vote obey one defined policy |
| [CreateAuctionScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CreateAuctionScreen.tsx) | Yes | Preview reserve, increments, timing, fees and seller obligation | Invalid timing/currency/eligibility fails server-side; draft retained on error |
| [CreateCameraScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CreateCameraScreen.tsx) | No | Camera is the object; controls remain safe-area accessible | Camera/mic denied, interruption, orientation and background return recover correctly |
| [CreateCollectionScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CreateCollectionScreen.tsx) | No | Make public/private choice obvious without ornamental setup | Name conflict/offline create can retry once without duplicate collection |
| [CreateGroupChatScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CreateGroupChatScreen.tsx) | No | Confirm actual participants and permissions | Invalid/blocked/ineligible invitee gets per-person result, not false all-added success |
| [CreatePosterHighlightScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CreatePosterHighlightScreen.tsx) | No | Show selected source material and persistence meaning | Deleted/private/expired source cannot silently leak through highlight |
| [CreateSyndicateScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CreateSyndicateScreen.tsx) | Yes | Define membership, roles, rights and financial authority | Creator cannot mint unsupported powers or act for members without authorization |
| [CreatorAnalyticsDashboardScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CreatorAnalyticsDashboardScreen.tsx) | No | Distinguish reach, views, sales and attributed conversions | Time range, dedupe and unavailable data do not produce invented metrics |
| [CustomBotsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/CustomBotsScreen.tsx) | No | Separate inactive drafts and enabled automations | Toggle failure rolls back; disabled bots cannot continue newly queued consequential work |
| [DataExportScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/DataExportScreen.tsx) | No | Show requested/processing/ready/expired states | Export scoped to identity, download authorization expires, includes relevant actual data |
| [DataPrivacyScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/DataPrivacyScreen.tsx) | Yes | Explain actionable controls and retention exceptions | Changes propagate to actual data paths rather than only local preference storage |
| [DeleteAccountScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/DeleteAccountScreen.tsx) | No | Make outstanding obligations and irreversible effect clear | Reauthentication, interruption, cancellation policy and downstream purge proof work |
| [DistributionHistoryScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/DistributionHistoryScreen.tsx) | No | Separate declared, funded, paid, failed and reinvested cash | Ledger, wallet and beneficiary records reconcile; missing issuer cannot mean settled |
| [EditCollectionScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/EditCollectionScreen.tsx) | No | Keep identity/privacy/order changes coherent | Concurrent updates and failed save preserve work without exposing private contents |
| [EditGroupScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/EditGroupScreen.tsx) | No | Restrict each editable field by current role | Role removal during edit prevents unauthorized save and explains changed permission |
| [EditListingScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/EditListingScreen.tsx) | No | Preserve revision and order/offer constraints | Sold/reserved listings cannot be mutated into conflicting purchase terms |
| [EditProfileScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/EditProfileScreen.tsx) | No | Single photo/name/bio flow with deliberate save semantics | Handle taken username, long bio, failed avatar upload and unsaved exit |
| [EmailNotificationsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/EmailNotificationsScreen.tsx) | No | Show per-category choices and actual channel eligibility | Preference update failure rolls back; transactional email exceptions explained |
| [ExploreCollectionScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ExploreCollectionScreen.tsx) | No | Lead with coherent curated objects and their source | Collection availability and item eligibility refreshed before purchase |
| [FilterScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/FilterScreen.tsx) | No | One staged selection model and Apply/reset behavior | Dismiss leaves live query unchanged; supported facets serialize exactly |
| [ForgotPasswordScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ForgotPasswordScreen.tsx) | No | Clear non-enumerating recovery acknowledgement | Rate limits, delivery failure policy and retry avoid account leakage |
| [GalleriaCollectionDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/GalleriaCollectionDetailScreen.tsx) | No | Differentiate editorial/cultural content from purchasable inventory | Each object destination and availability truthful; no fixture results in production |
| [GalleriaScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/GalleriaScreen.tsx) | No | Media-led browsing with meaningful category/source identity | Real data empty/error states; no demo collections posing as active inventory |
| [GlobalSearchScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/GlobalSearchScreen.tsx) | No | Make cross-domain scope understandable | Users, listings and collections have distinct results and stable navigation targets |
| [GroupBotManagementScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/GroupBotManagementScreen.tsx) | No | State bot permissions within this group | Removed bot/member cannot read or act; queued actions recheck scope |
| [GroupChatInfoScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/GroupChatInfoScreen.tsx) | No | Show members, media and group controls by role | Changes reflected across views; private media not retained after unauthorized access |
| [GroupChatScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/GroupChatScreen.tsx) | No | Support durable, ordered conversation with clear membership | Reconnect, member removal, media failure and repeated send maintain correct history |
| [GroupMembersScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/GroupMembersScreen.tsx) | No | Keep roles and invitations factual | Concurrent role changes use server authority; pagination does not conceal active admins |
| [GroupPermissionsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/GroupPermissionsScreen.tsx) | No | Explain what each grant permits without broad ambiguous toggles | Least-privilege enforcement on every corresponding backend action |
| [HelpSupportScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/HelpSupportScreen.tsx) | Yes | Route users to order/account-specific assistance | Search and escalation work; unavailable live support has honest alternatives |
| [HomeScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/HomeScreen.tsx) | Yes | One coherent first viewport anchored in people/items | No false empty on partial failure; scroll restoration and recommendation continuation |
| [InboxScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/InboxScreen.tsx) | No | Dense conversations with meaningful last-message and unread state | Request/archive/mute/reconnect handling; urgent transaction updates reachable |
| [InventoryManagementScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/InventoryManagementScreen.tsx) | No | Expose stock/lifecycle and bulk actions with exact counts | Partial bulk failure, reserved stock and concurrent sell event remain consistent |
| [InviteFriendsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/InviteFriendsScreen.tsx) | Yes | Explain real referral eligibility and status | Self/duplicate/fraudulent referral cannot earn unsupported reward; links resume correctly |
| [ItemDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ItemDetailScreen.tsx) | Yes | Lead with item, exact price/terms and seller evidence | Condition photos are actually tagged or labeled generically; sold/deleted states safe |
| [KYCVerificationScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/KYCVerificationScreen.tsx) | No | Explain required evidence and provider status | Sensitive data protected; pending/rejected/expired verification gates server capabilities |
| [ListingPreviewScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ListingPreviewScreen.tsx) | No | Represent the eventual public listing faithfully | Unuploaded media/unconfirmed fields cannot appear as published evidence |
| [ListingSuccessScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ListingSuccessScreen.tsx) | Yes | Success only after authoritative publication | Pending moderation is not success; links resolve to the correct published listing |
| [LiveShoppingHomeScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/LiveShoppingHomeScreen.tsx) | Yes | Preserve cached shows when refresh fails | Success then network failure retains content with retry/freshness, never blank body |
| [LiveStreamReplayScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/LiveStreamReplayScreen.tsx) | Yes | Keep recorded media dominant; distinguish unavailable, processing and playback failure | Guard session identity; refresh expired playback URL; test interruption, captions and unauthorized recordings |
| [LiveStreamSellerScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/LiveStreamSellerScreen.tsx) | No | Broadcast health and current lot own the interface | Camera loss, reconnect, lot timing and end-stream safely converge on server |
| [LiveStreamViewerScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/LiveStreamViewerScreen.tsx) | Yes | Video dominates; lot/bid controls remain precise | Stream lag cannot bid on wrong lot; background/rejoin shows authoritative state |
| [LoginScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/LoginScreen.tsx) | No | Fast autofill and clear recovery with bounded retries | Token refresh, provider cancellation and deep-link return preserve intended route |
| [LookDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/LookDetailScreen.tsx) | Yes | Preserve creator attribution and linked-item truth | Removed listing, media failure and private content handled without false availability |
| [MakeOfferScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MakeOfferScreen.tsx) | No | Amount, expiry and commitment clearly stated | Precision, limits, duplicate submission and listing-state races validated server-side |
| [ManageCollectionItemsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ManageCollectionItemsScreen.tsx) | No | Clear move/copy/remove semantics and selection count | Partial batch failure and undo preserve correct membership/order |
| [ManageListingScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ManageListingScreen.tsx) | Yes | Show only lifecycle-valid actions | Pause/delete/relist cannot race a purchase into inconsistent inventory |
| [ManageQuickRepliesScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ManageQuickRepliesScreen.tsx) | No | Keep templates distinct from sent messages | Edit/delete and insertion preserve text; no automatic send or wrong-recipient leakage |
| [MarketLedgerScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MarketLedgerScreen.tsx) | No | Show actual fills/events with units, fees, timestamps and provenance | No fabricated activity; corrections/reversals remain auditable |
| [MessageRequestsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MessageRequestsScreen.tsx) | No | Explain request and commerce context before acceptance | Decline/block stops unauthorized continuation; accepted thread does not duplicate |
| [ModelRegistryScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ModelRegistryScreen.tsx) | Yes | Make model status, serving version and permissions explicit in restricted admin UI | Promotion must change the intended serving path with audited evaluation and rollback; metadata alone is insufficient |
| [MoodboardEditorScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MoodboardEditorScreen.tsx) | Yes | Canvas first, cross-source provenance and durable edits | Upload/export/reorder interruption preserves document and honest sync state |
| [MoodboardHomeScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MoodboardHomeScreen.tsx) | No | Lead with meaningful covers and recent work | Local-only drafts differ from synced/shared boards; account ownership respected |
| [MutedConversationsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MutedConversationsScreen.tsx) | No | Make mute duration/scope and unmute predictable | Push and in-app behavior align; mutation failures roll back |
| [MyBidsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MyBidsScreen.tsx) | No | Separate winning, outbid, won-unpaid and settled | Auction state changes and payment links converge without optimistic paid labels |
| [MyListingsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MyListingsScreen.tsx) | No | Stable seller inventory list with actionable lifecycle filters | Counts reconcile; pagination handles edits/sales without duplicate or missing items |
| [MyOrdersScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MyOrdersScreen.tsx) | No | Current task/status more prominent than decorative receipt cards | Pending, cancelled, returned, disputed and paid states have correct actions |
| [MyProfileScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/MyProfileScreen.tsx) | No | Identity then content; all apparent controls work | For-sale stat selects/scrolls listings; reorder does not mount entire large catalog |
| [NewMessageScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/NewMessageScreen.tsx) | No | Real recipient eligibility and conversation creation | Duplicate DM creation, block/privacy restrictions and network retry handled |
| [NotificationPreferencesScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/NotificationPreferencesScreen.tsx) | No | Distinguish in-app/push/email categories and required notices | Backend event taxonomy matches preferences; partial save visible |
| [NotificationsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/NotificationsScreen.tsx) | No | Actor, object, action and time readable at a glance | Expired targets, auth return, read rollback and pagination retry handled |
| [OffersScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/OffersScreen.tsx) | No | Show negotiation lineage and actionable expiry | Accepted offer price/quantity binds checkout; sold item resolves outstanding offers |
| [OnboardingScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/OnboardingScreen.tsx) | No | Ask only what improves immediate use; allow appropriate skipping | Saved progress and consent survive interruption without locking user out |
| [OrderDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/OrderDetailScreen.tsx) | No | Who acts next, item/money status and proof are clear | Payment/tracking/refund events arriving out of order converge |
| [OrderReceiptScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/OrderReceiptScreen.tsx) | Yes | Immutable purchase terms and financial identity | Receipt total/currency/fees reconcile with payment and refunds |
| [OrderSupportScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/OrderSupportScreen.tsx) | No | Keep evidence and case attached to correct order | Unauthorized order access rejected; repeated issue submission not duplicated |
| [OutfitBuilderScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/OutfitBuilderScreen.tsx) | No | Visual arrangement with real linked inventory | Deleted/sold items remain clearly identified; export respects media/source rights |
| [PaymentsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PaymentsScreen.tsx) | No | Show real methods and verification/capability state | Remove default method, expired card and provider error handled without false readiness |
| [PersonalisationScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PersonalisationScreen.tsx) | No | Give understandable preference controls and reset | Preference scope, persistence and actual ranking behavior match description |
| [PortfolioScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PortfolioScreen.tsx) | No | Separate holdings, sellable units and mark-to-market | Paused status consistent in row/sheet; signs and missing valuations truthful |
| [PostageScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PostageScreen.tsx) | No | Explain supported delivery options and cost basis | Unsupported address/carrier and quote expiry cannot silently select a wrong service |
| [PosterArchiveScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PosterArchiveScreen.tsx) | Yes | Clarify private archive versus deletion | Visibility and restore rules enforced; expired source media handled |
| [PosterHighlightViewerScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PosterHighlightViewerScreen.tsx) | No | Preserve content attribution and access rules | Removed highlight/source and mixed media navigation recover gracefully |
| [PosterStoryActivityScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PosterStoryActivityScreen.tsx) | No | Define viewer/engagement metrics and privacy | No fabricated identities/counts; current permissions limit access |
| [PosterViewerScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PosterViewerScreen.tsx) | Yes | Immersive playback with restrained controls | Pause/resume, reduced motion, text scaling and link targets remain usable |
| [PrivacySettingsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PrivacySettingsScreen.tsx) | Yes | Explain audience, discovery and messaging scope | Private mode affects APIs/search/media; optimistic toggles roll back on failure |
| [PulseFeedScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PulseFeedScreen.tsx) | No | Readable content rhythm tied to trader interests | Stable media lifecycle, moderation state and attribution; no infinite duplicate loop |
| [PushNotificationsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/PushNotificationsScreen.tsx) | No | Connect OS permission state to preference state | Denied permission gives actionable guidance; user choices honored by delivery |
| [ReportScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ReportScreen.tsx) | Yes | Show object and concrete reason/evidence choices | Duplicate submission safe; reporter privacy and case reference preserved |
| [ResetPasswordScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ResetPasswordScreen.tsx) | No | Clear expiry and completion without leaking credentials | Token single-use; old sessions handled per policy; keyboard-safe validation |
| [ResolutionCentreScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/ResolutionCentreScreen.tsx) | No | Unify active cases by deadline and next actor | Case counts and details reconcile; escalation works under partial service failure |
| [RestrictedAccountsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/RestrictedAccountsScreen.tsx) | No | Explain restriction scope and management | Restriction affects actual interaction paths; stale role/permission cannot evade it |
| [RuntimeSmokeTestScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/RuntimeSmokeTestScreen.tsx) | No | Keep diagnostics isolated from consumer navigation | Production bundle cannot expose privileged debug actions or fixture entry points |
| [SavedAddressesScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SavedAddressesScreen.tsx) | No | Show default and address purpose clearly | Delete/edit address used by existing order does not mutate historical shipment terms |
| [SavedSearchesScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SavedSearchesScreen.tsx) | No | Retain exact query/facets and alert controls | Schema changes, empty results and deduplicated notifications handled |
| [SearchScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SearchScreen.tsx) | Yes | Avoid diverging from unified query/filter contracts | Late query responses, history and detail/back navigation remain coherent |
| [SellScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SellScreen.tsx) | Yes | Media and seller task first; progressive complexity by format | Draft/upload/moderation/publish distinguish stages; no false success on partial work |
| [SellerAnalyticsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SellerAnalyticsScreen.tsx) | No | Use exact definitions and honest periods/comparisons | Refunds, timezone and missing data reconcile with source orders |
| [SellerAuctionCentreScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SellerAuctionCentreScreen.tsx) | No | Prioritize current obligations and unresolved auction outcomes | Won-unpaid, reserve failure and cancelled events get correct next actions |
| [SellerEarningsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SellerEarningsScreen.tsx) | No | Separate revenue, fees, pending liability and paid out | Wallet/provider/ledger reconciliation and date/currency basis are visible |
| [SellerFulfilmentScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SellerFulfilmentScreen.tsx) | No | One operational queue organized by deadline and action | Label failure, tracking update, partial shipment and cancellation remain recoverable |
| [SellerHubScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SellerHubScreen.tsx) | No | Actionable urgency before summary metrics | Each count opens its matching workload; failed module stays unavailable rather than zero |
| [SellerVerificationScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SellerVerificationScreen.tsx) | No | Show exactly what is verified and scope/expiry | Suspended/expired provider status removes unsupported badges and capabilities |
| [SettingsScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SettingsScreen.tsx) | Yes | Flat searchable grouping and account-bound freshness | Balance unavailable remains distinct from zero; returning from wallet refreshes data |
| [SharedConversationMediaScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SharedConversationMediaScreen.tsx) | No | Only authorized conversation media with durable provenance | Membership removal, deleted message and expired URL do not leak media |
| [SignUpScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SignUpScreen.tsx) | Yes | Minimal accessible form with correct verification/consent | Duplicate identity, age/region policy and interrupted verification handled |
| [SuccessScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SuccessScreen.tsx) | No | Use only for authoritative completed actions with meaningful next route | Pending or unknown outcome never funnels into generic success |
| [SupportCaseDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SupportCaseDetailScreen.tsx) | No | Evidence, deadline, owner and decision history dominate | Case permission, upload retry and appeal/escalation linkage correct |
| [SupportConversationScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SupportConversationScreen.tsx) | No | Durable case conversation with delivery clarity | Staff/user roles enforced; retry and attachments preserve evidence |
| [SupportTicketDetailScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SupportTicketDetailScreen.tsx) | No | Show actual service status and next step | Closed/reopened/merged tickets retain references and correct permissions |
| [SustainabilityPreferencesScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SustainabilityPreferencesScreen.tsx) | No | Separate user preference from verifiable environmental claims | No fabricated impact totals; preferences affect intended features only |
| [SyndicateHubScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SyndicateHubScreen.tsx) | No | Membership/rights and actionable events before performance decoration | Private syndicate data, stale membership and halted assets handled |
| [SyndicateOnboardingScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SyndicateOnboardingScreen.tsx) | No | Explain obligations and required eligibility | Cannot join with unaccepted current terms or missing mandatory checks |
| [SyndicateOrderHistoryScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/SyndicateOrderHistoryScreen.tsx) | No | Display actual orders/fills and whose authority executed them | Role changes do not erase audit; partial/cancelled orders reconcile holdings |
| [TradeConfirmScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/TradeConfirmScreen.tsx) | Yes | Exact units, side, fee, FX, expiry and final consequence | Expired/repriced quote requires reacceptance; duplicate confirm executes once |
| [TradeScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/TradeScreen.tsx) | No | Show executable liquidity and clear order terms | Reservations honored, unsupported quantities rejected, partial fill state recoverable |
| [TwoFactorSetupScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/TwoFactorSetupScreen.tsx) | No | Prove enrollment before enabling; protect recovery codes | Cancelled setup not marked enabled; codes single-use and stored appropriately |
| [UnifiedDiscoveryScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/UnifiedDiscoveryScreen.tsx) | Yes | Canonical search/feed entry with media-led hierarchy | Fixed-page recommendations labeled honestly; fallback pagination and module errors clear |
| [UserProfileScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/UserProfileScreen.tsx) | No | Public seller identity, evidence and inventory  | Suspended/private/blocked seller state controls actual follow/message/buy capabilities |
| [VerificationResponseScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/VerificationResponseScreen.tsx) | No | Match response to exact verification request/version | Wrong/expired evidence cannot satisfy another request |
| [VerificationScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/VerificationScreen.tsx) | No | Make verification purpose and required evidence explicit | Pending/failed/expired states do not confer verified status |
| [VerificationStatusScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/VerificationStatusScreen.tsx) | No | Show provider-backed result and next actionable step | Stale client success cannot override server revocation |
| [VisualSearchScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/VisualSearchScreen.tsx) | Yes | Crop/query context and capability truth are visible | Safe upload, real similarity or explicit fallback; no matches has useful recovery |
| [WalletConvertScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/WalletConvertScreen.tsx) | No | Authoritative rate, spread, fee and quote expiry | Non-unit FX and rounding reconcile; expired quote requires new consent |
| [WalletHistoryScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/WalletHistoryScreen.tsx) | No | Ledger events and pending/reversed status clearly separated | Pagination and filtering preserve exact totals; retries do not duplicate movements |
| [WalletScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/WalletScreen.tsx) | No | Spendable, held, withdrawable and total remain distinct | Privacy across overlays; reservation/segment reconciliation; unknown never fabricated zero |
| [WithdrawScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/WithdrawScreen.tsx) | No | Show eligible funds, destination, cost and expected process | Concurrent hold, provider rejection/return and duplicate requests do not lose funds |
| [WriteReviewScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/WriteReviewScreen.tsx) | No | Tie review eligibility to actual completed transaction | Photos safe/moderated; duplicate/superseded review and seller reply policy enforced |
| [YourAlgorithmScreen](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/frontend/src/screens/YourAlgorithmScreen.tsx) | No | Explain actual signals and user control simply | Hide/reset/preference actions measurably affect serving; no false instant-training claims |


## Appendix F. Current backend route-module register: 84 modules plus entry point

File inventory, not a deployed endpoint count. Source existence or a changed flag does not prove active registration, permission correctness or completion. Specific active paths are traced in the findings. A route module often serves multiple screens; validate the whole command or query boundary.

| Source module | File changed | Required proof |
|---|---|---|
| [backend/api/src/routes/accountSecurity.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/accountSecurity.ts) | No | Prove identity/object authorization, session revocation, recovery, privacy projections and cross-account isolation. |
| [backend/api/src/routes/adminAudit.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/adminAudit.ts) | No | Enforce staff roles, preserve case/evidence history, reason-code sensitive actions and demonstrate operator recovery. |
| [backend/api/src/routes/aiTruth.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/aiTruth.ts) | No | Identify actual baseline/model/provider selected, field provenance, safe ingestion, evaluation and truthful fallback. |
| [backend/api/src/routes/analytics.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/analytics.ts) | No | Reconcile aggregates and commercial claims to authoritative events; show unknown/partial state truthfully. |
| [backend/api/src/routes/appeals.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/appeals.ts) | No | Enforce staff roles, preserve case/evidence history, reason-code sensitive actions and demonstrate operator recovery. |
| [backend/api/src/routes/auctions.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/auctions.ts) | No | Prove server timing, winner/lot identity and verified payment before fulfilment; replay late/duplicate events. |
| [backend/api/src/routes/auth.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/auth.ts) | Yes | Prove identity/object authorization, session revocation, recovery, privacy projections and cross-account isolation. |
| [backend/api/src/routes/authentication.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/authentication.ts) | No | Prove identity/object authorization, session revocation, recovery, privacy projections and cross-account isolation. |
| [backend/api/src/routes/bots.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/bots.ts) | Yes | Prove grants, budgets, approvals, revocation and inspectable execution outcomes before consequential automation. |
| [backend/api/src/routes/catalogImports.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/catalogImports.ts) | No | Trace producer→consumer→external result; validate source permission, safe URLs, partial failures and revocation. |
| [backend/api/src/routes/chat.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/chat.ts) | No | Prove membership/block authorization on reads, writes and subscriptions; durable retry/reconnect without duplicate messages. |
| [backend/api/src/routes/chatComposerState.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/chatComposerState.ts) | No | Prove membership/block authorization on reads, writes and subscriptions; durable retry/reconnect without duplicate messages. |
| [backend/api/src/routes/chatPreferences.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/chatPreferences.ts) | No | Prove membership/block authorization on reads, writes and subscriptions; durable retry/reconnect without duplicate messages. |
| [backend/api/src/routes/chatTranslate.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/chatTranslate.ts) | No | Prove membership/block authorization on reads, writes and subscriptions; durable retry/reconnect without duplicate messages. |
| [backend/api/src/routes/coOwn.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/coOwn.ts) | Yes | Prove market state, units, FX, reservations, rights and actual settlement; test concurrent commands against PostgreSQL. |
| [backend/api/src/routes/coOwnDepth.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/coOwnDepth.ts) | No | Prove market state, units, FX, reservations, rights and actual settlement; test concurrent commands against PostgreSQL. |
| [backend/api/src/routes/collections.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/collections.ts) | No | Prove source attribution, pagination, privacy, stale/empty distinctions and actual item availability. |
| [backend/api/src/routes/compliance.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/compliance.ts) | No | Prove export/deletion identity, downstream task completion, retention exceptions and backup purge evidence. |
| [backend/api/src/routes/conversationalSearch.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/conversationalSearch.ts) | No | Identify actual baseline/model/provider selected, field provenance, safe ingestion, evaluation and truthful fallback. |
| [backend/api/src/routes/creatorAnalytics.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/creatorAnalytics.ts) | No | Prove media ownership, safe processing, draft/export/publication state and permission-aware deletion. |
| [backend/api/src/routes/creatorDocuments.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/creatorDocuments.ts) | Yes | Prove media ownership, safe processing, draft/export/publication state and permission-aware deletion. |
| [backend/api/src/routes/creatorPublications.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/creatorPublications.ts) | Yes | Prove media ownership, safe processing, draft/export/publication state and permission-aware deletion. |
| [backend/api/src/routes/exceptionQueue.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/exceptionQueue.ts) | No | Enforce staff roles, preserve case/evidence history, reason-code sensitive actions and demonstrate operator recovery. |
| [backend/api/src/routes/experiments.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/experiments.ts) | No | Validate server-side eligibility, configuration versions, expiry and rollback; no client-only enforcement. |
| [backend/api/src/routes/extractionIntelligence.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/extractionIntelligence.ts) | No | Trace producer→consumer→external result; validate source permission, safe URLs, partial failures and revocation. |
| [backend/api/src/routes/feed.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/feed.ts) | No | Prove source attribution, pagination, privacy, stale/empty distinctions and actual item availability. |
| [backend/api/src/routes/flags.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/flags.ts) | No | Validate server-side eligibility, configuration versions, expiry and rollback; no client-only enforcement. |
| [backend/api/src/routes/fraudDetection.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/fraudDetection.ts) | No | Validate real provider inputs and failure policy, review/appeal flow, access control and actionable audit evidence. |
| [backend/api/src/routes/fraudShadow.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/fraudShadow.ts) | No | Validate real provider inputs and failure policy, review/appeal flow, access control and actionable audit evidence. |
| [backend/api/src/routes/galleria.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/galleria.ts) | No | Prove source attribution, pagination, privacy, stale/empty distinctions and actual item availability. |
| [backend/api/src/routes/health.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/health.ts) | Yes | Prove dependency health, compatible version/state synchronization and safe degradation under partial failure. |
| [backend/api/src/routes/impact.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/impact.ts) | No | Reconcile aggregates and commercial claims to authoritative events; show unknown/partial state truthfully. |
| [backend/api/src/routes/importerExtraction.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/importerExtraction.ts) | No | Trace producer→consumer→external result; validate source permission, safe URLs, partial failures and revocation. |
| [backend/api/src/routes/listingIntelligence.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/listingIntelligence.ts) | No | Identify actual baseline/model/provider selected, field provenance, safe ingestion, evaluation and truthful fallback. |
| [backend/api/src/routes/listingOffers.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/listingOffers.ts) | Yes | Bind actor, order, immutable terms, amount and lifecycle; prove retries and provider event convergence. |
| [backend/api/src/routes/listings.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/listings.ts) | No | Validate actor/object authorization, lifecycle, failure recovery, external side effects and telemetry at the real route boundary. |
| [backend/api/src/routes/liveLotEngine.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/liveLotEngine.ts) | No | Prove server timing, winner/lot identity and verified payment before fulfilment; replay late/duplicate events. |
| [backend/api/src/routes/looks.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/looks.ts) | No | Prove media ownership, safe processing, draft/export/publication state and permission-aware deletion. |
| [backend/api/src/routes/mediaAssets.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/mediaAssets.ts) | No | Prove media ownership, safe processing, draft/export/publication state and permission-aware deletion. |
| [backend/api/src/routes/mediaEmbeddings.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/mediaEmbeddings.ts) | No | Identify actual baseline/model/provider selected, field provenance, safe ingestion, evaluation and truthful fallback. |
| [backend/api/src/routes/mediaEnhancement.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/mediaEnhancement.ts) | No | Identify actual baseline/model/provider selected, field provenance, safe ingestion, evaluation and truthful fallback. |
| [backend/api/src/routes/modelArtifacts.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/modelArtifacts.ts) | No | Identify actual baseline/model/provider selected, field provenance, safe ingestion, evaluation and truthful fallback. |
| [backend/api/src/routes/moderation.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/moderation.ts) | No | Validate real provider inputs and failure policy, review/appeal flow, access control and actionable audit evidence. |
| [backend/api/src/routes/moderationTriage.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/moderationTriage.ts) | No | Validate real provider inputs and failure policy, review/appeal flow, access control and actionable audit evidence. |
| [backend/api/src/routes/moodboards.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/moodboards.ts) | No | Prove media ownership, safe processing, draft/export/publication state and permission-aware deletion. |
| [backend/api/src/routes/notifications.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/notifications.ts) | No | Map real event types to preferences/channels; deduplicate, honor privacy and resolve deep links safely. |
| [backend/api/src/routes/operatorSupport.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/operatorSupport.ts) | No | Enforce staff roles, preserve case/evidence history, reason-code sensitive actions and demonstrate operator recovery. |
| [backend/api/src/routes/opsConsole.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/opsConsole.ts) | Yes | Enforce staff roles, preserve case/evidence history, reason-code sensitive actions and demonstrate operator recovery. |
| [backend/api/src/routes/oracle.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/oracle.ts) | No | Prove market state, units, FX, reservations, rights and actual settlement; test concurrent commands against PostgreSQL. |
| [backend/api/src/routes/orderFulfilment.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/orderFulfilment.ts) | Yes | Bind actor, order, immutable terms, amount and lifecycle; prove retries and provider event convergence. |
| [backend/api/src/routes/policies.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/policies.ts) | No | Validate server-side eligibility, configuration versions, expiry and rollback; no client-only enforcement. |
| [backend/api/src/routes/posters.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/posters.ts) | No | Prove media ownership, safe processing, draft/export/publication state and permission-aware deletion. |
| [backend/api/src/routes/price.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/price.ts) | No | Reconcile aggregates and commercial claims to authoritative events; show unknown/partial state truthfully. |
| [backend/api/src/routes/priceAlerts.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/priceAlerts.ts) | No | Prove market state, units, FX, reservations, rights and actual settlement; test concurrent commands against PostgreSQL. |
| [backend/api/src/routes/promotions.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/promotions.ts) | Yes | Validate server-side eligibility, configuration versions, expiry and rollback; no client-only enforcement. |
| [backend/api/src/routes/realtime.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/realtime.ts) | No | Prove membership/block authorization on reads, writes and subscriptions; durable retry/reconnect without duplicate messages. |
| [backend/api/src/routes/recommendationIntent.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/recommendationIntent.ts) | No | Identify actual baseline/model/provider selected, field provenance, safe ingestion, evaluation and truthful fallback. |
| [backend/api/src/routes/recommendations.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/recommendations.ts) | Yes | Identify actual baseline/model/provider selected, field provenance, safe ingestion, evaluation and truthful fallback. |
| [backend/api/src/routes/refunds.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/refunds.ts) | Yes | Bind actor, order, immutable terms, amount and lifecycle; prove retries and provider event convergence. |
| [backend/api/src/routes/retention.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/retention.ts) | No | Prove export/deletion identity, downstream task completion, retention exceptions and backup purge evidence. |
| [backend/api/src/routes/returns.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/returns.ts) | No | Bind actor, order, immutable terms, amount and lifecycle; prove retries and provider event convergence. |
| [backend/api/src/routes/savedSearches.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/savedSearches.ts) | No | Prove query/facet/cursor identity, relevance, inventory freshness and authorization-filtered results. |
| [backend/api/src/routes/search.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/search.ts) | Yes | Prove query/facet/cursor identity, relevance, inventory freshness and authorization-filtered results. |
| [backend/api/src/routes/searchExtended.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/searchExtended.ts) | Yes | Prove query/facet/cursor identity, relevance, inventory freshness and authorization-filtered results. |
| [backend/api/src/routes/secureMessages.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/secureMessages.ts) | No | Prove membership/block authorization on reads, writes and subscriptions; durable retry/reconnect without duplicate messages. |
| [backend/api/src/routes/secureProfiles.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/secureProfiles.ts) | No | Prove identity/object authorization, session revocation, recovery, privacy projections and cross-account isolation. |
| [backend/api/src/routes/security.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/security.ts) | No | Prove identity/object authorization, session revocation, recovery, privacy projections and cross-account isolation. |
| [backend/api/src/routes/sellerHub.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/sellerHub.ts) | No | Reconcile aggregates and commercial claims to authoritative events; show unknown/partial state truthfully. |
| [backend/api/src/routes/sellers.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/sellers.ts) | Yes | Reconcile aggregates and commercial claims to authoritative events; show unknown/partial state truthfully. |
| [backend/api/src/routes/smartSellPolicy.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/smartSellPolicy.ts) | No | Prove grants, budgets, approvals, revocation and inspectable execution outcomes before consequential automation. |
| [backend/api/src/routes/sms.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/sms.ts) | No | Map real event types to preferences/channels; deduplicate, honor privacy and resolve deep links safely. |
| [backend/api/src/routes/storefronts.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/storefronts.ts) | No | Reconcile aggregates and commercial claims to authoritative events; show unknown/partial state truthfully. |
| [backend/api/src/routes/streaming.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/streaming.ts) | Yes | Prove server timing, winner/lot identity and verified payment before fulfilment; replay late/duplicate events. |
| [backend/api/src/routes/support.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/support.ts) | No | Enforce staff roles, preserve case/evidence history, reason-code sensitive actions and demonstrate operator recovery. |
| [backend/api/src/routes/supportReviews.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/supportReviews.ts) | No | Enforce staff roles, preserve case/evidence history, reason-code sensitive actions and demonstrate operator recovery. |
| [backend/api/src/routes/sync.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/sync.ts) | No | Prove dependency health, compatible version/state synchronization and safe degradation under partial failure. |
| [backend/api/src/routes/taxonomy.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/taxonomy.ts) | No | Prove query/facet/cursor identity, relevance, inventory freshness and authorization-filtered results. |
| [backend/api/src/routes/ugcReports.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/ugcReports.ts) | Yes | Verify registered caller, input/output contract, object authorization, durable effects, failure/retry behavior and operational telemetry using actual dependencies. |
| [backend/api/src/routes/uploads.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/uploads.ts) | No | Prove media ownership, safe processing, draft/export/publication state and permission-aware deletion. |
| [backend/api/src/routes/users.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/users.ts) | No | Prove identity/object authorization, session revocation, recovery, privacy projections and cross-account isolation. |
| [backend/api/src/routes/v2.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/v2.ts) | Yes | Prove dependency health, compatible version/state synchronization and safe degradation under partial failure. |
| [backend/api/src/routes/vendorWebhooks.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/vendorWebhooks.ts) | No | Trace producer→consumer→external result; validate source permission, safe URLs, partial failures and revocation. |
| [backend/api/src/routes/visualSearch.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/visualSearch.ts) | Yes | Identify actual baseline/model/provider selected, field provenance, safe ingestion, evaluation and truthful fallback. |
| [backend/api/src/routes/voiceMessages.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/routes/voiceMessages.ts) | No | Prove membership/block authorization on reads, writes and subscriptions; durable retry/reconnect without duplicate messages. |
| [backend/api/src/index.ts](https://github.com/K17ze/thryftverse-upgrade/blob/76c0733f8fca7424ad5bfb51c81d2a71a36e866f/backend/api/src/index.ts) | Yes | Map remaining inline routes to domain owners; eliminate bypass financial writes and test registration/authorization boundaries. |


## Appendix G. Reproducibility and review handoff

All source links are pinned to the reviewed SHA, so later branch changes cannot silently alter the evidence. Line anchors identify inspected locations; nearby paths in the prose give context when a finding spans multiple callers. The screen and route registers are requirements, not runtime certification.

Run the following on an isolated review checkout with its documented dependencies. The dummy database URL used in this audit satisfied import-time configuration only; replace it with a reviewed disposable integration database for real database tests. Never point test or restore tooling at production.

```sh
# frontend
NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck
npm test
npm run check:visual-gates
npm run check:residue
npm run lint:design-tokens
npm run check:icons
npm run check:golden-parity
npm run check:release-config

# backend/api
npm run typecheck
npm run test:vitest
npm test
node --import tsx scripts/run-eval-suite.ts
node --import tsx --test src/__tests__/notificationContract.test.ts src/__tests__/sellerPerformance.test.ts src/routes/supportReviews.test.ts
node --import tsx --test src/__tests__/coOwnSurveillanceContract.test.ts src/__tests__/ledgerKindContract.test.ts
node --import tsx --test src/__tests__/mediaEmbeddingPgvector.test.ts src/__tests__/retrievalSourceContract.test.ts src/__tests__/searchAdapterDegradation.test.ts

# backend/ml-service; requires its Python dependencies
python3 -m unittest discover -s tests
```

A release review should retain commit, runtime, lockfiles, enabled flags, provider modes, applied migrations, device/OS, exact command, exit code and artifact. Redact credentials and personal data from evidence. Group static policy checks, mocked behavior, real integration, native screenshots and operational drills separately so a successful narrow test cannot become a broad completion claim.

**Next review entry condition:** present the closure evidence for waves 1–3, a final-image staging run and real native reference captures. Re-score only the dimensions that those artifacts actually improve.
