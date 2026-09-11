# ThryftVerse flagship-autopilot readiness review

**Review date:** 7 September 2026  
**Scope:** current repository, product surfaces, connected API/data paths, release gates, and public competitor evidence  
**User goal:** refine and deepen the existing social-commerce product; this review does not treat feature-count expansion as parity  
**Workspace:** C:/Users/User/Desktop/thryftverse-upgrade  
**Git root:** C:/Users/User/Desktop/thryftverse-upgrade  
**Remote:** https://github.com/K17ze/thryftverse-upgrade.git  
**Branch:** feat/product-detail-contract-media-device-closure  
**HEAD:** 6c00bbc6b62d6995dca5f1b84aa17561340ac7  
**AGENTS:** C:/Users/User/Desktop/thryftverse-upgrade/AGENTS.md  
**Working tree:** dirty (39 entries at review start); existing user/agent work was preserved  
**Execution mode:** read-only product/release review; no source implementation was changed

## Executive decision

**Status: CONDITIONAL — not approved for an unrestricted public launch.**

The stack is worth keeping. The current distance from a flagship-quality release is not a missing-framework problem; it is a proof, truth, connected-flow, and refinement problem. The current branch has materially advanced Co-Own, Seller Hub, analytics, profile/closet navigation, chat truth, and editor/upload work. It still has release-blocking evidence gaps:

- the visual release gate is not measuring real pixels;
- frontend tests have six current Group Chat failures;
- backend tests cannot complete without Redis;
- production residue still enables fabricated Galleria content;
- Expo/React Native patch alignment and app-config schema checks fail;
- the root production Compose rendering still has network/runtime inconsistencies;
- attestation and certificate pinning are not production-grade;
- no native-device, signed-build, large-text, light/dark, or screen-reader evidence exists;
- semantic discovery, creator export, and provider-backed commerce/safety recovery are not proven end to end.

This means “broadly capable” is supportable; “1:1 with Instagram, Pinterest, Snapchat, or Depop from day one” is not. The correct next move is a closure campaign over the present implementations, with every claim tied to a live row, a real interaction, or a recorded native/release artifact.

## How this review reconciles the earlier snapshots

The 30 August stack/release audit remains directionally useful: keep the native/full-stack foundation and close deployment, security, media, commerce, and measurement gaps. Its exact test counts and deployment observations are not treated as current because HEAD and the working tree moved.

The earlier provisional 56/100 visual/connected score was a static snapshot, not a durable product metric. The current branch includes later Co-Own, profile, navigation, chat-truth, editor, and upload changes, so a new percentage would be invented precision until native and live gates are measured. This review therefore reports gate evidence and a prioritized gap register rather than reusing either old score.

## Current evidence ledger

| Gate | Current evidence | Decision |
|---|---|---|
| Frontend TypeScript | npm.cmd run typecheck exits 0 | Green |
| Backend TypeScript | npm.cmd run typecheck exits 0 | Green |
| Backend build | npm.cmd run build exits 0 | Green |
| Design-token lint | exits 0; two hardcoded-margin warnings in AnalyticsTrajectoryChart.tsx | Green with cleanup |
| Frontend ESLint | exits 0 but reports 14,608 warnings | Technically green; not a trustworthy quality gate |
| Frontend tests | 84/85 files pass; 1,762 passed, 6 failed, 2 skipped; all six are Group Chat source-string parity assertions | Red until classified and replaced by behavioral coverage |
| Backend tests | does not complete; repeated Redis connection refusals on 127.0.0.1/::1:6379; terminated | Red/blocked by test infrastructure |
| Expo Doctor | 18/20 checks pass; app-config schema and 20 Expo/RN patch mismatches fail | Red |
| Visual release gate | report finds 49 P0, 15 P1, 139 warnings; default gate fails | Red |
| Golden parity | fixture/integration baselines absent; 12 golden PNGs are 1x1, 70-byte placeholders | Red |
| Residue check | 5 errors (demo-mode-true), 135 warnings | Red |
| Docker/deployment | Compose renders, but Docker daemon is unavailable; API/key-service/Redis exposure and runtime settings are inconsistent | Unverified/red |
| Live API proof | repository has real routes and local code paths, but this review did not certify a production/staging journey | Pending |
| Native visual/a11y | no available device/signed-build capture matrix | Pending |

The checks distinguish “command returned zero” from “release evidence is trustworthy.” A passing TypeScript build cannot certify a connected social-commerce journey, and a passing report-mode visual script cannot certify pixels when the baseline assets are placeholders.

## What has materially improved

### Platform and architecture

The Expo 57 / React Native 0.86 / React 19 foundation, FlashList, Reanimated, Skia, VisionCamera, SQLite, MMKV, Zustand, TanStack Query, Fastify, PostgreSQL, Redis, BullMQ, object storage, payments, and observability primitives are reasonable launch choices. A rewrite is not justified by the stack.

The repository now has 171 screen files, 564 components, 92 backend route files, and 250 migrations. This is substantial product surface, not a blank prototype. It is also the source of coupling: breadth must now be reduced into clear owners and shared contracts.

### Co-Own and finance surfaces

The recent Co-Own waves add distributions, corporate actions, market statistics/tape, ranged history and volume toggles, ownership disclosures, active orders, related-assets rail, holder pagination, offline fail-visible states, and card-sprawl reduction. Backend and UI work are present in the current HEAD. Native visual proof and live financial mutation evidence remain open.

### Seller Hub and seller operations

Seller Hub is now split into domain modules (executive hero, pillar tiles, trust strip, orders, analytics, closet, listings, opportunities, dock) and the backend computes real inventory, tasks, ledger/wallet posture, settled-order pulse, trust rows with stale handling, and opportunity signals. Money and trust are increasingly fail-closed rather than hardcoded.

There is still a connected-flow bug: SellerHubScreen fetches five Promise results but destructures four. Import batches are never set and importError is forced false, while handleNavigateToTask still reads importBatches. The surface can therefore look complete while its catalog-import task is unreachable or stale. This is a P1 integration defect.

### Chat truth and privacy

Fake Inbox Notes and the old false E2EE copy have been addressed in the current direction. Group Chat now describes encrypted transport/storage rather than claiming client-held-key end-to-end encryption. Real conversation resolution was added to canonical paths.

The backend still encrypts/decrypts message bodies server-side and exposes plaintext to bot/safety processing; that is at-rest encryption, not E2EE. The secure-messages route is not registered. Do not restore an E2EE claim without a real client-key protocol and recovery model.

### Editor, upload, and creator publishing

The upload queue is a real state machine: durable AsyncStorage state, throttled progress, AbortController cancellation, NetInfo pause/resume, FIFO concurrency capped at two, retries, and visible progress/retry affordances. Crop math and XHR transport are substantially better than a placeholder.

Creator publish review validates caption/audience, supports draft save, and disables Share offline. The remaining work is coherence and native proof: aggregate queue state, explicit offline/recovery communication, shared creator/listing adjustment contracts, media/export implementation, and device validation.

### Navigation, profile, and product contracts

Recent commits remove duplicated StyleQuiz ownership, deduplicate trust components, improve profile contracts/Closet labels, and repair navigation/profile paths. These are meaningful debt closures. Duplicate route ownership and legacy/canonical boundaries still need a deliberate final inventory.

## Remaining upgrade register

Severity definitions:

- **P0:** truth, security, release, or data-integrity defect that blocks public launch.
- **P1:** flagship connected-flow or quality defect that must close for a credible competitive beta.
- **P2:** refinement, maintainability, or scale work that can follow a gated beta but should be scheduled.

### P0 — release and trust blockers

| Department | Evidence in code/repo | Upgrade required | Acceptance evidence |
|---|---|---|---|
| Runtime truth / Galleria | galleriaApi.ts sets GALLERIA_DEMO_MODE=true and returns local mock collections/editorials/assets after backend errors in five production paths | Gate fixtures behind runtimeFlags fixture-design only. In integration/production return typed error/empty/retry state; retain an explicit fixture badge only in fixture mode | Production build/network-failure test proves no fabricated cards, IDs, people, or success state |
| Visual release | 12 root goldens are 1x1 placeholders; fixture/integration baseline directories are absent; report finds 49 P0 and 15 P1 | Capture real signed/native baselines at agreed widths, themes, large text and state matrix; make missing/invalid baselines fail, not skip | Blocking diff gate with valid dimensions, expected/actual/diff artifacts and two clean runs |
| Release lint/residue | 14,608 ESLint warnings; 5 residue errors, including demo-mode-true | Fix flat-config invocation/ownership, then burn down production errors and Rules-of-Hooks; classify obsolete assertions behaviorally | Clean install with zero errors and an agreed warning budget; residue exits nonzero on new production fakes |
| Compose/deployment | root prod render leaves API host port 4000 published despite ports: []; API lacks explicit REDIS_CACHE_URL/REDIS_QUEUE_URL; key-service inherits development and publishes 4100 | Select one canonical production Compose/deploy path; explicitly set split Redis URLs, production mode, queue ownership, proxy-only exposure, immutable image tags and health checks | Fresh host boot, API/worker/key-service health, queue job processed, intended ports only, rollback rehearsal |
| Runtime LTS | API/key-service Dockerfiles use node:20-alpine while README/CI/dependencies expect Node 22+; workstation is Node 24 | Choose and document one supported LTS, align Docker, CI, EAS and local tooling, then rebuild lockfile in a controlled branch | Reproducible clean install/build/test under the chosen runtime |
| Expo/Android release | Expo Doctor fails app-config schema and 20 Expo/RN patch checks; target SDK 36 is configured but signed artifact was not verified | Align Expo SDK 57 patch set using Expo tooling; reconcile generated security fields instead of deleting required plugin output; verify signed Android API 36 artifact | Expo Doctor clean (or documented accepted plugin warnings) and Play Console pre-launch/API-36 evidence |
| iOS release | no signed artifact or Xcode 26/iOS 26 SDK submission evidence | Build and archive with the supported toolchain, test privacy/account deletion/UGC flows | TestFlight/App Store Connect validation plus device capture matrix |
| Attestation | attestation route is not registered; iOS returns trusted true with placeholder publicKey; Android returns empty integrity verdict | Either implement real App Attest/Play Integrity verification with key rotation and replay protection, or remove the promise from the release contract | Staged valid/invalid/replay/expired token tests and observed rejection metrics |
| TLS pinning | native pinning package is not installed; TrustKit only enabled by env; production validator passes local-looking hashes because it validates shape, not certificate ownership | Install/implement the intended native pinning path, obtain production SPKI pins, rotation strategy and failure UX; fail closed only where recovery is designed | Signed production build against controlled certs, rotation and recovery drill |
| Backend test infrastructure | backend test runner hangs/retries on unavailable Redis and cannot produce a final result | Make tests self-contained with a service container/test Redis or an explicit deterministic fake; close connection lifecycle and runner ownership | Clean install starts dependencies, test suite terminates with reproducible result |

### P1 — front-end screens and connected product quality

#### Seller Hub and Analytics

1. Repair the Seller Hub import-batch Promise/destructuring/setter bug and add a behavior test for task navigation.
2. Replace analytics catch-to-empty behavior with per-source data, status, error, and updatedAt contracts. A failed top-performer or attention query must not render as a truthful empty result.
3. Add focus/refetch or query invalidation after listing, order, offer, payout, and import mutations; add cancellation/unmount guards.
4. Reconcile the frontend analytics offsetDays option with the backend schema, or remove it. The backend currently accepts period while the client appends an ignored offset.
5. Define gross/net/reconciled money semantics. The trend route currently documents gross revenue and does not subtract daily refunds/fees; expose the qualifier or implement a ledger-backed net series.
6. Add live staging evidence for trust freshness, payout holds, partial data and stale recovery. No badge or money posture should be derived from a frontend default.

#### Editor, upload, and creator

1. Split ListingMediaStudio (632 lines) into an authored media stage, ordered strip, adjustment controller, and upload status/recovery surface without removing existing handlers.
2. Add aggregate queue state (“3 of 5 uploaded”, paused/offline, retry-all, failed item count) and preserve truthful unknown-outcome states after transport interruption.
3. Share crop/adjust contracts between CreatorCropSheet and listing editing; remove the current seam where creator filter presets and listing adjustments diverge.
4. Restore visible crop-grid affordance at rest (currently opacity is zero until interaction), raise Done and ratio controls to practical hit targets, and validate the narrow straighten range against the product promise.
5. Remove dead publish-label branches or wire isPublishing correctly. Verify draft, queued, server-rejected, timeout/unknown, and final CDN states.
6. Replace the 36px edit scrim visual with a smaller glyph inside a 44pt transparent hit target; keep media as the visual anchor.
7. Implement the native media-export module promised by the creator surface, or narrow the promise. Validate orientation, codecs, audio sync, memory pressure, interrupted uploads, processing failure, retry, and final playback.
8. Produce native captures for upload, crop, reorder, retry, offline and large-text states.

#### Chat, Inbox, and social identity

1. Route every theme selection through the persisted mutation. The current Theme Picker only changes selectedTheme locally, closes, and shows success; it does not call the API or hydrate selection from the query.
2. Replace the six brittle Group Chat source-string tests with behavior tests for theme persistence, lock/biometric truthful state, disappearing-message policy, favourites, starred-message state, media-save outcome, and privacy copy.
3. Keep E2EE language removed until client-held keys, membership changes, multi-device recovery, bot/safety boundaries, key rotation, and message migration are implemented and audited.
4. Verify every message entry point uses one canonical ensureConversation operation; no route may derive a conversation ID from seller/listing values.
5. Implement or truthfully gate “coming soon” voice/video, starred, save-to-photos, disappearing, and advanced privacy controls. A toast is not a capability.
6. Complete server-enforced retention, favourites ownership, cross-screen invalidation, report/block/moderation/appeal surfaces, and support escalation.

#### Discovery, home, and visual search

1. Replace whole-image deterministic colour/layout similarity with catalogue-wide versioned image/text embeddings, object/region selection, semantic attributes, availability/size/price/delivery constraints, and a reranker.
2. Keep the heuristic as a labelled baseline and measure precision/recall, diversity, cold-start quality, unavailable-inventory rate, seller diversity, and conversion/save outcomes.
3. Upgrade recommendations from the heuristic/recency fallback and 500-item candidate cap to an evaluated retrieval/rerank pipeline with policy, inventory freshness, safety, and experiment assignment.
4. Ensure degraded discovery is visible as degraded only where appropriate; do not hide fixture content as live inventory.
5. Add real media focal-point rules by category (garments, shoes, bags, jewellery) and verify placeholders/partial media at native sizes.

#### Marketplace, PDP, checkout, and orders

1. Finish the canonical product-detail owner split; ItemDetail is still a 2,428-line owner while purpose-built ItemDetailDock, AttributeSummaryRow, TrustFactsSection, and sheet components are orphaned or duplicated.
2. Verify Checkout and Order routes use one safe-area contract; earlier double-inset paths must remain closed across every entry route.
3. Run provider-backed staging journeys: unique-item race, duplicate/out-of-order webhook, timeout after payment submit, challenge/decline/cancel, payout/refund-after-payout, reconciliation, shipping exception, non-delivery, misdescription, dispute, and appeal.
4. Wire Buyer Protection and trust assurances to backend evidence, not static copy. Keep unknown payment outcomes distinct from success and provide idempotent safe retry/check-result.
5. Validate seller/buyer cache invalidation after purchase, offer, cancellation, shipment, refund, and protection claims.

#### Settings, profile, Closet, and secondary pages

1. Reduce Settings information architecture; roughly 45 destinations/toggles with an icon on almost every row destroys hierarchy.
2. Separate public identity editing from private account/security/deletion/AI disclosure work. Preserve account deletion and data projection behavior.
3. Remove duplicate “Saved” semantics in Closet (saved versus wishlist) and make the primary media/collection action visible before utility chrome.
4. Reconcile duplicate route registrations and stack ownership (LookDetail, StyleQuiz, discovery/collection roots). Define canonical versus compatibility routes and test Back/return destinations.
5. Apply one header/safe-area/action geometry contract. At least 12 header/top-bar implementations and about 50 local header style systems remain.

#### Accessibility, motion, and responsive quality

1. Audit all flagged controls for role, state announcement, label, hitSlop, and practical target. Keep visible glyphs small while the transparent target reaches at least 44pt on iOS and 48dp on Android.
2. Remove unjustified Dynamic Type caps from critical commerce, identity, price, error, and action text. Verify at large text rather than trusting numberOfLines.
3. Capture light/dark geometry parity, reduced-motion behavior, screen-reader order, keyboard/back behavior, and safe-area coverage on signed iOS/Android builds.
4. Standardize icon family/optical sizes, press feedback, and two-radius surface grammar. Flatten card-on-card utility pages; media and identity should dominate the first viewport.
5. Complete localization of user-facing literals and make async/live-region announcements state-aware.

### P1 — backend and platform depth

| Area | Current state | Required depth |
|---|---|---|
| Recommendations | heuristic policy, recency fallback, candidate cap 500, shadow LightGBM only | versioned retrieval/rerank, event quality, inventory constraints, diversity/safety policies, offline evaluation, and controlled experiments |
| Visual search | candidate cap 60; histogram/layout/brightness/contrast/aspect heuristic; no vector embedder | object-aware crop/regions, image/text embeddings, attribute filters, shoppable results, catalogue refresh, and relevance measurement |
| Chat privacy | server-side ciphertext/decryption and bot/safety access; secure route not registered | keep truthful at-rest wording, or design/audit real E2EE with client keys and explicit safety trade-offs |
| Conversation identity | canonical path exists, legacy entry points previously derived IDs | one idempotent ensureConversation endpoint, authorization, dedupe, cross-entity cache invalidation, and behavior tests for order/offer/search flows |
| Analytics | broad seller routes and ledger data; gross trend and contract drift | net/reconciled series, freshness/version metadata, stable pagination/filters, event instrumentation, and live contract tests |
| Seller operations | real inventory/tasks/trust/ledger posture | import-batch status propagation, payout/hold exceptions, support ownership, alerting, and audit trail |
| Realtime sequencing | Redis INCR with process-local fallback on Redis failure | reconnect/resync protocol, replica-safe ordering, duplicate suppression, persisted cursor, and observability; do not silently claim order when sequence authority is unavailable |
| Payments/ledger | idempotency and unknown-outcome handling exist in parts | full provider-backed test matrix, transactional effects, webhook replay ordering, reconciliation, and negative-balance/refund-after-payout policy |
| Buyer protection | types/routes exist | evidence-backed eligibility, claim lifecycle, seller notification, support/appeal ownership, and recorded end-to-end outcomes |
| Moderation/safety | primitives exist in repository | operational queues, response SLAs, UGC filtering, report/block, teen/privacy controls, appeals, and audit retention |
| Attestation/pinning | contracts/validators exist but are not production proof | real provider verification, key/cert rotation, replay testing, metrics, and recovery |
| Media processing | upload and server processing foundations | durable jobs, idempotent publication, CDN validation, codec/size policy, cancellation/retry, and final playback verification |
| Operations | health/readiness code exists | backups/restore rehearsal, queue lag/error alerts, moderation/payment on-call, rollback, capacity/load testing, and incident runbooks |

## Flagship parity, measured as outcomes

The relevant comparison is not dependency count. Public documentation exposes portions of competitors’ capabilities, while private ranking, abuse operations, and capacity remain unknown. The parity target is therefore the user journey and its evidence.

| Benchmark | Public capability evidence | ThryftVerse today | Gap class |
|---|---|---|---|
| Instagram discovery and social graph | Meta operates multi-stage recommendation infrastructure and controlled launches | heuristic/recency fallback with shadow model, no measured user-facing learned rank | Material backend/measurement gap |
| Instagram DMs and creator creation | documented translation/music/scheduled/pinned/QR DM features; Edits offers dedicated mobile editing and direct share | broad chat/editor UI, but connected settings and export are not fully proven | Partial; truth and reliability first |
| Pinterest visual search | object/region selection, zoom, similar and shoppable items, keyword refinements and cutouts on iOS/Android | whole-image deterministic heuristic with cap 60 and no vector embedder | Material discovery gap |
| Pinterest shopping/catalogue | product feeds include title, description, price, availability, URL and image; product Pins expose product details | marketplace/catalogue foundations exist; freshness, semantic matching, and live merchant proof remain | Partial |
| Snapchat safety/privacy | Family Center exposes usage categories, contacts without message contents, restrictions and reports; public replies/privacy are controlled | safety primitives exist but operating evidence and age/teen policy are not certified | Operational parity unverified |
| Depop/eBay protection | non-arrival, damage/misdescription, tracked delivery, reports, support and appeals form a trust loop | protection/order/shipping pieces exist, but provider-backed resolution journey is not recorded | Launch-critical evidence gap |

The focused day-one experience should be: discover a look → save/share/follow → find an available item → ask the seller → buy safely → receive it → resolve or relist. That is a defensible combined social-commerce promise. It is more realistic and more valuable than claiming to reproduce three entire networks.

## Upgrade sequence

### Gate 1 — truth and release plumbing

Close Galleria fixture leakage, residue errors, visual baseline validity, Expo/runtime alignment, Compose network/Redis/runtime settings, backend test dependencies, attestation/pinning decision, and signed artifact requirements. Nothing else should be called launch-ready until this gate is green.

### Gate 2 — connected data contracts

Canonicalize conversation creation, seller import propagation, analytics freshness/error contracts, payment/ledger unknown outcomes, cache invalidation, trust evidence, moderation claims, and realtime replay. Add behavioral tests at the route/service boundary.

### Gate 3 — depth passes

Refine Seller Hub/Analytics, Editor/Upload/Creator, Group Chat/Inbox, Settings/Profile/Closet, PDP/Checkout/Orders, and discovery in that order. Preserve existing capability while deleting false or dead controls. Each pass needs populated, loading, empty, filtered-empty, partial, offline, error, retry, submitting, success, and unknown-outcome states where relevant.

### Gate 4 — native flagship acceptance

Capture signed iOS/Android screenshots at agreed device widths in light/dark and large text, including loading-to-final geometry, offline/retry, missing media, and screen-reader traversal. Apply thumbnail and squint tests. Verify press feedback, safe areas, keyboard, Back, media focal points, and reduced motion on device.

### Gate 5 — staged commercial proof

Execute the provider-backed commerce/safety matrix, restore/rollback rehearsal, moderation/support ownership, capacity test against a declared launch forecast, and a focused beta measuring publish success, relevant discovery, saves/follows, seller response, completed transactions, refunds/disputes, crash-free sessions, and return behavior.

## Suggested release acceptance targets

These are targets to measure, not current claims:

- p95 meaningful feed content within 2 seconds on an agreed mid-range device/network profile;
- p95 video first frame within 1 second on that profile;
- at least 99.9% crash-free sessions across a meaningful beta sample;
- no sustained memory growth through repeated feed, creator, chat, and checkout journeys;
- no duplicate financial effect under retries and webhook replay;
- recovery under roughly three times declared launch peak;
- zero fabricated production content, trust badges, IDs, or success states;
- zero open P0/P1 visual, security, data-integrity, or release-gate defects.

## Public research ledger (accessed 7 September 2026)

- Pinterest Help, “Use visual search features”: object/region selection, zoom, similar/shoppable results, refinements, and cutouts. https://help.pinterest.com/en/article/use-visual-search-features
- Pinterest Business, “Before you get started with catalogs”: merchant product-feed fields and catalogue import requirements. https://help.pinterest.com/en/business/article/before-you-get-started-with-catalogs
- Pinterest Business, “Shopping on Pinterest”: product Pins, pricing/availability/details, and catalogue/Rich Pin surfaces. https://help.pinterest.com/en/business/guide/shopping-on-pinterest
- Meta Newsroom, “Introducing Edits”: dedicated mobile creation, direct sharing, no-watermark export, and iterative creator tooling. https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/amp/
- Meta Newsroom, “Edit videos with Meta AI”: prompt-based edits and sharing workflow. https://about.fb.com/news/2025/06/edit-videos-with-meta-ai/
- Meta Newsroom, “One year of Edits”: saved Reels/audio/ideas and planned creator insights. https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/amp/
- Meta Newsroom, “New Instagram DM features”: translation, music, scheduling, pinned content, and group-chat invitations. https://about.fb.com/news/2025/02/new-instagram-dm-features-stay-connected/amp/
- Meta Newsroom, “New built-in restrictions for Instagram Teen Accounts”: age-appropriate restrictions and notifications. https://about.fb.com/news/2025/04/introducing-new-built-in-restrictions-instagram-teen-accounts-expanding-facebook-messenger/
- Snapchat Newsroom, “Deeper insights with Family Center” (22 January 2026): usage breakdowns, contact context, restrictions, and reporting. https://newsroom.snap.com/deeper-insights-with-family-center
- Snapchat Help, “Your Privacy When You Post Publicly”: public-profile age and reply/filter controls. https://help.snapchat.com/hc/en-us/articles/14855534914708-Your-Privacy-When-You-Post-Publicly-on-Snapchat
- Snapchat Help, “Security and safety steps”: report/block/leave-group, passkeys, 2FA, location, and Family Center controls. https://help.snapchat.com/hc/en-us/articles/7012304746644-What-steps-can-I-take-to-help-protect-my-security-and-safety-on-Snapchat?lang=zh-Hant
- Depop Help UK, “Depop Protection for buyers”: eligible non-arrival/damage/not-as-described claims, reporting window, and covered purchase components. https://depophelp.zendesk.com/hc/en-gb/articles/360038461713-Depop-Protection-for-buyers?moduleOrigin=explore_y2k-ww_bubbles
- Google Android Developers, target SDK requirements: Android 16/API 36 requirement for new apps and updates from 31 August 2026. https://developer.android.com/google/play/requirements/target-sdk?authuser=2
- Apple Developer, account deletion: in-app deletion of associated account data and user-generated content. https://developer.apple.com/support/offering-account-deletion-in-your-app
- Apple App Review Guidelines: UGC filtering/report/block/response, account deletion, privacy, and payment requirements. https://developer.apple.com/app-store/review/guidelines/
- Apple Design Tips: practical 44pt hit targets, readable text, and contrast guidance. https://developer.apple.com/design/tips/
- Android Developers accessibility guidance: interactive controls should expose at least 48dp touch/focus target. https://developer.android.com/guide/topics/ui/accessibility/views/apps-views

## Limitations and honest status

- No native device or signed-build walkthrough was available during this review. Status: **IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING**.
- No production financial mutations, live load test, backup restore, or provider settlement was executed. Status: **IMPLEMENTED — LIVE ENDPOINT VALIDATION PENDING** for those journeys.
- Docker daemon was unavailable, so Compose was rendered statically rather than booted.
- Backend tests were blocked by Redis availability and need a deterministic test-service fix before their count is meaningful.
- Earlier parallel audit workers were attempted but hit the host usage limit; this review relies on direct repository evidence and current commands.
- Public competitor sources describe selected capabilities, not private full architectures or operating scale.

## Completion rule for this campaign

Do not mark the product flagship-ready until the P0/P1 registry is closed, the visual gate has real native baselines, backend/live journeys are recorded, security claims are evidenced, and two consecutive adversarial re-audits are clean. The next implementation wave should be the gates and connected contracts above, followed by the department depth passes; adding another surface before these closures would increase breadth without increasing trust or parity.
