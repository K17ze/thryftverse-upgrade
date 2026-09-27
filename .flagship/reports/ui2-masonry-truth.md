# UI-2 — Masonry Truth: Measured-Geometry Feedback for the Discovery Grid

Date: 2026-10 (session) · Surface: Discover/explore masonry (`PinterestMasonryGrid`) + `ProductDiscoveryTile`

## Root cause (confirmed)

Tiles resolved their frame via `resolveListingMediaAspectRatio()`, which only honored the
top-level `mediaAspectRatio` / `mediaWidth` / `mediaHeight` fields. Feed rows that carry none
(all rows from the For-You feed — see below) rendered every tile at the 3:4 portrait fallback,
so FlashList masonry had identical-height items in both columns and read as a plain 2-col grid.

Additionally, the resolver **ignored `media[]` record geometry entirely** — even though the
canonical media contract (`listingMedia.ts`) serves post-orientation `width`/`height` per
record on `/feed/home`, `/feed/discover`, `/listings`, `/related`, etc. Real server dims were
already reaching the device and being thrown away.

## What changed (re-author, not parameter tweak)

### `src/utils/listingMediaGeometry.ts`
- New `resolveServerListingMediaAspectRatio(source): number | null` — the honest server-truth
  resolver. Order: `mediaAspectRatio` → `mediaWidth`/`mediaHeight` → **the `media[]` record
  matched to the rendered cover URI** (falls back to first image record, never a video).
- `resolveListingMediaAspectRatio` is now `server ?? DEFAULT` — same public contract.
- New `hasServerListingMediaGeometry(source)` gate for measurement reporting.
- `normalizeAspectRatio` → exported as `normalizeMediaAspectRatio` so measured values pass
  through the identical 0.55–1.8 clamp.

### `src/utils/measuredMediaRatio.ts` (new)
Session-scoped `Map<unitId, ratio>` + per-key listener sets, consumed via
`useSyncExternalStore` (`useMeasuredMediaRatio`). Rules implemented:
- First valid measurement wins; repeats are no-ops (no measure→render loop).
- Non-finite / non-positive / out-of-clamp values are dropped, never clamped into a lie.
- Notifications are coalesced into one microtask — a first-viewport burst of ~8 image
  decodes produces a single render pass / masonry re-pack, not N sequential reflows.
- Keyed subscriptions keep re-renders local: a tile re-renders only when *its* media resolves.

### `src/components/CachedImage.tsx` (additive only)
`handleLoad` now normalizes decoded geometry across all three render paths —
expo-image `e.source`, RN Image `e.nativeEvent.source`, expo-av Video `e.naturalSize` —
and forwards `{source:{width,height}}` to `onLoad` whenever dims are present.
Previously the RN Image and Video paths silently dropped geometry.

### `src/components/ProductCard.tsx` — `ProductDiscoveryTile`
- Ratio resolution: `aspectRatio` (explicit reservation) → server truth → measured feedback
  → 3:4 standard.
- `onLoad` on the tile's `CachedImage` records decoded dims — **only when the row has no
  server geometry** (measurements never override API truth).
- Subscription is armed only when it can change the frame (`no prop && no server ratio`).
- Placeholder quieted: the tile's missing-media state was `ImageEmptyGraphic` (gradient +
  6 diagonal stripes + 48pt bordered icon ring + label pill) — chrome-heavy at ~180pt tile
  scale vs Depop's plain tonal cell. Now a flat `surfaceAlt` block + single 18pt muted glyph.
- Verified unchanged per spec: `Radius.lg` (12) media, price-first semibold, single-line
  title, hairline-free metadata, transparent save glyph with text-shadow scrim.

### `src/components/discover/PinterestMasonryGrid.tsx`
- Listing units (incl. hero) and the legacy `Listing[]` path now pass
  `resolveServerListingMediaAspectRatio(...) ?? undefined` — the 3:4 fallback is no longer
  baked into the prop, so measured geometry can take over inside the tile.
- `LookDiscoveryTile` and `PosterDiscoveryTile` subscribe to the same cache keyed by
  `unit.id` and report `ExpoImage.onLoad` dims — the authored 4:5 / 9:16 reservations become
  real cover geometry on first decode.
- `MoodboardDiscoveryTile` intentionally excluded: its 16:10 full-width frame is a composed
  3-image collage — no single decoded asset describes its shape.

## Server-dims coverage — how much of the feed actually carries geometry

| Feed source | Endpoint | Geometry served? |
|---|---|---|
| For-You feed (primary Discover source, `useForYouFeed`) | `GET /recommendations/:userId` | **None.** SQL selects only `l.image_url` — no `listing_images` join, no `media[]`, no dims. `backend/api/src/routes/recommendations.ts:433` |
| Backend cursor fallback (`useBackendData`) | `GET /listings` | Full: `media[]` + top-level `mediaWidth/mediaHeight/mediaAspectRatio` (`index.ts:16911–16915`) — dims non-null once pipeline processes the upload |
| Home feed | `GET /feed/home` | `media[]` records with width/height only (`feed.ts:411`); no top-level fields — **previously dropped by the old resolver, now used** |
| Discover feed route | `GET /feed/discover` | `media[]` + unit-level `mediaAspectRatio` (`feed.ts:897–921`) — the unit-level field is not consumed by `feedApi`'s `HomeFeedUnit` typing |
| Seller/profile grids | `GET /users/:id/listings`, `/listings/:id/related` | `media[]` (+ top-level dims on `/users/:id/listings`, `index.ts:19567–19571`) |

**Effective split on the Discover tab:** the For-You path (dominant when personalized)
serves **0%** server dims → ~100% of those tiles rely on the new measurement feedback.
Cursor/search rows serve `media[]` dims whenever the media pipeline has processed the
upload; unprocessed/legacy rows (NULL dims) fall back to measurement. The `media[]`-record
tier added to the resolver means every endpoint that joins `listing_images` now yields real
geometry without waiting for decode.

## Upload pipeline check (per task — reported, not changed)

Upload **does** persist dims: migration `055_listing_image_geometry.sql` added
`media_width`/`media_height` to `listing_images`; the attach handler writes
`verifiedUpload.asset_width ?? payload.mediaWidth` (`index.ts:19756`), and
`mediaUploadQueue` sends `mediaWidth`/`mediaHeight` captured from the local asset
(`mediaUploadQueue.ts:474`). `listingMediaProjection` projects them onto every `media[]`
record. **The systemic gap is downstream, not upload:** `/recommendations` doesn't join
`listing_images` at all, so the ranking feed never projects the dims that exist in the DB.
A one-line-join fix on that route would eliminate the need for measurement on the primary
Discover source — flagged for backend follow-up.

## Behavior notes

- First decode still starts at the honest 3:4 reservation, then re-frames once — the
  accepted Pinterest trade-off; session persistence means revisits/recycled cells render
  the real ratio on first paint.
- Hero span decisions remain assembly-time (spans can't change post-layout); a measured
  landscape item stays single-column for that session's assembly.
- `keyExtractor`/`getItemType` unchanged — measurement is per-item state, recycling-safe.

## Verification

- `npx tsc --noEmit` — clean for all owned files. One **pre-existing** error in
  `src/screens/FilterScreen.tsx:221` (concurrent WIP in filter components, out of scope).
- `npx vitest run discoverySurfaces visualRegressionPlan flagshipProductionDetailPass
  discoveryFeedDedup` — **138 passed, 2 skipped** (baseline-screenshot gates pending device
  capture, as designed).
