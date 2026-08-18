# 07 — Creator Studio, Tools & Capture: Flagship Research Report

**Department:** Creator suite — look, poster, outfit, moodboard, camera, capture, studio, color, controls, dock, surfaces, tools
**Date:** August 2026
**Scope:** `CreateLookScreen.tsx`, `LookDetailScreen.tsx`, `OutfitBuilderScreen.tsx`, `MoodboardEditorScreen.tsx`, `MoodboardHomeScreen.tsx`, `CreateCameraScreen.tsx`, `CreatePosterHighlightScreen.tsx`, `PosterViewerScreen.tsx`, `PosterArchiveScreen.tsx`, `PosterStoryActivityScreen.tsx`, `PosterHighlightViewerScreen.tsx`, `StyleQuizScreen.tsx`, all files under `frontend/src/creator/` (camera, capture, color, controls, core, dock, look, poster, studio, surfaces, tools), and all files under `frontend/src/components/look/` and `frontend/src/components/poster/` (35 files)

---

## 1. 2026 Competitor Benchmark

### Snapchat — Camera-First Creative Ecosystem (2026)

Snapchat remains the gold standard for camera-first creation. Their 2026 trajectory shows three major shifts:

- **AI Clips in Lens Studio (2026).** Snapchat introduced AI Clips — a closed-prompt AI format that transforms a single photo into a five-second video. The key insight is the *closed-prompt design*: developers define the creative direction, and the end user simply taps to step into the experience. This eliminates the "open-ended text-to-video" anxiety that paralyses most users while still producing cinematic, share-ready output. The lesson for ThryftVerse: AI-assisted creation works best when the user's decision space is narrow and the result is immediate — not when they're staring at a blank prompt field.

- **Lens Studio iOS app and web tool (late 2025/2026).** Snapchat lowered the barrier to Lens creation by launching a mobile Lens Studio app. Users can generate AI effects, add Bitmoji, and publish Lenses from their phone. The desktop app remains for professionals, but the mobile tool makes creation accessible to everyone. The architecture lesson: the creation tool should meet the user where they already are (the phone), not require a context switch to a separate professional environment.

- **Camera Kit maturity (v46, February 2026).** Lens Prefetch API and Lens WarmUp API allow preloading Lens content with custom priorities — eliminating the blank-spinner gap between selecting an effect and seeing it render. Snapchat also added Custom Location AR and City-Scale AR Lenses. The performance lesson: creative effects must preload and warm up before the user needs them; a 200ms render delay is the difference between "magic" and "loading."

- **Creator Mode / Easy Lens.** Snapchat introduced a preset-based building block system for basic Lenses (face filters). For prototyping, this is sufficient. The lesson: most creators don't need a full node graph — they need preset combinations that produce good results instantly, with the option to go deeper.

### Instagram — Story Editor & Templates (2026)

Instagram's Story editor is the most-used creative tool on the planet. The 2026 state:

- **Drafts (7-day TTL).** Instagram lets users save a half-finished story as a draft — preserving photos, stickers, text, effects, filters, and drawn elements. The draft is saved locally and survives app restarts. The critical constraint: drafts auto-delete after 7 days. The lesson: drafts are essential for creative flow (users often start a story, get interrupted, and return), but they should be treated as ephemeral working state, not permanent storage.

- **Restyle AI for Stories (October 2025, now in 2026 toolbelt).** Instagram integrated Meta AI to apply creative styles to story content — transforming photos and videos without requiring external editing apps. The feature is inside the Story workflow, not a separate destination. The lesson: AI enhancement belongs inside the creative flow, not behind a separate "AI tools" screen.

- **AI Transition for Stories.** Instagram added the ability to select two or more photos and let AI generate the motion between them, producing a seamless video Story. The workflow is straightforward: open the gallery, tap AI Transition, select photos, wait, share or save as draft. The lesson: the platform packages specialised editing tasks into built-in publishing actions — the user never leaves the Story creation flow.

- **Collage (AI-powered).** Instagram's Collage feature creates animated collages from 5+ photos, automatically arranging images with movement and style. The lesson: auto-composition (the system arranges things for you) is a legitimate creative mode, not a compromise — users want the result, not the manual labour.

- **Add Yours Templates.** Templates are ready-made designs users fill in with their own photos and text. They're accessible from the gallery selection page and the sticker tray. The lesson: templates lower the activation energy for creation — a user who wouldn't start from blank will happily fill in a template.

- **Sticker tray depth.** Instagram's sticker tray includes polls, quizzes, sliders, countdowns, mentions, hashtags, links, location, time, weather, and photo stickers. All are interactive, resizable, and rotatable with two fingers. The lesson: the sticker system is the primary expressive vocabulary — it must be deep, consistent, and physically manipulable.

### Cross-platform synthesis for ThryftVerse

| Dimension | Snapchat 2026 | Instagram 2026 | ThryftVerse target |
|---|---|---|---|
| Capture | Camera is the root state; effects preload | Swipe right → camera instantly | Camera-rooted entry; capture → editor in one continuous flow |
| Editing | Closed-prompt AI; preset building blocks | In-flow AI Restyle; AI Transition | Effect rail with GPU preview; auto-compose for layouts; honest AI labels |
| Drafts | Lens Studio drafts persist across sessions | 7-day TTL, local + cloud sync | Persistent drafts with recovery; no silent data loss |
| Templates | Easy Lens presets; Creator Mode | Add Yours Templates; Collage | Template browser inside composer; look + poster templates |
| Stickers | Bitmoji, GIFs, interactive Lenses | Polls, quizzes, sliders, countdowns, photo stickers | Commerce-native stickers: product tags, mentions, polls, countdowns |
| Performance | Lens Prefetch + WarmUp APIs | Three-layer media preloading | Preload next frame + next story; Skia GPU effects; no blank spinners |

---

## 2. Psychology & Principles

### The "make me look good" promise

Every creative tool makes an implicit promise: *this tool will make me look good*. The user opens the camera or the editor with a vision — an outfit they want to showcase, a poster story they want to tell, a moodboard they want to compose. The tool's job is to close the gap between the user's vision and the output as quickly and frictionlessly as possible. When the tool fails this promise — when the output looks worse than what the user could produce with their phone's native camera — the tool is worse than useless; it is an obstacle.

ThryftVerse's creator suite must make every user's output look better than they expected. This means:
- Auto-compose layouts that produce editorial-quality arrangements from a few taps
- Filters and effects that are subtle and tasteful, not garish
- Text tools with good defaults (font, size, colour, shadow) so the user doesn't have to be a typographer
- Crop and cutout tools that preserve the subject's silhouette

### Creative flow state

Creative flow is fragile. The user is in a flow state when they're making rapid decisions — add this, move that, try this filter — and the tool responds instantly to every action. Flow breaks when:
- The tool introduces a loading state between action and feedback (>200ms feels broken)
- The user has to navigate to a different screen to access a tool they need
- The tool presents a modal dialog that interrupts the creative stream
- The tool requires the user to make a decision they don't understand (e.g. "choose a blend mode")

The `LookComposerScreen.tsx` (lines 88–95) already implements the correct architecture: a single bottom surface state machine that shows exactly ONE panel at a time (`'tools' | 'items' | 'layout' | 'effects' | null`). This preserves flow by never competing for the user's attention with multiple simultaneous panels. The `ContextToolRail` (`frontend/src/creator/surfaces/ContextToolRail.tsx`) further refines this with a context-sensitive rail that adapts its visible tool set based on the active selection — up to 6 primary actions, overflow under "More."

### Low-friction capture

The camera must be the root creator state — the first and only thing the user sees. `CreatorEntryScreen.tsx` (lines 42–57) implements this correctly: "Creation is a continuous state, not a wizard. The camera is the ROOT creator state — the first and only thing the user sees when opening the creator. There is no dashboard, no 2×2 tile grid, no intent classification." From the camera, the user can capture (photo/video), open the gallery, switch capture mode, open drafts, or start a blank text poster. This is the correct architecture.

The `CreateCameraScreen.tsx` is now a thin redirect shim (lines 19–44) that forwards to `CreatorStudio` with `openEntry: true`. This is the correct canonical implementation — the standalone camera route was merged into the unified CreatorStudio flow.

### Immediate feedback

Every creative action must produce visible feedback within one frame (16ms). The `CreatorCamera.tsx` (lines 53–70) implements tap-to-focus with a visual reticle, recording ring, and shutter button with press-and-hold=video. The `MoodboardEditorScreen.tsx` (lines 129–327) implements pan/pinch/rotation with Reanimated shared values that drive transforms directly on the UI thread — the item moves as the finger moves, not after a round-trip through JS state. This is the correct pattern for all creative manipulation.

### Expressive range

The creator suite must support a wide expressive range — from a simple single-photo look with one tagged product to a multi-frame poster story with text, stickers, effects, and shoppable tags. The `StickerPicker.tsx` (lines 41–55) exposes a rich sticker vocabulary: mention, hashtag, poll, quiz, question, emoji, shape, countdown, location, time, weather, temperature. This is good breadth. The gap is in the *quality* and *discoverability* of these stickers — they must be easy to find, easy to place, and physically manipulable (drag, scale, rotate with two fingers).

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Defect 1: Dual creation paths for Looks — `CreateLookScreen` vs `LookComposerScreen`

The codebase has **two parallel Look creation paths**:
1. `CreateLookScreen.tsx` (399 lines) — a simple form-based screen with `LookMediaComposer`, caption input, outfit piece editor, and audience selector. Uses `expo-image-picker` with `allowsEditing: true, aspect: [4, 5]` for a basic crop. Tags are created by tapping on the photo; labels are typed manually; listings are linked via a text search.
2. `LookComposerScreen.tsx` (in `frontend/src/creator/look/`) — a full collage-native workspace with `CreatorCanvas`, multi-select, layers, effects, auto-layout, cutout, crop, and a context tool rail.

These two screens serve the same user goal (create a Look) but offer radically different capabilities. `CreateLookScreen` is the simpler, older path; `LookComposerScreen` is the V3 flagship path. The `LookDetailScreen.tsx` "Edit" action (line 204) navigates to `CreatorStudio` with `type: 'look'` — the V3 path. But `CreateLookScreen` still exists as a registered route, creating ambiguity about which is canonical.

**Impact:** Users may encounter the basic form when they expect the full creative studio, or vice versa. The basic form's tag system (`LookMediaComposer.tsx` lines 197–235) is primitive — tap to place a dot, type a label manually, optionally search listings — compared to the V3 composer's product browser, cutout, and layer system.

### Defect 2: `LookMediaComposer` tag system is prototype-level

`LookMediaComposer.tsx` (lines 101–114) implements tag placement via `onStartShouldSetPanResponder` and a `handlePhotoPress` that reads `locationX/locationY` from the native event. The tag editor (lines 214–227) shows a "Label" text, a hint "Tap the dot to set label," and a remove button — but there is **no text input in the tag editor itself**. The label is set in the `OutfitPieceEditor` below the image, not at the tag location. This is a context switch: the user taps a dot on the photo, then scrolls down to find the corresponding piece card to type the label. This breaks the spatial mental model.

The tag dot (lines 326–333) is a 14pt white circle with a 2pt black border — functional but not art-directed. There is no tap-to-inspect preview like `LookDetailScreen` provides (lines 504–542). The creation experience is weaker than the viewing experience.

### Defect 3: `OutfitBuilderScreen` — StyleGraph scoring is opaque and potentially fabricated

`OutfitBuilderScreen.tsx` (lines 308–312) calls `scoreOutfit(outfitItems)` and `suggestCompletion(outfitItems, availableItems)` from `services/styleGraph`. The `ScoreBadge` (lines 225–250) displays a numeric compatibility score with a colour-coded border (green ≥80, brand ≥50, danger <50). The score animates with a spring scale on change.

The concern is truthfulness: if `styleGraph` uses heuristic rules rather than real ML model inference, the score is a fabricated authority signal. A user who sees "Compatibility: 87" believes the system has analysed their outfit — but if it's just `if (items.length >= 3) return 80`, that's a lie. The `aiSuggestion` card (lines 496–517) says "Add a [slot] to improve your outfit score by +N" — this implies the system has predictive knowledge of outfit quality. Without a real model, this violates AGENTS.md §11 (Truthful UI).

### Defect 4: Moodboard is in demo mode with no backend

`MoodboardEditorScreen.tsx` imports `MOODBOARD_DEMO_MODE` from `services/moodboardApi` (line 70) and displays an honest "Demo mode — moodboards are saved locally" banner (lines 723–731). `MoodboardHomeScreen.tsx` shows the same banner (lines 461–468). This is truthful per AGENTS.md §11 — but it means the entire moodboard feature is a local-only prototype. The `handleCreateWithPosterStudio` action (lines 390–396) navigates to `CreatorStudio` with `type: 'poster', openTemplates: true` — suggesting that moodboard creation was partially migrated to the Poster Studio, creating a confusing dual-entry point.

The moodboard editor's gesture system (lines 129–327) is well-built — pan, pinch, rotation, tap, long-press with Reanimated shared values — but it operates on a fixed `ITEM_BASE_SIZE = 120` (line 85) which means all canvas items are the same base size. Real moodboards need variable item sizes, which the current model doesn't support.

### Defect 5: `PosterHighlightViewerScreen` — inefficient data loading

`PosterHighlightViewerScreen.tsx` (lines 61–97) loads highlight data by fetching **all** highlights for the current user and then finding the one matching `highlightId` in the response array. The code comment (lines 66–74) acknowledges this: "We don't know the userId here, so we fetch via a different approach... This is a limitation of the backend API design." This is an N+1 problem — if a user has 50 highlights, all 50 are fetched to display one. The fix is a backend `GET /poster-highlights/:highlightId` endpoint, but the frontend should also not import `useStore` dynamically inside a `useEffect` (line 75: `const { useStore } = await import('../store/useStore')`) — this is a code smell that indicates the component was built without proper dependency injection.

### Defect 6: `CreativeToolbar` — chrome-heavy tool buttons

`CreativeToolbar.tsx` (lines 90–131) renders tool buttons with a `LinearGradient` fill on the active state (brand → antiqueGold) and a 1pt border on the inactive state. The toolbar container (lines 182–192) uses `backgroundColor: colors.overlay` with `borderRadius: Radius.xxl` — a floating pill container. This violates AGENTS.md §4's surface budget constraint: "Above the fold, use at most one dominant non-media panel." The toolbar is a second panel competing with the canvas. The `ContextToolRail` in the V3 composers is the correct pattern — transparent background, no card, no border. `CreativeToolbar` appears to be a legacy component that should be migrated or removed.

### Defect 7: `OutfitBuilderScreen` — card-on-card composition

`OutfitBuilderScreen.tsx` wraps the slot row, score row, and background picker in a single `previewWrap` card (lines 610–618: `backgroundColor: colors.surface, borderWidth: Stroke.standard, borderColor: colors.border`). Inside this card, the AI suggestion is in its own `aiCard` (lines 667–672: `backgroundColor: colors.surface, borderWidth: Stroke.standard`). This is card-on-card — the inner card doesn't represent a distinct interaction boundary. The item grid below uses `ItemThumb` cards (lines 188–223) with their own borders and shadows. The result is a screen dominated by nested rounded rectangles rather than content.

### Defect 8: `CreatePosterHighlightScreen` — no creative editing

`CreatePosterHighlightScreen.tsx` (567 lines) is a frame *selector*, not a frame *editor*. The user picks frames from archived stories, chooses a cover, and names the highlight. There is no cropping, no text overlay, no sticker, no filter — the frames are used as-is. Compared to Instagram's highlight cover editor (which lets you crop, add text, and choose a cover frame from any point in the story), this is minimal. The `thumbSelected` style (lines 520–528) adds a `shadowColor: colors.brand, shadowOpacity: 0.2` — a decorative shadow that doesn't communicate state clearly.

### Defect 9: `StyleQuizScreen` — quiz results don't feed the creator

`StyleQuizScreen.tsx` (418 lines) collects gender, style, and price preferences and stores them via `updatePersonalisation` (line 108). The quiz itself is well-designed — 4 steps, progress bar, summary card, skip option. But the results feed only the Explore/Home feed personalisation. They do **not** feed the creator suite: the style preferences don't influence template suggestions, filter defaults, or auto-compose layouts. A user who says "I like Streetwear" should see streetwear-oriented templates when they open the Look composer, not generic ones.

### Defect 10: AI photo enhancement is demo-only

`aiPhotoEnhancementApi.ts` (line 82) sets `AI_PHOTO_DEMO_MODE = __DEV__`. In demo mode, every function returns the **original image URI** with `isDemo: true` — no actual enhancement is applied. The UI is expected to show a "Demo mode" banner. This is truthful, but it means the entire AI photo enhancement feature (background removal, AI shadows, auto-crop, colour correction, background replacement, lighting fix) is non-functional in production. The `AutoAdjustButton` and `AdjustPanel` in the creator effects system (`frontend/src/creator/tools/effects/`) may call through to this service, meaning the "Auto Adjust" button in the Look/Poster composer does nothing in production.

---

## 4. Micro Improvements

1. **Remove `CreateLookScreen` as a registered route.** All Look creation should flow through `CreatorStudio` → `LookComposerScreen`. Keep `CreateLookScreen` only as a redirect shim (like `CreateCameraScreen`) for legacy deep links. This eliminates the dual-path ambiguity.

2. **Add inline tag label editing in `LookMediaComposer`.** When a tag is active, show a `TextInput` directly at the tag location (in the `tagEditor` popover) instead of requiring the user to scroll down to `OutfitPieceEditor`. The `tagEditor` (lines 214–227) already has the popover container — add a `TextInput` with auto-focus and a "Link to listing" button inside it.

3. **Replace `OutfitBuilderScreen` score with honest heuristic label.** If `styleGraph` uses rules (not ML), label the score as "Style match" rather than "Compatibility" and show the reasons as the primary information, not the number. The number implies a precision the system doesn't have.

4. **Flatten `OutfitBuilderScreen` preview card.** Remove the inner `aiCard` border and background — render the AI suggestion as a flat row with a hairline separator above it, inside the same `previewWrap`. Remove the `ItemThumb` card border and shadow; use a hairline separator between items instead.

5. **Fix `PosterHighlightViewerScreen` data loading.** Add a `GET /poster-highlights/:highlightId` backend endpoint and fetch the single highlight directly. Remove the dynamic `import('../store/useStore')` — pass `currentUser` via props or use a static import.

6. **Remove `CreativeToolbar` and migrate callers to `ContextToolRail`.** The `ContextToolRail` already implements the correct transparent, context-sensitive pattern. Any screen still using `CreativeToolbar` should be migrated.

7. **Add `StyleQuizScreen` results to creator template filtering.** When `LookComposerScreen` or `PosterComposerScreen` opens the template browser, filter/sort templates by the user's style preferences from the store. A "Streetwear" user sees streetwear templates first.

8. **Add variable item sizes to moodboard canvas.** Change `ITEM_BASE_SIZE` from a constant to a per-item property in the `MoodboardItem` type. The picker tile can offer size presets (small, medium, large) when adding an item.

9. **Add highlight cover editing to `CreatePosterHighlightScreen`.** Let the user crop the cover frame, add text, and choose a background colour — matching Instagram's highlight cover editor. This is a creative tool, not just a selector.

10. **Label AI photo enhancement honestly in production.** If `AI_PHOTO_DEMO_MODE` is true in production, either disable the "Auto Adjust" button with a truthful "Coming soon" disabled state (per AGENTS.md §11: "show a truthful disabled state") or remove it from the toolbar entirely. Do not show a button that appears to work but returns the original image.

---

## 5. Macro Improvements

### 5.1 Unified creator architecture

The creator suite has the right bones: `CreatorStudioShell` dispatches to `LookComposerScreen` or `PosterComposerScreen` based on `type`; both wrap themselves in `CreatorProvider`; both share `CreatorCanvas`, `CreatorContext`, the composition document model, and the `ContextToolRail`. The architecture is sound. The gap is in the *legacy surfaces* that haven't been migrated:

- `CreateLookScreen` should become a redirect shim
- `OutfitBuilderScreen` should be re-evaluated: is it a creator tool or a closet/wardrobe tool? If it's a creator tool, it should use the composition document model and `CreatorCanvas`. If it's a wardrobe tool, it belongs in the profile/closet department, not the creator suite.
- `MoodboardEditorScreen` should either be migrated to the composition document model (so moodboards use the same layer system as posters) or clearly scoped as a separate, simpler tool. The `MoodboardHomeScreen` already navigates to `CreatorStudio` for "Studio" creation (line 502), suggesting the migration is partially intended.

### 5.2 Capture-first flow consolidation

The capture-first flow is architecturally correct: `CreatorEntryScreen` → camera → capture → editor. But the entry points are scattered:
- The "Create" tab navigates to `CreateCamera` → redirects to `CreatorStudio` with `openEntry: true`
- `MoodboardHomeScreen` has a "Create" button (→ `MoodboardEditor`) and a "Studio" button (→ `CreatorStudio` with `type: 'poster'`)
- `LookDetailScreen` "Edit" navigates to `CreatorStudio` with `type: 'look', sourceDocumentId`
- `LookDetailScreen` "Remix" navigates to `CreatorStudio` with `type: 'look', sourceDocumentId`

The consolidation should ensure that **every** creation entry point goes through `CreatorStudio` with the appropriate `type` parameter. The moodboard "Create" button should navigate to `CreatorStudio` with `type: 'poster'` and a moodboard template, not to the separate `MoodboardEditor`.

### 5.3 Editing tool rail standardisation

The `ContextToolRail` (`frontend/src/creator/surfaces/ContextToolRail.tsx`) is the correct pattern: context-sensitive, transparent, max 6 primary tools, overflow under "More." Both `LookComposerScreen` and `PosterComposerScreen` use it. The remaining work:

- Ensure the tool registry (`core/toolRegistry`) covers all creator contexts (look-edit, look-create, poster-edit, poster-create, moodboard) with appropriate tool groups
- Migrate any remaining `CreativeToolbar` usages to `ContextToolRail`
- Add tool pinning personalisation (`usePinnedTools` is already imported in `ContextToolRail.tsx` line 50 — ensure it's wired)

### 5.4 Poster/Look truthfulness

The poster system has a strong truthfulness foundation: `PosterViewerScreen.tsx` records real frame views via `recordPosterFrameView` (line 377), fetches real tags via `fetchPosterTags` (line 389), and preloads next-frame media (lines 402–415). `PosterStoryActivityScreen.tsx` shows real viewer counts, reaction counts, and completion rates. This is the correct pattern.

The Look system is similarly truthful: `LookDetailScreen.tsx` fetches the creator's real profile and real "more looks" from the API (lines 152–184). The `handleTagTap` (lines 282–295) honestly tells the user "This tag has no product attached" when no listing ID is available, rather than navigating to a dead end.

The gap is in the **creation** truthfulness: the `OutfitBuilderScreen` score (if heuristic, not ML) and the AI photo enhancement (demo mode in production) are the two areas where the system may be presenting fabricated intelligence. These must be either backed by real models or honestly labelled as heuristic/demo.

### 5.5 Moodboard → composition document migration

The moodboard editor uses its own data model (`Moodboard`, `MoodboardItem`, `MoodboardItemPosition`) and its own service (`moodboardApi` with `MOODBOARD_DEMO_MODE`). The composition document model (`CreatorDocument`, `CreatorLayer`, `CreatorPage`) already supports spatial layouts (the Look composer uses it for collage). Migrating moodboards to the composition document would:
- Eliminate the separate demo-mode service
- Give moodboards access to the full layer system (text, shapes, backgrounds, effects)
- Enable moodboard templates using the same template browser
- Unify the rendering pipeline (`CreatorCanvas` for both looks and moodboards)

---

## 6. Flagship Acceptance Criteria

### Capture & entry
- [ ] The camera is the root creator state — no dashboard, no tile grid, no intent classification before capture
- [ ] Capture (photo/video) → editor transition is a continuous flow with no route change
- [ ] Gallery access from the camera is one tap; multi-select returns to the editor with all selected assets
- [ ] Drafts are accessible from the camera top bar; resuming a draft loads the full composition state
- [ ] Camera permission denied state is art-directed with a clear path to Settings

### Look composer
- [ ] Canvas is 4:5 with direct object manipulation (pan, pinch, rotate)
- [ ] Context tool rail shows max 6 primary tools, transparent background, overflow under "More"
- [ ] Product tags can be placed, labelled, and linked to listings **inline** (no scroll to a separate editor)
- [ ] Auto-compose produces editorial-quality layouts from selected items
- [ ] Effects (filters, adjust) render via Skia GPU with live thumbnail previews
- [ ] Cutout (background removal) works when the native backend is available; honestly labelled "Crop" when it is not
- [ ] Publish flow uploads all local media, receives remote URLs, and never fabricates upload success
- [ ] Drafts persist across sessions with crash recovery

### Poster composer
- [ ] Frame-native model: one frame fills the screen; frame navigation appears only because there are multiple frames
- [ ] Timeline, transitions, keyframes, and speed curves are in "More/Advanced," not the first-run path
- [ ] Sticker picker exposes the full vocabulary (polls, quizzes, countdowns, mentions, products) with two-finger manipulation
- [ ] Text tool has good defaults (font, size, colour, shadow) and supports inline editing
- [ ] Preview mode shows the poster as a viewer will see it (full-screen, auto-advance, safe zones hidden)

### Poster viewer
- [ ] Three-layer preloading (current frame, next frame, next story's first frame) eliminates blank spinners
- [ ] Tap zones for frame navigation are correct (left = previous, right = next)
- [ ] Double-tap produces a heart reaction with haptic feedback
- [ ] Long-press pauses; release resumes
- [ ] Pinch-to-zoom works on image frames with rubber-band clamping
- [ ] Swipe-down dismisses the viewer
- [ ] Shoppable tags are fetched per-story and rendered as hotspots on the current frame

### Moodboard
- [ ] Canvas supports pan/pinch/rotate with Reanimated shared values (already implemented)
- [ ] Variable item sizes (not fixed 120pt base)
- [ ] Theme picker with live background preview
- [ ] If demo mode: honest "Demo mode" banner (already implemented)
- [ ] If migrated to composition document: full layer system access

### Truthfulness
- [ ] No "Coming soon" toasts on any creator control
- [ ] AI photo enhancement is either backed by a real model or honestly disabled in production
- [ ] Outfit compatibility score is either backed by a real model or honestly labelled as a heuristic
- [ ] No fabricated upload success — local URIs are never treated as delivered remote media
- [ ] Drafts are persisted, not faked

### Visual quality
- [ ] No card-on-card composition in any creator surface
- [ ] Tool rails are transparent (no floating pill containers)
- [ ] One bottom surface at a time (no competing panels)
- [ ] Radius budget: max two non-avatar radius sizes per viewport
- [ ] Squint test: canvas/media dominates; tool chrome recedes

---

## 7. Priority & Sequencing

### Phase 1 — Truthfulness & consolidation (1–2 days)
1. Remove `CreateLookScreen` as a creation path; make it a redirect shim to `CreatorStudio`
2. Audit `styleGraph` — if heuristic, relabel the score honestly or remove it
3. Disable or remove the "Auto Adjust" button in production if `AI_PHOTO_DEMO_MODE` is true
4. Fix `PosterHighlightViewerScreen` data loading (single-highlight fetch endpoint)

### Phase 2 — Look composer polish (2–3 days)
5. Add inline tag label editing in `LookMediaComposer` (TextInput in the tag popover)
6. Add tap-to-inspect preview in the creation tag system (matching `LookDetailScreen`'s hotspot preview)
7. Wire `StyleQuizScreen` results to creator template filtering
8. Flatten `OutfitBuilderScreen` card-on-card composition

### Phase 3 — Moodboard migration (3–5 days)
9. Migrate `MoodboardEditorScreen` to the composition document model
10. Add variable item sizes to the moodboard canvas
11. Consolidate `MoodboardHomeScreen` creation entry points to `CreatorStudio`
12. Remove `MOODBOARD_DEMO_MODE` once backend is wired

### Phase 4 — Poster highlight editing (2–3 days)
13. Add cover frame cropping and text overlay to `CreatePosterHighlightScreen`
14. Add background colour picker for highlight covers
15. Match Instagram's highlight cover editor capability

### Phase 5 — Tool rail standardisation (1–2 days)
16. Audit all remaining `CreativeToolbar` usages and migrate to `ContextToolRail`
17. Verify tool pinning personalisation is wired in all composer contexts
18. Ensure the tool registry covers all creator contexts with appropriate tool groups

### Phase 6 — Performance & preloading (2–3 days)
19. Add effect preloading (warm-up) to the Look/Poster composer — load effect thumbnails before the user opens the effects panel
20. Verify three-layer media preloading in `PosterViewerScreen` is working for all story transitions
21. Add preload for moodboard picker items on the moodboard home screen

---

**Total estimated effort:** 11–18 days for full flagship pass across all creator surfaces.

**Key files to modify:**
- `frontend/src/screens/CreateLookScreen.tsx` — convert to redirect shim
- `frontend/src/components/look/LookMediaComposer.tsx` — inline tag editing
- `frontend/src/screens/OutfitBuilderScreen.tsx` — flatten cards, honest score
- `frontend/src/screens/MoodboardEditorScreen.tsx` — composition document migration
- `frontend/src/screens/MoodboardHomeScreen.tsx` — consolidate entry points
- `frontend/src/screens/PosterHighlightViewerScreen.tsx` — fix data loading
- `frontend/src/screens/CreatePosterHighlightScreen.tsx` — add cover editing
- `frontend/src/screens/StyleQuizScreen.tsx` — wire results to creator
- `frontend/src/services/aiPhotoEnhancementApi.ts` — honest production labelling
- `frontend/src/components/poster/CreativeToolbar.tsx` — migrate to ContextToolRail
- `frontend/src/creator/look/LookComposerScreen.tsx` — template filtering, effect preload
- `frontend/src/creator/poster/PosterComposerScreen.tsx` — effect preload
- `frontend/src/creator/surfaces/ContextToolRail.tsx` — verify tool pinning
