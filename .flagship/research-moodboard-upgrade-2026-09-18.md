# Mood Board Upgrade — Consolidated Research Report

Date: 2026-09-18 · Campaign: mood-board capability + gallery/Looks import + upload UI/UX flagship upgrade
Three parallel research streams: (A) live competitor/product research, (B) moodboard repo archaeology, (C) import/upload infrastructure. Sources verified against repo code — no claim below is unsupported by a cited file or a cited live source.

---

## A. Competitive / user-perspective research (live web, accessed 2026-09-18)

### The 2025–26 landscape: two paradigms, converging

1. **Ordered collection** — Pinterest boards, IG saved collections, Cosmos clusters: masonry/grid, drag-reorder, sections, covers.
2. **Freeform canvas** — Pinterest Collages/Shuffles, Canva Whiteboards, Milanote, IG Stories photo stickers: direct manipulation — drag, pinch, rotate, layer, cutout.
3. **Pinterest merged them in 2025**: "Styled for you" AI collages are built *from* saved Pins inside boards. Boards are now collection + canvas seed. ThryftVerse's moodboard already sits on the freeform-canvas side — the gap is ingestion breadth, not the canvas model.

### Pinterest (the reference implementation)

- **Boards**: masonry grid, 3 density modes (wide/2-up default/3-up compact); reorder via long-press-drag or explicit "Organize" mode with checkbox multi-select + batch move/copy/delete; sections as sub-containers; cover must be a Pin inside the board.
- **Collages/Shuffles**: freeform canvas; one-tap subject **cutouts** that keep price/availability metadata → natively shoppable; remix as social primitive; "learn to collage" cold-start tutorial.
- **Ingestion**: in-feed save, own uploads, Lens visual search, cutouts from any Pin, OS share-sheet, board export as auto-generated video montage/photo-grid for IG Stories.
- **Collaboration**: graduated permission tiers (everything / save+comment / invite / request-to-join), per-item emoji reactions inside group boards, sort-by-reactions. Scale: 98% of group boards ≤5 people, 77% two people — design for dyads.
- **Upload/export UX**: board→video montage or photo-grid export (public boards, ≥5 Pins, ≤14 in video).

### Instagram

- **Saved collections**: private utility grid, no reorder/layout/covers — a *gap we can exploit*: IG deliberately keeps collections non-visual.
- **Carousel multi-select**: numbered selection badges (order shown), up to 20 items, long-press-drag reorder; post-publish reorder added Mar 2026.
- **Stories freeform canvas**: photo stickers — drag/pinch/rotate, tap cycles frame shapes (square/rounded/circle/star/heart), recency stacking, cutout stickers that persist cross-device.
- **Upload trick (Krieger, Warm Gun 2011)**: upload starts when the user reaches the caption screen — *before* Share. Two round-trips; media transfers while user types; Share sends only metadata. Optimistic publish: post appears instantly, thin top progress indicator, failure → "Not posted yet. Try again" with draft preserved.

### Snapchat

- **Scissors**: freehand outline → subject lifts → movable sticker, auto-saved to personal sticker drawer.
- **Quick Cut (2025)**: multi-select from Memories/Camera Roll → instant rendered preview, beat-synced. Single-gesture creation beats multi-step flows.
- **Send states**: semantic icons (sent/delivered/pending/failed+retry) — never a percentage; pending self-heals; failure = state + action + preserved work.

### Canva / Milanote / Cosmos / Are.na

- Canva: smart guides (pink alignment lines), snap toggles, explicit z-order menu (Forward/Backward/To front/To back), lasso + tap-and-hold→"Select Multiple", Magic-arrange "tidy up" by color/author/topic.
- Milanote: **"Unsorted" inbox column** — capture now, curate later; drag-corner resize, double-tap corner restores size; color swatches as first-class objects.
- Cosmos: **All-Elements archive** (everything saved lands uncommitted first), connect-don't-copy graph model, direct Pinterest board import.
- Are.na: connect-over-copy (one block lives in many channels), pinned blocks, table view as second lens on a collection.

### Upload UX — the flagship pattern, distilled (research stream A §9)

1. Start upload before intent is confirmed; discard on cancel.
2. Render success optimistically; reconcile in background.
3. **Separate "uploading" from "processing/publishing"** — two states, two ETAs; never a bar that stalls at 99% (TikTok/YouTube both ship staged pipelines).
4. Percent-done indicator for >10s waits (Nielsen response-time limits: 0.1s direct manipulation / 1s flow / 10s attention).
5. Failure = state + action + preserved work; per-item retry, not batch.
6. Queue visibility: each job is its own row with its own state/reason.
7. Let users leave: background continuation + completion notification.
8. Accelerating progress bars feel faster (peak-end) — never stall at the end.

### Psychology worth citing

- Direct manipulation (Shneiderman/NN-g): <0.1s response, rapid/reversible/incremental actions.
- PHPicker runs out-of-process: **no permission prompt needed**, multi-select, ordered selection — the zero-friction gallery path.
- Haptics measurably improve drag-and-drop at boundary crossings.
- Springs are the only animation model preserving velocity continuity at gesture handoff (WWDC18/23).
- Masonry serves browsing, not organizing — give organizers a different lens.

---

## B. Repository archaeology (agent ff1051e6, verified)

### The editor monolith — `MoodboardEditorScreen.tsx` (1,716 lines)

- Canvas 70% + bottom panel 30%; CanvasItem owns pan/pinch/rotate/tap/long-press shared values; `Race(Simultaneous(pan,pinch,rotate), tap, longPress)`; multi-select swaps to tap-only.
- Add flow: `addItemToMoodboard(boardId, listingId)` → **full board re-fetch** per mutation; `handleBringAllToFront` is sequential O(n) requests.
- **Ingestion is a single listing rail**: `GET /moodboards/picker-items` (saved→recently-viewed fallback). No gallery import, no looks, no search, no other sources.
- Sync: server-authoritative LWW ops endpoint, but only `item.transform`/`board.theme` are ever submitted; add/remove/reorder go through plain REST.
- **Offline path is broken**: `drainMoodboardOutbox()` is never called anywhere; outbox op names (`item.move`, `board.setTheme`) don't match the `MoodboardOperationType` union and drop rotation/scale; `fetchJson` has a *separate* generic offline write-queue that double-queues mutations while the UI reports error.
- **"Keep my version" is a lie**: `onKeepLocal` just dismisses the conflict sheet; local edits are never re-submitted after the board reconciles to server state.
- Style debt: `styles` + `useStyles()` duplicate ~15 keys; three different sync-status pill styles; "Add to canvas" eyebrow label; hardcoded "pounds" in a11y labels; no i18n.
- `MoodboardEditor` opened with no `moodboardId` **creates a server board on every mount** — embedded CreatorStudio mount leaks "Untitled moodboard" boards.
- `MoodboardHomeScreen` (845 lines) is unreachable from app UI except editor back-fallback; deterministic fake masonry heights; no rename/delete/visibility management anywhere.

### Dead API surface

`updateItemPosition`, `updateMoodboardTheme`, `fetchMoodboardOperations`, `restoreMoodboard`, `createMoodboardVersion`, `acceptMoodboardInvite` (invite tokens can be created but never redeemed in-app), `MOODBOARD_DEMO_MODE`, the `moodboard` SQLite cache table (never read/written), 6 of 7 `MoodboardOperationType`s unused.

### Entry points

Command palette "Create moodboard", Discover feed `MoodboardDiscoveryTile`, CreatorStudio `type:'moodboard'` embedded mount, camera CreatorModeSwitch "Board", MoodboardHome "+", deep link `moodboards/:id`. Poster stories render boards read-only via `MoodboardPosterFrame`.

---

## C. Import/upload infrastructure (agent 1929bbc2, verified)

### What's already buildable with zero backend changes

- `POST /moodboards/:id/items` accepts `mediaFinalizationId` → server verifies `owner_id === actor` + `status='finalized'` → resolves `public_url` server-side (`moodboards.ts:777-808`).
- `uploadMedia(uri, folder)` → `UploadedMedia {publicUrl, finalizationId, mediaAssetId, width, height, blurhash}` — one call, presign→PUT→finalize→publish-gate (`mediaUpload.ts:484-563`).
- `MediaBrowserSheet` — self-contained prop-driven gallery browser: ordered multi-select with order badges, albums, pagination, permission+limited-library+settings states, camera tile, `SelectedAsset[]` output (`MediaBrowserSheet.tsx`, used only by `CreatorEntryScreen`).
- `fetchLooksFromApi({creatorId, status:'published'})` lists own published looks incl. private (`looks.ts:759-775`); look `mediaUrl` is the server-rendered flattened artifact; video looks carry JPEG `posterUrl`.

### Contract gaps discovered

- **Look items can't use the verified receipt path**: `/looks` list mapper doesn't emit `upload_finalization_id`/`media_finalization_id` (stored in DB, not selected). Options: backend accepts `lookId` on `POST /items` (cleanest — server resolves media + verifies creator), or unverified `mediaUrl` via ops `item.add`.
- **`item.add` ops path doesn't verify media ownership** — bypasses the receipt check; don't route device uploads through it.
- **Listing items store `media_url=''`**: `POST /items` with only `listingId` stores empty media_url — `mapItem` emits `imageUri: ''`. Server never resolves the listing image/title/price — a real defect for any item added via the current client (which sends only `{listingId}`).
- **`media_asset_id` column exists but is never written** — media lineage half-wired.
- **No `moodboards` upload folder enum** — use `uploads`/`general` scope today (`uploads.ts:46-59`); adding the enum value is trivial.
- `POST /items` bypasses the LWW baseRevision protocol — concurrent-collaborator adds aren't conflict-checked.
- Upload UX gaps (the "AI-made" complaint): bare `ActivityIndicator` "Saving…" pill on canvas; `SharingStateView` is a bar with no thumbnails/per-item rows; `LookPicker` shows text rows with no media thumbnails; no surface shows per-asset progress, staged states, or per-item retry.

---

## D. Design implications (what the research demands of the build)

| Research finding | Concrete design consequence |
|---|---|
| Pinterest: ingestion breadth is the product (Lens, uploads, cutouts, share-sheet) | Source-tabbed picker: **Listings · Looks · Photos** — three first-class sources, one control family |
| PHPicker needs no permission; MediaBrowserSheet exists | Gallery import = system picker fast path + full browser power path (same pattern as `CreatorEntryScreen`) |
| Verified receipt path exists for media | Device media: pick → `uploadMedia` → `POST /items {mediaFinalizationId}` |
| Look DTO lacks finalization IDs | Backend: `POST /items` accepts `lookId`, resolves media server-side, verifies `creator_id === actor` |
| Listing items store `media_url=''` | Backend resolves listing image/title/price server-side when `listingId` provided — also removes client trust |
| Staged upload states beat one bar (TikTok/YouTube) | Per-item import strip: queued → uploading % → confirming → placed / failed+retry (CaptureStagingTray pattern) |
| Optimistic + reconcile (IG) | Items land on canvas as each upload finalizes; failures preserve the picked set with retry |
| Canvas item aspect matters (Pinterest collage pieces aren't forced square) | `aspect_ratio` column + aspect-aware canvas items |
| Provenance enables navigation (Are.na connect) | `source_type` + `source_look_id` on items |
| Direct-manipulation quality bar | Keep existing gesture grammar; add aspect-aware item geometry |
| Editor is 1,716-line monolith | Decompose to `src/components/moodboard/` modules before adding the import surface |
| Offline outbox is dead code | Wire `drainMoodboardOutbox` on reconnect; align op names/payloads to `MoodboardOperationType` |
| "Keep my version" lies | Re-submit local ops or honest label |
| Anti-AI design policy | Kill the eyebrow label, unify sync pills into one status surface, no new decorative chrome; thumbnails are the color |
