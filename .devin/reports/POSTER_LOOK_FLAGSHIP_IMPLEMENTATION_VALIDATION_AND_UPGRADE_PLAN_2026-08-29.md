# ThryftVerse Poster + Look Creator
## Flagship Implementation Validation, Pin-to-Pin Parity Specification, and V2/V3/V5 Reconciliation

**Audit date:** 2026-08-29  
**Audit snapshot:** `e5b615f9c83e4171b84a6980a1231f005c8016dc`  
**Starting snapshot observed for this task:** `630b3e271f437f7eae72603ec1dc223da29e8cd5`  
**Branch:** `feat/product-detail-contract-media-device-closure`  
**Repository:** `thryftverse-upgrade`  
**Scope:** Poster and Look capture, import, editing, upload, publication, scheduling, recovery, viewing, revision, and the correctness of the V2, V3, and V5 flagship reports.  
**Assessment type:** code-backed validation plus implementation specification; not a visual redesign implementation.

---

## 1. Executive verdict

The implementation is materially stronger than the version assessed by the original Poster/Look research. The creator now has structural validation before upload, post-upload validation, server-side exact media coverage checks, a processing/finalization path for ordinary uploads, server-owned publication rows, better theme and reduced-motion coverage, and a large amount of mechanical design-system cleanup.

It is **not yet flagship-release ready** and it cannot honestly be described as Pinterest-, Instagram-, Snapchat-, Coinbase-, or Corner-level. The remaining gap is not primarily a missing gradient, card style, or animation. It is the absence of one continuous, proven creation contract across camera geometry, server document ownership, multipart media finalization, publication idempotency, schedule execution, native rendering, and regression evidence.

### Release decision

| Surface or claim | Verdict | Reason |
|---|---:|---|
| Poster/Look creator implementation | **BLOCK RELEASE** | New documents are not created/saved to the server before publication; scheduled publishing cannot complete in the production worker topology; Poster camera/editor geometry is not canonical; multipart upload parity is incomplete. |
| Poster/Look visual quality | **NOT CERTIFIABLE** | No current native before/after captures, the screenshot baseline is empty, ADB/device validation is unavailable, and the supplied Mobbin flows were access-gated. |
| Original Poster/Look research implementation | **PARTIAL** | Several important P0 items landed, but multiple P0 contract and lifecycle requirements remain open. |
| `FLAGSHIP_UPGRADATION_REPORT_V2_2026-08-29.md` | **PARTIAL / MOSTLY IMPROVED** | Many named defects were fixed; raw IDs, locally asserted compliance, broad `any` usage, and some motion/brand-quality issues remain. |
| `FLAGSHIP_UPGRADATION_REPORT_V3_2026-08-29.md` | **STALE AND OVER-CERTIFIED** | It treats clean frontend TypeScript and static substitutions as proof of type safety, full state coverage, visual quality, and anti-AI quality. Those conclusions are not supported. |
| `FLAGSHIP_UPGRADATION_REPORT_V5_2026-08-29.md` | **USEFUL CHANGE LOG, INVALID RELEASE CERTIFICATE** | Some zero-count claims are true, several counts are inaccurate, multiple “zero” claims are false, the full suite is red, backend build is red, and visual/native gates are not passed. |

### The six non-negotiable blockers

1. **Server document lifecycle is disconnected.** The client publishes `workingDoc.id` without first creating and saving the canonical `creator_documents` record. The backend correctly returns not found when that row does not exist.
2. **Scheduled publication is structurally unable to publish in the documented production topology.** The standalone worker deliberately returns a transient failure; the inline `app.inject` request omits the publish command body.
3. **Poster capture geometry is wrong.** `CreatorCamera` assigns Poster `3:4` and Look `9:16`, while the canonical contracts use Poster `9:16` and Look `4:5`.
4. **Poster editor geometry changes with the physical device for full-bleed media.** This breaks “what I edit is what is exported.”
5. **Media receipt parity is incomplete.** The server validates every media-bearing reference, while the client only emits receipts for primary `media` layers. Multipart completion also returns before canonical processing parity is established.
6. **Durable recovery is incomplete.** Publication attempt identity exists only in a component ref and is lost on unmount/process death; the command revision is hardcoded to `0` and no expected document hash is enforced.

### What “1:1 pin-to-pin quality” should mean

It should **not** mean cloning another product's pixels. It should mean that every important user intention has an equally direct, equally trustworthy, and equally polished response:

```text
intent → immediate feedback → reversible edit → durable save → truthful progress
       → exact render → reliable publish → recoverable failure → consistent return
```

At flagship quality, capture framing equals editor framing, editor framing equals export framing, export media equals receipt-validated media, the server document equals the published command, and the final public object equals the preview the user approved. This report uses **pin-to-pin parity** to describe that end-to-end equivalence.

---

## 2. Evidence boundary and methodology

### 2.1 What was inspected

The review traced both directions:

```text
entry route → camera/import → editor → local document → upload manager
→ media finalization → publish sheet → publication API → DB rows → public projection

public projection → publication/revision rows → document contract → client serializer
→ editor state → preview → viewer → user-visible state and recovery
```

The following evidence was used:

- all four requested reports, including V5;
- `Design.md`, especially the Poster/Look contract and flagship scorecard;
- active frontend creator components, services, state, upload code, and tests;
- backend creator document, publication, media, schedule, and worker code;
- repository status and recent commits;
- frontend TypeScript, design-token lint, visual gates, residue checks, targeted creator tests, full frontend tests, and backend build;
- official current Pinterest, Apple, Android, Coinbase Design System, WCAG, and Corner sources;
- supplied Mobbin URLs, subject to the limitation below.

### 2.2 Mobbin limitation

The supplied Pinterest, Coinbase, and Corner Mobbin pages resolved to the signed-out Mobbin shell in the available in-app browser. The authenticated screen flows were not inspectable. Therefore:

- this report does **not** claim direct observation of those protected screens;
- no layout measurement, screenshot comparison, or pixel-parity conclusion is attributed to Mobbin;
- the apps remain explicit benchmark targets;
- Section 15 defines the exact authenticated capture set required for final parity certification.

This is preferable to inventing reference details. A flagship review must distinguish observed evidence from informed inference.

### 2.3 Evidence grades

| Grade | Meaning |
|---|---|
| **A** | Direct code path, command result, database contract, or official primary documentation. |
| **B** | Strong inference from active code and architecture, but not exercised against a live backend/device. |
| **C** | Design recommendation requiring native or authenticated reference comparison. |

Every release-blocking finding below is Grade A or B. No blocker depends on inaccessible Mobbin content.

---

## 3. Repository and report drift

The task began with HEAD `630b3e27`. While validation was in progress, the branch advanced through Phase 4 commits and V5 consolidation to `e5b615f9`. This review deliberately re-ran its static checks against the newer HEAD rather than validating a stale snapshot.

Relevant recent commits:

```text
e5b615f9 Consolidate V4 and V5 flagship reports into single V5 document
9d6ae6f9 Phase 4: Add Flagship Upgradation Report V5
cea9a5f5 Replace last raw fontSize values
f2d656d1 Phase 4 Wave 2
d97b7495 Phase 4 Wave 1
24e47825 Phase 4 label/state/theme work
15df673a Phase 4 cleanup
8388d754 Phase 4 fixes
1616a782 Add V4 report
6c67571b i18n migration
630b3e27 Phase 3D typography migration
```

V2 and V3 must consequently be read as historical planning/status documents, not as authoritative descriptions of the current tree. V5 is current enough to reconcile, but its measurement methodology is not sufficiently strict for release certification.

---

## 4. Validation command ledger

### 4.1 Current results

| Gate | Result | Material evidence |
|---|---:|---|
| Frontend `npm run typecheck` | **PASS** | Exit 0. This proves the configured frontend TS project compiles; it does not prove absence of `any`, backend correctness, runtime route closure, or native quality. |
| Frontend `npm run lint:design-tokens` | **FAIL** | One current violation: `AITransparencyDisclosure.tsx` uses a hardcoded radius. |
| Frontend `npm run check:visual-gates` | **FAIL** | 11 P0, 9 P1, 143 warnings. Includes hardcoded Look colors, Agent Ledger accessibility failures, empty screenshot baseline, inline list render functions, and a missing CreateCamera golden route. |
| Frontend `npm run check:residue` | **FAIL** | 6 errors and 179 warnings. The six errors are production demo-mode flags; creator warnings include nested virtualized lists. |
| Targeted creator frontend tests | **PASS** | 131 tests across five creator-focused files. |
| Targeted creator/backend tests | **PASS** | 107 tests. Several tests reimplement helper logic and do not execute the real route/worker/DB path. |
| Full frontend test run | **FAIL** | 19 suites failed, 56 passed; 91 tests failed, 1,492 passed, 2 skipped. |
| Backend `npm run build` | **FAIL** | Missing test modules and TypeScript errors in visual-search test code. |
| Native device validation | **NOT RUN** | `adb` was unavailable; no emulator/device render was available. |
| Current visual baseline | **FAIL** | Screenshot baseline directory is empty; the repository's own visual gate reports this. |

### 4.2 Release interpretation

A frontend typecheck pass cannot override:

- a broken creator document lifecycle;
- a schedule worker that cannot execute its command;
- incorrect authored geometry;
- a red full test suite;
- a red backend build;
- a red visual gate;
- absence of native visual evidence.

The appropriate status is not “zero errors” or “flagship complete.” It is **partial implementation with interaction failures remaining**.

---

## 5. Poster/Look end-to-end implementation validation

### 5.1 P0 — client never creates the canonical server document

**Evidence grade: A — release blocker**

The backend exposes a canonical document lifecycle in `backend/api/src/routes/creatorDocuments.ts`, including server creation and `If-Match` optimistic concurrency for updates. Publication in `creatorPublications.ts` locks and reads the stored `creator_documents` row before creating a public projection.

The frontend publication service exposes publish/schedule/history operations, but no active create/save integration for the canonical document endpoint. `frontend/src/creator/CreatorPublishSheet.tsx` calls `publishCreatorDocument(workingDoc.id, ...)` directly.

Result for a newly created local Poster or Look:

```text
local UUID exists
→ no matching creator_documents row
→ POST /creator/documents/:id/publications
→ backend SELECT finds no row
→ 404 / publication cannot complete
```

This is the highest priority defect because all visual polish sits above a path that may not produce a public object.

**Required correction:**

1. Add a shared client contract for `POST /creator/documents` and conditional update.
2. On first durable save, create the server row and store `{documentId, lockVersion, documentHash, headRevision}` locally.
3. Autosave material changes using `If-Match: <lockVersion>`.
4. Resolve `409` as an explicit version conflict; never overwrite silently.
5. Before publish, flush local changes and wait for the saved server acknowledgment.
6. Submit `expectedLockVersion` and `expectedDocumentHash` in the publish command.
7. The server must compare those expectations inside the same transaction that creates the publication.

**Acceptance gate:** create a Poster from a clean account, kill and restart the app twice, resume the draft, publish, and prove the public projection references the exact stored hash the preview rendered.

### 5.2 P0 — publication command and stored document can diverge

**Evidence grade: A — release blocker**

The client currently sends `revision: 0`. The backend allocates `head_revision + 1`. The server reads stored `document_json` while the command can also contain a `compositionDocument`; there is no enforced equality between:

- last client preview hash;
- saved server document hash;
- command revision/hash;
- media receipt set;
- public projection revision.

That permits a theoretically valid command to publish a stale server document or to validate media against two representations that do not describe the same authored state.

**Required invariant:**

```text
hash(previewed client document)
= hash(acknowledged server document)
= publishCommand.expectedDocumentHash
= creator_revisions.document_hash
= public projection source_hash
```

The transaction must reject a mismatch with a typed `DOCUMENT_CHANGED` response containing current server metadata, not a generic error.

### 5.3 P0 — scheduled publication cannot complete reliably

**Evidence grade: A — release blocker**

The schedule route correctly stores a server-owned due time and publish command. The worker execution path is not closed:

- the documented production topology disables background workers in the API and starts a standalone worker;
- the standalone `sweepScheduledPublications(reason)` call has no Fastify app;
- `executeScheduledPublication` deliberately returns `Publication orchestrator not available in standalone worker — retrying`;
- the inline `executeScheduledPublicationViaApp` path calls `app.inject` without `payload`/`body`, although the publication route parses the request body as the publish command.

The user can therefore receive a truthful “scheduled” save while the content never becomes published at its due time.

**Required correction:** extract a `publishCreatorDocumentTransaction` application service with no HTTP dependency. Both the route and worker must call the same service with an authenticated actor/service context. Do not use `app.inject` as the business-logic boundary.

**Required schedule state machine:**

```text
draft → scheduled → claimed → publishing → published
                         ↘ retryable_failed → scheduled
                         ↘ terminal_failed
scheduled → cancelled
scheduled → rescheduled(version + 1)
```

Every transition needs persisted timestamps, version ownership, idempotency, and user-facing recovery.

### 5.4 P0 — authored aspect ratio is incorrect at capture

**Evidence grade: A — release blocker**

`frontend/src/creator/CreatorCamera.tsx` currently defines:

```ts
const authoredAspectRatio = isPoster ? 3 / 4 : isVisualSearch ? undefined : 9 / 16;
```

The canonical contract and tests use:

- Poster: `9:16` (`0.5625` width/height)
- Look: `4:5` (`0.8` width/height)

The camera mapping is therefore wrong for both modes. This alone prevents pin-to-pin framing parity.

**Required correction:** derive geometry from one shared `CreatorFormatContract`, not conditionals duplicated across camera, editor, serializer, viewer, and backend.

### 5.5 P0 — Poster full-bleed editor uses physical-screen geometry

**Evidence grade: A — release blocker**

`PosterComposerScreen.tsx` sets full-bleed canvas height to `screenHeight`; non-full-bleed content uses authored aspect ratio. The same document can therefore occupy a different coordinate space depending on layer content and device dimensions.

Consequences:

- focal point and crop differ between devices;
- text/sticker normalized positions can render differently;
- edit preview can differ from export;
- the viewer may not reproduce the editor;
- screenshot comparison is unstable.

**Required correction:** keep one immutable authored coordinate system. Fit that authored canvas into the physical viewport with letterboxing/controlled crop at the presentation layer. Full-bleed describes media fit inside the authored canvas; it must not redefine the canvas.

### 5.6 P0 — exact media receipt coverage is asymmetric

**Evidence grade: A — release blocker**

The backend's exact-coverage validator walks media-bearing references from stored and command documents. The client builds `expectedMedia` only from `media` layers whose primary `mediaUri` is remote and has a finalization ID.

Potentially omitted references include:

- video thumbnails/posters;
- product or Look snapshot imagery embedded in composition payloads;
- other media-bearing fields the server walker recognizes;
- derived canonical assets.

This produces `MEDIA_COVERAGE_MISMATCH` for legitimate rich documents or incentivizes weakening the backend validator. The backend validator is the correct direction; the client contract must become complete.

**Required correction:** place the media-reference walker in a shared package used by frontend serialization and backend validation. Generate receipts from that canonical walker after every local URI has been resolved. The server independently re-walks and compares; shared code reduces drift but does not replace server validation.

### 5.7 P0 — multipart upload is not equivalent to single PUT

**Evidence grade: A/B — release blocker for large video**

The ordinary upload path finalizes, waits for a publishable media asset, and returns a canonical URL. The multipart branch records `finalizationId` and returns `remoteUrl`, but does not establish the same `mediaAssetId`/processing/canonical URL guarantees before handing control back to publication.

This creates size-dependent behavior: a small asset can be publication-ready while a large asset can reach publish with an uncanonical or still-processing reference.

**Required correction:** both upload transports must converge on one result type:

```ts
type PublishableUploadReceipt = {
  uploadId: string;
  finalizationId: string;
  mediaAssetId: string;
  canonicalUrl: string;
  sha256: string;
  mimeType: string;
  byteLength: number;
  width?: number;
  height?: number;
  durationMs?: number;
  moderationState: 'accepted';
  processingState: 'ready';
};
```

No path may return a publish receipt before this invariant is true.

### 5.8 P0 — publication attempt recovery is memory-only

**Evidence grade: A/B — release blocker for ambiguous outcomes**

`CreatorPublishSheet` stores the attempt ID in `useRef`. It can query an ambiguous result while the component remains mounted, but process death, navigation teardown, or an OS kill loses the only lookup key.

**Required correction:** persist an attempt record before sending the request:

```text
attemptId, documentId, expectedHash, destination, state,
requestStartedAt, lastCheckedAt, targetId?, failureCode?
```

On app launch and creator entry, reconcile all `sending`/`unknown` attempts. A timeout or connection loss after request dispatch must render **“Result unknown — Check publication”**, not success and not a blind retry. Reuse the same idempotency key until a definitive result exists.

### 5.9 P0/P1 — Close Friends is fail-closed but migration UX is incomplete

**Evidence grade: A**

The publish UI only exposes Public and Private, and the backend rejects a tampered `closeFriends` command. This is a correct improvement. Existing documents with `closeFriends` are silently coerced to Private by the client, however.

**Required correction:** perform an explicit draft migration and show a one-time, non-alarming message: “This draft was changed to Private because Close Friends is not available.” Persist that migration so it is not repeated.

### 5.10 P1 — media selection requests broader access than necessary

**Evidence grade: A**

`MediaBrowserSheet` is a custom `expo-media-library` browser. It requests library access and separately owns a camera permission path. Modern platform guidance supports privacy-preserving system pickers:

- iOS PHPicker runs out of process and can select without broad Photo Library permission;
- Android Photo Picker grants selected-media access and supports persisted URI permission for longer-running upload.

**Required hierarchy:**

1. system picker for ordinary single/multi selection;
2. limited-library expansion when the user explicitly chooses “Manage access”;
3. custom in-app asset browser only when a product requirement truly needs it;
4. one camera permission owner at the camera boundary.

### 5.11 P1 — state ownership remains fragmented

**Evidence grade: A/B**

Poster has moved some sheet ownership into `useActiveSheet`, but still retains parallel flags for templates, preview, safe zone, and frame tray. Look retains many independent `show*` booleans. These combinations permit impossible or layered states and make Back behavior brittle.

Use a reducer/statechart with mutually exclusive primary modes:

```text
editing
├─ idle
├─ selectingLayer
├─ editingText
├─ choosingAsset
├─ adjustingMedia
├─ linkingProduct
├─ choosingTemplate
├─ arrangingFrames
└─ previewing

publishing
├─ review
├─ uploading
├─ processing
├─ committing
├─ scheduled
├─ success
├─ knownFailure
└─ unknownOutcome
```

### 5.12 P1 — frame navigation contradicts `Design.md`

**Evidence grade: A**

`Design.md` requires floating page dots for multi-frame Posters and explicitly rejects a bottom frame strip as the persistent navigation model. `PosterComposerScreen` still renders a `FrameTray`, reachable from multiple controls. That duplicates navigation and consumes canvas space.

Use page dots as persistent location. Open a temporary frame organizer only for reorder/duplicate/delete; dismiss it back to the exact current frame.

### 5.13 P1 — creator components are too large to iterate safely

**Evidence grade: A**

Approximate current sizes:

- `CreatorAssetPicker.tsx`: 4,485 lines;
- `CreatorCanvas.tsx`: 2,953 lines;
- `PosterComposerScreen.tsx`: 3,246 lines;
- `LookComposerScreen.tsx`: 2,140 lines.

Line count is not itself a quality metric, but these files combine orchestration, geometry, gestures, rendering, permission behavior, tool surfaces, and state transitions. That obscures ownership and makes visual fixes regress functionality.

Refactor by responsibility, not by creating wrapper layers:

- `useCreatorSession` — document/save/recovery lifecycle;
- `CreatorViewport` — authored-to-device transform only;
- `CreatorGestureCoordinator` — gesture arbitration;
- `CreatorToolState` — mode reducer;
- `CreatorMediaResolver` — local-to-canonical receipts;
- format-specific Poster/Look composition components;
- small, direct tool surfaces with no generic “container wrapper” hierarchy.

### 5.14 P1 — motion is improved but not fully restrained

**Evidence grade: A/C**

Reduced-motion support is much broader. Remaining creator examples still deserve product review:

- collage cells stagger and scale from `0.8` on mount;
- progress segments scale to `1.4` on completion;
- loading progress repeats opacity motion indefinitely;
- viewer entrance uses spring motion.

These are not automatically defects, but the default should be continuity, not spectacle. For a serious creator:

- use no per-cell entrance cascade after the first editor load;
- use a quiet color/fill transition for frame completion;
- limit continuous loading motion and provide a stable reduced-motion fallback;
- reserve spring for direct manipulation or mode selection, not every mounted object.

---

## 6. Original Poster/Look report implementation matrix

| Original requirement | Current status | Validation |
|---|---:|---|
| Validate structure before upload | **PASS** | `validateDocumentStructure` precedes upload. |
| Validate publishability after upload | **PASS** | `validateForPublish` runs on the resolved working document. |
| Canonical server document create/save | **FAIL** | Backend exists; active frontend lifecycle is absent. |
| Conditional save / conflict handling | **FAIL** | No active `If-Match` client integration before publish. |
| Stored document and command convergence | **FAIL** | No enforced expected hash/version; revision remains `0`. |
| Hide unsupported Close Friends | **PASS/PARTIAL** | Hidden and rejected server-side; old drafts silently downgrade. |
| Exact receipt coverage | **PARTIAL** | Strong server validator; incomplete client receipt generation. |
| Processing gate | **PASS FOR ORDINARY PUT** | Finalization waits for canonical publishable media. |
| Multipart parity | **FAIL/PARTIAL** | Does not converge to the same publishable receipt guarantees. |
| Shared creator schema | **PARTIAL** | Similar shapes exist, but frontend/backend walkers and validation can drift. |
| Publication attempt persistence | **PARTIAL** | Server idempotency exists; client key is memory-only. |
| Unknown-outcome recovery | **PARTIAL** | Mounted lookup exists; durable relaunch recovery is absent. |
| Edit/revision/remix | **PARTIAL** | Backend revision/remix foundations exist; end-to-end UX proof is absent. |
| Permission ownership | **PARTIAL** | Camera/import paths still own permissions separately. |
| System media picker | **FAIL** | Broad custom media-library browser remains primary. |
| Server schedule + worker | **FAIL** | Row creation exists; execution path is broken in both standalone and inline variants. |
| Authored aspect geometry | **FAIL** | Camera mapping and Poster full-bleed viewport violate the contract. |
| One editor surface | **PARTIAL** | Tool consolidation improved; frame tray and parallel sheets remain. |
| Complete native state matrix | **NOT CERTIFIED** | No native render evidence; static and test gates are red. |
| Flagship parity | **NOT CERTIFIED** | No authenticated benchmark captures or device comparison. |

The correct overall evaluation of the original report is **partially implemented, with release-blocking contract gaps**.

---

## 7. V2 report validation — issue-by-issue

| # | V2 issue | Status at audited HEAD | Notes |
|---:|---|---:|---|
| 1 | SellerHub money formatting typo | **PASS** | Corrected. |
| 2 | Inventory list virtualization | **PASS** | Main inventory list uses `FlashList`; small horizontal controls need not be virtualized. |
| 3 | Fabricated bundle shipping/tiers | **PASS** | Fabricated values removed. |
| 4 | Unsupported “3x more likely” claim | **PASS** | Removed. |
| 5 | Fabricated Apple/Google brand marks | **PARTIAL** | Text/icon usage remains. Real payment branding should use official/native platform controls, never a generic icon approximation. |
| 6 | OrderReceipt `t` naming collision | **PASS** | Theme variable naming corrected. |
| 7 | Review eligibility / `hasReview` | **PASS** | Connected to actual state/hook. |
| 8 | Notification action | **PASS** | Wired. |
| 9 | Unsupported live-shopping preference | **PASS** | Removed. |
| 10 | Closed-support tone | **PASS** | Neutralized. |
| 11 | “← information” UI | **PASS** | Corrected. |
| 12 | Raw internal asset IDs | **FAIL** | Co-own recurring orders and tax documents still expose raw IDs. Use human-readable item/order labels and a copyable reference only in support detail. |
| 13 | Buyout `any` / type safety | **PARTIAL/FAIL GLOBALLY** | The specific area improved, but the source tree still contains 327 explicit `any` matches across 134 files. |
| 14 | MultiPhotoCollage interaction | **PARTIAL** | Long-press actions and reduced motion exist, but entrance cascade and discoverability need native review; drag/reorder parity is not proven. |
| 15 | PosterProgressSegments pulse | **PARTIAL** | No constant success pulse, but completion scales to `1.4` and loading repeats. Restraint needs visual review. |
| 16 | PosterViewer theme | **PASS/PARTIAL** | Theme tokens are used; multiple hardcoded RGBA scrims remain purposeful media-contrast values but should be centralized into scrim tokens. |
| 17 | Sticker vote closure | **PASS** | Current-ID/ref handling appears corrected. |
| 18 | Outfit background/theme consistency | **PASS** | Centralized/themed improvement present. |
| 19 | Help article behavior | **PASS** | Articles expand in-product rather than pretending to navigate. |
| 20 | Co-own eligibility authorization | **FAIL — TRUST P0** | `checkCoOwnEligibility` reads frontend Zustand flags. It is not server-evidenced compliance and must not authorize a financial action. |

### Critical V2 trust correction

The local co-own eligibility function is worse than a visibly disabled placeholder because it can look authoritative while relying on client-owned flags. Eligibility must be returned by an authenticated server decision with reason codes, policy version, evaluation timestamp, and expiry. The final money mutation must re-evaluate authorization transactionally; the UI check is advisory, never authoritative.

---

## 8. V3 report validation

V3 accurately records a meaningful cleanup wave, but it crosses the line from “changes made” into unsupported certification.

### Valid or directionally valid V3 claims

- frontend TypeScript is currently clean;
- many typography and token migrations landed;
- theme awareness and reduced-motion coverage improved;
- multiple dead controls and fabricated claims were removed or connected;
- the creator publication backend gained substantial validation and idempotency foundations.

### Invalid or unsupported V3 claims

1. **“Type-safe, no `any`.”** A clean TypeScript build does not mean absence of `any`; 327 explicit matches remain.
2. **Anti-AI design “PASS.”** No native before/after captures or thumbnail/squint artifacts support that claim.
3. **Full state coverage.** No screen-by-screen executed state matrix is attached, and creator scheduling/recovery are incomplete.
4. **Numeric zero metrics as proof of quality.** Regex counts can establish narrow residue facts; they cannot establish composition, hierarchy, truthfulness, state closure, or platform feel.
5. **Completion by breadth.** Mechanical edits across many screens do not close the highest-risk user journeys unless those journeys are exercised end to end.

V3 should be retained as a historical implementation log, not used as a release sign-off.

---

## 9. V5 report validation and metric reconciliation

### 9.1 Recounted metrics

Counts below are lexical matches at audited HEAD unless otherwise stated. A lexical match is not automatically a component, screen, or behavior.

| V5 claim | Recount | Verdict |
|---|---:|---:|
| `TypographyV2` 11,104 usages | 10,445 matches / 648 files | **INACCURATE** |
| `ConfirmationSheet` 185 usages | 177 matches / 60 files | **INACCURATE** |
| `useAppTranslation` 56 | 56 matches / 15 files | **COUNT MATCHES; INTERPRETATION OVERSTATED** |
| `useReducedMotion` 679 usage sites | 679 matches / 229 files | **COUNT MATCHES; NOT 679 SCREENS/SITES** |
| `FlashList` 314 usages | 294 matches / 74 files | **INACCURATE** |
| `useShallow` 12 | 12 matches / 3 files | **COUNT MATCHES** |
| Zero raw numeric `fontSize` in `.tsx` | 0 | **PASS** |
| Zero legacy `Type.*` | 13 source matches / 4 files, excluding tests | **FAIL** |
| Zero hex-alpha token concatenation | 24 matches / 12 files | **FAIL** |
| Zero `springify().duration()` | 0 | **PASS** |
| Zero actual `Alert.alert` | Not contradicted by the focused scan | **LIKELY PASS** |
| Zero dev annotations | 45 TODO/FIXME/HACK/ts-ignore matches / 30 files | **FAIL** |
| Zero P0 dead controls | Runtime blockers and local-only compliance remain | **FAIL** |
| All visual gates passed | Current visual gate exits non-zero | **FAIL** |
| WCAG AA achieved | No executed contrast/a11y report attached | **UNSUPPORTED** |
| Thumbnail and squint tests passed | Empty visual baseline; no captures | **UNSUPPORTED** |

### 9.2 Why the metrics drifted

Likely causes include:

- counting imports, comments, declarations, tests, and uses as equivalent “usage sites”;
- counting before later consolidation/cleanup changed totals;
- using different globs or including generated/test files inconsistently;
- reporting intended outcomes rather than re-running release commands at final HEAD;
- treating absence of one code pattern as proof of user-experience quality.

### 9.3 Required metric protocol for V6

Every numeric claim must include:

```text
snapshot SHA
working directory
exact command
file glob and exclusions
whether the count is matches, lines, files, components, or screens
exit code
captured output artifact
```

Example:

```powershell
rg -n --glob '*.tsx' 'fontSize\s*:\s*[0-9]' frontend/src
```

Report `0 matches across 0 files`, not “the entire app is fully tokenized.” The first is measurable; the second requires broader evidence.

### 9.4 V5 final assessment

V5 is valuable as an inventory of mechanical improvements. It must be amended to remove or qualify:

- “all screens” language;
- visual parity claims without captures;
- accessibility certification without executed evidence;
- zero-residue claims contradicted by the current tree;
- completion language while full tests, backend build, visual gates, and residue gates fail.

---

## 10. Flagship product model: one continuous creator, not a stack of sheets

The shallow/overdone feeling comes from a mismatch between **visual busyness** and **product depth**. A screen can show many chips, cards, labels, rails, and animated states while still withholding the capabilities users expect: deterministic crop, durable drafts, media order, source attribution, exact preview, visibility truth, scheduling confidence, recovery, and revision.

The flagship composition should have four persistent layers only:

1. **Content canvas** — the dominant object; real media supplies the color.
2. **Transparent navigation** — Back/Close and one restrained completion action.
3. **Context rail** — at most four tools relevant to the current selection, then More.
4. **Transient task surface** — exactly one picker/editor/review sheet at a time.

Everything else should be contextual, temporary, or absent. This obeys the anti-AI surface budget: no card-on-card editor, no label for every obvious icon, no duplicated frame controls, no permanent instructional paragraphs.

### Psychology principles

| Principle | Product implication |
|---|---|
| **Direct manipulation** | Transform the selected media/text on the canvas; do not make users edit abstract numeric fields unless they choose precision controls. |
| **Recognition over recall** | Show actual recent media, actual product imagery, and visual text styles; do not rely on named presets alone. |
| **Progressive disclosure** | Keep crop, focal point, duration, link metadata, and advanced accessibility fields available but contextual. |
| **Commitment gradient** | Capture is effortless; metadata appears after a useful composition exists; irreversible publication gets a deliberate review. |
| **Loss aversion** | Autosave visibly but quietly; confirm only destructive loss; preserve originals and reversible edit history. |
| **Peak-end effect** | The final preview and successful return to the published object matter more than decorative entrance motion. |
| **Trust through legibility** | Distinguish uploading, processing, saving, scheduled, published, failed, and unknown; do not collapse them into a generic spinner/check. |
| **Object primacy** | Media, products, people, and place/source identity lead; UI chrome recedes. |
| **Choice architecture** | Default to the last safe visibility/destination, expose consequences inline, and avoid unsupported options. |

---

## 11. Screen-by-screen pin-to-pin upgrade specification

### 11.1 Creation entry

**Objective:** enter capture immediately without a generic “choose how to begin” lobby.

**Composition**

- full-screen live camera or last-authorized system-picker preview;
- transparent 44pt targets with 20–24pt glyphs;
- mode selector anchored near the shutter: Look / Poster, not a large segmented dashboard panel;
- recent-media thumbnail as the picker entry;
- no duplicated title or explanatory subtitle.

**Behavior**

- preserve the last capture mode only if it is safe and comprehensible;
- ask for camera permission only after the user chooses camera;
- if denied, keep import fully usable and offer Settings as a secondary action;
- mode change updates the authored viewport mask from the shared format contract;
- the camera preview, crop guide, and captured crop use identical transform math.

**States**

- permission undecided, denied, restricted, camera unavailable, capture processing, storage pressure, import available, offline.

**Acceptance**

- no permission prompt at route mount;
- first useful camera/import action visible without scroll;
- physical capture compared against output on small iPhone, large iPhone, and representative Android at <1 px normalized-coordinate drift.

### 11.2 System media picker and asset handoff

**Objective:** provide privacy-preserving, fast selection with stable handoff to long uploads.

**Behavior**

- system picker first;
- ordered multi-select for Poster frames;
- display selection order directly on thumbnails when the platform supports it;
- persist Android URI permission before background upload;
- copy/import assets into app-owned durable storage when required;
- retain metadata needed for orientation, color space, dimensions, duration, and focal handling;
- never treat a temporary picker URI as a durable published URL.

**Handoff state**

```text
selected → importing → locally durable → probing → editor-ready
          ↘ permissionLost
          ↘ unsupported
          ↘ importFailed(retry/remove)
```

### 11.3 Poster editor

**Objective:** authored media first, minimal persistent controls, precise multi-frame continuity.

**Composition**

- immutable 9:16 authored canvas fit into the safe viewport;
- transparent top controls: Close/Back, undo/redo, Done;
- page dots for frame position;
- bottom context rail: up to four tools plus More;
- no persistent frame strip;
- real media fills the authored canvas; utility chrome visually recedes;
- safe zones appear only while moving/resizing or when explicitly toggled.

**Core tools**

- text, media, product link/tag, draw/sticker as the primary four based on current scope;
- More contains templates, background, timing, accessibility text, frame organizer, and advanced link/source controls;
- tools change when a layer is selected: Replace, Crop, Adjust, Remove—not a second global rail.

**Frame organizer**

- transient surface for reorder, duplicate, duration, and delete;
- thumbnails reproduce the authored crop;
- destructive deletion is undoable immediately;
- current frame remains anchored after dismiss.

**Precision and accessibility**

- alignment guides, edge snap, center snap, safe-zone snap;
- explicit layer order and accessible reading order;
- text alternative per meaningful image/frame;
- dynamic type affects editor chrome, not authored text geometry;
- VoiceOver/TalkBack can select a layer and invoke move/order/delete actions without canvas gestures.

### 11.4 Look editor

**Objective:** make the outfit/product story the dominant object, with products and provenance integrated rather than added as badges.

**Composition**

- immutable 4:5 authored canvas;
- product tags appear as restrained anchored dots only when visible/selected;
- a selected tag opens one bottom task surface with real product identity, price state, availability, and remove/replace;
- source and creator identity remain available without crowding the canvas;
- no decorative trust badges unless server-evidenced.

**Product linking**

- search existing owned/saved/listed products;
- scan/import only through truthful extraction states;
- tag location uses normalized authored coordinates;
- server resolves product availability at publish and viewer time;
- missing or private product becomes a typed warning with remove/replace, never a fabricated card.

**Curation quality**

Corner's public product positioning reinforces the value of deliberate curation, lists, identity, and social provenance. Apply that principle to Looks: a Look is not merely an image with hotspots; it is an authored collection with who/why/source context that can be revisited and remixed.

### 11.5 Canvas and gesture engine

**Objective:** deterministic, conflict-free direct manipulation.

**One coordinate system**

```text
document space: normalized 0..1 in authored aspect ratio
viewport space: contain/fitted authored canvas
media space: focal transform inside document bounds
export space: deterministic scale of document space
```

**Gesture priority**

1. selected-layer handles;
2. selected-layer transform;
3. canvas frame navigation;
4. sheet gesture;
5. route dismiss gesture.

Use simultaneous/exclusive gesture relationships deliberately. A media tap selects; it never accidentally dismisses the viewer. A drag beginning on a resize handle never pages to the next frame.

**Undo model**

- every user-visible mutation is a command with inverse data;
- coalesce continuous gestures into one undo step;
- autosave occurs after gesture settlement, not every pointer tick;
- undo/redo predicts its target through accessible labels such as “Undo move text.”

### 11.6 Publish review

**Objective:** provide the confidence of a final proof, not another settings dashboard.

**Composition**

- large exact preview at authored aspect;
- destination, visibility, expiry/schedule, and accessibility summary in flat rows separated by hairlines;
- one dominant Publish or Schedule action;
- Edit returns to the same frame/selection context;
- advanced metadata appears only on demand.

**Preflight order**

```text
structural validation
→ durable document save
→ local media upload
→ media processing/moderation
→ canonical receipt coverage
→ document re-save with canonical media
→ hash/version acknowledgment
→ exact preview render
→ publish/schedule transaction
```

**Truthful states**

- `Saving draft…`
- `Uploading 2 of 4…`
- `Preparing video…`
- `Checking media…`
- `Publishing…`
- `Scheduled for <local date/time + timezone>`
- `Published`
- `Couldn't publish — Retry`
- `Result unknown — Check publication`

Never display a generic 100% progress state before the transaction commits.

### 11.7 Upload/recovery surface

**Objective:** keep creation durable when the user backgrounds or leaves.

- upload jobs live outside component memory;
- status is keyed by document and asset receipt;
- background continuation follows platform constraints;
- user may leave after durable local save;
- a compact creator activity row reports processing/scheduled/failed/unknown items;
- retries preserve the same upload or publication identity when the outcome is ambiguous;
- removal clearly distinguishes removing from the draft from deleting a remote asset.

### 11.8 Published viewer

**Objective:** media dominates; interactions are discoverable and restrained.

- exact authored crop reproduced;
- progress segments indicate multi-frame position without decorative pulsing;
- product tags are temporarily revealable and do not obstruct the story;
- pause/play and mute state are explicit for video;
- Close/Back behavior matches presentation style;
- loading skeleton uses the final geometry;
- failure preserves creator identity and offers retry;
- unavailable product tags disappear or show an evidenced unavailable state;
- reduced motion replaces automatic progress motion with stable state where necessary.

### 11.9 Edit, revision, and remix

**Objective:** close the lifecycle after publication.

- metadata-only edits and composition edits are distinct;
- media/composition edits create a new immutable revision;
- the public target changes atomically to the accepted revision;
- a conflict shows who/what changed and supports reload or duplicate—not silent overwrite;
- remix creates a new owned document with provenance to the source;
- permissions are server-enforced and fail closed;
- deletion/takedown preserves required audit data without leaving public content reachable.

---

## 12. Backend target architecture

### 12.1 Shared packages

Create one versioned creator-contract package containing:

- format contract (`poster@1`, `look@1`);
- document schema and migrations;
- normalized geometry types;
- media reference walker;
- stable canonical JSON/hash function;
- publish command/result/error union;
- revision and schedule state types.

The backend remains authoritative. Sharing parsing/walking code prevents accidental drift but does not authorize trusting the client.

### 12.2 Application services

Routes and workers should be thin adapters around:

```text
CreatorDocumentService
CreatorMediaService
CreatorPublicationService
CreatorScheduleService
CreatorRevisionService
CreatorAuthorizationService
```

The core publication method receives an actor context, document ID, expected version/hash, receipts, destination, audience, and idempotency key. It performs all checks and writes transactionally. HTTP routes and background workers call the same method.

### 12.3 Minimum API contract

```text
POST   /creator/documents
GET    /creator/documents/:id
PUT    /creator/documents/:id          If-Match required
POST   /creator/documents/:id/publish  Idempotency-Key required
GET    /creator/publication-attempts/:id
POST   /creator/documents/:id/schedules
PATCH  /creator/schedules/:id          If-Match/version required
DELETE /creator/schedules/:id
GET    /creator/documents/:id/revisions
POST   /creator/documents/:id/remix
```

### 12.4 Transactional publication invariant

Inside one transaction:

1. lock the document and attempt key;
2. authorize ownership and destination;
3. compare expected lock version and document hash;
4. parse/migrate the stored document;
5. walk all media references;
6. verify exact receipt coverage, ownership, MIME, digest, moderation, and readiness;
7. validate products/privacy/visibility;
8. write immutable revision;
9. write or update the public projection;
10. write publication attempt outcome and outbox events;
11. advance document status/head revision;
12. commit;
13. dispatch asynchronous notifications from the outbox.

No external notification or feed side effect should occur before commit.

### 12.5 Scheduling invariant

Scheduling must pin:

- document hash/version;
- command version;
- asset receipts;
- audience/destination;
- due time in UTC plus user's source timezone for display/audit;
- schedule version;
- idempotency key namespace.

At execution, decide product behavior explicitly:

- **Pinned revision:** publish exactly what the user reviewed; later edits require reschedule confirmation.
- **Latest revision:** risky and surprising; not recommended.

Use pinned revision. If a linked product or media asset becomes invalid, fail with a visible reason and recovery action.

### 12.6 Privacy and authorization

- every document query scoped to owner/authorized collaborator;
- media receipts verified as owned or explicitly licensed;
- private drafts never leak through feed/search/analytics projections;
- public visibility cannot be inferred from a missing value;
- close-friends remains unavailable until a real membership graph and privacy projection exist;
- product/compliance/trust signals render only from backend evidence.

### 12.7 Observability

Emit structured events for:

```text
creator.document.created
creator.document.save_conflict
creator.media.upload_started/completed/failed
creator.media.processing_ready/rejected
creator.publish.started/committed/unknown/failed
creator.schedule.created/claimed/retried/published/terminal_failed
creator.revision.created
creator.remix.created
```

Include correlation IDs, document ID, attempt ID, schedule ID/version, format version, latency bands, and typed failure code—never private caption/media content.

---

## 13. Anti-AI design enforcement for this surface

### 13.1 Remove these tells

- frame tray plus page segments plus tool rail all visible together;
- explanatory labels under obvious icons;
- equal rounded containers for every publish setting;
- decorative gradients behind non-media utility surfaces;
- multiple sheet styles and radii in one flow;
- generic “success” check before a server commit;
- staggered mount animations across every selected photo;
- grey placeholder media as the dominant editor story;
- settings shown because the schema has fields, rather than because the user needs them now.

### 13.2 Keep these authored qualities

- one dominant image/canvas;
- intentional asymmetry driven by the content;
- flat utility structure with hairlines;
- two non-avatar radius roles maximum in a viewport;
- transparent Back/Close/overflow hit targets;
- a single icon family and optical size band;
- exact media crop and focal handling;
- quiet typography with no duplicate heading;
- state-specific language;
- reversible direct manipulation;
- real source/product/creator identity rather than decorative badges.

### 13.3 Surface budget by viewport

| Viewport | Persistent non-media surfaces | Maximum visible type sizes | Persistent tool count |
|---|---:|---:|---:|
| Camera | 0 panels; transparent chrome only | 2 | mode + capture essentials |
| Poster editor | 0 dominant panels; 1 tool rail | 3 | 4 + More |
| Look editor | 0 dominant panels; 1 tool rail | 3 | 4 + More |
| Publish review | 1 preview object; flat setting rows | 3 | 1 primary + restrained edit |
| Viewer | 0 panels; media contrast scrims only | 3 | essential playback/close/actions |

---

## 14. Benchmark-derived product insights

### 14.1 Pinterest

Official Pinterest creator guidance supports the following current capabilities and constraints:

- image/video creation with text and stickers;
- links, boards, topics, descriptions, and product tags;
- up to five product tags in the documented Pin flow;
- pre-publication review;
- scheduling for eligible/business contexts;
- recommended 2:3 standard Pin geometry (1000×1500), with taller content subject to feed cropping;
- media/content itself is not necessarily editable after publication even when metadata is.

**ThryftVerse implication:** publishing settings must be deep enough to support destination, discovery, product links, alt text, timing, and exact preview, but they must be progressively disclosed. A Poster's 9:16 immersive viewer and feed thumbnail need separate, deterministic preview modes; do not pretend one crop serves both.

### 14.2 Coinbase

Coinbase's public design system emphasizes cross-platform consistency, TypeScript-first APIs, accessibility, theming, and explicit component contracts.

**ThryftVerse implication:** the transferable quality is not finance styling. It is state legibility and system discipline. Creator controls must use the same token, interaction, accessibility, and state grammar across iOS and Android, while publication and scheduling expose precise outcomes rather than celebratory ambiguity.

### 14.3 Corner

Corner's public App Store description centers saving/curating places, organizing lists, personalized maps, and sharing/following friends.

**ThryftVerse implication:** curation feels premium when objects retain identity, organization, provenance, and social context. Looks should support purposeful collections and source identity, rather than treating the final artifact as a generic collage.

### 14.4 Instagram and Snapchat benchmark principles

Without claiming inaccessible screen measurements, the relevant benchmark qualities are:

- immediate camera/media entry;
- direct manipulation on a dominant canvas;
- minimal persistent chrome;
- strong draft continuity;
- fast, reversible edits;
- clear multi-item position;
- preview that matches published output;
- resilient media processing;
- content, not cards, as the visual system.

ThryftVerse should exceed those references in commerce truthfulness, product provenance, accessibility, revision safety, and unknown-outcome recovery.

---

## 15. Authenticated Mobbin and native comparison protocol

### 15.1 Required reference captures

For each supplied app, collect the same approximate viewport width and record:

**Pinterest**

1. create entry;
2. system/gallery selection;
3. image edit/crop;
4. text/sticker/tool state;
5. product/link metadata;
6. board/destination selection;
7. publish review;
8. uploading/published/failure state.

**Coinbase**

1. high-stakes confirmation;
2. processing/pending;
3. known failure;
4. offline/retry;
5. final receipt/detail;
6. accessibility and destructive confirmation patterns.

**Corner**

1. save/create entry;
2. object search/selection;
3. collection/list editing;
4. source/provenance treatment;
5. profile/social identity;
6. empty and populated curation states.

### 15.2 ThryftVerse native capture matrix

Capture every state in light and dark where meaningful:

| Surface | Required states |
|---|---|
| Camera | first permission, allowed, denied, restricted, capture, camera unavailable |
| Picker | empty/recent, ordered multi-select, limited access, import progress, missing asset |
| Poster | blank text path, one frame, multi-frame, media selected, text selected, frame organizer, undo/redo |
| Look | base media, product search, tag placement, unavailable product, source detail |
| Publish | saving, upload progress, processing, validation error, scheduled, success, known failure, unknown outcome |
| Viewer | image, video, multi-frame, loading, offline, missing media, removed product |
| Revision | clean, dirty, conflict, revision history, remix provenance |

Devices:

- small iPhone;
- current large iPhone/Dynamic Island class;
- compact Android;
- tall Android;
- tablet only if officially supported.

### 15.3 Measurement sheet

For every paired screenshot record:

```text
first useful content Y
canvas share of viewport
useful objects above fold
visible rounded-container count
largest visible non-media control
actual hit-target size
icon optical size/weight
number of type sizes
media crop/focal delta
sticky chrome occlusion
loading-to-final layout shift
Back/keyboard/sheet behavior
```

Then run:

- **thumbnail test:** primary media and reading order survive at 25%;
- **squint test:** content dominates and utility chrome recedes;
- **grayscale test:** hierarchy is not color-dependent;
- **large text test:** critical actions remain reachable;
- **reduced motion test:** meaning remains without movement.

No future report may mark these passed without linking the actual local artifact set and snapshot SHA.

---

## 16. Implementation sequence

### Phase 0 — restore truth and release closure

1. Correct the shared Poster/Look aspect contracts and delete duplicate conditionals.
2. Make Poster editor viewport immutable to physical device height.
3. Implement client create/save/`If-Match` lifecycle.
4. Add expected document hash/version to publish.
5. Put media reference walking in the shared contract.
6. Make multipart and ordinary upload return one publishable receipt.
7. Extract publication orchestration into a route/worker-neutral service.
8. Repair scheduled execution and add a real integration test.
9. Persist publication attempts and implement relaunch reconciliation.
10. Replace local co-own compliance authorization with server evidence.

**Exit gate:** real device → real API → real DB → real media worker → published Poster and Look, including large video and scheduled publication, with exact hashes and no mocks.

### Phase 1 — author the native creator surface

1. System picker first and one permission owner.
2. One editor state reducer/statechart.
3. Remove persistent FrameTray; use page dots plus transient organizer.
4. Enforce four tools plus More.
5. Consolidate authored viewport/gesture ownership.
6. Add product/source/alt-text depth through contextual surfaces.
7. Reduce decorative entrance/pulse motion.
8. Complete loading, empty, partial, offline, error, retry, disabled, processing, success, and unknown states.

**Exit gate:** native screenshot matrix passes the scorecard and all controls are actionable/truthful.

### Phase 2 — lifecycle and flagship differentiation

1. Revision history and conflict recovery.
2. Remix with provenance and permissions.
3. Collection/curation organization for Looks.
4. Poster feed-thumbnail versus immersive-view preview.
5. Background activity/recovery center.
6. Creator analytics based on server events, not optimistic UI.

### Phase 3 — hardening and rollout

1. Route/DB integration tests with real migrations.
2. Device visual regression baseline.
3. Performance profiles on large media/multi-frame docs.
4. Accessibility audit with screen reader and large text.
5. Offline, process-death, conflict, and unknown-outcome fault injection.
6. Feature-flag rollout with failure-rate and abandonment guardrails.

---

## 17. Required tests

### 17.1 Contract tests

- frontend/backend parse the same golden Poster and Look documents;
- format migration preserves geometry and media references;
- canonical hash is stable across platforms;
- media walker returns identical ordered references;
- unsupported visibility fails closed.

### 17.2 Route and database integration tests

- create → save → conflict → reload;
- publish missing document returns typed not-found;
- publish stale hash/version returns `DOCUMENT_CHANGED`;
- exact receipt coverage accepts complete and rejects missing/extra/foreign receipts;
- transaction rollback leaves no partial public target;
- idempotency replay returns the same result;
- ambiguous client timeout reconciles to committed/failed;
- private content never enters public projections.

### 17.3 Schedule tests

Run the real production worker adapter, not a copied helper:

- due schedule publishes once;
- cancelled and old-version claims do not publish;
- worker restart is safe;
- transient media state retries with backoff;
- terminal moderation/product failure becomes visible;
- the publish command body reaches the common service;
- outbox notification occurs after commit.

### 17.4 Media tests

- small image PUT;
- large image multipart;
- large video multipart;
- rotation/EXIF normalization;
- HEIC/unsupported conversion policy;
- digest mismatch;
- processing timeout;
- moderation rejection;
- missing thumbnail receipt;
- canonical URL persistence;
- Android persisted URI after relaunch.

### 17.5 Native interaction tests

- capture crop equals editor crop;
- editor crop equals export/viewer crop;
- keyboard never covers selected text/action;
- sheet Back dismisses the sheet before the route;
- layer gesture does not trigger page/route gesture;
- undo coalesces a transform;
- frame reorder persists;
- process death resumes draft/upload/publication lookup;
- screen-reader focus follows visible order;
- 200% text retains primary action access.

### 17.6 Tests to avoid

Do not treat these as flagship proof:

- source-string assertions that a component name exists;
- copied versions of production helper logic inside tests;
- file-count or token-count assertions;
- snapshots with no interaction/state coverage;
- frontend-only tests for server authorization;
- mocked schedule tests that never run the production handler.

---

## 18. Flagship acceptance scorecard

No visual category can receive a passing score without native evidence. The following is the current **code-informed provisional** assessment, not a visual certification.

| Dimension | Current provisional score / 4 | Target | Reason |
|---|---:|---:|---|
| Authored composition | 2 | 4 | Media-first intent exists; duplicate frame/tool surfaces remain. |
| Visual hierarchy | 2 | 4 | Cannot verify native silhouette; editor chrome remains dense. |
| First viewport usefulness | 3 | 4 | Camera-first entry is directionally strong. |
| Spacing/alignment | Not certifiable | 4 | Requires device captures. |
| Typography | 3 | 4 | Token adoption is broad; usage counts do not prove optical quality. |
| Media treatment | 1 | 4 | Incorrect geometry prevents exact art direction. |
| Interaction placement | 2 | 4 | Tool consolidation improved; state/surface duplication persists. |
| Native motion | 2 | 4 | Reduced-motion coverage improved; some motion remains ornamental. |
| State completeness | 1 | 4 | Schedule, multipart, relaunch recovery, and unknown-outcome gaps. |
| Accessibility | 2 | 4 | Many labels/hooks exist; global visual gate still reports P0 accessibility issues and no native audit exists. |
| Full-stack truthfulness | 1 | 4 | Server lifecycle/schedule and local compliance authority are blockers. |
| Performance | 2 | 4 | Virtualization adoption improved; nested lists and very large creator components remain. |

**Flagship gate:** every dimension ≥3, at least two dimensions at 4, and **full-stack truthfulness, media treatment, and state completeness must all be ≥3**. No average may hide a zero/one in a trust-critical dimension.

---

## 19. Concrete definition of done

The Poster/Look initiative is complete only when all of the following are true:

- [ ] Poster and Look use one shared, correct authored format contract.
- [ ] Capture, editor, preview, export, and viewer crops match on all supported device classes.
- [ ] Every draft is created and conditionally saved on the server before publish.
- [ ] Publish rejects stale document hash/version with a recoverable conflict.
- [ ] Every media reference has an owned, processed, accepted canonical receipt.
- [ ] Multipart and ordinary uploads have identical postconditions.
- [ ] Publish attempt identity survives navigation, process death, and relaunch.
- [ ] Unknown outcomes are reconciled without fabricated success or unsafe duplicate.
- [ ] Scheduled content is executed by the production worker topology exactly once.
- [ ] Close Friends is absent until the backend capability is real.
- [ ] Co-own/compliance authorization is server-evidenced.
- [ ] System picker is the ordinary import path; permission ownership is singular.
- [ ] One editor state machine prevents overlapping sheets/modes.
- [ ] Poster page dots are persistent; frame organizer is transient.
- [ ] Tool rail respects four tools plus More.
- [ ] Every visible control works, is truthfully disabled, or is removed.
- [ ] Full frontend tests pass or every unrelated failure is baselined and owned.
- [ ] Backend build and creator integration tests pass.
- [ ] Design-token, visual-gate, and residue scripts pass with zero P0/P1.
- [ ] Native state matrix exists for supported devices, light/dark, large text, and reduced motion.
- [ ] Authenticated reference comparison is attached without copying proprietary pixels.
- [ ] Thumbnail and squint tests have captured evidence.
- [ ] Live endpoint/DB rows and worker outcomes are recorded.
- [ ] Rollback and telemetry runbook is approved.

Until then, the honest status remains partial.

---

## 20. Source register — current official material

### Pinterest

- [Pinterest — Guide to creating Pins](https://help.pinterest.com/en/guide/guide-to-creating-pins)
- [Pinterest — Create a Pin from an image or video](https://help.pinterest.com/en-gb/article/create-a-pin-from-an-image-or-video)
- [Pinterest Business — Product specifications](https://help.pinterest.com/en/business/article/pinterest-product-specs)
- [Pinterest Business — Product tagging](https://help.pinterest.com/en/business/article/shop-the-look-product-tagging)

### Platform media and editing

- [Apple — Selecting photos and videos in iOS](https://developer.apple.com/documentation/PhotoKit/selecting-photos-and-videos-in-ios)
- [Apple Human Interface Guidelines — Photo editing](https://developer.apple.com/design/human-interface-guidelines/photo-editing)
- [Apple Human Interface Guidelines — Undo and redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo)
- [Android Developers — Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker)

### System quality and accessibility

- [Coinbase Design System](https://cds.coinbase.com/)
- [Coinbase Design System — Introduction](https://cds.coinbase.com/getting-started/introduction)
- [Coinbase Design System — API overview](https://cds.coinbase.com/getting-started/api-overview/)
- [W3C WCAG 2.2 — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)

### Corner

- [Corner: Curate & Share Places — App Store](https://apps.apple.com/us/app/corner-curate-share-places/id1668282277?platform=ipad)

### User-supplied benchmark locations

- [Pinterest iOS on Mobbin](https://mobbin.com/apps/pinterest-ios-757657c5-f7af-4a4a-a972-f33a77e77a8c?utm_source=copy_link&utm_medium=link&utm_campaign=app_sharing)
- [Coinbase iOS on Mobbin](https://mobbin.com/apps/coinbase-ios-1d0a6f78-e687-4d7b-bbff-e9abe5cd09ff?utm_source=copy_link&utm_medium=link&utm_campaign=app_sharing)
- [Corner iOS on Mobbin](https://mobbin.com/apps/corner-ios-59299513-be08-4409-95f2-9db957b978ed?utm_source=copy_link&utm_medium=link&utm_campaign=app_sharing)

The Mobbin flows must be revisited in an authenticated session for visual measurement; they were not used as unverifiable evidence in this report.

---

## 21. Final validation conclusion

The recent implementation work deserves credit for improving the codebase's design-system consistency and for building several strong backend primitives. It does not yet close the creator product.

The next highest-quality move is **not another global codemod or another completion report**. It is a narrow, senior-owned closure pass on the Poster/Look golden path:

```text
correct geometry
→ durable server document
→ canonical media receipts
→ hash-bound publication
→ executable scheduling
→ durable unknown-outcome recovery
→ native authored UI pass
→ real device/reference evidence
```

Once those invariants are true, visual iteration will stop fighting architectural uncertainty. The editor can then become quieter, faster, and more authored because every visible state maps to a real system state. That is the point at which “1:1 pin-to-pin quality” becomes attainable rather than cosmetic.

**Final implementation status:** `PARTIAL — INTERACTION FAILURES REMAIN`  
**Final report status:** `COMPLETE — VALIDATION AND UPGRADE SPECIFICATION DELIVERED`  
**Native status:** `NATIVE DEVICE VALIDATION PENDING`  
**Live endpoint status:** `LIVE ENDPOINT VALIDATION PENDING`
