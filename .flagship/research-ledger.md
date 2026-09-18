# Research Ledger — Flagship Seller Suite Campaign

**Access date:** 2026-06-09
**Campaign:** flagship-seller-suite-2026-06

---

## Source classes searched

1. Official competitor pages / help centers / docs
2. App-store listings / changelogs
3. Engineering and design-system documentation
4. Public repositories / issues / discussions
5. HIG / Material / accessibility standards
6. Independent UX teardowns (Mobbin, Page Flows)
7. Community reviews and reports

---

## Competitor research

### Depop — Seller Hub / Dashboard
- **Source:** Mobbin Depop seller hub screenshots (accessed 2026-06-09)
- **Observation:** Depop seller hub leads with a single financial summary (balance available to payout), then a flat list of recent activity. No 2x2 grid. Items to ship are surfaced as actionable rows, not cards. Seller profile is media-anchored (shop cover + avatar).
- **Why it works:** One dominant number (available balance) + flat actionable list = clear reading order. The user knows exactly what to do next.
- **Claim type:** Direct observation (Mobbin screenshots)

### Depop — Listing / Upload flow
- **Source:** Mobbin Depop listing flow + Depop help center listing guide
- **Observation:** Photo-first flow. First screen is camera/gallery with large photo area. Details form is secondary, fields are flat (no card nesting). Price field is prominent. Category is a bottom-sheet picker, not chips. No "specialties" or decorative tags.
- **Why it works:** Media is the product. The form is minimal and honest.
- **Claim type:** Direct observation

### Vinted — Seller Analytics / Sales Dashboard
- **Source:** Vinted help center "View your selling statistics" + community screenshots
- **Observation:** Vinted shows a simple stats page: views, favorites, sold count for a selected period. No executive dashboard. No funnel. No synthetic data. Period selector is a simple segmented control.
- **Why it works:** Honest, minimal metrics. No fabricated depth.
- **Claim type:** Primary documentation + community screenshots

### Vestiaire Collective — Seller Workflow
- **Source:** Vestiaire seller help center + community teardowns
- **Observation:** Vestiaire emphasizes authentication and trust. Seller dashboard shows pending items (in authentication, shipped, delivered) as status rows. Earnings shown as a single line with next payout date. No multi-card executive grid.
- **Why it works:** Status-driven task queue, not metric dashboard.
- **Claim type:** Primary documentation + secondary analysis

### Instagram — Edit Profile (Android)
- **Source:** Page Flows Instagram Android edit-profile + Mobbin
- **Observation:** Single flat form. Name, username, website, bio. Profile photo at top with a small "Change photo" text link (transparent hit target, not a circular button). No specialties, no decorative tags, no "passport" concept. Save is a top-right text action.
- **Why it works:** Minimal, honest, no decorative chrome. The form is the screen.
- **Claim type:** Direct observation (Page Flows + Mobbin)

### General marketplace patterns
- **Source:** Cross-competitor synthesis
- **Observation:** Best-in-class seller surfaces (Depop, Vinted, Grailed) share: (1) one dominant metric or task, (2) flat rows for secondary information, (3) media-anchored identity, (4) honest empty/loading states, (5) no fabricated trust badges.
- **Claim type:** Inference from multiple direct observations

---

## Design standards consulted

- **Apple HIG (2025):** Touch targets 44pt minimum. Dynamic Type support. Reduced motion respect.
- **Material Design 3:** Touch targets 48dp. Accessible labels on interactive elements.
- **WCAG 2.2:** Color contrast 4.5:1 for text. No color-only status communication.
- **Stripe / Linear design systems:** Single dominant panel, flat rows, restrained chrome.

---

## Internal audit results (2026-06-09)

Three parallel read-only audits completed:

| Surface | Agent | P0 | P1 | P2 |
|---------|-------|----|----|-----|
| Analytics | 8603f704 | 3 | 4 | 2 |
| SellerHub | 88882242 | 3 | 4 | 0 |
| EditProfile | df5eef15 | 4 | 4 | 0 |
| SharedUI | (derived) | 0 | 1 | 2 |
| **Total** | | **11** | **12** | **3** |

Full findings in `.flagship/gap-registry.json`.

---

## Research saturation assessment

- Competitor patterns: **saturated** for Depop, Vinted, Vestiaire, Instagram edit-profile.
- Design standards: **saturated** for HIG, Material, WCAG.
- Internal audit: **complete** for the five target surfaces.
- Backend contracts: **partial** — need to verify dailyBreakdown, offerCount, priceAdjustments, specialties fields before implementation.

No additional research is required before the spec approval gate. Targeted backend-contract verification will occur during implementation planning.

---

## 2026-09-16 — Creator department full benchmark (5 parallel domain audits)

**Verdict: 68/100 vs Snap/IG flagship quality.** Full report: `.flagship/benchmark-2026-09-16-creator-department.md`; machine scorecard: `.flagship/quality-scorecard-creator-2026-09-16.json`.

| Domain | Score |
|---|---|
| Capture/camera | 74 |
| Canvas/layers | 72 |
| Timeline/audio/keyframes | 45 |
| Tools/effects/color | 68 |
| Publish/drafts/share | 74 |
| Upload/reliability | 85 |
| Backend/contracts | 78 |
| Accessibility | 65 |
| Performance | 60 |
| Architecture | 60 |
| Testing/observability | 60 |

Independently verified P0s: slide-to-lock killed by trailing onPress (`CreatorCamera.tsx:1020-1054`); alignment guides in layer-local space (`CreatorCanvas.tsx:1381`); draw strokes raw-pixels vs normalized render (`DrawingWorkspace.tsx:559-585` vs `CreatorCanvas.tsx:2652-2661`); emoji-brush never renders; "Cutout" label promises nonexistent segmentation.

Sources: Snap Help (Director Mode, Timeline Editor, Green Screen), Instagram Creators (Edits, Reels tools), Meta dev docs (content publishing API), CapCut guides/press, Android haptics UX docs, Reanimated performance refs. Corrected subagent claim: publish preserves edits via server-side `renderComposition` — deferred native module only blocks on-device export.

## 2026-09-16 — Benchmark P0/P1 fix wave (post-scorecard)

All fixes verified in source; creator suite 79/79, frontend tsc clean, eslint 0 errors.

| Finding | Fix |
|---|---|
| CAM-P0 slide-to-lock killed by trailing onPress | `handleShutterPress` early-returns while `isLongPressRef` set (CreatorCamera.tsx:1020); also kills the double-stop on normal release |
| CAM-P1 tap-to-abort countdown unreachable | shutter `disabled` no longer includes countdowns; long-press during countdown guarded instead |
| CAM-P1 gallery video thumbs | `recentItems`/`lastItem` carry mediaType; video tiles render honest glyph tile (GalleryCarousel) |
| CAM-P3 RecordingRing off-center | shutterSize 80 → 78 |
| CANVAS-P0 guides in layer-local space | guide state lifted to CreatorCanvas via `onGuidesChange`; `AlignmentGuides` rendered at stage level; overlay cleared on commit/cancel |
| CANVAS-P0 layout preview commits | snapshot/restore via `updateLayerLive` — preview pushes no history, restores on release (LookComposerScreen) |
| TOOLS-P0 draw coordinate space | adapter normalizes workspace px → 0-1 via DrawingDocument.width/height (CreatorAssetPicker) |
| TOOLS-P0 emoji brush never renders | emoji strokes stamp glyph along polyline (spacing scaled by sourceWidth, deterministic jitter); non-emoji strokes still Skia paths |
| TOOLS-P0 cutout truthfulness | rail hint now says "Paint a mask…" not "subject segmentation" (both configs) |
| TL-P1 duplicate ghost layer | duplicates the owning PAGE (projector renders one media layer/page); selects new clip; MAX_PAGES guard |
| TL-P1 reorder index confusion | clip indices mapped through clipPageIndices to owning pages |
| TL-P1 delete gap | media-layer delete removes the owning page (last page → layer-only fallback) |
| TL-P1 split at cap silent trim | guard moved before mutations; honest toast |
| TL-P1 transition misattribution | split moves owning page's transitionId to the new second-half page |
| TOOLS-P1 Poster adjust history spam | live/commit split (updateLayerLive + 'Adjust photo' on finger-up), ADJUST_PARAM_MAP validation — Look parity |

Residual from this wave's scope: intensity slider + AI-effects entry still missing on Poster effects surface (P1 partial); a11y scale/rotate path; device validation pending.

### Addendum — Poster effects parity completed

| Finding | Fix |
|---|---|
| TOOLS-P1 Poster intensity slider missing | `filterAmount` + live/commit intensity handlers ported to `usePosterEffects` (live `updateLayerLive`, single history entry on finger-up) — wired through `PosterSheetStack` rail |
| TOOLS-P1 AI/style effects unreachable on Poster | `handleAIEffectApply`/`handleAIEffectRemove` (`ai:<id>` namespaced filter nodes) ported; "Style effects" entry row + `AIEffectBrowserSheet` mounted in PosterSheetStack |
| `currentEffects` dep instability | memoized — cleared 14 exhaustive-deps warnings in usePosterEffects |

Post-addendum verification: frontend tsc clean, creator suite 79/79, eslint 0 errors (pre-existing warnings only). Remaining residuals: a11y scale/rotate path, native device validation (no ADB).

### A11Y-P1 — scale/rotate accessible alternative (both composers)

New `surfaces/AccessibilityTransformSheet.tsx` — the pinch/rotate counterpart to AccessibilityMoveSheet: scale (20–500%) + rotation (−360..360°) readouts, fine (5%/5°) and coarse (25%/45°) nudge steps, numeric inputs, reset-to-identity, `announceForAccessibility` on every mutation. Wired identically on both composers:

- Look: `a11yTransform` mode + `SHOW_A11Y_TRANSFORM` action (lookEditorState), "Resize & rotate" overflow item, sheet mount in LookComposerScreen.
- Poster: `a11yTransform` sheet id (useActiveSheet), "Resize & rotate" overflow item, mount in PosterSheetStack — `updateLayer(id, { scale, rotation })` with one history entry per commit.

Verification: frontend tsc clean, eslint 0 errors (pre-existing warnings only). Remaining residual: native device validation (no ADB).

## 2026-09-16 — Timeline wave: doc-level op extraction + regression coverage

**Migration decision (recorded):** the recommended pages→clip-sequence schema rewrite was evaluated and deferred. Rationale: every defect the migration was meant to fix (duplicate ghost, reorder index confusion, delete gap, split-cap silent trim, transition misattribution) is already fixed under the page model via owning-page addressing. A schema rewrite would additionally buy multi-track semantics and cleaner invariants, but touches the publish renderer, export segment graph, drafts, templates, viewers, and page UI end-to-end — high blast radius for incremental gain while the page=clip-segment invariant holds. Recorded as a deliberate deferral, not a dropped task.

**What shipped instead — the correctness core made testable:**
- New `poster/timeline/TimelineDocOps.ts`: pure document surgery for `splitPageClip`, `duplicateClipPage`, `deleteClipPage` — owning-page resolution, transition migration, keyframe re-anchoring, freeze clearing, speed-adjusted duration recompute, one-media-layer-per-page invariant, last-page delete guard.
- `usePosterTimeline` split/duplicate/delete cases now route through the doc ops (~150 lines of inline surgery removed); single `commitDocument` per op = one undo step.
- New `__tests__/timelineDocOps.test.ts`: 12 tests covering transition attribution, speed-adjusted durations, keyframe shifting, freeze clearing, overlay non-duplication, ghost-clip prevention, last-page guard — the defect class the benchmark flagged, now regression-locked.

**Verification:** creator suite 91/91, frontend tsc clean, eslint 0 errors on touched files.

**Residuals:** overlay editing remains page-scoped (timeRange is playback-correct; editing requires the owning page active — acceptable for short-form); audio/captions/voiceover tracks remain facade-level; device validation pending.

## 2026-09-16 — Dead-code sweep (wave 3)

Policy applied: dead *plumbing inside live files* is removed; honestly-declared dormant capabilities (registry-gated, schema fields, server-implemented paths awaiting entry points) stay.

**Deleted (~1,750 lines, recoverable from git):**
- `core/captions/` — CaptionService (301), CaptionRenderer (374), CaptionTypes, index. Fully orphaned: no UI entry, no consumers; STT path was already honest (`isAvailable()` → false).
- `core/tracking/` — MotionTracker (409 NCC tracker) + barrel. Orphaned.
- `core/audio/VoiceoverRecorder.ts` (349) — dead barrel export; its `expo-audio` static import pulled the dep into every consumer of the barrel.
- `tools/stickers/StickerPinOverlay.tsx` (283) + `StickerPinTracker.ts` (240) — pin mode unreachable end-to-end (`onPinSticker` never passed; no render path resolves `layer.pin`; publish parity absent). Re-wire spec recorded in composition.ts comment.

**Stripped:** pin plumbing from `StickerBrowserSheet` (~110 lines: 6 props, pinMode state, header pin button, overlay mount, pin styles).

**Wired live (deduped):** `computeVolumeAtTime` (AudioMixer) now drives the canvas fade gain — replaces the inline ramp with the same module export's afade-parity math. `core/audio` barrel trimmed to consumed symbols.

**Surveyed and deliberately kept:** green screen + speed camera tools (registry-gated, honest), publish scheduling path (server-implemented, missing only a picker UI), `pin`/`scheduledFor`/`greenScreen` schema fields (document compat), AudioMixer ducking/mix API (documented foundation for the future multi-track surface).

**Verification:** creator suite 91/91, frontend tsc clean, eslint 0 errors on touched files.

## 2026-09-16 — Look/Poster grammar unification wave (wave 4)

**Poster multi-select parity** — the last major interaction divergence closed:
- `useLookMultiSelect` → `shared/useMultiSelect.ts` (renamed export `useMultiSelect`); shared by both composers.
- `ToolContext` gained `poster-multi-select`; `posterToolRailConfig` gained the group (Front/Back/Delete primary + center/middle align overflow) mirroring Look.
- Poster canvas wiring: `selectedLayerIds`, `onMultiDragStart/Commit`, long-press → enter multi-select (Snapchat/IG grammar; layers sheet still reachable via rail), double-tap → overlap cycle in multi mode, tap → toggle in selection, canvas press → exit.
- `PosterTopBar` third mode: Done · "N selected" badge · Select-all (transparent 44pt targets, same grammar as Look).
- Escape/hardware-back exit multi-select first; keyboard Delete → bulk delete; auto-exit when selection empties; dim overlay during multi-select.
- All mutations were already in shared CreatorContext — zero new state plumbing.

**Verification:** tsc clean, creator suite 91/91, eslint 0 errors on touched files.

## 2026-09-16 — Perf micro-wave (wave 5)

- **Slide-to-zoom JS-thread churn fixed**: `handleHoldTouchMove` called `setPinchZoomDelta` per move event (unthrottled React state → CameraView re-render every frame while the finger drags). Now mirrored on the same 50ms cadence as the pinch gesture's JS bridge, with `lastSlideDeltaRef` flushed on press-out so the final zoom position can't be dropped by the throttle window.
- **Shutter/ring audit**: RecordingRing + ShutterButton already worklet-driven (`useAnimatedProps`/`useAnimatedStyle`) — no fix needed, audit claim disproven.
- **Drawing audit**: DrawingWorkspace already collects live points into a ref and renders via a throttled `renderTickSV` shared-value reaction (16ms cadence) — no per-point React state. Audit claim disproven.

**Verification:** tsc clean, eslint 0 errors on CreatorCamera.

## 2026-09-16 — Monolith decomposition wave 1: CreatorAssetPicker (wave 6)

**CreatorAssetPicker.tsx: 4,743 → 299 lines.** 20 mode pickers extracted to `surfaces/pickers/` (media 745, product 432, draw 407→deleted, text 364→deleted, quiz 217, gif 217, music 204→deleted, vote 194, mention 145, emojiSlider 140, countdown 139, look 138, weather 138, question 120, shape 106, link 104, time 87, hashtag 78, location 73) + `pickerShared.tsx` (604: PickerShell, baseLayer, hslToHex, PermissionDeniedState, shared constants, picker createStyles). Main file keeps the mode union, props, 4 Phase-2 adapters, and the dispatch table.

**Dead legacy pickers deleted** (the extraction surfaced them): `TextPicker`, `DrawPicker`, `MusicPicker`, `StickerTray` — the text/draw/music/stickers modes already dispatched to the Phase-2 adapters (TextEditorSheet, DrawingWorkspace, AudioBrowserSheet, StickerBrowserSheet); the inline pickers were unreachable duplicates. −915 lines.

**Verification (subagent + parent re-run):** tsc clean, creator suite 91/91, eslint 0 errors, multiset line-diff confirmed pure extraction (0 missing lines).

**Remaining monoliths:** CreatorCanvas (3.4K), PosterComposerScreen (~2.8K), LookComposerScreen (~2.5K). The composers decompose along their existing hook/sheet seams; the canvas decomposes along layer-renderer/gesture seams — each a dedicated pass, not a side-task.

## 2026-09-16 — Publish scheduling UI wired (wave 7)

The server-owned scheduling path (schedule row → worker publishes at `dueAt`, cancel/lookup endpoints, attempt-store reconciliation, scheduled/scheduleUnknown/scheduleFailed sheet stages) was built but unreachable — nothing could set `metadata.scheduledFor`.

- `CreatorPublishReview`: "Publish time" segment (Now/Later) between Audience and the poster toggles; Later mounts `AppDatePicker` (datetime, min now+5m, max +75d — IG's window) writing ISO to `metadata.scheduledFor` on a 400ms debounce (wheel ticks don't spam history). Past-time guard at the CTA; button reads "Schedule" when armed.
- Verified contract: backend `POST schedule` validates `dueAt > now`, stores the frozen publish command; metadata schema `scheduledFor: z.string().datetime().optional()` on both ends.

**Verification:** tsc clean, 91/91, eslint 0 errors.

## 2026-09-16 — Composer parity + share-out (wave 8)

- **LayerFloatingMenu ported to Poster** — the selected-layer action bubble (front/back/duplicate/lock/delete) anchored above the layer's top edge now appears in Poster; suppressed during multi-select, inline text edit, and active manipulation. Reuses the shared component + context mutations verbatim.
- **Share-out on publish success** — `SuccessView` gained a Share affordance next to View → system `Share.share`: posters carry the canonical `thryftverse.com/story/{id}` URL, looks carry caption + Look ID (matches LookDetail's existing share pattern; no look web route exists to deep-link).
- **Frame-leave guard for Poster multi-select** — selection ids are page-scoped; any page change (swipe, segment, timeline tap, tray) exits multi-select so bulk ops can't act on stale ids.

**Verification:** tsc clean, 91/91, eslint 0 errors on touched files.

## 2026-09-16 — Remaining P1 closures (wave 9)

- **Drag frame reorder** — FrameTray thumbs get a UI-thread Pan
  (`activateAfterLongPress(300)`) simultaneous with a 600ms LongPress for the
  existing overflow menu. Hold→lift→drag grammar; neighbours shift with
  timing animation; release commits one `reorderPages` call. Menu still
  opens on a hold that never moves; a drag that starts suppresses the menu.
  Wired to `reorderPages` in PosterComposerScreen; accessibility announce on
  commit.
- **Ambient upload surface** — new `surfaces/GlobalUploadIndicator.tsx`:
  3pt top-edge bar fed by real byte progress from the shared UploadManager,
  mounted in AppNavigator root (also runs reconciliation on cold start).
  Offline parks the bar dimmed; confirming holds full. Owns background
  failure toasts (only always-mounted upload observer).
- **Scrub position persisted** — `metadata.playheadMs` (schema field, no
  history entries via new `updateMetadataLive`); `usePosterPlayback` seeds
  the clock on first projection (clamped) and reports on pause/seek/unmount.
  Drafts reopen at the last playhead — CapCut/Edits grammar.
- **Publish share-out** — verified wired: SuccessView `onShare` → system
  Share sheet with canonical story URL / look ID.

- **CreatorCanvas decomposition** — 3,461 → 1,789 lines. 21 layer-content
  components extracted to `studio/layers/` (media/text/product/sticker/
  draw/gif/music/link/location/hashtag/time/weather/etc.) with a shared
  `layerContentShared.ts` (VideoPlayerRef, media/overlay styles). Main file
  retains gesture engine, LayerRenderer, selection handles, guides. No
  import cycles; 91/91 tests green.

## 2026-09-16 — A11y sweep landed (wave 9b)

- **417 → 0 accessibilityHint warnings** across `src/creator/` (~90 files).
  Shared `PressScale` forwards hints; state-dependent hint on
  ShutterButton; informational (not fake-action) hints on non-interactive
  elements; published-behavior hints on canvas layer renderers. The final
  expo-video `Video` gap closed by wrapping in an accessible View.

- **useCreatorPublishWorkflow cleanup** — removed 19 dead imports (UI
  primitives leftover from extraction), dead `humanizePublishError`
  (its doc comment had drifted onto it — restored to
  `generatePublicationAttemptId`), unused `targetId`, and resolved all
  hook dep warnings. File now 844 lines with only 2 max-lines warnings.


## Wave — UI-thread drawing pipeline + monolith decomposition (2026-09-16, cont.)

- **Drawing strokes moved fully to UI thread** (`tools/drawing/useDrawingStrokes.ts` + `drawingSkia.tsx`): points accumulate in `livePointsSV` shared value; `livePathSV` rebuilds the smoothed Skia path in a `useDerivedValue`. JS is touched twice per stroke (begin mounts `LiveStrokePath` with fixed brush meta; end commits the full point array). Was: 2 bridge crossings + React re-render per accepted point. `smoothPathToSkia` workletized; `LiveStrokePath` mirrors `StrokePath` per-brush paint structure for identical live/committed rendering. Emoji brush keeps JS accumulation (stamp layout is JS-computed).
- **Cutout trace + refine strokes on UI thread**: `CreatorCutoutSheet` trace points accumulate in `tracePointsSV` → derived Skia path; `PathOverlay` now renders one Skia stroke (40px round) instead of one 40px View PER POINT (200-pt trace = 200 Views). `MaskedPreview.livePoints` contract → `livePointsSV: SharedValue<Point[]>`; `smoothSkiaPath` workletized. Legacy runOnJS-per-point retained only as the no-Skia fallback.
- **Decompositions landed**: `DrawingWorkspace` 1231→633 (+drawingSkia, useDrawingStrokes, drawingEmojiPanel, drawingToolbar); `FolderOrganizeSheet` 1574→500 (+folderOrganize/: styles, OrganizeHeader, TapOrganizeContent, DragOrganizeContent, ManagePanel, useFolderOrganizeDrag).
- **Hygiene sweep**: 97 unused-vars warnings → 0 across 56 files (dead imports/bindings/props removed; traced, not guessed).
- **Bug fixes**: `useLookEffects.currentEffects` `?? []` minted a fresh array per render destabilizing 14 memos/callbacks — wrapped in useMemo (all 14 warnings gone). `WaveformExtractor.base64ToBytes` bytePos started at 0 instead of group-aligned offset → non-aligned byte reads double-offset — fixed. `browseFilterContexts` patch fns: `browseFilters` now optional in return Pick (inactive-context branch doesn't emit it) + test condition 'New' → 'New with tags'. `check-animated-scroll-usage.mjs` now requires an actual call site (doc-comment mentions no longer trip it) and recognizes named-prop handler forwarding (`*ScrollHandler={}`) — the ComposerScreen→TimelineDock pattern.
- **Look sticker gap closed**: `look-default` rail gained Stickers/GIF/Shape overflow; `look-sticker-selected` gained gated Edit via shared `LAYER_TYPE_TO_PICKER_MODE` (moved to `shared/layerEditModes.ts`, re-exported from posterToolRailConfig). `handleEditLayer` now routes interactive sticker types to their editors.
- Verified: frontend tsc clean; 108 files / 2025 tests green; eslint 0 errors, 91 warnings (was 204) — remainder is structural max-lines + dep-array notes.


## Wave — dept-wide hygiene zero + monolith decomposition wave 2 (2026-09-16, cont.)

- **All functional lint warnings cleared**: exhaustive-deps and no-explicit-any now 0 across src/creator/. Deps fixed honestly (stable SVs/setters added; genuinely-unused deps removed — incl. CreatorCanvas gesture memos now declaring their SV deps). `any` replaced with real types: picker payloads via `Extract<CreatorLayer,{type}>['payload']`, `useRoute<RouteProp<...>>` + typed `CreatorStudioRouteParams` (7 downstream casts removed), `useNavigation<NativeStackNavigationProp<RootStackParamList>>`, `TextStyle['fontWeight']`, `MediaLibrary.AssetsOptions`, Giphy response interfaces, `TextLayer['payload']['background']`.
- **Half-landed subcategory feature completed** (pre-existing uncommitted WIP breaking the gate): `SellDraftPersistenceValues`/`Setters` + DRAFT_FIELD_KEYS + store-key map wired through; `useSellScreenData.pickerTaxonomy` return type gained `subcategory`; `ListingPublishPipelineParams.subcategory` plumbed; i18n keys `listing.create.subcategory`/`selectSubcategory` added (EN + es/fr/de patches).
- **Decompositions landed**: TextEditorSheet 1,076→398 (+6 modules); CreatorCropSheet 1,341→515 (+cropSheet/ 6 modules, gesture worklets intact); MediaBrowserSheet 1,153→501 (+10 modules); composition.ts 1,547→9 thematic files under projectStore/composition/ (barrel preserves all 45 exports); CreatorContext 1,822→590 (+context/ 14 hooks — provider 1,344→354 lines); FolderOrganizeSheet + DrawingWorkspace earlier.
- **Verified**: tsc clean; 109 files / 2,028 tests green; eslint creator scope: 26 warnings — ALL structural max-lines family; zero deps/any/unused.
- **In flight**: final structural wave — styles/data splits (templates, glyph map, 3 createStyles, lookToolRailConfig), sheet batch (LayersSheet, DraftList, both cutout sheets, BackgroundSheet, SourceTray, SheetStack), LayerRenderer branch extraction, publish-workflow + timeline hook splits, MediaPicker.
- **Deferred by judgment**: PosterComposerInner/LookComposerInner (~1,100-line orchestrators) and CreatorCamera fn — already decomposed once; further extraction is the riskiest class with diminishing returns.


## Wave — FINAL structural decomposition: dept-wide lint ZERO (2026-09-16, late)

- **src/creator/ eslint: 204 → 0 warnings.** Every file ≤800 lines, every function ≤400, zero deps/any/unused across the department.
- **Final monolith wave landed**: `templates.ts`→4 modules + barrel; `CreatorGlyph` 1,183→259 + 5 glyph packs; 3 createStyles factories → section builders (StyleSheet.create preserved per-section for NamedStyles typing); `lookToolRailConfig` → 6 context builders; 7 sheets split (LayersSheet 822→288, DraftList 986→446, CutoutPreview 823→525, CutoutSheet→424, BackgroundSheet→433, SourceTray→497, PosterSheetStack→393 + 6 sheetStack modules — recovered from file-view history after a stale-structure write); `LayerRenderer`→studio/layers/ (timeMs/clipTimeMs dual-base contract verbatim); `useCreatorPublishWorkflow`→7 publish modules (schedAttemptId local-scope fix intact); `usePosterTimeline`→useClipOps/useTrackOps (5 reflow calls + page-indexed commits verbatim); `MediaPicker`→7 modules.
- **The last three giants**: LookComposerInner 1,094→3-line shell (controller + 16 domain hooks + Workspace); PosterComposerInner 1,117→orchestrator (11 hooks + PosterEditorSurface 533); CreatorCamera 1,002→~396 (7 hooks + CameraFeed/CameraBottomBar; slide-lock ±12pt, dy/80 zoom, 250ms arbitration verbatim).
- **Checker extended again**: hook-returned handlers now matched as `\w*ScrollHandler\w*` in return objects (usePosterTimelineZoom pattern).
- Verified: tsc clean; 109 files / 2,028 tests green; eslint src/creator/ = 0 problems.

## 2026-09-17 — Live shopping benchmark research (Wave AJ kickoff)

Sources (live web):
- getstream.io/blog/tiktok-live-shopping — TikTok Live Shopping UX teardown: product card → in-stream listing → 2-tap checkout overlay → auto-return to stream; social proof via verified badges + real viewer counts + purchase notifications
- getstream.io/blog/live-selling — host pinning, lightweight reactions, pre-live surfacing, post-live VOD availability
- forasoft.com/blog/article/live-commerce-platform-development-2026 — 2026 architecture: sub-1s WebRTC hot path + HLS-LL fallback, pinned-SKU swap reaching viewers in 2–3s, checkout <30s in-stream
- mdpi.com/2076-328X/15/5/673 — eye-tracking study: dense overlays increase cognitive load and reduce purchase intent; restraint wins

Benchmark contract for the audit: pinned-product swap <3s propagation, in-stream checkout <30s, honest viewer/sold counts, ABR/fallback, real chat+reactions, NO fabricated scarcity.
