# ThryftVerse Flagship Production Readiness Review

**Audit date:** 23 August 2026  
**Research horizon:** Official material available through 23 August 2026  
**Workspace:** `C:\Users\User\Desktop\thryftverse-upgrade`  
**Starting branch:** `feat/product-detail-contract-media-device-closure`  
**Starting HEAD:** `cf7aa52c5ae0209c62d1bc79ea15b4892fc19dca`  
**Scope:** Native product, subscreens, shared components, search, discovery geometry,
Poster/Looks/camera/gallery/editor/upload/publish/viewer, backend correctness,
security, providers, migrations, CI, EAS, operations, and stack direction.

## 1. Executive decision

ThryftVerse is **not ready to deploy as a flagship production product** and is
not at Instagram, Pinterest, Snapchat, eBay, Depop, or Edits parity today.

The codebase contains meaningful senior-grade foundations: native stacks,
FlashList v2 masonry, a broad token system, a versioned creator document,
Skia drawing/filter paths, durable upload receipts, transactional Poster
publication, real API-backed commerce surfaces, and substantial state handling.
Those are assets worth preserving.

The current blocker is not one missing gradient or icon. The repository has a
large **claim-to-evidence gap**:

- visual acceptance can pass with 1×1 PNGs and filename checks;
- “complete” backend phases contain migrations that cannot run;
- upload finalization creates media jobs that no worker consumes;
- several creator controls write metadata that neither preview nor viewer uses;
- editor, viewer, and export do not share a single rendering authority;
- Looks previously accepted an arbitrary URL instead of an authoritative upload;
- search autocomplete could change its hook count when opened;
- checkout, refunds, webhooks, and chat retries mishandle ambiguous outcomes;
- trust badges synthesize identity/seller verification from email verification;
- release approval, OTA rollout, backup, and queue guarantees are weaker than
  their documentation claims.

The correct status is:

`PARTIAL — INTERACTION FAILURES REMAIN`

with additional backend and native validation blockers. The app can reach the
target, but it needs vertical closure, not another department-wide decoration pass.

## 2. What changed during this audit

This review did not stop at documentation. It closed publication, search, and
Hook-order defects and repaired the governance loop.

### 2.1 Looks publication now uses authoritative media

Before:

```
local media → PUT/finalize → remote URL → POST /looks accepts URL alone
lost 201 response → retry → 409 Look ID already exists
```

After this pass:

```
local media → PUT/finalize → finalization + media asset receipt
→ Look payload carries receipt → backend verifies owner/type/URL/scope/status
→ Look + media binding commit transactionally
→ same key + same payload safely replays the same Look
→ same key + different payload fails closed
```

Implemented in:

- `frontend/src/creator/compositionContract.ts`
- `frontend/src/services/looksApi.ts`
- `backend/api/src/routes/looks.ts`
- `backend/api/src/db/migrations/129_looks_publication_fidelity.sql`
- `frontend/src/__tests__/creatorStudioContract.test.ts`

This aligns the primary Looks asset with the Poster receipt contract. It does
not yet bind every nested asset in the composition; that remains a P0 roadmap item.

### 2.2 Publish ambiguity is now represented honestly

Before, a network drop after the request left the device became “Publishing
failed,” even when the server may have committed it. That invites unsafe retry
and contradicts the repository’s unknown-outcome rule.

Now `CreatorPublishSheet` presents **Result not confirmed** and a **Check result**
action. It reconciles the stable publication ID before claiming success or retrying.

### 2.3 Search autocomplete crash and composition were corrected

`SearchAutocomplete` returned before a later `useMemo`, changing hook count when
visibility toggled. The early return now occurs after all hooks. The suggestion
surface was also flattened:

- idle mode shows recent searches or trending searches, not both;
- typing shows at most five ranked suggestions;
- confidence-color dots were removed;
- the redundant rounded/bordered suggestion card was removed;
- matched text remains the restrained ranking signal.

### 2.4 ESLint 9 is callable again

The repository used only a legacy `.eslintrc.cjs`, while ESLint 9 requires flat
configuration by default. `frontend/eslint.config.mjs` restores hook correctness
as a real executable gate.

### 2.5 Conditional Hook failures were removed repository-wide

Enabling the executable lint gate exposed 30 errors. Twenty-seven were conditional
Hook calls across navigation, discovery, creator, commerce, social, biometric,
recommendation, and transition surfaces; the other three were definite type/lint
errors. All 30 are now fixed at their call sites without disabling the rules.
Repository-wide ESLint now reports zero errors. The remaining warning inventory is
large and is tracked as engineering debt rather than being misreported as clean.

### 2.6 Documentation no longer converts file presence into completion

AGENTS §§40–44 are now labeled implementation ledgers with validation pending.
The new `.devin/workflows/flagship-production-readiness-loop.md` adds an evidence
ladder and coordinates visual, live-signs, creator, and release proof.

## 3. Methodology

The review used four concurrent evidence tracks:

1. frontend product, navigation, interaction, accessibility, and visual systems;
2. creator/Skia/camera/gallery/editor/timeline/upload/publish/viewer;
3. backend/data/security/payments/messaging/providers;
4. release/EAS/CI/migrations/backups/operations.

Every major claim was tested against this ladder:

| Level | Required evidence |
|---:|---|
| 0 | prose or proposed behavior |
| 1 | file/package exists |
| 2 | canonical route/import is reachable |
| 3 | types and focused tests pass |
| 4 | clean build and pristine migration pass |
| 5 | live endpoint/provider/worker succeeds |
| 6 | signed native artifact succeeds on device |
| 7 | equal-scale benchmark comparison, rework, accessibility/performance matrix, human acceptance |

The previous “complete” language often stopped at levels 1–3. This report never
calls that production evidence.

## 4. Codebase profile

Measured in this snapshot:

| Area | Files | Approximate lines |
|---|---:|---:|
| Frontend TypeScript/TSX | 1,226 | 379,967 |
| Backend API TypeScript | 206 | 107,596 |
| Screens | 166 | — |
| Backend route files | 54 | — |
| SQL migrations | 131 | — |
| Frontend tests | 63 | — |
| Backend tests | 34 | — |

Largest ownership risks:

| File | Approx. lines | Risk |
|---|---:|---|
| `backend/api/src/index.ts` | 40,084 | canonical payment/chat/poster logic mixed with app bootstrap |
| `CreatorAssetPicker.tsx` | 4,590 | multiple tools and duplicate implementations share one owner |
| `routes/listings.ts` | 4,334 | large route file appears unregistered/duplicated |
| `routes/wallet.ts` | 4,227 | high-risk financial surface concentration |
| `PosterComposerScreen.tsx` | 3,087 | UI, playback, timeline, and tool orchestration coupled |
| `CreatorCanvas.tsx` | 2,774 | heterogeneous renderers and temporal semantics in one component |
| `LookComposerScreen.tsx` | 2,244 | editor orchestration and tool state concentration |

Large files are not automatically defects. Here they correlate with duplicate
authorities, dead adapters, and security-sensitive drift.

## 5. Department scorecard

Scores represent current proven behavior, not aspiration. `10` means benchmarked,
live, native-verified, and operationally releasable.

| Department | Score | Evidence ceiling | Decision |
|---|---:|---:|---|
| Design charter/tokens | 7/10 | 3 | strong rules; enforcement/evidence weak |
| Navigation architecture | 7/10 | 3 | native stacks and lazy routes are sound |
| Home/Discover renderer | 6/10 | 3 | real masonry exists; media geometry coverage does not |
| Search entry/autocomplete | 5/10 before, 6/10 after | 3 | crash fixed and composition flattened; native proof pending |
| Product detail core | 7/10 | 3 | live-query strengths; full visual matrix pending |
| Poster camera entry | 5/10 | 3 | continuity improved; capture/output parity incomplete |
| Poster editor/timeline | 3/10 | 2 | many visible tools do not affect runtime playback |
| Looks composer/viewer | 4/10 | 3 | composition exists; renderer/durability/privacy gaps remain |
| Creator upload transport | 4/10 | 3 | receipts exist; background/multipart/worker chain incomplete |
| Creator publication | 5/10 before, 6/10 after | 3 | Looks primary asset hardened; nested manifest pending |
| Messaging | 3/10 | 2 | media contract and retry duplication blockers |
| Trust/verification | 3/10 | 2 | fail-closed rule is not consistently implemented |
| Payments/settlement | 2/10 | 2 | ambiguity, refund, webhook, concurrency blockers |
| Backend migration/release | 2/10 | 2 | deterministic migration and orchestration failures |
| Visual regression evidence | 1/10 | 1 | 1×1 baselines and filename parity cannot prove pixels |
| Accessibility | 5/10 | 3 | many labels exist; shared primitive and role defects remain |
| Observability/operations | 3/10 | 2 | substantial scaffolding; multiple integrations are dead code |

## 6. Benchmark research: what flagship quality means in August 2026

### 6.1 Apple platform direction

Apple’s current design guidance separates the content layer from a restrained
navigation/control layer. Brand and color belong primarily in content; Liquid
Glass is reserved for navigation and controls that float above it. Standard
iconography, predictable placement, accessibility labels, adaptive layout, and
content focus matter more than coating custom cards in glass.

Implication for ThryftVerse:

- keep photography and authored media as the color story;
- use glass selectively for floating creator/navigation chrome;
- do not make every icon a filled circle;
- preserve standard back/search/overflow semantics;
- test reduced transparency and dark mode;
- separate the 44pt target from the visible 20–24pt glyph.

Sources: [Apple Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass),
[WWDC26 design guide](https://developer.apple.com/wwdc26/guides/design/),
[Apple brand identity on iOS](https://developer.apple.com/videos/play/wwdc2026/251/),
[Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass).

### 6.2 Android platform direction

Predictive back is a navigation-trust feature: people should see where the back
gesture leads before committing. The system Photo Picker is a permissionless,
lower-friction default where broad library access is unnecessary.

Implication:

- test every custom editor/sheet dismissal under predictive back;
- do not intercept Back with a different visual destination;
- prefer the system picker for bounded selection;
- reserve broad MediaLibrary access for an actual in-app library browser.

Sources: [Android predictive back](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back),
[Android Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker).

### 6.3 Meta Edits / Instagram creator direction

Meta’s April 2026 Edits update emphasizes a simple workspace backed by real
advanced controls: captions, color adjustments, speed curves, customizable tools,
templates, overlays, keyframes, video effects, ideas, and post-share feedback.
The differentiator is not tool count; it is that a creator can understand the
tool, see it immediately, reopen the project, and receive the same output.

Implication:

- remove controls whose evaluator/player/export path is absent;
- give each visible control one preview authority and one saved parameter;
- make favorite/pinned tool customization later, after tools are real;
- preserve editable project structure and source attribution;
- connect post-share insights only to real distribution data.

Source: [Meta, One Year of Edits](https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/).

### 6.4 Pinterest discovery/collage direction

Pinterest’s value is visual intent continuation: varied media geometry, useful
related paths, editable collage objects, cutouts, remix/source attribution, and
shopping connections. Masonry is necessary but insufficient. Equal cards are
often a metadata defect, not a list-component defect.

Implication:

- keep FlashList v2 masonry;
- backfill trusted intrinsic dimensions and focal data;
- use mixed semantic feed units intentionally;
- make cutout/remix/source permissions server-authorized;
- avoid generic equal listing-card rhythm.

Sources: [FlashList v2 masonry](https://shopify.github.io/flash-list/docs/guides/masonry/),
[Pinterest Collages](https://newsroom.pinterest.com/en-gb/news/introducing-new-ways-to-create-and-share-collages/).

### 6.5 Snapchat creation direction

Snapchat optimizes time-to-camera-ready and maintains capture continuity.
Multi Snap makes the accumulated sequence visible and individually manageable.
The viewfinder is the composition; utility chrome recedes.

Implication:

- measure icon press → camera ready in release mode;
- persist staged captures, not component state only;
- ensure preview pixels match the captured first frame;
- keep single-capture direct-to-edit;
- keep visual-search confirmation separate from creation intent.

Sources: [Snap time to camera ready](https://eng.snap.com/time_to_camera_ready),
[Snapchat Multi Snap](https://help.snapchat.com/hc/en-gb/articles/7012374385940-How-do-I-use-Multi-Snap).

### 6.6 React Native / Expo / Skia direction

React Native 0.87 is the active stable line as of 10 August 2026; this repository
uses 0.86.2 through Expo SDK 57. A direct unsupported upgrade is not justified.
Release performance must be tested in release mode. FlashList v2 already supports
real masonry and spans. Skia `useVideo` exposes frame, seek, duration, rotation,
pause, loop, and volume, enabling the same shader path as images on supported
devices. Expo Camera returns temporary local URIs and requires readiness before
capture. Expo ImagePicker documents Android pending-result recovery.

Implication:

- keep the Expo-supported RN version until the next validated SDK upgrade;
- prototype Skia video behind a device/API capability boundary;
- unify scene evaluation before chasing experimental Graphite/WebGPU;
- import temporary media into project-owned storage;
- call `getPendingResultAsync()` on Android recovery paths;
- profile only release builds.

Sources: [React Native releases](https://reactnative.dev/releases/),
[React Native performance](https://reactnative.dev/docs/performance.html),
[Skia video](https://shopify.github.io/react-native-skia/docs/video/),
[Skia canvas](https://shopify.github.io/react-native-skia/docs/canvas/overview/),
[Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/),
[Expo ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/),
[Expo MediaLibrary](https://docs.expo.dev/versions/v57.0.0/sdk/media-library/).

## 7. Frontend product findings

### P0-UI-1 — visual baselines are not screenshots

Every committed golden PNG inspected under
`frontend/src/__tests__/__screenshots__/` is a 67-byte 1×1 RGBA file.
`visualRegressionPlan.test.ts` checks names/file presence. The golden parity
script says the pixel diff “would go here.” Missing integration baselines remain
warnings. Source-analysis tests explicitly disclaim native rendering.

Impact: the release gate can report zero P0/P1 visual violations while proving
nothing about first viewport, crop, type, safe areas, dark mode, or native motion.

Required fix:

1. reject any baseline below the device target dimensions and encoded-size floor;
2. capture actual signed/dev-client native screens through Maestro or device tooling;
3. compare pixels with masks only for nondeterministic content;
4. retain before/after captures locally;
5. require human cold-critic sign-off after one rework iteration.

### P0-UI-2 — search hook order could crash

`SearchAutocomplete.tsx` previously returned when hidden before a later `useMemo`.
Visibility false→true changed hook count. This is now fixed. React’s rule is
explicit: hooks must not occur after conditional returns.

Source: [React Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks).

### P0-UI-3 — verification is synthesized from the wrong evidence

Profile, seller, settings, and trust components equate `emailVerified` with
identity or seller verification and sometimes synthesize a tier of `email`.
Email ownership, identity/KYC, seller standard, and marketplace trust are
different contracts.

Required fix:

- API returns explicit evidence-backed tiers and timestamps;
- null tier means no badge;
- “Email confirmed” remains account security copy, never a seller badge;
- trust serializers fail closed;
- every badge consumer uses the same projection.

### P1-UI-1 — equal masonry is a data geometry defect

Home and Discover already enable FlashList v2 `masonry`. The repeated card shape
comes from `listingMediaGeometry.ts`, which assigns the same 4:5 fallback when
intrinsic dimensions are missing. Migration 055 added nullable geometry but did
not backfill live rows.

Required fix:

- extract authoritative width/height/rotation in media processing;
- backfill existing covers;
- return cover geometry in every discovery serializer;
- measure coverage (`>=95%` active covers);
- use fallback only for genuinely unknown legacy assets;
- art-direct focal points by category.

### P1-UI-2 — shared press behavior is overclaimed

`AnimatedPressable` documents a `.97–.985` scale and 44pt target but defaults to
`.96`; 8pt hit slop around a 20pt glyph is only 36pt and cannot escape parent
bounds. It triggers haptics on press-in, including aborted scroll gestures, and
can compound manual haptics.

Required fix at the shared owner:

- real minimum layout box of 44×44;
- visible glyph remains 20–24pt;
- `.98` default scale for primary/card activation;
- opacity only for routine icon controls;
- semantic action owner triggers one haptic after activation.

### P1-UI-3 — Home creates continuous springs while scrolling

Home assigns a new `withSpring` target across a continuously changing scroll
range. Continuous motion should use interpolation/direct shared values; spring
only at snap/threshold completion.

### P1-UI-4 — local-only actions claim persistence

Inbox mute, archive, pin, read/unread, and request decisions update local Zustand
and show success. They do not survive reinstall or a second session. Settings
clears an unscoped search-history key while Explore uses a user-scoped key, then
claims success.

Required fix: canonical endpoints, optimistic rollback, query invalidation,
cross-session test, and truthful offline/unknown states.

## 8. Creator, Poster, Looks, and Skia findings

### P0-CREATOR-1 — editor, viewer, and export lack one renderer

`CreatorCanvas` uses heterogeneous RN/Expo/Skia branches. Images can receive
Skia matrices/masks; video uses native `VideoView`; text and interactive stickers
use RN. Poster and Look viewers invoke the canvas without the editor playback
clock. Timed layers, keyframes, transitions, and effect-bearing video therefore
cannot be WYSIWYG.

Required architecture:

```
CreatorDocument + AssetManifest + PlaybackClock
                  ↓
             SceneEvaluator
        ┌─────────┼──────────┐
        ↓         ↓          ↓
 editor scene  viewer scene  export/render plan
```

One evaluator must own temporal visibility, transforms, masks, effects, text
layout, audio parameters, and asset resolution. Skia should own the visual scene
where that creates parity; native controls remain accessible RN views.

### P0-CREATOR-2 — timeline controls are metadata theatre

Seek and rate adapters are no-ops. Trim/reverse/freeze/speed metadata does not
control native video preview. Split creates a second media layer on a page while
the projector selects the first visible media layer. Transition evaluation has
no runtime caller.

Action: hide these controls immediately or complete their evaluator/player/export
path before rendering them. Tool count cannot compensate for false behavior.

### P0-CREATOR-3 — drawing round-trip is nondeterministic

Existing strokes are not passed into the editing workspace; editing begins blank.
One path uses hardcoded 320×400 geometry. Points are stored as pixels while
playback treats them as normalized. Emoji stamps use `Math.random()`.

Action:

- normalize points at write time;
- import existing strokes on edit;
- seed deterministic stamp IDs/rotations;
- use live canvas geometry;
- ensure editor/viewer/export fixture equality.

### P0-CREATOR-4 — camera preview can differ from capture

The live camera filter is previewed through a Skia frame processor, but captured
media does not consistently carry `cameraEffect`. Green-screen metadata is shown
as a post effect yet no renderer consumes it.

Action: either bake the approved effect into the captured asset/render plan or
persist it into the single scene graph. Hide green screen until a real key/mask
path exists. Camera preview and post-capture frame should achieve SSIM ≥0.985.

### P0-CREATOR-5 — project recovery does not own source media

Project packages repeatedly save an empty asset registry. MediaBrowser returns
raw external URIs. Initial captures remain temporary/external. CrashJournal begin/
append are unused, and multi-capture lives only in component state.

Action: project-owned files + transactional SQLite registry/journal + persisted
capture tray + Android pending-picker recovery.

### P0-CREATOR-6 — audio controls do not produce an audio mix

Music renders album-art-like visual layers; `AudioMixer` has no runtime consumer;
fade callbacks discard values; playback audio callbacks are empty.

Action: remove/hide music, volume, fades, and ducking until one playback engine
owns clip audio, music, voiceover, fades, and export parameters.

### P0-CREATOR-7 — effect graph is only partially materialized

LUT evaluation is identity/future work. Blur, vignette, and grain may be computed
but are not consistently applied by the canvas. Text effects use a different RN
approximation. Thumbnails, canvas, viewer, and export can disagree.

### P0-CREATOR-8 — sticker identity collapses

Emoji becomes text and icon references become a star shape. The frontend exposes
interactive sticker types the Poster backend does not accept. Publishing can fail
after the user completes an apparently valid edit.

Action: typed canonical sticker payloads, same renderer and backend schema, or
remove unsupported sticker tools.

### P0-CREATOR-9 — crop is destructive/inconsistent

Rotation/crop coordinate order diverges between preview and materialization,
results are forced to JPEG, alpha can be lost, and the generic crop sheet can be
offered for video.

Action: nondestructive crop/rotation/mirror parameters; materialize only at
upload/export. Reject video in the image crop sheet.

### P0-CREATOR-10 — primary receipt is not a composition manifest

This pass binds the Look cover and the existing Poster flow binds frames, but
`compositionDocument` remains `unknown` and can contain additional media, masks,
backgrounds, GIFs, cutout sources, music, and nested URLs without bindings.

Action: versioned schema plus immutable `AssetManifest` listing every source by
asset revision, content hash, finalization, media asset, purpose, and canonical URL.
The backend validates all references in the same publication transaction.

### P1 creator findings

- microphone runtime permission is not clearly requested before camera audio;
- multi-capture staging is not process-durable;
- position keyframes animate X but not Y in one path;
- bare single-media Looks may omit composition and lose crop/effect/transform;
- Look cover selection uses raw layer area, not visible dominance/z-order;
- Look product hotspots can render twice;
- upload rehydration does not automatically resume processing;
- background upload is not real native background transfer;
- multipart calls four missing endpoints and intentionally cannot finalize;
- paused jobs can make project completion poll forever;
- unknown file size is fabricated as one byte;
- queue-store corruption silently becomes an empty queue;
- local path, not immutable byte hash/revision, identifies jobs;
- followers-only Looks are not actually visible to followers;
- remix is exposed without server-authorized `allowRemix` enforcement;
- scheduling field naming and state transitions are inconsistent.

## 9. Backend and data findings

### P0-BE-1 — migration chain is not deployable [RESOLVED]

Deterministic issues include:

- migration 115 attempts to convert regular tables with `ALTER TABLE … PARTITION BY`;
- it assigns `SELECT EXISTS` to an integer variable;
- migration 121 applies RLS to nonexistent table names and runtime never sets
  `app.current_user_id`;
- migration 122 runs `ALTER SYSTEM` inside the migration runner transaction;
- rollback without a down file deletes the ledger row without reverting schema;
- migration execution has no advisory lock;
- two migration files use the `127_` prefix.

PostgreSQL requires new partitioned parents/attach or data migration, and forbids
`ALTER SYSTEM` in a transaction.

Sources: [PostgreSQL partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html),
[PostgreSQL ALTER SYSTEM](https://www.postgresql.org/docs/current/sql-altersystem.html).

### P0-BE-2 — media processing queue is a dead end [RESOLVED]

Upload finalization inserts `media_assets` and pending `media_processing_jobs`.
A media ingest handler exists, but the queue union/worker dispatch does not include
it. Assets can remain pending while production publication gating waits forever.

Action: dedicated `media_ingest` queue, enqueue-after-commit, handler dispatch,
lease/retry/DLQ, job health, and end-to-end image/video fixtures.

### P0-BE-3 — moderation defaults fail open [RESOLVED]

The pipeline can default unmoderated media to approved, mock moderation skips real
review, and production compose defaults remain mock-compatible. A social marketplace
must fail closed or quarantine when providers are unavailable.

### P0-BE-4 — payment intent idempotency races [RESOLVED]

The idempotency pre-check is outside the transaction, the provider call happens
before the durable idempotency row, and concurrent requests can both create
provider side effects. Key uniqueness is global while lookup semantics include user.

Action: durable operation row keyed by `(user, operation, key)`, advisory/row lock,
provider idempotency key propagation, explicit pending/unknown/reconciled states.

Source: [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).

### P0-BE-5 — refund and admin payment semantics are unsafe

Refund lacks a request idempotency key and remaining-refundable calculation; the
provider call occurs inside a DB lock, and provider success followed by DB failure
has no reconciliation. Another admin refund path updates only local ledger/status
but returns `refunded: true`. An admin pay route can set paid without settlement
evidence. Some early returns release a client with an open transaction.

### P0-BE-6 — webhook dedup can discard valid settlement

Stripe event ID is persisted before processing. If processing rolls back, the
dedup row remains and later provider delivery receives `200 duplicate`. The retry
route locks outside a transaction and attempts signature verification without the
original signature header.

Action: durable inbox state machine with raw signed envelope, processing lease,
succeeded/failed state, scheduled recovery, and exactly-once ledger effects.

Source: [Stripe webhooks](https://docs.stripe.com/webhooks?lang=node).

### P0-BE-7 — BullMQ Redis may evict durable jobs

Cache and BullMQ share Redis configured with `allkeys-lru`. BullMQ recommends
`noeviction` for queue correctness.

Action: separate queue Redis with AOF and no eviction; cache/rate-limit Redis may
use eviction independently.

Source: [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production).

### P0-BE-8 — backup workflow misses encrypted output

The script creates `.dump.enc` and deletes `.dump`; the GitHub workflow uploads
only `.dump` and can succeed with zero artifacts. The DR runbook claims WAL/PITR
and weekly restore verification without implementation.

Action: managed PITR/WAL where possible; fail on zero artifacts; upload encrypted
output; automated decrypt/restore/data verification; record RPO/RTO evidence.

### P0-BE-9 — release approval and staged OTA are not real gates

Production build/update jobs do not depend on the approval job, builds use
`--no-wait`, and EAS CLI uses mutable `latest`. The OTA workflow republishes a
new update at each percentage instead of progressing the same rollout with
`eas update:edit`.

Expo recommends runtime compatibility, staged rollout monitoring, identical
staging/production configuration, and promoting the tested artifact.

Sources: [Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/),
[Expo deployments](https://docs.expo.dev/eas-update/deployment/),
[Expo update code signing](https://docs.expo.dev/eas-update/code-signing/).

### P1 backend findings

- reciprocal block/privacy projection is inconsistent across profile/search/follow;
- docs/metrics auth can fail open when admin token is missing;
- liveness/readiness routes may sit behind JWT and omit worker/media/provider health;
- realtime fallback/replay is per process and Pub/Sub is at-most-once;
- outbox rows have no stale processing lease reclamation;
- repeatable schedules are defined but never registered;
- presence/SLO/heartbeat utilities appear unused;
- Meilisearch env key names differ between compose and clients;
- “Postgres fallback” is actually process-local memory;
- proxy trust is broader than proven infrastructure boundaries;
- PgBouncer uses trust auth;
- CI actions/installers are not immutable SHA-pinned;
- a 40K-line `index.ts` remains canonical while extracted route files can be dead.

## 10. Messaging and social findings

### P0-MSG-1 — media messages violate the backend schema

The canonical client sends image/video messages with empty text. The backend
requires text length ≥1 in both schema and Zod. Every canonical media-only send
can be rejected.

Action: define a discriminated message payload (`text`, `image`, `video`, etc.),
validate body by type, persist remote asset receipt, and test second-device render.

### P0-MSG-2 — retry can duplicate messages

Client generates only a local optimistic ID; backend generates a new server ID.
A dropped response followed by retry creates another row.

Action: stable `clientMessageId`, unique `(conversation_id, sender_id,
client_message_id)`, same-response replay, explicit unknown state.

### P1-MSG-3 — inbox actions are session-local

Mute/archive/pin/read/request actions need API persistence and propagation.

## 11. Commerce and trust findings

### P0-COMMERCE-1 — checkout calls ambiguity failure

Checkout has no `unknown_outcome` stage. A lost response becomes payment failed,
which can lead to repeat attempts. The app also says it can proceed with standard
shipping while UI/backend both require a quote.

Action: retain attempt key, reconcile intent/order status, show unknown outcome,
and align copy with executable constraints.

### P0-COMMERCE-2 — co-own issue form targets no endpoint

The active UI promises issue submission; its service notes backend implementation
is missing. Implement transactionally with ownership/privacy/idempotency/support
propagation, or remove/disable the route truthfully.

## 12. Visual psychology diagnosis

The prototype feeling reported by the user follows predictable cognitive defects:

| Defect | Psychological cost | ThryftVerse response |
|---|---|---|
| equal card geometry | no salience; catalogue monotony | trusted intrinsic dimensions + authored spans |
| too many labels/headers | higher scanning load | object becomes label; one intent list |
| bordered suggestion container | field-inside-card hierarchy | flat results under the only input boundary |
| false tool controls | broken agency and trust | hide until preview/save/view/export agree |
| inconsistent icon containers | uncertain action meaning | one family, one optical band, transparent targets |
| layout shift/placeholders | perceived instability | exact skeleton geometry and focal metadata |
| fake success/failure | loss of financial/social trust | unknown outcome + reconciliation |
| local-only persistence | inconsistent mental model | server authority + optimistic rollback |
| generic repeated sheets | assembled rather than authored | task-specific composition and progressive disclosure |

Flagship feel is the behavioral experience of control: the product is fast,
predictable, spatially continuous, honest under failure, and visibly authored.
Decoration cannot recover a broken agency model.

## 13. Stack decision matrix

| Area | Decision | Timing | Reason |
|---|---|---|---|
| Expo SDK 57 / RN 0.86 | Keep now | immediate | supported combination; stabilize first |
| RN 0.87 | Evaluate with next Expo-supported upgrade | next release train | active stable, but direct unsupported jump is risky |
| FlashList 2.0 | Keep and fully use | immediate | masonry already correct; fix geometry data |
| React Native Skia | Expand into canonical scene compositor | P0 creator program | resolves image/video/effect parity where appropriate |
| Skia Graphite/WebGPU | Defer | later | experimental novelty does not fix ownership |
| expo-video/native VideoView | Keep for simple playback | immediate | accessible/native path; capability-bound effect video |
| Skia `useVideo` | Prototype behind API/device gate | P0 creator | frame/seek/shader parity for editor/viewer |
| Reanimated 4 | Keep | immediate | suitable for UI-thread gestures/motion |
| SQLite (`op-sqlite`) | Expand to creator project journal | P0 creator durability | transactional document/assets/jobs recovery |
| AsyncStorage creator state | Reduce | P0 creator durability | not transactional; too weak for project/media authority |
| Native background transfer | Add | P1 upload | URLSession + WorkManager/foreground service for process survival |
| S3 multipart | Complete existing backend/client | P1 upload | large video resume; do not add another provider |
| BullMQ | Keep, wire, isolate | P0 backend | adequate if worker/leases/DLQ/Redis are correct |
| Separate queue Redis | Add | P0 backend | durable noeviction/AOF independent of cache |
| PostgreSQL | Keep | all phases | strong source of truth; migration discipline is the gap |
| Kysely | Incrementally expand | P1 | type safety without ORM rewrite |
| New migration platform | Conditional | P0 release | use only if custom runner is not hardened |
| Kafka/Temporal | Defer | later | premature before outbox/worker basics are correct |
| Redis Streams | Conditional | later | only for durable cross-instance realtime replay |
| Managed Postgres PITR | Add/enable | P0 release | honest recovery beats shell-script claims |
| Maestro/device capture | Expand | immediate | real native visual/interactions evidence |
| Pixel diff | Add | immediate | filename checks cannot prove geometry |

## 14. Target creator architecture

### 14.1 Canonical project model

```
CreatorProject
├── versioned CreatorDocument
├── immutable AssetManifest
│   ├── source hash/revision
│   ├── project-owned local path
│   ├── finalization/media asset evidence
│   └── canonical derivatives
├── PlaybackClock
├── History checkpoints
├── Crash journal
└── Upload jobs
```

Persist the project atomically in SQLite. Store large bytes in project-owned
files and immutable remote object revisions, never inside SQLite/AsyncStorage.

### 14.2 Scene evaluator

The evaluator converts document + time + viewport + capabilities into a stable
render scene. Editor, viewer, export planning, thumbnail generation, and effect
previews consume the same parameters.

### 14.3 Truthful capability boundary

Every tool state is one of:

- supported and visible;
- supported on this asset/device and visible;
- temporarily unavailable with a real reason and recovery;
- absent.

Never show a control because a type or metadata field exists.

## 15. Sequenced roadmap

### Release Integrity Closure 01 — stop unsafe deployment

**Status: IMPLEMENTED — 23 August 2026**

1. quarantine/replace migrations 115, 121, and 122;
2. add migration advisory locking and immutable checksums;
3. run pristine and previous-schema upgrade CI;
4. wire media ingest queue/worker and fail-closed moderation;
5. fix payment operation idempotency and unknown states;
6. replace webhook dedup with durable inbox state machine;
7. split queue/cache Redis;
8. repair encrypted backup upload and automated restore;
9. connect release approval and wait for completed builds;
10. progress one signed OTA rollout rather than republishing.

Exit: all migrations run; image/video reach publishable/quarantined; concurrent
money calls produce one provider operation; failed webhooks recover; backup restores;
release jobs cannot bypass approval or backend/schema health.

#### Closure evidence

**Slice A — migration chain repair:**
- `backend/api/src/db/migrate.ts`: advisory locking (pg_try_advisory_lock),
  SHA-256 checksum verification, `noTransaction` support for `ALTER SYSTEM`.
- `115_table_partitioning.sql`: removed illegal `ALTER TABLE … PARTITION BY`,
  replaced with partition creation + attach pattern.
- `121_row_level_security.sql`: fixed table/column names, added existence
  guards, removed policies for non-existent tables.
- `122_postgres_tuning.sql`: marked as `noTransaction` for `ALTER SYSTEM`.
- `127_live_shopping_chat_bids.sql` → renamed to `130_` to resolve collision.
- `partitionManager.ts`: corrected `PARTITIONED_TABLES` to reference only
  `admin_audit_logs`.
- Backend typecheck: PASS.

**Slice B — payment idempotency & unknown states:**
- `131_payment_idempotency_unknown_states.sql`: added `unknown` status to
  payment intents and refunds, adjusted idempotency key constraints, added
  idempotency keys to refunds.
- `payments.ts`: idempotency key propagation for intent creation and refunds,
  explicit `unknown` state for timeout/lost-response scenarios.
- `orders.ts`: admin refund route fixed with ROLLBACKs and provider call.
- `CheckoutScreen.tsx`: `unknown_outcome` stage for network errors during
  payment, `orderId` correctly scoped for catch block.
- Backend + frontend typecheck: PASS.

**Slice C — webhook durable inbox state machine:**
- `132_webhook_inbox_state_machine.sql`: `webhook_events` table upgraded with
  state machine (`received → processing → succeeded | failed | dead`), raw
  body + signature storage, lease columns, retry columns.
- `webhooks.ts`: dedup insert moved INSIDE the transaction (rollback undoes
  both ledger effects and dedup row), raw body + signature header stored,
  inbox row marked `succeeded` on commit, `failed` on error with backoff.
- `ops.ts` retry sweep: `FOR UPDATE SKIP LOCKED` moved inside transaction,
  signature re-verification replaced with `normalizeWebhookEvent` (event was
  already verified at receipt), lease-based claiming.
- `paymentProviders.ts`: exported `normalizeWebhookEvent` for retry sweep.
- Backend typecheck: PASS.

**Slice D — media ingest queue/worker + fail-closed moderation:**
- `queues.ts`: added `media_ingest` queue, worker, DLQ, and
  `enqueueMediaIngestJob` with 5 attempts + exponential backoff.
- `workers/handlers/index.ts`: exported `processMediaIngestJob`.
- `workers/index.ts`: wired `handleMediaIngestJob` in standalone worker.
- `index.ts`: wired `handleMediaIngestJob` in inline API workers.
- `uploads.ts`: replaced fire-and-forget moderation with queue dispatch
  after commit, with inline fallback if queue is unavailable.
- `pipeline.ts`: fail-closed moderation — default changed from `approved`
  to `review` when no moderation provider has run.
- Backend typecheck: PASS.

**Slice E — Redis split + encrypted backup + EAS approval/OTA rollout gates:**
- `config.ts`: added `redisQueueUrl` and `redisCacheUrl` config options
  (fall back to `REDIS_URL` if unset).
- `redis.ts`: cache client uses `redisCacheUrl`.
- `redisClient.ts`: realtime pub/sub uses `redisCacheUrl`.
- `queues.ts`: BullMQ queue + worker connections use `redisQueueUrl`.
- `productionReadiness.ts`: `REDIS_QUEUE_URL` and `REDIS_CACHE_URL` added
  to required production values.
- `docker-compose.production.yml`: split `redis` into `redis-cache`
  (allkeys-lru, no AOF) and `redis-queue` (noeviction, AOF everysec),
  separate volumes, API + worker env vars updated.
- `docker-compose.prod.yml`: same split applied to root prod override.
- `automated-backup.sh`: encryption enforced in production
  (`BACKUP_REQUIRE_ENCRYPTION` or `NODE_ENV=production`), SSE-KMS on S3
  upload, SHA-256 checksum generation and upload.
- `postgres-backup.mjs` (both copies): same encryption enforcement, SSE-KMS,
  checksum generation.
- `scheduled-db-backup.yml`: `BACKUP_ENCRYPTION_KEY` required in production,
  SSE-KMS on upload, checksum verification step added.
- `.eas/workflows/build-and-deploy.yml`: `approve_store_submission` and
  `approve_production_ota` approval gates added before store submission and
  OTA update, `rollout_percentage: 10` for staged OTA rollout.
- Backend typecheck: PASS. Docker-compose YAML: VALID. EAS workflow YAML:
  VALID.

### Creator Truth Closure 01 — remove false tools

1. inventory every visible tool against evaluator/player/export/backend;
2. hide green screen, no-op LUT/effects, audio, speed/reverse/freeze/transition
   controls until functional;
3. preserve sticker identity and reject unsupported schemas before edit begins;
4. reject video crop; preserve image format/alpha;
5. normalize/determinize drawing.

Exit: every visible creator control changes the resulting viewer or provides a
truthful unavailable state.

### Creator Renderer Closure 02 — WYSIWYG

1. build `AssetManifest` and `SceneEvaluator`;
2. connect Poster/Look viewer to the same PlaybackClock;
3. use Skia for effect-bearing image/video/text/drawing/mask scene composition;
4. generate an export/render plan from the same evaluator;
5. build deterministic timestamp fixtures.

Exit: editor/viewer/export SSIM ≥0.985 at ten timestamps; seek error ≤1 frame;
audio/video drift <20ms over 60s.

### Creator Durability Closure 03

1. project-owned media import;
2. SQLite project/asset/job transactions;
3. CrashJournal begin/append/checkpoint lifecycle;
4. Android pending picker recovery;
5. persisted multi-capture tray;
6. immutable content hash/revision job identity.

Exit: kill after capture/draw/crop/40% upload; restore with zero missing URIs.

### Discovery Geometry Closure 01

1. media processor extracts width/height/orientation/focal/category metadata;
2. backfill active covers;
3. surface coverage dashboard;
4. feed uses actual geometry and deliberate spans;
5. native first viewport cold-critic loop.

Exit: ≥95% trusted geometry, no fallback-ratio monoculture, ≥2 strong media
objects above fold, release p95 ≥55 FPS on mid-range Android.

### Search and Messaging Closure 01

1. consolidate one canonical flat typeahead;
2. preserve scoped history through one service;
3. discriminated media message contract;
4. stable client message ID and replay;
5. persist Inbox actions with optimistic rollback.

Exit: 100 search focus toggles without hook/runtime error; media message renders
on a second device; a lost response creates exactly one message.

### Trust and Commerce Closure 01

1. separate email, KYC, seller, and trust tiers;
2. fail closed on missing evidence;
3. checkout/payment/refund unknown states and reconciliation;
4. implement or remove co-own issue submission;
5. device/accessibility/money sandbox matrix.

## 16. Measurable release acceptance

### Native visual

- actual captures at 320/390/430pt and representative Android;
- light/dark, 200% text, reduced motion/transparency;
- loading/populated/empty/error/offline/partial/permission states;
- no baseline below 720×1280;
- thumbnail and squint tests pass;
- one cold-critic rework per changed surface;
- no 1×1/file-presence proxy evidence.

### Discovery

- trusted geometry coverage ≥95%;
- first viewport contains ≥2 meaningful media objects;
- no more than 20% of first 20 tiles share fallback ratio unless real assets do;
- no loading→final geometry shift;
- release-mode scroll p95 ≥55 FPS on mid-range Android.

### Creator

- editor/viewer/export SSIM ≥0.985 at ten timestamps;
- camera preview/captured frame same threshold;
- seek ≤1 source frame; A/V drift <20ms/60s;
- process-death recovery at capture/draw/crop/upload;
- 200MB multipart resumes at last completed part;
- every composition asset resolves to owned finalization + immutable binding;
- stable publish key reconciles lost responses;
- follower/private/block/remix matrix passes.

### Messaging

- text/image/video contract fixtures pass end-to-end;
- stable client ID produces one row across lost-response retry;
- mute/archive/pin/read/request persist across reinstall/second session.

### Money

- every operation has a stable provider idempotency key;
- concurrency fixture produces one provider side effect;
- unknown outcomes reconcile before retry;
- refunds cannot exceed remaining amount;
- webhook redelivery produces exactly-once ledger effect;
- no UI claims provider success from a local ledger update.

### Release and operations

- pristine and previous-schema migrations pass;
- worker/media/provider health appears in readiness;
- moderation cannot be mock/fail-open in production;
- queue Redis uses `noeviction` and durable persistence;
- encrypted backup restores automatically;
- release waits for backend/schema and completed signed builds;
- approval is a dependency, not a leaf job;
- OTA uses supported rollout edit/progression and monitoring.

### Security

Apply the current OWASP MASVS families for storage, cryptography, authentication,
network, platform, code, resilience, and privacy. Starting with MASVS 2, do not
claim obsolete “levels”; record the concrete control evidence.

Source: [OWASP MASVS](https://mas.owasp.org/MASVS/).

## 17. Current strengths to preserve

- per-tab native stacks preserve independent history;
- root-owned cross-entry routes are lazy-loaded;
- Create is an action, not a selected tab;
- FlashList v2 masonry with stable keys/types is already present;
- product detail uses real query/loading/error/refetch paths;
- runtime mocks are production-gated in many canonical services;
- Poster frame publication uses upload receipt verification and replay safety;
- auction/co-own transaction flows contain examples of stable idempotency;
- theme tokens and Ionicons provide a usable visual grammar;
- creator documents preserve significantly more authored structure than a flat URL;
- Skia is already installed at compatible RN/Reanimated generations;
- current Design.md has strong anti-AI, geometry, state, and evidence principles.

Do not throw away these foundations in a rewrite. Correct ownership and proof.

## 18. Validation performed in this pass

Passed:

- backend TypeScript: `tsc -p tsconfig.json --noEmit`;
- frontend TypeScript after changes: `tsc --noEmit`;
- focused creator contract tests: 35/35;
- frontend co-own lifecycle smoke tests: 3/3 after repairing the MMKV/analytics
  test boundary so the real Zustand actions execute;
- focused backend workflow closure tests: 16/16;
- repository-wide frontend ESLint: 0 errors, 1,389 warnings;
- Expo Doctor: 20/20 checks passed;
- migration 129 applied and reapplied successfully on ephemeral PostgreSQL 16,
  preserved an existing `creator_document` binding, and accepted a `look` binding;
- `git diff --check`;
- visual gate script exits 0, but produced 153 heuristic warnings;
- production residue script exits 0, but produced 174 warnings;
- non-production SSL check exits 0 only because pinning is disabled.

Important interpretation:

- zero visual gate violations is not visual sign-off;
- 153 card/surface warnings require surface-by-surface review;
- 29 nested-list warnings include creator paths and can affect performance;
- 33 direct ItemDetail navigation warnings suggest owner drift;
- SSL validation was skipped, not passed under production configuration;
- the full backend suite passed all tests emitted before it stalled on existing
  long-lived handles; it did not produce a final result and was stopped;
- migration 129 was validated in isolation, but the complete historical migration
  chain and live provider/worker paths were not validated;
- no new signed EAS artifact was produced;
- ADB was available from the Android SDK, but no device/emulator was connected;
  no native before/after screen recording was captured in this pass.

## 19. Documentation corrections

AGENTS §§40–44 previously used `COMPLETE` for implementation inventories. They
are now validation-pending ledgers. This is not cosmetic wording: it prevents a
future agent from treating dead code, invalid migrations, mock providers, or
placeholder visual files as product completion.

Design.md remains directionally strong and did not need a wholesale rewrite.
Its strongest rules—native source of truth, truthful controls, media geometry,
one surface at a time, screenshot evidence, and full state coverage—are retained.
The defect was enforcement and later contradictory status claims.

## 20. Final conclusion

ThryftVerse is beyond a simple prototype in architecture, but parts of the user
experience still feel prototype-grade because too many capabilities are present
as labels/types/components without one executable owner from input to output.

The next quality jump will not come from “using Skia everywhere,” adding more
libraries, or redesigning 30 screens in parallel. It will come from:

1. making deployment and money/data paths safe;
2. making every visible creator tool truthful;
3. unifying editor/viewer/export rendering;
4. making media durable and authoritative;
5. fixing discovery data geometry, not replacing masonry;
6. replacing counterfeit visual evidence with real native captures;
7. iterating one bounded surface until a cold critic and human accept it.

The implemented Looks/search fixes are a real step, but the flagship benchmark
has not been reached. The next recommended active package is **Release Integrity
Closure 01**, followed by **Creator Truth Closure 01** and the canonical renderer.

**Final status:** `PARTIAL — INTERACTION FAILURES REMAIN`

**Additional blockers:** backend deployment integrity, live provider/worker proof,
signed native visual evidence, and human visual acceptance.

## 21. Screenshot-driven profile and creator-entry closure — 23 August 2026

This addendum records the corrective implementation triggered by the three native
screenshots supplied after the wider audit. The screenshots are treated as product
evidence, not as instructions. They prove three concrete geometry failures:

1. the profile cover edit affordance occupied the same vertical band as the avatar
   and follower statistics;
2. the camera effect picker occupied the same bottom band as the Look / Poster /
   Search intent selector;
3. the grid, corner brackets, and crosshair were positioned relative to the whole
   screen rather than the unobstructed capture viewport.

### 21.1 Measured root causes

| Surface | Previous owner geometry | Why the native render failed | Correct owner |
|---|---|---|---|
| Profile cover | `COVER_HEIGHT = 152`; content began at `COVER_HEIGHT - 50` | The identity surface began at y=102 while the cover and its 44pt edit target still extended to y=152. This guaranteed a 50pt collision band. | Cover owns its entire height; only the avatar optically crosses the seam. |
| Creator effects | Effects rail at `insets.bottom + 96` | The intent selector was at `insets.bottom + 100`, a four-point delta. Two primary interaction systems were rendered almost on top of each other. | Effects are secondary capture tools and belong in the Tools sheet. |
| Camera guides | `absoluteFill`, percentage top/bottom values, crosshair at 42% | Percentages were calculated from the device screen including system and creator chrome, so the framing language drifted upward and varied by device. | One inset capture-guide viewport owns grid, brackets, and centre point. |
| Mode switching | Entry screen changed a local label/state only | Selecting Poster while inside Look could still commit media to the Look composer contract. The control looked functional but its document intent was false. | Studio shell owns document type and remounts the correct canonical composer before capture. |
| Live effects | Skia frame processor changed preview only on several paths | Single and multi photo/video payloads could omit `cameraEffect`; the editor/export then diverged from the preview. | Capture metadata carries the selected effect into the scene graph for non-destructive re-render. |

### 21.2 Current primary-source research applied

The implementation follows current platform guidance available on 23 August 2026:

- Apple Camera Control guidance says to maximise the preview, minimise distraction,
  keep interface elements out of system overlay regions, and avoid duplicating
  secondary controls in the viewfinder. This supports moving the persistent effect
  carousel behind one deliberate Tools affordance rather than stacking two rails
  above the shutter.
  Source: [Apple Human Interface Guidelines — Camera Control](https://developer.apple.com/design/human-interface-guidelines/camera-control?changes=_5).
- Apple layout guidance makes safe areas and readable, adaptable placement part of
  the geometry contract rather than device-specific padding.
  Source: [Apple Human Interface Guidelines — Layout](https://developer.apple.com/design/human-interface-guidelines/layout?changes=_____7&language=objc).
- Android's current edge-to-edge guidance requires important content and interactive
  controls to account for system-bar insets while allowing media to remain immersive.
  Source: [Android — Edge-to-edge design](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge).
- Android's insets documentation, updated 14 August 2026, distinguishes system-bar,
  display-cutout, gesture, and keyboard geometry. A fixed screen percentage is not a
  safe substitute for these owners.
  Source: [Android — Window insets](https://developer.android.com/develop/ui/views/layout/insets).
- CameraX transformation guidance explains that analysis, preview, and capture use
  crop and rotation transformations that must be mapped deliberately. This supports
  a single framing coordinate space and a future native crop-matrix proof rather
  than decorative brackets placed over the screen.
  Source: [Android — Transform CameraX output](https://developer.android.com/media/camera/camerax/transform-output).
- CameraX configuration guidance identifies `ViewPort`/use-case grouping as the way
  to obtain consistent crop rectangles across preview and captured output. This is
  the native benchmark for eventual WYSIWYG framing validation.
  Source: [Android — CameraX configuration](https://developer.android.com/media/camera/camerax/configuration).
- Android's Photo Picker guidance, updated 7 August 2026, reinforces system-owned,
  permission-minimising media selection and its backported availability. Gallery
  import should remain on this boundary instead of creating a bespoke broad-storage
  permission flow.
  Source: [Android — Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker).
- Meta's April 2026 Edits update describes creator quality in terms of precise
  keyframe control, project continuity, reusable styles, and export fidelity. It is
  evidence that a flagship creator is a durable editing system, not a dense camera
  toolbar.
  Source: [Meta — One Year of Edits](https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/).

### 21.3 Psychology and interaction diagnosis

The previous camera entry violated four perceptual principles:

- **Preview dominance:** a camera is understood through its live scene. A persistent
  secondary tool rail reduced the visible scene and competed with the creation mode.
- **Progressive disclosure:** effects, timer, speed, grid, multi-capture, hands-free,
  and green screen do not all need equal first-viewport prominence. The shutter,
  capture intent, close, gallery, flash, and camera flip are the stable core.
- **Stable spatial mapping:** a framing guide is a promise about the output. If it is
  centred in the screen rather than the crop viewport, the promise is false.
- **Intent fidelity:** Look and Poster are different document models. A switch that
  changes text but not the owning composer damages trust more than a disabled control.

The profile failure had the same ownership smell. The cover, avatar, and statistics
were all allowed to overlap through negative geometry. A flagship profile may use
one intentional avatar overlap to join identity with media; it should not let cover
controls collide with the statistics surface.

### 21.4 Corrective implementation completed

#### Profile

- Expanded the cover from 152pt to 200pt so background media has visual presence
  comparable to a true profile hero rather than a narrow toolbar backdrop.
- The scroll content now begins after the cover, eliminating the 50pt control/stats
  collision band.
- The avatar retains one deliberate 48pt optical overlap, preserving identity
  continuity without moving the statistics into the cover-control layer.
- The collapsed header interpolation is derived from cover height instead of stale
  magic numbers, so the transition follows the new hero geometry.

Canonical file: `frontend/src/screens/MyProfileScreen.tsx`.

#### Camera entry and capture tools

- Removed the always-visible effect rail from the viewfinder.
- Added the real effect selector to the existing Tools sheet with the active effect
  named explicitly.
- Visual Search fails closed to the unstyled source image and does not expose creation
  effects that would reduce recognition fidelity.
- Removed a duplicated haptic dispatch from the effect picker.
- Kept the 44pt interaction targets while reducing visible chrome; accessibility size
  no longer dictates a large visible container.

Canonical files:

- `frontend/src/creator/CreatorCamera.tsx`;
- `frontend/src/creator/camera/CaptureToolsSheet.tsx`;
- `frontend/src/creator/camera/CameraEffectBar.tsx`.

#### Framing geometry

- Introduced one safe, mode-aware capture-guide viewport.
- Top inset clears the close/flash/tools row.
- Bottom inset clears shutter, gallery, flip, and the optional intent selector.
- Look, Poster, and Search use different side insets to communicate different framing
  intent without arbitrary screen percentages.
- Rule-of-thirds grid, all four brackets, and crosshair are children of this viewport.
- The crosshair is centred at 50% of the usable viewport.

This corrects the visible alignment defect. Native proof must still verify that the
viewfinder's aspect-fill crop maps to saved-photo/video coordinates on each supported
device family.

#### Truthful mode dispatch

- Replaced the duplicate inline selector with the canonical `CreatorModeSwitch`.
- Standardised its third mode to `visual-search`.
- Removed the component-local `creatorCaptureMode` store that could override explicit
  route intent and persist Search as the next Create action. Look/Poster now update the
  canonical preference owner; Search remains transient.
- The studio shell now owns active document type.
- Look→Poster and Poster→Look switch the actual dedicated composer before media is
  captured or imported.
- Search gallery selection now launches visual search with one source asset instead of
  incorrectly inserting search media into the active editor.
- Route parameter changes resynchronise the shell without preventing local entry-mode
  switching.

Canonical files:

- `frontend/src/creator/capture/CreatorModeSwitch.tsx`;
- `frontend/src/creator/CreatorEntryScreen.tsx`;
- `frontend/src/creator/CreatorStudioShell.tsx`;
- `frontend/src/creator/look/LookComposerScreen.tsx`;
- `frontend/src/creator/poster/PosterComposerScreen.tsx`.

#### Preview-to-output effect fidelity

Poster, Look, and the creator context mapped `CreatorInitialMedia.cameraEffect` into
filter nodes, but the shared effect evaluator skipped every preset filter. The camera
also did not consistently populate the field. The correction now:

- single-photo direct-to-editor capture;
- multi-photo capture;
- carries photo width, height, MIME type and recorded video duration;
- resolves persisted preset nodes through the same canonical Skia color matrices used
  by the live camera preview;
- preserves a single-media Look's authored effect in `compositionDocument` at publish;
- preserves acquired speed metadata when mapping a Look layer;
- uses the same explicit portrait interface-orientation source for plain and Skia
  camera branches;
- blocks capture during native Camera↔SkiaCamera session replacement.

The preview remains GPU-rendered through the Skia frame processor while the captured
asset remains non-destructive and the canonical scene graph reapplies the same effect.
This is preferable to baking a preview texture into the file because it preserves
editability. Video effect composition/export is not implemented, so effect-active
capture is photo-only. Speed and Green Screen remain hidden until playback, viewer and
export can honor them. Advertising them before that point would be untruthful UI.

### 21.5 Stack decision

No new library is justified for this geometry correction. The existing stack already
contains the necessary owners:

- React Native + safe-area context for device geometry;
- VisionCamera for native acquisition;
- VisionCamera Skia frame processing for live effect preview;
- React Native Skia for scene/filter rendering;
- Reanimated and Gesture Handler for restrained native interaction;
- Expo/system photo selection for gallery acquisition.

“Use Skia 100%” would be the wrong target. Standard text, accessibility controls,
navigation, sheets, and lists should remain native React Native surfaces. Skia should
own operations that benefit from a retained GPU scene: compositing, masks, filters,
drawing, crop/transform previews, and export. Putting ordinary buttons into a canvas
would degrade accessibility, typography, semantics, and maintainability.

### 21.6 Required creator architecture expansion

The camera-entry correction does not make the entire Poster/Look/Moodboard department
complete. The next bounded packages are:

1. **One acquisition manifest.** Persist source URI, durable remote key, dimensions,
   orientation, crop transform, duration, MIME type, selected effect, speed, audio,
   green-screen intent, and creation timestamp under one versioned media contract.
2. **One scene evaluator.** Editor, playback, thumbnail generation, draft restore, and
   export must evaluate the same transform/effect graph.
3. **Native crop proof.** Record preview content mode, sensor orientation, mirrored
   front-camera state, output rotation, and final crop. Validate against CameraX
   `ViewPort` semantics on Android and equivalent AVFoundation geometry on iOS.
4. **Durable project media.** A local temporary URI is not a project asset. Upload,
   receipt verification, project binding, failure, retry, cancellation, and orphan
   cleanup must be visible and transactional.
5. **Truthful timeline.** Split, trim, reorder, speed, transitions, audio, keyframes,
   and undo/redo must share one command/history model and survive draft restore.
6. **Moodboard semantics.** Moodboard should not be a Poster skin. It needs collection,
   provenance, flexible spatial grouping, source attribution, and collaboration rules
   if those capabilities are promised.
7. **Performance budgets.** Capture-to-preview, capture-to-editor, gesture frame time,
   draft save latency, memory high-water mark, export duration, and thermal behaviour
   need device-class budgets and telemetry.

Recommended schema evolution should extend the existing TypeScript contracts and
PostgreSQL JSON/versioned project model first. Kotlin or Swift modules are justified
only for camera transform parity, codec/export acceleration, platform media sessions,
or capability gaps proven by profiling. A language addition is not itself quality.

### 21.7 Native acceptance matrix for this slice

Before this slice can be called complete, produce a signed or development EAS build
and verify on at least one compact Android device, one tall Android device, and one
notched iPhone-equivalent geometry:

- cover edit target does not intersect avatar or statistics at default and large text;
- 200pt cover remains useful with image, video, missing media, upload progress, failure,
  and retry;
- intent selector never intersects shutter, gallery, flip, system gesture inset, or
  Tools sheet;
- grid and brackets are centred within the unobscured preview in all three modes;
- front/back camera and portrait/landscape metadata do not rotate or mirror output
  unexpectedly;
- effect preview, editor, restored draft, thumbnail, and exported output match;
- Visual Search receives the original unfiltered source;
- switching Look↔Poster opens the correct editor and preserves no state from the wrong
  document model;
- TalkBack/VoiceOver exposes Close, Flash, Tools, Gallery, Shutter, Flip, and the three
  selected mode states in visual order;
- reduced motion removes decorative spring travel while retaining state clarity.

### 21.8 Honest status

The source-level root causes visible in the submitted screenshots are corrected. A
running Android emulator (`emulator-5554`, package `com.thryftverse.app`) was inspected
after the change. Native captures verify:

- the 200pt profile cover has a clear control band and the cover upload control ends
  above the identity/statistics canvas;
- only the avatar crosses the cover seam;
- the creator intent switch is unobstructed;
- the four framing corners and crosshair share one centred safe capture viewport;
- effects are contained in Tools rather than permanently obscuring the viewfinder.

The emulator camera provides synthetic colour blocks, so it is geometry evidence, not
media-art-direction or sensor-crop evidence. This was a Metro development build, not a
new signed EAS artifact. The compact/tall Android and iPhone-equivalent device matrix,
large-text states, real sensor crop, front-camera mirroring, draft restore, and exported
output still require proof. Therefore this slice is:

**`IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING`**

It must not be relabelled `COMPLETE — TARGET MET` until the acceptance matrix above is
captured on the real build and the renderer/export parity is demonstrated.

### 21.9 Profile media end-to-end findings

The geometry correction preserves the existing optimistic upload interaction, but the
profile-media data path is not production-safe yet.

#### P0 — profile media is not bound to an owned published asset

Upload finalization returns `finalizationId` and `mediaAssetId`, but the profile hook
discards them and PATCHes only a URL. The profile endpoint accepts that URL and writes
it directly to `users`. It therefore does not prove that the asset belongs to the
current user, was uploaded under avatar/cover scope, passed publication processing, or
matches the permitted media kind.

Required closure:

1. PATCH an asset identifier, not a caller-authored URL;
2. transactionally verify owner, intended scope, media kind and published state;
3. derive the canonical URL server-side;
4. store the media asset reference beside its denormalised projection URL;
5. retire/tombstone the previous binding atomically after successful replacement.

#### P0 — profile media can leak across account changes

The legacy `userAvatar` and `userCover` Zustand fields are global, survive logout, and
remain fallbacks when the active account has no media. Bootstrap can apply those values
after restoring a different cached account. Remove the global fallback after one
owner-aware migration and keep profile media exclusively under the current user ID.

#### P1 — upload state is incomplete

- Cover exposes progress/failure/retry, but Avatar passes only an edit callback and can
  start overlapping uploads without a busy state.
- The success path guards its operation ID; the failure path does not. An older failed
  request can overwrite a newer success.
- A lost PATCH response is reported as failure even though the server may have applied
  it. This requires an `unknown`/`reconciling` state and authoritative GET comparison.
- A failed picker/validation state exposes Retry even when no durable pending asset
  exists.
- A cover photo replacement clears cover video only locally; the server contract cannot
  atomically set one media kind and clear the other.
- The selected file is copied to app storage, but upload/retry retains the original
  picker URI, defeating durable retry on expiring Android content URIs.

#### P1 — responsive crop and media contrast need one owner

The picker still requests a fixed 3:1 crop while the accepted 390×200 cover viewport is
approximately 1.95:1. The subsequent `cover` render crops again without a stored focal
point. The profile media component also contributes a bottom gradient while the screen
adds top and bottom fades, shading most of the enlarged cover. The follow-up should
preserve the full source plus normalized focal point/crop data and let the screen own
the single contrast treatment.

#### P1 — propagation is not authoritative

Profile confirmation updates local Zustand state but does not consistently reconcile
current-user, public-profile, feed seller, messaging identity, and notification actor
projections. The authoritative PATCH response should update the current-user owner and
invalidate every directly coupled projection.

This backend/profile work was not mixed into the current geometry patch because the
worktree contains concurrent release-integrity changes in the same backend. It is the
next bounded full-stack closure, not a reason to fabricate completion here.

### 21.10 Validation refresh for this slice

Passed after the final corrective changes:

- frontend TypeScript: `tsc --noEmit`;
- targeted ESLint for profile, creator entry, camera, composers, scene evaluator,
  composition contract and regression test: zero errors;
- creator contract, output parity, device contract and real-store smoke suites: 98/98;
- scoped `git diff --check` for this slice;
- Android emulator render inspection of profile and camera geometry.

The emulator pass also exposed a development warning from the Home header: its search
button dispatched root-owned `GlobalSearch` into the tab-local Home stack. The handler
now climbs to the RootStack owner before navigating; targeted lint and the final
TypeScript pass remain clean. Other cross-stack Home actions should receive the same
owner audit in the navigation closure rather than relying on misleading root-typed
local navigation objects.

Repository-wide `git diff --check` remains non-zero because unrelated concurrent
backend/release and other-screen files contain trailing whitespace. Those files were
preserved rather than mechanically rewritten during this bounded product correction.

## 22. Discovery, destructive-account and group-identity convergence

### 22.1 Evidence supplied by the August 23 EAS audit

The two new device captures expose structural defects rather than missing decoration:

- **Data & Privacy:** the outlined `Danger zone` panel, warning badge, two versions of
  the irreversible warning and another contained destructive row create a card-on-card
  silhouette. The component spends more visual weight advertising danger than helping
  the user make a deliberate decision. It also competes with the legal rows below it.
- **Discover:** two nearly identical red-bag images lead a product-only two-column
  catalogue. Search is represented by a large field, a separate back control and a
  second search control beside a duplicate `Discover` heading. The masonry engine may
  be capable of variable geometry, but the rendered information architecture remains
  a catalogue because every unit is still a listing with price chrome.
- **Group messaging:** creation already accepted a group photo, yet the canonical edit
  surface rendered initials only. The client conversation serializer discarded
  backend `metadata.description` and `metadata.avatar`, so even successful server
  writes could disappear when conversations were re-fetched.

The references demonstrate a different discovery model. Pinterest uses a dominant
media idea followed by board/topic modules and mixed continuations. Depop uses an
editorial hero followed by community looks and categories. The reusable principle is
not “make every tile taller”; it is **one scrollable world with heterogeneous objects,
real media, contextual chaptering and truthful destinations**.

### 22.2 Current official research and its implementation consequence

This pass used official product/engineering sources current through August 23, 2026:

- Pinterest Engineering, *Module Relevance on Homefeed* (2025):
  <https://medium.com/pinterest-engineering/module-relevance-on-homefeed-ae76f8b545b2>
  documents a move beyond a uniform Pin grid toward heterogeneous modules and dynamic
  ranking/blending. Consequence: do not simulate intelligence with fixed client slots.
- Pinterest Engineering, *Advancements in Embedding-Based Retrieval at Pinterest
  Homefeed* (2025):
  <https://medium.com/pinterest-engineering/advancements-in-embedding-based-retrieval-at-pinterest-homefeed-d7d7971a409e>
  treats engagement, saving and shopping as different intents. Consequence: listings,
  Looks, Posters and Moodboards keep their own interaction meaning inside one feed.
- Pinterest Engineering, *How Pinterest Leverages Realtime User Actions…* (2025):
  <https://medium.com/pinterest-engineering/how-pinterest-leverages-realtime-user-actions-in-recommendation-to-boost-homefeed-engagement-volume-165ae2e8cde8>
  combines short-term action sequences with longer-lived interest models. Consequence:
  a future server ranker should blend recent intent and durable taste; the current
  client must not invent “because you viewed” explanations.
- Pinterest Engineering, *Improving Quality of Recommended Content Through Pinner
  Surveys* (2025):
  <https://medium.com/pinterest-engineering/improving-quality-of-recommended-content-through-pinner-surveys-eebca8a52652>
  shows that engagement is not equivalent to perceived quality. Consequence: optimise
  visual relevance/diversity and explicit negative feedback, not clicks alone.
- Apple HIG, *Managing accounts*:
  <https://developer.apple.com/design/human-interface-guidelines/managing-accounts>
  requires account deletion to be clear and discoverable. Consequence: retain one real
  deletion row and its dedicated verification flow; remove decorative alarm chrome.
- WhatsApp, *Customize Your WhatsApp Group Chats…* (January 2026):
  <https://about.fb.com/news/2026/01/whatsapp-group-chats-member-tags-text-stickers-event-reminders/>
  demonstrates role identity, events and reminders as real group state rather than
  visual ornament.
- Telegram, *Member Tags…* (March 2026) and the July 2026 product index:
  <https://telegram.org/blog/member-tags-disable-sharing-and-more?setln=en>
  and <https://telegram.org/blog?setln=en>. These establish granular group permissions,
  member roles, group administration and structured community organisation as parity
  dimensions. Consequence: ThryftVerse should first make group identity, ownership,
  permissions, media and propagation correct; it should not expose fake topic/event or
  moderation controls merely to match a checklist.
- Android Developers, *Photo picker*:
  <https://developer.android.com/training/data-storage/shared/photo-picker>. Consequence:
  group-photo acquisition should use the system picker and selected-media access rather
  than requesting broad library access.

### 22.3 Product contract adopted by this pass

**Discovery**

1. Fetch real published public Looks, active public Posters and backend public
   Moodboards beside real listings.
2. Reject development/demo Moodboards at the discovery data boundary.
3. Assemble a heterogeneous feed from available real rows; no hash-derived geometry,
   no fabricated creator spotlight and no claim of personalisation without a signal.
4. Render Looks, Posters and Moodboards with distinct media grammar rather than forcing
   them through a commerce card.
5. Preserve FlashList masonry virtualization, pull-to-refresh, pagination, offline
   treatment, category filtering and listing save/navigation.
6. Navigate only where a canonical truthful destination exists. A public Moodboard may
   be presented visually, but must not impersonate a button that opens the owner editor.
7. Long term, replace client blending with one server-ranked discovery response that
   records unit reason, content type, fatigue state and stable pagination cursor.

**Account deletion**

1. One flat `Account` section.
2. One restrained red hairline and one `Delete account` row.
3. One useful subtitle explaining the next step, not a second version of the warning.
4. Navigation remains the canonical deletion flow with identity verification and
   backend eligibility checks.

**Group identity**

1. Name, description and group photo/avatar form one backend-owned projection.
2. The client serializer retains those fields across initial list, fetch and update.
3. The group information surface renders the actual photo and exposes edit only to a
   backend-authorised owner/admin.
4. The edit surface uses the system media picker, visible pending/upload/error states,
   and updates the store only from the server-confirmed result.
5. Creation and edit use the same upload/finalisation contract.
6. Leave/delete/report controls remain flat, separated and safe-area clear. A bordered
   `DANGER ZONE` block is prohibited.
7. The term “cover picture” maps to the canonical group photo/avatar. A separate wide
   banner is not added until the domain, crop model, backend ownership and all consuming
   surfaces support a distinct asset.

### 22.4 Remaining platform work after this bounded implementation

Flagship discovery still needs a backend-owned mixed-feed contract. Recommended fields
are `unitId`, `unitType`, typed payload, `rank`, `reasonCode`, optional reason display
copy, `spanHint`, intrinsic media geometry, ranking model/version, stable cursor and
impression token. Ranking should control fatigue and type distribution; the client
should control only layout safety. Recommendation quality needs explicit `not
interested`, hide/seen/impression and save/close-up feedback paths before “personalised
for you” becomes an evidence-backed claim.

Messaging parity should be implemented in capability order: authoritative group
identity and roles; shared media/search; invite lifecycle; member management and admin
audit; mute/notification policy; replies/pins/reactions; then optional events/topics.
Every capability requires backend state, auth projection, error/offline handling and
cross-surface propagation. The number of visible menu rows is not a quality metric.

Native validation for this pass must compare the exact audited routes at the same
viewport: rounded-container count, first useful media Y, useful objects above fold,
duplicate search controls, group-photo propagation and bottom-navigation occlusion.
Static TypeScript success does not override an inferior EAS render.
