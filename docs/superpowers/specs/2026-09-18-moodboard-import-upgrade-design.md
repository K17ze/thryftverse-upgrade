# Mood Board Capability Upgrade — Design Spec

Date: 2026-09-18 · Status: **proposed — awaiting approval**
Research basis: `.flagship/research-moodboard-upgrade-2026-09-18.md`

## 1. Goal

Turn the mood board from a listings-only collage into a mixed-source editorial canvas — Pinterest Collage / Shuffles-class — with three first-class ingestion sources (listings, own Looks, device gallery), honest staged import progress, and an editor decomposed into modules. All within the existing server-authoritative LWW + collaboration domain, anti-AI design policy, and truth-lockdown rules.

## 2. Scope

### In scope

1. **Mixed-source item model** — backend + frontend contract: `listing | look | media`, provenance, caption, aspect ratio.
2. **Gallery import** — system picker (zero-permission fast path) + `MediaBrowserSheet` (full browser, ordered multi-select) → `uploadMedia` → verified `mediaFinalizationId` add → per-item staged progress.
3. **Looks import** — "Looks" source tab showing the user's published looks as real media tiles → server-resolved `lookId` add.
4. **Source-tabbed picker** — replace the single listing rail + "Add to canvas" eyebrow with a Listings · Looks · Photos segmented switcher.
5. **Editor decomposition** — extract the 1,716-line monolith into `src/components/moodboard/` modules; screen becomes orchestrator.
6. **Honesty fixes adjacent to the work** — server-side listing media resolution (items currently store `media_url=''`), outbox drain wiring + op-name alignment, sync-error retry action, "Keep my version" → honest behavior.
7. **Upload UX polish** — per-item import tray (thumbnails + per-item state + retry), unified sync status surface.
8. **Playable video items (user-approved expansion)** — video looks and gallery videos land as playable canvas items: `VideoView` paused → first frame/poster, muted loop, tap toggles play/pause, play-glyph affordance (IG Stories photo-sticker semantics). `expo-video` is installed; `LookMediaCarousel` already plays m3u8 on both platforms.

### Out of scope (deferred, documented)

- Freeform cutout stickers (subject segmentation) — research-flagged as the next frontier, requires a segmentation pipeline.
- Smart guides/snapping, auto-arrange, sections, board density views, table view — canvas vocabulary upgrades, separate campaign.
- Board management (rename/delete/visibility UI), invite redemption, manual version snapshots — real gaps, separate fix.
- Text/note items — `source_type` enum leaves room; not built now.
- Importing *other users'* looks — own looks only (ownership verification).

## 3. Data model & contracts

### 3.1 Migration `318_moodboard_item_sources.sql`

```sql
ALTER TABLE moodboard_items
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'listing'
    CHECK (source_type IN ('listing','media','look','note')),
  ADD COLUMN IF NOT EXISTS source_look_id TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image','video')),
  ADD COLUMN IF NOT EXISTS poster_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS aspect_ratio NUMERIC NOT NULL DEFAULT 1.0;

UPDATE moodboard_items
  SET source_type = CASE WHEN listing_id IS NOT NULL THEN 'listing' ELSE 'media' END;
```
(+ `_down` file per convention.)

### 3.2 `POST /moodboards/:id/items` — extended `addItemSchema`

```ts
{
  listingId?: string,               // existing
  lookId?: string,                  // NEW — resolves look media server-side
  mediaUrl?: string,                // existing
  mediaFinalizationId?: string,     // existing — verified receipt path
  mediaType?: 'image'|'video',      // NEW — default 'image'
  title?, caption?, priceGbp?,      // existing
  aspectRatio?: number,             // NEW — client-declared, clamped 0.2–5
  positionX?, positionY?, rotation?, scale?  // existing
}
```

Server resolution rules (never trust the client for denormalized data):
- `listingId` → resolve listing's primary image (`l.image_url` → first `listing_images` row, video→`poster_url`), `title`, `price_gbp` **server-side** — fixes the current `media_url=''` defect. Client overrides still accepted for `mediaUrl`.
- `lookId` → verify `looks.creator_id = actor` (own looks only), resolve `media_url`/`poster_url`/`media_type` + look `title`; store `source_type='look'`, `source_look_id`. For video looks: `media_url` = playback URL (m3u8), `poster_url` = JPEG frame — canvas plays the video inline.
- `mediaFinalizationId` → existing receipt verification (owner + finalized) → `public_url`; store `source_type='media'`, `media_asset_id` (column exists, currently unwritten), `media_type`/`aspect_ratio` from the media asset receipt when available.
- `aspectRatio` + `mediaType` overrides accepted for all paths, clamped/enum-validated.

The `item.add` **ops path** gets the same resolution helper so both paths share one trust boundary (ops path currently inserts unverified `mediaUrl`).

### 3.3 `mapItem` response extension

```ts
{ id, listingId, sourceType: 'listing'|'media'|'look'|'note', sourceLookId: string|null,
  imageUri,            // = media_url for images, poster_url for videos
  videoUri,            // = media_url when mediaType==='video', else ''
  mediaType: 'image'|'video', title, caption, price, aspectRatio,
  position, addedAt, revision, isDemo }
```

### 3.4 Upload folder

Add `'moodboards'` to the presign/finalize `folder` enum (`uploads.ts`) and `creatorScopeForFolder` → `general` scope with `scopeRefId = boardId`. Semantically correct storage path; `uploads`/`general` works as fallback.

### 3.5 Frontend `MoodboardItem`

```ts
export type MoodboardItemSourceType = 'listing' | 'media' | 'look' | 'note';
export interface MoodboardItem {
  id: string;
  sourceType: MoodboardItemSourceType;
  listingId: string;            // '' unless sourceType==='listing'
  sourceLookId: string | null;
  imageUri: string;             // poster for video items
  videoUri: string;             // '' unless mediaType==='video'
  mediaType: 'image' | 'video';
  title: string;
  caption: string;
  price: number;
  aspectRatio: number;
  position: MoodboardItemPosition;
  addedAt: string; isDemo: boolean; revision: number;
}
```

`addItemToMoodboard(boardId, input)` becomes a discriminated input: `{listingId} | {mediaFinalizationId, mediaType?, title?, caption?, aspectRatio?} | {lookId}`.

## 4. Import UX architecture

### 4.1 Source-tabbed picker (replaces "Add to canvas" eyebrow)

Bottom panel keeps theme rail + picker rail geometry; the eyebrow label is replaced by a compact **segmented source switcher**: `Listings · Looks · Photos`. One control family, hairline-separated, no pills-on-pills.

- **Listings** — existing picker rail (saved → recently-viewed), unchanged tile design.
- **Looks** — horizontal rail of real media tiles (`mediaType==='video' ? posterUrl : mediaUrl`), aspect from `compositionDocument.canvas.aspectRatio` → `mediaWidth/Height` → 1:1 fallback; tap adds via `{lookId}`.
- **Photos** — rail of previously-imported board-media (the board's `media` items feed reuse) + persistent leading **Import tile** (camera-roll glyph, real affordance, not a decorated card). Tap → `ImagePicker.launchImageLibraryAsync` (PHPicker, no permission, ordered multi-select, `selectionLimit` remaining); long-press or "Browse library" → `MediaBrowserSheet` (albums, ordered badges, limited-library handling) — the `CreatorEntryScreen` fast/power split, reused verbatim.

Empty canvas copy becomes honest: "Start your moodboard — add listings, looks, or photos below."

### 4.2 Import pipeline (gallery → canvas)

```
pick assets (PHPicker or MediaBrowserSheet → SelectedAsset[])
  → normalize via mediaUploadAsset (MIME/size/dimension validation, EXIF orientation)
  → per-item: uploadMedia(uri, 'moodboards') → finalizationId
  → POST /items {mediaFinalizationId, aspectRatio}
  → item lands on canvas at cascade position
```

- Items are added **as each upload finalizes** — the optimistic-land pattern (research §9.2): the import tray shows progress per item; canvas receives them incrementally.
- **Import tray**: a `CaptureStagingTray`-style strip inside the bottom panel during an active import — real thumbnails, per-item state: `queued → uploading N% → confirming → placed → failed (tap to retry)`. No bare spinners; percent for >10s waits; failure preserves the item with a retry affordance.
- Cancellation: swipe-away/dismiss of the tray cancels in-flight PUTs via `AbortSignal`; already-placed items stay (honest — they're real board items).
- Offline: picked items park at `waiting for connection` state (NetInfo gate, same pattern as `useUploadManager`); online resume continues from the PUT.
- Dedup: same `uri` imported twice → second add is allowed (user intent) but the *upload* is deduped via the in-flight map.
- Aspect: `Image.getSize` on the local URI gives `aspectRatio` pre-upload; the media-asset receipt's processor-measured dims win when present.

### 4.3 Looks picker

`fetchLooksFromApi({creatorId: currentUserId, status:'published', limit:60})` with cursor pagination on scroll-end. Tiles: real thumbnail + title (1 line) — **not** the `LookPicker` text-row pattern. Failed-to-load tile → error state with retry. Empty: "No published looks yet" + honest affordance (create a look — navigates to composer).

### 4.4 Canvas item geometry & video

`CanvasItem` renders at `ITEM_BASE_SIZE × (aspectRatio, 1)` bounding box — media items show at natural aspect (Pinterest collage pieces aren't forced square). Shared-value transform math is unchanged (transforms are center-origin; only the inner content box size changes). `halfBase` becomes per-axis `halfW/halfH`.

**Video items** (`mediaType==='video'`): `useVideoPlayer(videoUri)` per item, `VideoView` paused → first frame/`posterUri`, `isLooping`, `volume=0` (muted — canvas is a composition surface, not a player). Tap on a video item toggles play/pause *and* selects — a 18pt play/pause glyph overlay (bottom-left, scrimmed) communicates state. Pan/pinch/rotate gestures unaffected (VideoView doesn't consume touches; the gesture detector wraps it). Players pause when the sheet/modal opens or item scrolls off... items are always on-canvas, so players pause on sheet-open via a shared `videoPlaybackSuspended` flag.

## 5. Editor decomposition — `src/components/moodboard/`

| New module | Contents |
|---|---|
| `MoodboardCanvasItem.tsx` | the memoized gesture item (pan/pinch/rotate/tap/long-press) + aspect-aware geometry |
| `MoodboardSourceRail.tsx` | segmented switcher + listings/looks/photos rails + import tray mount |
| `MoodboardImportTray.tsx` | per-item upload strip with states/retry/cancel |
| `MoodboardThemeRail.tsx` | theme chips |
| `MoodboardSelectionControls.tsx` | single + multi-select control rows |
| `MoodboardSyncOverlay.tsx` | unified status surface (one component: syncing/synced/error+retry/conflict card) |
| `useMoodboardBoard.ts` | board load, ops submission, reconcile, conflict state, realtime |
| `useMoodboardImport.ts` | import state machine (pick→normalize→upload→add→tray lifecycle) |
| `useMoodboardLooks.ts` | my-looks fetch/pagination |
| `moodboardImportService.ts` | pick→normalize→upload→add orchestration (testable pure-ish layer) |

Screen stays the orchestrator (< ~450 lines): state wiring, header, canvas host, sheets. Static/themed style duplication collapsed into one `useStyles` per module.

## 6. Honesty fixes bundled (adjacent, small)

1. **Listing `media_url=''` defect** — server-side resolution (§3.2). Without this, listing items render blank — currently masked only because picker-add sends nothing and no one has exercised failure visibly.
2. **Outbox drain** — call `drainMoodboardOutbox` on reconnect + board load; rename outbox ops to `item.transform`/`board.theme`; include rotation/scale in the move payload; submission goes through `submitMoodboardOperation` so LWW semantics apply.
3. **Sync error → retry** — the error pill gains a retry affordance (re-submit last op) instead of "try again" implying repeat-the-gesture.
4. **"Keep my version"** — re-submit the preserved local snapshot's item transforms via ops (real behavior) or rename to "Dismiss" — implemented as real resubmission if simple, honest label if not.
5. **`media_asset_id` write** — lineage column actually populated for media items.

## 7. Anti-AI design rules applied

- Source switcher is one control — not three cards.
- Import tile is a real affordance (camera-roll glyph + label), not a decorated hero.
- No new pills: sync states collapse into `MoodboardSyncOverlay` — one surface, hairline-separated from canvas, honest icons.
- Import tray uses real thumbnails — media is the color; states are a 1pt progress rule under each thumb + a state word, not badges.
- Canvas items: media at natural aspect, 1pt selection stroke, existing gesture grammar untouched.
- Copy: "Listings / Looks / Photos", "Import photos", "No published looks yet" — no verbs explaining the feature, no "smart", no emoji.

## 8. Verification plan

- **Backend**: extend `addItemSchema` tests (listing resolution, lookId ownership+media resolution, mediaFinalizationId path, aspectRatio clamp); `item.add` ops-path resolution parity; migration up/down.
- **Frontend unit**: `moodboardImportService` state machine (pick→upload→add, cancel, retry, offline park, dedup); mixed-source `mapApiItem`/`MoodboardItem` mapping; source-tab switching; looks tile URL rule (video→posterUrl).
- **Editor**: decomposition = pure extraction (snapshot the gesture grammar verbatim).
- **Gates**: `tsc` clean, focused vitest, full `src/creator`+new-scope eslint, full frontend suite.
- **Manual/device**: picker on iOS/Android, limited-library path, offline→reconnect import resume — documented if no device available.

## 9. Risks & decisions needing sign-off

1. **Backend contract change** — new migration + `POST /items` schema extension + `mapItem` fields + uploads folder enum. Small but real.
2. **`lookId` resolution = own looks only** — other people's looks can't be imported (ownership check). Acceptable per the request ("uploads that done as looks").
3. **`MediaBrowserSheet` stays in `src/creator/`** — imported directly; hoisting to `src/components/` is cosmetic and deferred.
4. **Video looks import as `posterUrl` stills** — honest representation, no canvas video playback.
5. **Outbox "item.add" for gallery imports** — imports use REST `/items` (verified path); offline imports park in the tray rather than the outbox (uploads can't be queued as ops anyway).

## 10. Build order

1. Migration + backend item-source resolution + mapItem + folder enum (+ backend tests)
2. `moodboardApi.ts` contract extension (`sourceType`, `caption`, `aspectRatio`, discriminated `addItemToMoodboard`)
3. Editor decomposition (pure extraction, gates green at each step)
4. Source switcher + Looks rail + Photos rail + Import tile
5. `moodboardImportService` + `useMoodboardImport` + `MoodboardImportTray`
6. Aspect-aware canvas items + honest copy/state updates
7. Outbox drain + sync retry + keep-local honesty
8. Tests, gates, adversarial review, re-audit
