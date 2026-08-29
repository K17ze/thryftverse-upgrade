# ThryftVerse Poster + Look Editor and Upload — Flagship Research and Upgrade Blueprint

**Research date:** 29 August 2026

**Research cutoff:** 29 August 2026

**Repository baseline:** feat/product-detail-contract-media-device-closure at 60aabc49f6233c3a6cf73ec394e0a91f2b0a4d61

**Scope:** Native mobile Poster creation, Look collage creation, media selection/capture, editing, draft recovery, upload/finalization, publishing, and rendered-viewer parity

**Primary internal specification:** Design.md

**Benchmark set:** Instagram and Meta Edits, Snapchat, Pinterest Pins and Collages, Apple platform guidance, Android Photo Picker and Media3

**Deliverable type:** Research and implementation plan only. This document does not claim that the proposed product changes have been implemented or device-validated.

**Repository-state note:** The audit began at HEAD 60aabc49f6233c3a6cf73ec394e0a91f2b0a4d61 in an already heavily modified worktree. The branch HEAD moved externally during report creation; cited findings describe the inspected working-tree implementation, and no pre-existing product changes were modified by this report task.

---

## 1. Executive conclusion

ThryftVerse does not primarily have a missing-feature problem. It has a **capability abundance, product convergence, and media-truth problem**.

The current creator department contains an unusually wide range of tools: camera effects, multi-capture, text, drawing, stickers, cutout, templates, layouts, filters, keyframes, transitions, speed curves, reverse, freeze frame, audio fades, product tags, drafts, preview, publish history, resumable upload, composition documents, and transactional publication. That breadth is real. The normal local-media creation path, however, is not currently end-to-end publishable: local URI validation runs before upload, and the client does not create/save the server creator document required by the canonical publication route. This is the most important finding in the report.

The breadth also explains why the product can feel shallow and overdone simultaneously:

- individual capabilities exist, but the creative journey does not always feel like one authored interaction;
- several surfaces still expose capabilities that the backend silently translates into weaker semantics;
- the editor code is split across oversized orchestration files and partially extracted duplicate systems;
- the upload path is stronger than the UI communicates, while processing and moderation are weaker than the UI promises;
- comments repeatedly assert benchmark parity, but benchmark quality is a felt property of continuity, response, defaults, output fidelity, and recovery—not a count of tools;
- Poster and Look share too much implementation shape while still duplicating orchestration, leaving neither experience as opinionated as its job requires.

The target is not a smaller feature set in absolute terms. It is a **lower floor, wider walls, higher ceiling**:

1. immediate, calm entry for a first-time creator;
2. direct manipulation and reversible exploration for everyone;
3. progressive depth, personalization, and precision for expert creators;
4. one canonical document, media, rendering, upload, and publication truth across editor and viewer;
5. two clearly authored products:
   - **Poster:** a fast, temporal, camera-first story composer;
   - **Look:** a spatial, source-rich, shoppable collage studio.

The first release should fix truth and convergence before adding another visible tool.

### Immediate release verdict

Poster/Look creation must not be described as production-complete until all of these P0 blockers are closed:

- local captured/selected media reaches upload instead of failing pre-upload validation;
- the uploaded, authoritative document is saved server-side with concurrency control before publish;
- publication binds exactly that stored document version and hash;
- every media-bearing field is covered by a verified, publishable asset;
- large multipart uploads enter the same media processing/moderation pipeline;
- scheduling calls the real publication service rather than the worker stub;
- Close Friends cannot become public, private, or followers through silent mapping;
- a second publication revision has valid projection and idempotency semantics.

---

## 2. Research method and evidence standard

This report traced the system in both directions.

### Top-down trace

Create tab → CreatorStudio route → CreatorEntryScreen → CreatorCamera or MediaBrowserSheet → PosterComposerScreen or LookComposerScreen → CreatorCanvas → CreatorContext and project store → CreatorPublishSheet → upload manager → creator publication API → public Poster or Look viewer.

### Bottom-up trace

Upload intents and finalizations → media assets and processing jobs → creator documents and immutable revisions → publication orchestrator → Poster/Look projections → API serializers → services → composition validation → CreatorCanvas viewer render → feed/detail/story surfaces.

### Review criteria

Every recommendation was tested against:

- Design.md’s media-first, full-screen, camera-first composer contract;
- the anti-AI design policy: authored composition, restraint, truthful controls, one primitive system, full states;
- feature truth across editor, viewer, persistence, export, and permissions;
- psychological cost: interruption, memory load, premature commitment, loss aversion, perceived latency, and confidence;
- native constraints: safe areas, keyboard, Android Back, permission privacy, large text, reduced motion, memory, and media processing;
- release evidence, not visual adjectives.

### Important limitation

No native before/after render was produced for this report. Visual findings are therefore code- and specification-backed, not a claim of physical-device fidelity. The implementation phase must run the required render → capture → critique → correct loop.

---

## 3. The flagship diagnosis

### 3.1 What is already structurally strong

The codebase is not a prototype. Several foundations are ahead of many production creator tools:

- the Create tab opens CreatorStudio with openEntry instead of routing through a redundant screen (frontend/src/navigation/TabNavigator.tsx:259-268);
- CreatorStudio delegates to dedicated Poster and Look composers rather than the prohibited legacy small-canvas editor (frontend/src/creator/CreatorStudioShell.tsx:9-64);
- Poster and Look use a shared versioned CreatorDocument and CreatorCanvas;
- the editor and viewers reuse CreatorCanvas, supporting WYSIWYG composition playback in Home, Look detail, and Poster viewer (frontend/src/screens/HomeScreen.tsx:165-173, frontend/src/screens/LookDetailScreen.tsx:489-534, frontend/src/screens/PosterViewerScreen.tsx:203-212 and 731);
- local device URIs are rejected before publish (frontend/src/creator/compositionContract.ts:74-103);
- unsupported interactive layer types are rejected instead of silently coerced (frontend/src/creator/compositionContract.ts:137-153);
- uploads have durable jobs, byte progress, retry, cancellation, single-PUT and multipart paths;
- the backend has upload finalization receipts, media assets, processing jobs, canonical URLs, immutable document revisions, transactional projection creation, outbox events, and idempotent publish replay;
- the publish UI distinguishes an ambiguous network outcome from failure and offers an authoritative “Check result” path (frontend/src/creator/CreatorPublishSheet.tsx:512-571);
- the context rail caps immediate actions and supports context-sensitive personalization (frontend/src/creator/surfaces/ContextToolRail.tsx:193-277).

These are valuable assets. The upgrade should consolidate them, not replace them.

### 3.2 Why it still feels below Instagram, Snapchat, and Pinterest

#### P0. The ordinary local-media publish path is not operable

CreatorPublishSheet calls validateForPublish before it checks hasLocalUris and starts upload (frontend/src/creator/CreatorPublishSheet.tsx:345-355). validateForPublish rejects every local media, thumbnail, product snapshot, and Look snapshot URI (frontend/src/creator/compositionContract.ts:74-101). A camera or gallery document therefore throws before UploadManager or uploadAllLocalMedia can run.

The correct sequencing is:

1. validate the editable document structure and local asset readability;
2. upload/finalize local assets;
3. replace every local reference with an authoritative asset reference;
4. run strict publication validation;
5. save the final document version to the server;
6. publish that exact saved version.

These must be separate validation modes. “Draft-valid,” “upload-ready,” and “publish-valid” are different states.

#### P0. The client does not establish the canonical server document

Creator drafts are persisted locally through CreatorDraftService and AsyncStorage (frontend/src/creator/drafts.ts:26-31). The audited frontend has no normal create/update call to the backend creator-document endpoints before publication. The canonical publication route locks an existing creator_documents row and returns 404 when absent (backend/api/src/routes/creatorPublications.ts:456-475).

The server already has versioned save semantics and If-Match enforcement in backend/api/src/routes/creatorDocuments.ts:400-498. The client must wire them. Until it does, the strongest publication transaction in the codebase is unreachable from the ordinary local creator journey.

#### P0. Command and stored document are two different truths

The client sends compositionDocument and expectedMedia from an uploaded in-memory workingDoc (frontend/src/creator/CreatorPublishSheet.tsx:444-481). The backend builds title, caption, frames, and projections from creator_documents.document_json while validating only the command composition envelope (backend/api/src/routes/creatorPublications.ts:547-683; backend/api/src/lib/compositionValidation.ts:52-99).

Without expected lock version and document hash equality, the narrow projection may come from one document while the full WYSIWYG composition comes from another. Publication must accept only the exact server-saved document version; the command must reference it, not resubmit a competing body.

#### A. Breadth is visible; depth is not felt

The canonical files are extremely large:

| File | Approximate lines | Architectural signal |
|---|---:|---|
| CreatorAssetPicker.tsx | 4,890 | multiple tool families and media selection concerns in one shell |
| PosterComposerScreen.tsx | 3,383 | scene orchestration, modes, timelines, tool registries, sheets, and publication entry coupled |
| CreatorCanvas.tsx | 3,225 | edit/view/render behavior and many layer types in one renderer |
| LookComposerScreen.tsx | 2,306 | editor orchestration plus 18 local state toggles |
| CreatorCamera.tsx | 2,086 | permission, capture, effects, multi-capture, recent media, save, and video lifecycle |
| CreatorPublishSheet.tsx | 1,939 | review UI, validation, uploads, scheduling, publication, recovery, and success |

Large files do not automatically mean bad engineering. Here they correlate with a product problem: adding another capability requires modifying broad orchestration, which encourages more booleans, more sheets, more comments, and more local exceptions. This makes visual and state behavior drift even if every isolated feature works.

#### B. Partial extraction has produced duplicate product systems

CreatorEntryScreen uses MediaBrowserSheet, while both composers still use CreatorAssetPicker (frontend/src/creator/CreatorEntryScreen.tsx:21 and 303-306; PosterComposerScreen.tsx:34 and 2712; LookComposerScreen.tsx:34 and 1825). MediaBrowserSheet’s own documentation says it was extracted from the monolithic picker.

The result is two media-browser implementations with separate permission, paging, album, limited-access, and camera logic. This is not harmless duplication. It creates inconsistent selection behavior between entering the editor and adding/replacing media inside it.

#### B2. Look’s contextual More path is wired to the wrong menu

Look’s tool configuration defines selection-specific overflow actions such as Effects, Cutout, reorder, duplicate, and delete (frontend/src/creator/look/lookToolRailConfig.ts:319-379). ContextToolRail’s More callback opens a separate hardcoded global overflow instead of rendering getOverflowTools for the active context (frontend/src/creator/look/LookComposerScreen.tsx:1446-1450 and 1599-1664).

This is a concrete example of “broad but shallow”: the capability exists in configuration and comments, yet its ordinary interaction path is unreachable.

#### C. Code comments and runtime truth have diverged

CreatorPublishSheet says multipart endpoints are awaiting backend support (lines 361-369), while UploadManager enables multipart by default and backend/api/src/routes/uploads.ts implements initiate, part URL, complete, and abort endpoints (lines 664-1009).

PosterComposerScreen comments describe “up to 6” primary tools (line 1420 and around 2232), while ContextToolRail enforces a maximum of four.

The capture permission hook says camera permission is requested on mount (frontend/src/creator/capture/useCreatorCapturePermissions.ts:43-53), but it only exposes an explicit request function. The explicit-on-action behavior matches Design.md; the comment and ownership do not.

These inconsistencies are an anti-AI warning: the repository explains an idealized system in great detail, but explanation has become a substitute for a smaller, executable source of truth.

#### D. Truthful UI is incomplete at the audience boundary

The publish UI offers Close Friends (frontend/src/creator/CreatorPublishSheet.tsx:1101-1110). The serializer converts Close Friends to followers for Looks and private for Posters (frontend/src/creator/compositionContract.ts:269-271 and 342-347). The canonical publication route also maps it to public for Looks and private for Posters (backend/api/src/routes/creatorPublications.ts:654 and 677).

That is not a Close Friends feature. It is a silent semantic downgrade. Per Design.md and the repository trust policy, the option must be hidden until a real audience graph, authorization query, delivery filter, viewer behavior, and analytics segmentation exist.

#### E. Scheduling exists in one layer and is denied in another

The frontend service and backend expose server-owned scheduled publication, but the review UI disables publishing when scheduledFor exists and tells the user scheduling is unavailable (frontend/src/creator/CreatorPublishSheet.tsx:1368-1387 and 1403-1415).

Failing closed is correct. Keeping a partly connected scheduling branch in the main publish orchestration is not. Either complete and expose the atomic path with timezone/recovery/cancellation, or remove all ordinary UI and orchestration branches until the release gate passes.

#### F. The media publication gate is not end-to-end

Upload finalization creates a media asset initially in integrity_verified/pending states and enqueues probe, derivative, moderation, and processing work (backend/api/src/routes/uploads.ts:388-508). The upload response explicitly distinguishes publishable from processingRequired (lines 543-559).

The publication orchestrator verifies receipt ownership, type, URL, finalization status, and optional asset ID, but it does **not require the media asset to be publishable**. It only binds the asset ID when its status is published and otherwise can use the source URL (backend/api/src/routes/creatorPublications.ts:128-158).

This violates Design.md’s requirement that publish wait for finalization and processing. A finalized transport object is not yet a safe, correctly transformed, moderated publication asset.

Large files have a second gap. Multipart is enabled by default above the configured threshold, but backend multipart completion creates an upload_finalizations row without creating the same media_assets row and processing job produced by the single-PUT finalization path (frontend/src/creator/core/upload/UploadManager.ts:98-114 and 405-410; backend/api/src/routes/uploads.ts:924-972). A large video can therefore bypass processing entirely.

#### G. Not every persisted media reference is proven by a receipt

The client builds expectedMedia only for remote media layers that already contain mediaFinalizationId (frontend/src/creator/CreatorPublishSheet.tsx:454-470). Remote URLs without a receipt are omitted rather than rejected.

The backend validates only the composition envelope—id, type, and schema version—and intentionally stores the remainder as opaque JSONB (backend/api/src/lib/compositionValidation.ts:3-25 and 52-99). It verifies entries supplied in expectedMedia but does not prove that the list exactly covers every media-bearing field in the stored document.

For Poster frames, a media layer with no verified receipt becomes an empty narrow media URL, while the full composition document can still contain its remote URI (backend/api/src/routes/creatorPublications.ts:659-683 and 282-305). This creates a split-brain projection and a potential unverified remote-media rendering path.

#### H. Revision and recovery identity are under-specified

CreatorPublishSheet always sends revision 0 (line 473), and the service derives the key pub_{documentId}_{revision}. The unknown-outcome lookup also hardcodes pub_{documentId}_0 (lines 539-545). The server allocates the actual revision separately and rejects the same key with a different payload hash.

This works for a single publication attempt. It cannot cleanly represent a later publish of an edited document using the same document identity. The current behavior risks a 409 idempotency conflict instead of creating the next immutable revision.

The correct model is:

- stable document ID identifies the creative project;
- stable, persisted publish-attempt ID identifies one mutation attempt;
- document content hash detects same-attempt/different-payload misuse;
- server revision identifies the committed publication revision;
- recovery always looks up the exact persisted attempt ID, never a recomputed guess.

Public Look and Poster projections also use the document ID as their row/story identity. A genuine later revision would collide with the already published projection unless projection versioning/update semantics are explicitly redesigned.

#### I. Edit and republish semantics are not canonical

CreatorPublishSheet imports createLookOnApi, fetchLookByIdFromApi, and updateLookOnApi, but the main publish path uses the creator publication orchestrator. editingLookId is used mainly in recovery targeting, while publication creates typed projections using document identity.

The product needs one explicit command model:

- Create publication
- Publish new revision
- Edit metadata only
- Remix into a new document

“Edit” and “Remix” must not be inferred from a mixture of route params and legacy service imports.

#### J. The camera permission owner is duplicated

CreatorCamera calls useCameraPermission directly and also calls useCreatorCapturePermissions, whose stated role is to own camera and microphone permission (frontend/src/creator/CreatorCamera.tsx:199-200; frontend/src/creator/capture/useCreatorCapturePermissions.ts:1-12 and 55-65).

Even if React Native Vision Camera deduplicates native state, there are two conceptual owners. Permission state, blocked state, Settings recovery, mic degradation, and analytics should be governed by one capture session state machine.

#### K. System photo-picker privacy is not the default architecture

The editors depend heavily on expo-media-library/legacy, ask for library access for album browsing, and maintain custom gallery implementations. They handle limited access thoughtfully, but current Apple and Android guidance favors system pickers for selection-only flows because users grant only selected items.

The correct product split is:

- **system picker by default** for add/select media;
- **optional enhanced library browser** only after an explicit, well-explained request for expanded access;
- persist URI access or copy the selected asset into the project package before long-running uploads.

This lowers permission anxiety and reduces custom gallery maintenance without sacrificing an advanced browse mode.

#### L. Scheduling’s worker path is a stub

The scheduler’s main sweep calls executeScheduledPublication, which unconditionally returns a transient “orchestrator not available” result (backend/api/src/workers/handlers/scheduledPublicationHandler.ts:121-127 and 357-374). A functional executeScheduledPublicationViaApp path exists later in the same file but is not called (lines 382-457). Retried schedules eventually fail.

Schedule creation is also composed of separate cancel, insert, and document-update operations rather than one idempotent transaction. The UI is right to hide scheduling, but the report’s implementation plan must treat the backend path as incomplete—not merely an unexposed finished feature.

#### M. Authored geometry changes with the physical viewport

Poster can replace its authored 9:16 edit geometry with the physical screen ratio for full-bleed media (frontend/src/creator/poster/PosterComposerScreen.tsx:259-278). Look similarly changes the authored 4:5 document to a viewport-dependent height (frontend/src/creator/look/LookComposerScreen.tsx:305-334).

Normalized layer geometry can therefore be authored against a different coordinate space from viewer/thumbnail/export. Full bleed must be achieved by letterboxing/cropping the workspace around one authored coordinate system—not by changing document geometry.

#### N. Smaller interaction defects reveal missing ownership

- Aa is shown in Look, Poster, and Search entry modes even though it is a Poster-only blank-text path (frontend/src/creator/CreatorEntryScreen.tsx:262-274).
- “No camera device” is rendered as a permission-denied state with Open Settings, although Settings cannot add camera hardware (frontend/src/creator/CreatorCamera.tsx:1146-1148).
- Poster exposes duplicate More affordances during selection and three frame-management entry points.
- CreatorStudio’s modal gesture remains enabled while dirty-exit protection lives inside custom Close handlers, so a native dismissal can bypass the guard (frontend/src/navigation/AppNavigator.tsx:41-47).
- Look source search can describe a backend failure as “No products found” and instruct “Pull to retry” without a pull-to-refresh action.
- CreatorCanvas recomputes filtered sibling arrays inside each layer render, creating avoidable quadratic work and weakening memoization (frontend/src/creator/CreatorCanvas.tsx:390-403).

---

## 4. What the benchmarks actually teach

### 4.1 Instagram and Meta Edits: power must become personal

Meta’s April 2026 Edits update says its goal is powerful tooling that remains simple and approachable. The noteworthy direction is not just more features: creator-requested friction removal, customizable core tools, inspiration, reusable techniques, and post-share insights. Meta describes pinning favorite tools and personalized project setup as upcoming work, not a currently verified capability. See [One Year of Edits: Built For and With Creators](https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/) and the original [Introducing Edits](https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/).

**ThryftVerse implication:** ContextToolRail personalization is directionally correct, but it must be based on completed outcomes and context—not simply “most tapped.” A tool that users repeatedly open and abandon should not be promoted. Personalization should be per Poster photo, Poster video, Look collage, and selected-object type, with a reset control and stable defaults.

Meta’s media engineering also emphasizes composing and flattening authored layers into a predictable upload artifact and preserving HDR fidelity. See [Enhancing HDR on Instagram for iOS with Dolby Vision](https://engineering.fb.com/2025/11/17/ios/enhancing-hdr-on-instagram-for-ios-with-dolby-vision/) and [FFmpeg at Meta: Media processing at scale](https://engineering.fb.com/2026/03/02/video-engineering/ffmpeg-at-meta-media-processing-at-scale/).

**ThryftVerse implication:** an in-app composition viewer is valuable, but a serious creator product also needs a deterministic authored render/export contract, thumbnails derived from that render, color-space policy, and conformance tests. The current capability registry marks many export columns hidden. That is honest, but it also identifies the quality ceiling.

### 4.2 Snapchat: remove the interval between intention and capture

Snapchat’s creator guidance centers on the camera and exposes specific creation modes such as hands-free, timed captions, timeline, Multi Snap, sounds, and speed. Distribution is a separate destination decision across Story, Public Story, Snap Map, or Spotlight. See [Tips for Content Creators](https://help.snapchat.com/hc/en-us/articles/7012329698964-Tips-for-Content-Creators), [What is Director Mode?](https://help.snapchat.com/hc/en-gb/articles/8132871831828-What-is-Director-Mode), and [posting to Spotlight](https://help.snapchat.com/hc/en-us/articles/7012288096532-How-do-I-post-Snaps-to-Spotlight).

**ThryftVerse implication:** keep the camera root, but simplify its resting state. The viewfinder, subject, shutter, mode, latest-media affordance, and close action should dominate. Advanced capture controls should be mode-relevant and retractable. Multi Snap should remain an explicit mode because it changes the object model. Distribution choices belong after creation, not in the capture viewport.

### 4.3 Pinterest: Look creation is a source-and-provenance experience

Pinterest’s current Collage flow is not merely a freeform canvas. It supplies personalized Pins and cutouts, search, saved boards, prior cutouts, suggestions, templates, remix, shape-preserving swap, product provenance, drafts, download, and social sharing. Product-Pin cutouts carry price and availability. See [Create a collage](https://help.pinterest.com/en/article/create-a-collage).

Pinterest’s Pin flow separates media editing from publication metadata and supports cover choice, links, product tags, related topics, business scheduling, AI-modified disclosure, comments/shopping settings, drafts, and multi-asset stitching. See [Create a Pin from an image or video](https://help.pinterest.com/en/article/create-a-pin-from-an-image-or-video).

**ThryftVerse implication:** Look’s flagship advantage should be **commerce-native provenance**, not a generic image editor with a Product button. Every cutout should know:

- source asset and source creator;
- listing or catalog identity where applicable;
- availability/price snapshot and freshness state;
- mask version and source crop;
- permission/remix terms;
- swap constraints;
- attribution behavior.

The source tray is a core surface, not a modal afterthought. It should unify wardrobe/listings, saved items, search, device media, recent cutouts, and suggested complements while keeping media on canvas.

### 4.4 Apple: content first, reversible edits, no duplicate chrome

Apple advises a large camera preview with minimal distraction, mode-relevant controls, short labels, and no duplicated viewfinder controls. Its photo-editing guidance says to preserve originals, preview edits, and confirm cancellation only when work would be lost. See [Camera Control HIG](https://developer.apple.com/design/human-interface-guidelines/camera-control) and [Photo editing HIG](https://developer.apple.com/design/human-interface-guidelines/photo-editing).

Apple’s Photos guidance favors privacy-preserving selection and modern picker behavior. See [Delivering an enhanced privacy experience](https://developer.apple.com/documentation/PhotoKit/delivering-an-enhanced-privacy-experience-in-your-photos-app) and [Selecting photos and videos in iOS](https://developer.apple.com/documentation/PhotoKit/selecting-photos-and-videos-in-ios).

**ThryftVerse implication:** the canvas is the product. Toolbars must retract when manipulating content; destructive exit confirmation appears only after a meaningful edit; originals remain immutable; compare-original should be instant; the default selection flow should not demand broad photo-library access.

### 4.5 Android: selected-media privacy, durable URI access, explicit HDR policy

Android’s Photo Picker grants access only to selected media, supports cloud sources and multiple selection, and requires persistable access for long-running background work. It also added explicit HDR transcoding capability negotiation; the guidance was updated 14 August 2026. See [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker).

Media3 Transformer 1.11 supports transformations, async progress, cancellation, transmuxing to avoid needless quality loss, previewable effects, HDR preservation or tone mapping, and explicit export errors. See [Create a basic video editing app](https://developer.android.com/media/implement/editing-app), [Transformations](https://developer.android.com/media/media3/transformer/transformations), and [Supported formats](https://developer.android.com/media/media3/transformer/supported-formats).

**ThryftVerse implication:** build a native media ingress and render/export adapter:

- persist or copy selected content URIs into the project package;
- probe dimensions, rotation, duration, codec, frame rate, audio, HDR, and color metadata once;
- choose passthrough/transmux where possible;
- tone-map only under an explicit compatibility policy;
- expose honest export progress, cancellation, retry, and storage requirements;
- never claim upload is resumable unless the persisted multipart session can resume after process death.

---

## 5. Product psychology: why flagship creator tools feel different

The following principles are not decoration. They determine whether a creator remains in flow.

### 5.1 Low floor, wide walls, high ceiling

MIT’s “low floor, wide walls” creative-tool principle recommends easy entry, many expressive paths, and room for advanced growth. See [Resnick and Silverman, Some Reflections on Designing Construction Kits](https://www.media.mit.edu/publications/some-reflections-on-designing-construction-kits-for-kids-2/). Shneiderman’s creativity-support research emphasizes rapidly generating alternatives, exploring implications, and reverting to earlier stages. See [Creativity Support Tools: Accelerating Discovery and Innovation](https://www.cs.umd.edu/~ben/papers/Shneiderman2007Creativity.pdf).

For ThryftVerse:

- **low floor:** capture/select → edit immediately → share;
- **wide walls:** templates, cutouts, media, text, products, draw, remix;
- **high ceiling:** precise crop, layers, timing, keyframes, audio, color, accessibility;
- advanced tools never raise the floor.

### 5.2 Preserve locus of attention

Every sheet, permission prompt, mode switch, loading jump, and full-screen picker makes the user rebuild a mental image of the composition. Flagship tools keep the artwork visible and keep the selected object stable.

Rule: if an operation changes one property, reveal one contextual control without replacing the whole workspace.

### 5.3 Recognition over recall

People should see the relevant object and current value rather than remember what a previous sheet changed. NN/g’s usability guidance explains that recognition reduces working-memory load. See [Recognition Rather Than Recall](https://www.nngroup.com/articles/recognition-and-recall/).

Use:

- live thumbnails for fonts, colors, filters, layouts, and transitions;
- selected state on the object and tool;
- a visible current value;
- contextual help next to the unfamiliar action;
- stable tool placement after personalization.

Do not use:

- generic text rows for visual transformations;
- multiple “More” surfaces with overlapping tools;
- hidden changes that become visible only after closing a sheet.

### 5.4 Reversibility creates courage

Creators explore when they trust Undo, compare-original, drafts, autosave, and non-destructive media. Confidence is the product.

Required behaviors:

- every document mutation produces a semantic history item;
- history survives process death for the active project;
- compare-original has no recompute lag;
- Cancel explains loss only if a material mutation exists;
- failed processing never corrupts the source;
- replacing a source can preserve transform/mask when the user asks.

### 5.5 Immediate causality creates craft

A flagship editor keeps the interval between gesture and visible result below perception thresholds. Coarse targets:

- press feedback: immediate;
- transform/crop response: same frame;
- local filter preview: under 100 ms after cached setup;
- sheet open: 160–240 ms with no content jump;
- selected-media preview: visible before upload;
- background upload progress: based on bytes;
- publish completion: based on server commit, never animation duration.

### 5.6 Defaults are product taste

Generic editors expose parameters; authored editors provide good initial decisions.

Poster defaults should protect faces, fashion silhouettes, safe text areas, legibility, and story timing. Look defaults should preserve object edges, arrange visual mass rather than symmetrical card grids, and keep product identity visible. Templates must be authored examples with provenance and adaptation rules—not decorative blank frames.

### 5.7 The commitment ladder

Ask for commitment in increasing order:

1. pick or capture media;
2. manipulate locally;
3. save a recoverable draft automatically;
4. choose truthful audience and destination;
5. upload/process;
6. publish atomically;
7. confirm the public result.

Do not request broad permissions or publication metadata before the user has creative momentum.

---

## 6. Target product architecture

### 6.1 One creation kernel, two authored shells

Create a platform-owned CreatorKernel with these bounded modules:

1. **ProjectSession**
   - document identity, project package, autosave, crash journal, dirty state, migrations;
2. **MediaIngress**
   - system picker, enhanced library opt-in, camera output, metadata probe, durable local copy/URI grant;
3. **SceneDocument**
   - versioned typed schema, semantic commands, selection, history, constraints;
4. **SceneEvaluator**
   - deterministic edit/preview/viewer/thumbnail/export scene;
5. **Renderer**
   - shared geometry and typography semantics with profile-specific media adapters;
6. **ToolPolicy**
   - capability truth, context tools, personalization, education, maturity gates;
7. **RenderExport**
   - still/video output, HDR policy, progress, cancellation, storage, retry;
8. **UploadCoordinator**
   - persistent jobs, multipart checkpoints, finalization, processing wait, reconciliation;
9. **PublicationCoordinator**
   - persisted attempt ID, audience/destination, transaction, unknown-outcome recovery, cache invalidation.

PosterShell and LookShell own composition and interaction priorities. They do not own duplicate upload, picker, renderer, or publication implementations.

### 6.2 Poster’s opinionated contract

Poster is temporal:

- immediate camera or chosen media;
- one active frame by default;
- full-screen 9:16 authored viewport;
- text, sticker, product, draw as fast expressive actions;
- multi-frame only after explicit Add or Multi Snap;
- timeline only when timing/video requires it;
- Next leads to preview/destination, not a dense settings form;
- WYSIWYG story playback uses the committed render contract.

Resting chrome budget:

- Close;
- history state;
- Next;
- one contextual side rail only when useful;
- shutter or a four-tool edit rail;
- media remains dominant in thumbnail and squint tests.

### 6.3 Look’s opinionated contract

Look is spatial and source-driven:

- 4:5 canvas with safe output boundary always truthful;
- persistent but collapsible source tray;
- device media, saved products, wardrobe, listings, search, prior cutouts, suggestions;
- direct cutout creation and refinement;
- shape-preserving Swap;
- product provenance and availability;
- composition-aware auto-layout;
- product tag placement that avoids covering the item;
- explicit Remix that creates a new document and attribution;
- Edit changes the owned document or an allowed metadata surface.

Look should not inherit Poster’s temporal controls unless a video object makes them relevant.

### 6.4 One surface-state reducer per shell

Replace independent showX booleans with a discriminated interaction state:

- idle
- objectSelected
- directTextEditing
- transforming
- cropping
- drawing
- sourceBrowsing
- toolInspecting
- previewing
- publishReview
- publishing
- recovering

The reducer owns allowed transitions, Back priority, keyboard behavior, chrome visibility, accessibility announcements, and autosave checkpoints. This prevents impossible combinations and sheet stacking.

---

## 7. Detailed frontend upgrade specification

### 7.1 CreatorStudio and entry

**Keep**

- direct Create-tab entry;
- camera-first architecture;
- Look / Poster / Search intent;
- Aa text-only path;
- typed initial-media payloads.

**Change**

- preserve the last explicit creator intent, but do not let personalization move the default unexpectedly;
- render the viewfinder immediately behind permission education where platform rules allow;
- keep only Close, intent, shutter, latest-media/system-picker entry, and mode-relevant camera actions at rest;
- make Drafts a quiet recovery affordance only when a draft exists;
- remove duplicate gallery surfaces by making MediaIngress the canonical selector;
- use the system picker for ordinary selection and offer “Browse all albums” as an enhanced-access choice;
- copy/persist selected assets into the project package before dismissing the picker;
- measure entry-to-first-media and camera-ready latency.

**Release gates**

- first frame of camera chrome under 250 ms after route mount on target devices;
- no broad photo permission on ordinary system selection;
- no shutter before camera ready;
- camera denied and blocked states offer Gallery and Settings appropriately;
- selected media never disappears after process restart.

### 7.2 CreatorCamera

**Immediate corrections**

- remove the direct useCameraPermission call or remove camera ownership from useCreatorCapturePermissions; keep one owner;
- correct stale permission documentation;
- encode the camera lifecycle as explicit states: booting, permissionNeeded, opening, ready, capturingPhoto, recording, stopping, interrupted, recovering, failed;
- request microphone only on video intent;
- if mic is denied, show a persistent muted indicator before recording and in the resulting clip;
- gate each camera tool on current mode and proven output parity;
- keep recent-media access permission-free; do not query the library unless authorization already exists;
- use capture-viewport coordinates for grids, focus, and safe guides;
- keep capture output pinned while transitioning to editor.

**Video gate**

Enable native video capture only when device tests prove:

- audio grant/deny/revoke;
- phone call and audio interruption;
- background/foreground;
- low storage;
- thermal and encoder failure;
- max duration;
- orientation metadata;
- process death after stop;
- output can be uploaded, processed, rendered, and recovered.

### 7.3 Media browser and asset picker

**Converge**

- make one MediaBrowser core used by entry, Add, Replace, background, green-screen source, and product snapshot selection;
- keep specialized shells for selection limits and media type, not copied internals;
- delete CreatorAssetPicker’s media browser only after all callers use the core;
- continue decomposing non-media tools out of CreatorAssetPicker until it becomes a small capability router.

**Interaction**

- ordered selection numbers;
- drag-to-reorder selected assets before insertion;
- exact limit and why;
- cloud/download pending state;
- unavailable/corrupt/HDR-unsupported badges;
- dominant thumbnails with metadata only when useful;
- partial selection remains intact after one asset fails;
- selected state announced to screen readers;
- large-text labels do not cover media.

### 7.4 CreatorCanvas and scene rendering

**Contract**

- one normalized scene evaluator for edit, preview, viewer, thumbnail, and export;
- one authored coordinate space per document; device workspaces letterbox around it and never mutate it;
- renderer profiles may change performance strategy, never geometry semantics;
- stable text layout: exact fonts, fallback metrics, line breaking, letter spacing, alignment, and scale;
- media transform represented as source crop + object transform, not a sequence of lossy rewrites;
- masks and cutouts versioned independently;
- deterministic z-order and blend semantics;
- every layer has a render-support verdict before the tool is advertised.

**Decomposition**

- extract media, text, vector/draw, interactive sticker, product, and selection overlay renderers;
- isolate gesture arbitration from layer drawing;
- isolate accessibility actions from touch gestures;
- keep a single geometry utility used by editor and viewer;
- create golden-scene fixtures covering every supported layer combination.

**Performance**

- no React re-render for every transform frame;
- keep manipulation on UI/native thread;
- use proxy media for editing and source media for final render;
- cache decoded thumbnails and filter previews by content hash;
- pause offscreen video/audio;
- set memory budgets by device tier;
- avoid full-scene rasterization after every small change.

### 7.5 PosterComposerScreen

**Reduce orchestration**

- move tool definitions into typed PosterToolPolicy;
- move temporal behavior into PosterTimelineController;
- move publish preparation into PublicationCoordinator;
- move Android Back/keyboard transition order into the surface-state reducer;
- keep the screen responsible for composition only.

**UI**

- make the full-screen media silhouette unambiguous;
- maintain exactly four contextual actions plus More;
- remove the duplicate selected-state More action;
- consolidate frame management into one page-dot/tray flow with Add inside the tray;
- remove comment-level “parity” claims and replace them with automated capability assertions;
- keep frame dots/tray visually subordinate;
- show timeline only for temporal need;
- when direct text is active, suppress unrelated chrome;
- use a single More sheet with grouped sections and no duplicated tools;
- keep safe zone an advanced temporary overlay;
- preview through the same scene contract and exact story timing.

### 7.6 LookComposerScreen

**Reduce orchestration**

- replace 18 independent local toggles with the interaction reducer;
- wire More to the active context’s computed overflow tools rather than the hardcoded global menu;
- extract LookSourceTray, LookSelectionController, LookLayoutEngine, and ProductProvenanceController;
- use the shared picker and publication coordinator;
- make the selected object the sole owner of contextual tools.

**UI**

- media/cutouts are the color and dominant objects;
- no generic card-on-card tool drawers;
- source tray previews show useful actual content, not labelled placeholder panels;
- layout proposals appear as visual previews and preserve selected item identity;
- cutout refinement supports Select/Add/Erase/zoom with edge-quality feedback;
- Swap can preserve mask, transform, or neither—with an explicit preview;
- product tag leaders avoid the garment silhouette and adapt to edge placement;
- multi-select is discoverable through a contextual action as well as long press;
- layer ordering has accessible Move forward/back/front/back actions.

### 7.7 ContextToolRail

**Keep**

- maximum four;
- contextual groups;
- stable visible shape and 48-point targets;
- one More action;
- per-context pinning.

**Improve**

- rank with successful completed use, not raw taps;
- reserve one stable anchor action per context to prevent a constantly moving UI;
- do not promote destructive or rarely reversible actions;
- show pinned state and allow reset;
- sync personalization across devices only with explicit account setting;
- test at large text: labels may scroll horizontally but targets and object viewport must remain usable;
- reconcile all comments and tests to the same maximum.

### 7.8 Publish review

The current review is feature-rich but too close to a settings form. Recompose it into:

1. dominant, playable/correctly cropped preview;
2. concise caption;
3. truthful destination and audience;
4. product/listing integrity summary for Looks;
5. one primary Share/Publish action;
6. secondary settings in one sheet.

**Remove or hide now**

- Close Friends until the graph and delivery semantics exist;
- scheduling control until the entire client path is enabled and device-tested;
- any export/download claim while export capability is hidden;
- unsupported interactive layers before review, not as a publish-time surprise.

**Add**

- processing state per failed/pending asset;
- “Fix” deep link to the exact layer;
- upload can continue in background;
- unknown outcome retains the exact attempt ID;
- post-success action opens the actual public target;
- success is announced only after the transaction commits.

---

## 8. Backend and media architecture upgrade

### 8.1 Make the document server-canonical before publication

The publication route currently reads creator_documents.document_json, while the client builds expectedMedia and compositionDocument from its in-memory working document. The contract needs an explicit save boundary:

1. upload and finalize local media;
2. replace local refs with verified media references;
3. PUT the full document with If-Match;
4. server validates and stores the same document hash;
5. POST a publish attempt referencing expected lock version/document hash;
6. server publishes exactly that stored version.

Reject a publish command whose hash or version does not equal the locked document. This eliminates client-command/stored-document divergence.

### 8.2 Replace arbitrary URLs with media references

Published compositions should not carry authority-bearing raw URLs as their identity. Use:

- mediaAssetId;
- finalizationId;
- derivative role;
- optional immutable delivery URL snapshot for debugging only;
- source crop and orientation metadata.

At response time, serialize a signed/canonical delivery URL from the asset projection. For external catalog images, create an explicit externalMediaAsset with provenance, allowlist, fetch/scan policy, and immutable source snapshot.

### 8.3 Require exact receipt coverage

On publish:

- walk the server-stored document;
- extract every media-bearing path, including thumbnails, masks, cutout sources, audio, product snapshots, Look snapshots, and background images;
- require exactly one authorized asset reference per path;
- reject missing, duplicate, unused, wrong-owner, wrong-scope, wrong-type, or mismatched URL evidence;
- never trust the client’s expectedMedia list as complete.

The client list may be an optimization; the server walk is authority.

### 8.4 Enforce the media processing gate

Publication should accept only media assets in publishable, or a specifically allowed equivalent state. Do not create an active Poster/Look using integrity_verified, processing, moderation_pending, quarantined, or processing_failed media.

Return structured blockers:

- MEDIA_PROCESSING
- MEDIA_QUARANTINED
- MEDIA_PROCESSING_FAILED
- MEDIA_UNSUPPORTED
- MEDIA_RECEIPT_MISSING
- MEDIA_RIGHTS_REQUIRED

For MEDIA_PROCESSING, support a status subscription or bounded polling and allow the user to leave the sheet while the project remains recoverable.

### 8.5 Share the full composition schema

The backend’s envelope-only validation is insufficient for authoritative publication. Move the versioned CreatorDocument schema to a shared package consumed by frontend, API, workers, and rendering tests.

Server validation must include:

- document byte and object-count limits;
- page/layer limits;
- finite numeric ranges;
- media-reference coverage;
- supported layer types per destination/version;
- string and text-run limits;
- valid transforms and timings;
- audience and interaction compatibility;
- no local/content/cache URI;
- no unapproved remote host;
- capability version.

Forward compatibility belongs in explicit migrations and viewer degradation policy, not in accepting arbitrary opaque publication JSON.

### 8.6 Correct publication identity

Add publicationAttemptId, generated once and persisted locally before the request.

Contract:

- Idempotency-Key = publicationAttemptId;
- request includes documentId, expectedLockVersion, expectedDocumentHash, destination, audience, and optional schedule;
- same attempt + same hash replays;
- same attempt + different hash conflicts;
- a new revision uses a new attempt ID;
- response returns server revision and public target;
- lookup uses the stored attempt ID;
- attempt records have a retention policy longer than client retry windows.

### 8.7 Make audience semantics exact

Until Close Friends exists, supported values should be only public/private or the actual domain vocabulary. Implement Close Friends only with:

- membership graph and ownership;
- transactional audience snapshot or version;
- query filters on every viewer/feed endpoint;
- notification delivery rules;
- share/deep-link authorization;
- cache-key separation;
- analytics privacy;
- membership change semantics;
- tests for non-members and removed members.

Never map it silently to followers, public, or private.

### 8.8 Clarify create, revise, edit, and remix

Recommended domain commands:

- POST /creator/documents — create project;
- PUT /creator/documents/:id with If-Match — save draft;
- POST /creator/documents/:id/publication-attempts — publish current saved version;
- POST /creator/documents/:id/revisions/from-publication/:publicationId — reopen as new draft revision;
- PATCH /looks/:id/metadata — update allowed post-publish metadata only;
- POST /creator/documents/:id/remixes — create new attributed document.

Public projections remain immutable except for explicitly mutable metadata and moderation state.

### 8.9 Scheduling

The backend schedule row is a strong start. Before UI exposure, prove:

- document and media are frozen or version-bound at schedule time;
- processing completes before due time or fails visibly;
- timezone and daylight-saving semantics;
- exactly-once claim with worker lease/version;
- cancel/reschedule race behavior;
- unknown-outcome lookup;
- audience checked at execution;
- notification of success/failure;
- expired/removed asset behavior;
- history shows scheduled, executing, published, cancelled, failed.

### 8.10 Derivatives and authored output

Implement a RenderManifest:

- document schema version and hash;
- renderer version;
- source asset hashes;
- output aspect, dimensions, frame rate, duration;
- codec/container/audio;
- color transfer, primaries, matrix, HDR mode;
- font assets and licenses;
- per-layer fallback decisions;
- output asset and poster/thumbnail assets;
- conformance status.

Poster image-only stories can initially render deterministically on device or server. Video, audio, and advanced effects need an export pipeline before they are marketed as downloadable or externally shareable authored media.

---

## 9. Anti-AI design policy for this surface

The anti-AI standard is not “avoid AI features.” It is “avoid generic, over-explained, over-contained, incoherent design.”

### Prohibited signatures

- equal-weight rounded cards for every tool group;
- a modal for every property;
- duplicate headings such as Create → Create Poster → Poster tools;
- marketing copy inside the editor;
- labels that restate an obvious icon or selected object;
- gradients, shadows, glass, and pills used to simulate premium quality;
- five different selection grammars;
- placeholder grey media dominating the first viewport;
- tool count presented as parity;
- comments that claim quality without executable evidence;
- controls whose backend semantics are downgraded;
- one happy-path publish animation masking processing uncertainty.

### Required authored signatures

- subject/media dominates;
- one obvious next action;
- asymmetry driven by the content, not decorative layout;
- one radius, stroke, icon, press, and motion grammar per viewport;
- transparent utility hit areas;
- contextual precision appears next to the selected object;
- real previews instead of text-heavy option rows;
- errors attach to the affected media/layer;
- empty states invite one meaningful action;
- motion explains state change and then stops;
- every visible control is supported across the full contract.

### Thumbnail and squint acceptance

At 25% scale:

- Poster must read as one immersive image/story frame, not tool chrome;
- Look must read as an authored outfit/collage, not a dashboard;
- Publish must read as preview + decision, not a settings form.

When blurred:

- media and selected identity dominate;
- navigation recedes;
- no repeated grey surfaces create the silhouette.

---

## 10. State completeness

### Capture

- permission resolving;
- permission not requested;
- permission denied/requestable;
- permission blocked/Settings;
- device unavailable;
- camera opening;
- camera ready;
- capture in flight;
- capture failed/retry;
- recording;
- muted recording;
- interruption;
- low storage;
- recovery after process death.

### Media selection

- initial loading skeleton matching grid;
- populated;
- empty album;
- limited access;
- cloud asset downloading;
- partial download;
- corrupt/unsupported asset;
- selection limit;
- filtered empty;
- permission denied;
- system picker cancelled;
- durable-copy failure.

### Editing

- no selection;
- selected object;
- multi-select;
- direct text and keyboard;
- crop;
- drawing;
- processing proxy;
- missing original;
- unsupported capability;
- autosaving;
- autosave failed;
- recovered draft;
- migration failed;
- offline.

### Upload and processing

- queued;
- hashing/probing;
- initiating;
- uploading with real bytes;
- paused;
- retrying with attempt count;
- multipart resuming;
- PUT complete but finalization pending;
- finalized but processing;
- publishable;
- quarantined;
- processing failed;
- cancelled;
- unknown network outcome.

### Publication

- review;
- validation blocked with layer deep link;
- offline save-draft;
- publishing;
- scheduled;
- server committed;
- unknown outcome/check result;
- idempotency conflict;
- audience no longer valid;
- partial cache refresh;
- public target failed to load with retry.

---

## 11. Accessibility specification

- minimum practical targets: 44 points iOS and 48 dp Android while visible glyphs remain 20–24;
- every icon action has role, concise label, state, and useful hint only when behavior is not obvious;
- selection count and current layer announced;
- layer manipulation has accessibility actions: move left/right/up/down, resize, rotate by increment, move forward/back, duplicate, delete;
- crop and cutout tools offer step controls in addition to gestures;
- order/reorder has non-drag alternatives;
- text controls support large type without covering the canvas;
- color choices include names and contrast feedback;
- errors announce once and move focus to recovery;
- upload/publish progress uses live-region semantics without announcing every percent;
- reduced motion uses instant state changes or short fades;
- captions/transcripts are part of video readiness;
- audio-only meaning has visual equivalent;
- product markers do not depend on color alone;
- screen-reader order matches media → selected object → contextual tools → Next.

See [Android accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles) for gesture alternatives and accessible app quality.

---

## 12. Performance and media-quality budgets

Set budgets on representative low/mid/high devices and enforce them in CI/device labs.

| Measure | Flagship target |
|---|---:|
| Creator route → stable entry chrome | ≤ 250 ms warm |
| Camera ready after permission already granted | ≤ 700 ms p75 target device |
| Selected local image → editable preview | ≤ 150 ms p75 using proxy |
| Transform gesture | 60 fps target, no JS-frame dependence |
| Tool rail response | visible feedback in same frame |
| Filter thumbnail rail initial useful previews | ≤ 500 ms p75 |
| Autosave after idle | begin within 500 ms, off interaction path |
| Draft recovery | ≤ 1 s for typical document |
| Upload progress | real bytes, monotonic per active transfer |
| Final publish UI | only after committed response or authoritative lookup |
| Memory | device-tier budgets with controlled decode dimensions |

Media quality gates:

- EXIF rotation correct;
- Display P3/sRGB and HDR policy documented;
- no double compression for unchanged compatible media;
- thumbnails and covers are generated, not blindly cropped;
- face/fashion/product focal regions retained;
- text metrics match between editor and viewer;
- frame timing tolerance defined;
- audio sync measured;
- source and derivative checksums recorded;
- rendered result compared against golden scenes.

---

## 13. Metrics that measure creative quality, not feature usage

### Creation funnel

- Create tap → camera ready;
- Create tap → first media;
- first media → first meaningful edit;
- first media → valid draft;
- draft → publish review;
- publish review → confirmed public target;
- abandonment by exact state.

### Fluency

- sheet opens per completed creation;
- Back presses caused by wrong surface;
- tool open-without-change rate;
- Undo immediately after tool use;
- time spent with canvas obscured;
- selection loss or context reset count;
- gestures that are cancelled or conflict;
- first-frame and first-use latency.

### Reliability

- draft recovery success;
- upload resume success after process death;
- finalization reconciliation rate;
- processing failure and recovery;
- unknown-outcome resolution;
- duplicate publication rate;
- editor/viewer scene hash mismatch;
- missing/expired media reference rate.

### Creative value

- successful template adaptation, not template tap;
- cutout reuse;
- product-linked Look engagement;
- shape-preserving Swap completion;
- remix with valid attribution;
- percentage of creations using only core tools versus advanced tools;
- creator return rate after first successful post.

Never optimize for raw tool taps. Optimize for completed, truthful creative outcomes.

---

## 14. Prioritized implementation roadmap

### Phase 0 — Truth convergence and risk removal

- **P0.1** Split draft/upload/publication validation so local media can reach upload.
- **P0.2** Wire server document create/save with If-Match before publication.
- **P0.3** Hide Close Friends and any unsupported destination semantics.
- **P0.4** Persist a unique publicationAttemptId and use it for request and recovery.
- **P0.5** Require stored-document version/hash equality at publish.
- **P0.6** Server-walk all media references and require exact receipt coverage.
- **P0.7** Require publishable media asset state, not transport finalization alone.
- **P0.8** Make multipart completion create the same media asset and processing jobs as single-PUT.
- **P0.9** Move full CreatorDocument validation to a shared schema package.
- **P0.10** Unify camera/microphone permission ownership.
- **P0.11** Remove stale multipart and parity comments; add contract tests instead.
- **P0.12** Connect scheduling to the real publication domain service or remove the dead branch.
- **P0.13** Define create/revision/edit/remix domain commands.

**Exit:** no control or public media claim is semantically false.

### Phase 1 — Canonical creative loop

- **P1.1** Introduce CreatorKernel module boundaries.
- **P1.2** Converge system picker/enhanced browser/media ingress.
- **P1.3** Replace Poster/Look sheet booleans with interaction reducers.
- **P1.4** Decompose CreatorAssetPicker into capability-owned tools.
- **P1.5** Decompose CreatorCanvas renderers and gesture arbitration.
- **P1.6** Recompose Poster and Look first viewports under surface budgets.
- **P1.7** Recompose Publish as preview + decision.

**Exit:** camera/select → edit → publish is visually calm, recoverable, and uses one path.

### Phase 2 — Look flagship differentiation

- **P2.1** Unified source tray.
- **P2.2** High-quality cutout mask/refinement pipeline.
- **P2.3** Composition-aware auto layout.
- **P2.4** Shape-preserving Swap.
- **P2.5** Product provenance, availability freshness, and tag collision avoidance.
- **P2.6** Remix permissions and attribution.
- **P2.7** Authored templates with source replacement rules.

**Exit:** Look is recognizably commerce-native and spatial, not a Poster variant.

### Phase 3 — Poster temporal depth and media fidelity

- **P3.1** Explicit video readiness matrix.
- **P3.2** Proxy/original workflow and native render adapter.
- **P3.3** Deterministic audio/timeline model.
- **P3.4** HDR/color pipeline.
- **P3.5** Authored still/video RenderManifest and thumbnails.
- **P3.6** Full interruption, low-storage, and process-death recovery.

**Exit:** every advertised temporal tool matches preview, viewer, persistence, and export where promised.

### Phase 4 — Creator intelligence without AI-slop design

- successful-outcome-based tool personalization;
- contextual education after intent, never generic onboarding;
- creator technique templates with inspectable construction;
- smart layout/crop suggestions shown as reversible alternatives;
- AI-modified disclosure and provenance where policy requires;
- no automatic mutation without preview and confirmation;
- no generated “premium” decoration or verbose assistant copy.

**Exit:** intelligence reduces work while the creator retains agency and authorship.

---

## 15. File-by-file implementation map

| File / area | Required change |
|---|---|
| frontend/src/creator/CreatorStudioShell.tsx | keep thin routing shell; move all creation state below CreatorKernel |
| frontend/src/creator/CreatorEntryScreen.tsx | system-picker-first ingress; stable intent; minimal camera entry |
| frontend/src/creator/CreatorCamera.tsx | single permission owner; explicit lifecycle reducer; retractable mode tools |
| frontend/src/creator/capture/useCreatorCapturePermissions.ts | own full permission state or mic only; documentation must match behavior |
| frontend/src/creator/CreatorAssetPicker.tsx | remove duplicated media browsing; decompose into small capability routers |
| frontend/src/creator/tools/MediaBrowser/MediaBrowserSheet.tsx | become canonical enhanced browser behind MediaIngress |
| frontend/src/creator/poster/PosterComposerScreen.tsx | extract orchestration; one surface reducer; Poster-specific composition |
| frontend/src/creator/look/LookComposerScreen.tsx | extract source/layout/selection; one surface reducer; commerce-native Look flow |
| frontend/src/creator/surfaces/ContextToolRail.tsx | outcome-based personalization; stable anchor; one max-tools truth |
| frontend/src/creator/CreatorCanvas.tsx | renderer decomposition; gesture isolation; exact shared geometry |
| frontend/src/creator/capabilities/registry.ts | executable maturity gates including processing/export promises |
| frontend/src/creator/engine/renderProfiles.ts | conformance assertions across edit/preview/viewer/thumbnail/export |
| frontend/src/creator/compositionContract.ts | shared schema import; all media refs and semantics validated |
| frontend/src/creator/CreatorContext.tsx | ProjectSession adapter; semantic command history; durable attempt state |
| frontend/src/creator/core/projectStore | asset grants/copies, migrations, crash recovery, render manifests |
| frontend/src/creator/core/upload | resumable session reconciliation, background policy, processing state |
| frontend/src/creator/CreatorPublishSheet.tsx | thin review surface; move orchestration out; remove false audiences; exact attempt lookup |
| frontend/src/services/creatorPublicationsApi.ts | attempt-ID contract, structured blockers, version/hash preconditions |
| backend/api/src/lib/compositionValidation.ts | replace envelope-only authority with shared full schema and limits |
| backend/api/src/routes/uploads.ts | preserve strengths; expose stable processing state and status subscription |
| backend/api/src/routes/creatorDocuments.ts | canonical draft version/hash, If-Match, migrations |
| backend/api/src/routes/creatorPublications.ts | exact media coverage, publishable gate, attempt identity, audience truth |
| backend/api/src/routes/looks.ts | converge legacy create/update paths onto document publication/revision rules |
| backend/api/src/routes/posters.ts | converge any legacy path; composition remains WYSIWYG source |
| frontend/src/screens/LookDetailScreen.tsx | render committed scene; product provenance; graceful unsupported-version state |
| frontend/src/screens/PosterViewerScreen.tsx | render committed scene/timing; no narrow/full-document split brain |

---

## 16. Verification matrix

### Contract tests

- same attempt + same hash replays;
- same attempt + different hash conflicts;
- new attempt + new saved version publishes next revision;
- missing receipt anywhere in document rejects;
- unused expected receipt rejects;
- processing media blocks;
- quarantined media blocks;
- external unapproved URL blocks;
- Close Friends cannot be sent while unsupported;
- local URI cannot be saved as publishable document;
- viewer supports every admitted layer/version.

### Integration tests

- capture photo → process → publish → open story;
- select limited-library image → process death → resume → publish;
- multi-part upload interrupted by app termination → resume only missing parts;
- PUT complete/finalization response lost → reconcile same object;
- publish response lost → lookup exact attempt → open public target;
- Look multi-source collage → publish → detail geometry matches;
- Poster multi-frame timing → publish → viewer timing matches;
- edit published Look → explicit revision behavior;
- remix → new document with attribution and no ownership leak.

### Native device visual matrix

- iPhone small/standard/large; light/dark; Dynamic Type;
- Android compact/large; API supported minimum/current; gesture/three-button navigation;
- low- and mid-tier Android memory/performance;
- camera notch/island/cutout safe areas;
- keyboard, Back, rotation policy;
- reduced motion and screen reader;
- SDR, Display P3, HDR inputs;
- image, video, missing media, cloud media, corrupt media;
- one item and maximum item count.

Capture before/after:

- first useful content Y-position;
- useful media objects above fold;
- rounded-container count;
- visible chrome area versus media area;
- largest visible non-media control;
- selected-object visibility while tool is open;
- loading/final geometry shift;
- sticky footer occlusion;
- editor/viewer pixel and timing deltas.

---

## 17. Definition of flagship complete

This department is complete only when:

- Poster and Look are visibly different products built on the same kernel;
- the first viewport passes thumbnail and squint tests;
- a new creator can publish without understanding layers, assets, finalization, or revisions;
- an expert can reach precise tools without losing canvas context;
- no visible feature is silently weakened by backend mapping;
- every published media reference is authorized, processed, moderated, and canonical;
- editor, preview, viewer, thumbnail, and promised export agree;
- draft/upload/publication survive interruption and process death;
- unknown mutation outcome is never called success or failure;
- native accessibility offers alternatives to every essential gesture;
- code comments are unnecessary for establishing runtime capability truth;
- TypeScript, backend tests, integration tests, device captures, performance budgets, and live endpoints all pass.

Until those gates pass, the honest status is not “Instagram/Snapchat/Pinterest parity.” It is “strong creator foundation under convergence.”

---

## 18. Recommended first engineering slice

Do not begin with a visual reskin. The best first slice is a vertical truth-and-flow pass:

1. remove Close Friends from publish review;
2. split validation so local media uploads before publish-valid checks;
3. introduce and persist publicationAttemptId;
4. save the finalized document to the server before publish;
5. enforce document hash/version and exact media receipt coverage;
6. block until media asset publishable, including multipart assets;
7. unify camera permission ownership;
8. use MediaBrowser core for both entry and in-editor Add/Replace;
9. repair Look More and replace independent sheet booleans with a reducer;
10. use one authored aspect-ratio coordinate space;
11. render and capture Poster entry, Poster edit, Look edit, and Publish review;
12. remove chrome until media dominates and only then refine typography, spacing, and motion.

This slice converts the current impressive feature inventory into one trustworthy product loop. It also gives every later creative feature a stable place to live.

---

## 19. Sources

### Internal

- Design.md, especially lines 1318-1363 for Poster/Look composer contracts and lines 1126 onward for shape, stroke, and surface budgets.
- AGENTS.md flagship product execution charter supplied for this repository.
- Current frontend and backend implementation at the repository baseline listed in this report.

### Official product and platform research

- Meta, [One Year of Edits: Built For and With Creators](https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/), April 2026.
- Meta, [Introducing Edits: A Streamlined Video Creation App](https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/), April 2025.
- Meta Engineering, [Enhancing HDR on Instagram for iOS with Dolby Vision](https://engineering.fb.com/2025/11/17/ios/enhancing-hdr-on-instagram-for-ios-with-dolby-vision/), November 2025.
- Meta Engineering, [FFmpeg at Meta: Media Processing at Scale](https://engineering.fb.com/2026/03/02/video-engineering/ffmpeg-at-meta-media-processing-at-scale/), March 2026.
- Snapchat Support, [Tips for Content Creators](https://help.snapchat.com/hc/en-us/articles/7012329698964-Tips-for-Content-Creators).
- Snapchat Support, [What is Director Mode?](https://help.snapchat.com/hc/en-gb/articles/8132871831828-What-is-Director-Mode).
- Snapchat Support, [How do I post Snaps to Spotlight?](https://help.snapchat.com/hc/en-us/articles/7012288096532-How-do-I-post-Snaps-to-Spotlight).
- Pinterest Help, [Create a collage](https://help.pinterest.com/en/article/create-a-collage).
- Pinterest Help, [Create a Pin from an image or video](https://help.pinterest.com/en/article/create-a-pin-from-an-image-or-video).
- Apple, [Camera Control Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/camera-control).
- Apple, [Photo editing Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/photo-editing).
- Apple, [Delivering an enhanced privacy experience in your Photos app](https://developer.apple.com/documentation/PhotoKit/delivering-an-enhanced-privacy-experience-in-your-photos-app).
- Apple, [Selecting photos and videos in iOS](https://developer.apple.com/documentation/PhotoKit/selecting-photos-and-videos-in-ios).
- Android Developers, [Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker), updated 14 August 2026.
- Android Developers, [Create a basic video editing app using Media3 Transformer](https://developer.android.com/media/implement/editing-app), August 2026.
- Android Developers, [Media3 Transformations](https://developer.android.com/media/media3/transformer/transformations).
- Android Developers, [Media3 Supported formats](https://developer.android.com/media/media3/transformer/supported-formats).
- Android Developers, [Principles for improving app accessibility](https://developer.android.com/guide/topics/ui/accessibility/principles).

### Human-computer interaction research

- Ben Shneiderman, [Creativity Support Tools: Accelerating Discovery and Innovation](https://www.cs.umd.edu/~ben/papers/Shneiderman2007Creativity.pdf), Communications of the ACM, 2007.
- Mitchel Resnick and Brian Silverman, [Some Reflections on Designing Construction Kits for Kids](https://www.media.mit.edu/publications/some-reflections-on-designing-construction-kits-for-kids-2/), 2005.
- Nielsen Norman Group, [Recognition Rather Than Recall](https://www.nngroup.com/articles/recognition-and-recall/).

---

## Final research status

**COMPLETE — TARGET MET for the research deliverable.**

The codebase has not been changed beyond this report. Product implementation, live endpoint proof, TypeScript/tests, and native device validation remain future execution work and must not be inferred from this research status.
