# THRYFTVERSE CREATOR DEPARTMENT — FLAGSHIP ELEVATION PLAN

## Executive Summary

The creator department is **functionally complete** but **visually and experientially uneven**. The architecture is solid — dedicated camera component, layer-based canvas, draft/publish workflow, optimistic concurrency, media pipeline. But the execution ranges from near-flagship (camera viewfinder) to prototype-level (asset picker, layers sheet, template browser). The back-end has a strong foundation but lacks analytics, scheduling, affiliate monetization, and advanced editing features that define a 2026 flagship creator experience.

This plan closes the gap between the current state and Snapchat 2026 / TikTok Studio AI / BeReal-level quality across **both front and back-end**, in proportional phases.

---

## RESEARCH BASELINE

### What makes Snapchat 2026 flagship (March 2026 update)
- **Camera is the new keyboard** — app opens directly to camera, creation is the primary action
- **Three-tab interface** — Messaging, Camera (central), For You (unified feed). Reduced click-friction
- **AI Lens carousel** — generative AI filters built from text prompts, real-time AR rendering
- **AI Clips** — photo-to-5-second-video transformation via closed-prompt AI
- **Vibe Lenses** — activity-based contextual filters (dating, commuting)
- **Swipe gestures** — swipe to switch modes, swipe-up for gallery, swipe-down to close
- **Quick review** — immediate post-capture preview with retake/edit before committing
- **Performance** — faster camera launch, better low-light, smoother video, responsive filters

### What makes TikTok Studio AI flagship (June 2026 global rollout)
- **Full-screen live preview** — camera fills screen, record button centered and large
- **Vertical tool rail** — flip, speed, timer, flash, effects on the right, glanceable but unobstructive
- **Segmented recording** — record a clip, stop, record another, with progress bar along top
- **AI Scene Generator** — text-to-video prompts create backgrounds/B-roll in seconds
- **Smart Clip Sequencer** — auto-reorders and trims footage based on pacing and trends
- **Voice and Face Effects** — synthetic voiceovers, face swaps with consent controls
- **Collaborative AI** — suggests edits based on group feedback and best-performing posts
- **Hook architecture** — first 1-2 seconds are the thumbnail; motion, face, or clear stake instantly

### What makes BeReal flagship (Voodoo era 2025-2026)
- **Dual-camera capture** — front and back simultaneously, authentic in-the-moment
- **2-minute window** — spontaneous, low-pressure, no curation
- **RealMojis** — selfie-based reactions instead of likes/comments
- **Retake transparency** — visible retake counts and on-time/late tags
- **Minimal aesthetic** — full black background, calm, privacy-centric
- **BeCloser circles** — privacy tiers for different audiences

### What makes fashion-resale creator tools flagship (2026 landscape)
- **AI item scanning** — snap a photo, AI detects brand, category, size, color, condition, price (Circular, ResellerIO, Closet-to-Cash)
- **Auto listing generation** — one-tap marketplace-optimized titles, descriptions, tags
- **Background removal + AR lifestyle shots** — place items on models, shelves, flat lays without a shoot
- **Price intelligence** — suggested price range from real sold-listing data
- **Platform-perfect image packs** — auto-generate multiple angles and crops per marketplace spec
- **Shoppable video** — every video is instantly shoppable with product tags

---

## QUALITY GAP COMPARISON

### Front-End Gaps (Current vs Flagship)

| Dimension | Current State | Flagship Benchmark | Gap Severity |
|-----------|--------------|-------------------|-------------|
| **Camera immersion** | Full-screen, tap-to-focus, corner brackets | Full-screen + swipe gestures + zoom + grid + timer + burst | **High** |
| **Mode switching** | Tap animated segment control | Swipe between modes, gesture-based | **High** |
| **Post-capture flow** | Goes straight to studio, no preview | Quick-review with retake/edit/confirm | **High** |
| **Gallery access** | 48x48 thumbnail, bottom-left | Larger thumbnail, swipe-up for full gallery, recent carousel | **Medium** |
| **Camera controls** | Shutter only | Flip, flash, zoom, timer, grid, speed | **High** |
| **Asset picker** | Dense 3-col grid, no preview, no albums | Breathing room, full-screen preview, album nav, recent section | **High** |
| **Layers sheet** | 40x40 thumbnails, no drag-reorder | 56x56+ thumbnails, drag-reorder, visual previews | **Medium** |
| **Template browser** | Basic 2-col grid, 160px previews | Categorized, searchable, animated previews | **Medium** |
| **Studio top bar** | Crowded (close, status, undo/redo, settings, preview) | Grouped, contextual, progressive disclosure | **Medium** |
| **Canvas guides** | None | Snap-to-center, snap-to-edge, alignment indicators | **Medium** |
| **Canvas zoom** | Fixed to screen | Pinch-to-zoom, fit-to-screen, pan | **Medium** |
| **Empty states** | Functional but not inspiring | Art-directed, example creations, guided first action | **Low** |
| **Skeleton loading** | Generic ActivityIndicator | Skeletons matching final layout | **Low** |
| **Motion** | Some spring physics, fade-in | Restrained native motion throughout, reduced-motion fallbacks | **Low** |

### Back-End Gaps (Current vs Flagship)

| Dimension | Current State | Flagship Benchmark | Gap Severity |
|-----------|--------------|-------------------|-------------|
| **Analytics** | Raw engagement tables, no aggregation | Daily aggregates, time-series, engagement rates, audience insights | **High** |
| **Scheduling** | No scheduled publishing | `scheduled_for` column + background publish job | **High** |
| **Affiliate system** | None | Link generation, click tracking, commission calculation, payouts | **High** |
| **Product tagging** | Looks only | Posters, stories, creator documents + click analytics | **High** |
| **Creator monetization** | Co-Own only | Tips, subscriptions, ad share, brand collaborations | **Medium** |
| **Visual search ML** | Honest placeholder (filtered queries) | Actual image similarity or honest rename | **Medium** |
| **Music/audio** | Video duration only | Audio library, licensing, waveform, background music | **Medium** |
| **Sticker library** | 6 sticker types, no library | Categorized library, animated stickers, custom uploads | **Medium** |
| **Advanced editing** | Layer transforms only | Filters, color adjustments, transitions, masking, blending | **Medium** |
| **Dual system confusion** | Legacy looks/posters + creator_documents | Single source of truth, clear migration path | **Medium** |
| **Seed data** | No creator content seeded | Realistic looks, posters, stories, documents, engagement | **Low** |

---

## UPGRADE PLAN

### Phase 1: Camera Experience Elevation (Front-End)
**Goal:** Make the camera feel like Snapchat 2026 / TikTok — the hero of the creator department.

#### 1A. Swipe Gesture Navigation
- Add swipe-left/swipe-right to switch between Visual Search / Look / Poster modes (in addition to the existing tap segment control)
- Add swipe-up from bottom to open the full gallery picker (in addition to the thumbnail tap)
- Add swipe-down from top to dismiss/close the camera
- Spring physics on mode transitions with content crossfade
- Reduced-motion: instant switch

#### 1B. Quick-Review Capture Flow
- After capture, show a full-screen preview overlay (not straight to studio)
- Preview shows the captured image with: Retake (left), Edit in Studio (center, primary), Save to Gallery (right)
- Swipe-up from preview to go to studio, swipe-down to retake
- 3-second auto-advance timer with progress ring (cancelable by tap) — matches BeReal's time-pressure pattern
- Haptic on capture (medium), haptic on auto-advance (light)

#### 1C. Camera Controls Rail
- Add a vertical tool rail on the right edge (TikTok pattern): flip camera, flash toggle, zoom (0.5x/1x/2x), timer (3s/10s), grid toggle
- Each tool is a 44x44 touch target with icon + active state
- Flash: auto/on/off with icon change
- Zoom: cycle through 0.5x/1x/2x with label
- Timer: select duration, countdown overlay on capture
- Grid: rule-of-thirds overlay toggle (subtle white lines, 1pt, 30% opacity)

#### 1D. Gallery Thumbnail Elevation
- Increase thumbnail from 48x48 to 64x64
- Add 2pt white border
- Add long-press to show recent photos carousel (horizontal scroll of last 10 photos)
- Tap opens full gallery picker (existing CreatorAssetPicker, elevated in Phase 3)

#### 1E. Gradient and Chrome Refinement
- Reduce gradient opacity from 0.4 to 0.25 (top) and 0.35 (bottom) — less heavy, more premium
- Reduce corner bracket stroke from 3pt to 2pt
- Remove the "Tap to capture" hint text (the shutter button is self-evident)
- Keep the mode pill but move it to be integrated with the mode switcher, not floating separately

**Files touched:**
- `frontend/src/screens/CreateCameraScreen.tsx`
- `frontend/src/creator/CreatorCamera.tsx`
- `frontend/src/components/VisualSearchCamera.tsx` (share improvements)

---

### Phase 2: Studio Editor Polish (Front-End)
**Goal:** Make the editor feel like Procreate / Instagram Stories — precise, responsive, crafted.

#### 2A. Smart Alignment Guides
- When dragging a layer, show snap-to-center guides (horizontal + vertical) when within 8pt of center
- Show snap-to-edge guides when within 8pt of canvas edge
- Guides are 1pt dashed lines in the accent color, 50% opacity, fade in/out in 120ms
- Snap with a subtle haptic (light) when aligned
- Reduced-motion: guides appear instantly, no haptic

#### 2B. Canvas Zoom and Pan
- Add pinch-to-zoom on the canvas (min 0.5x, max 3x)
- Add two-finger pan when zoomed in
- Add a "fit to screen" button (appears when zoomed) in the top-right
- Zoom indicator shows current zoom level
- Layers scale inversely with canvas zoom (so they stay manipulable)

#### 2C. Top Bar De-cluttering
- Group controls: [Close] ... [Draft Status] ... [Undo | Redo] [Settings] [Preview]
- Move settings to a slide-down panel (gear icon reveals: canvas settings, grid toggle, snap toggle)
- Undo/redo as a paired pill (single touch target that expands)
- Draft status as a compact dot (green=saved, amber=saving, red=failed) with tap to expand

#### 2D. Layers Sheet Elevation
- Increase layer thumbnails from 40x40 to 56x56
- Add drag-to-reorder with haptic feedback on drop
- Add visibility toggle (eye icon) and lock toggle (lock icon) with clear active/inactive states
- Add layer name (auto-generated from layer type: "Image 1", "Text 1", "Product 1")
- Add "Add Layer" button at the bottom of the sheet

#### 2E. Template Browser Elevation
- Increase preview cards from 160px to 220px wide
- Add category tabs at the top (All, Looks, Posters, Story, Minimal, Bold)
- Add search bar with live filtering
- Add "Use as starting point" vs "Replace canvas" distinction on selection
- Animate template preview on tap (scale 0.98 → 1.0)

**Files touched:**
- `frontend/src/creator/CreatorStudioShell.tsx`
- `frontend/src/creator/CreatorCanvas.tsx`
- `frontend/src/creator/CreatorLayersSheet.tsx`
- `frontend/src/creator/CreatorTemplateBrowser.tsx`
- `frontend/src/creator/CreatorToolDock.tsx`

---

### Phase 3: Asset Picker Elevation (Front-End)
**Goal:** Make the picker feel like iOS Photos / Pinterest — breathable, previewable, fast.

#### 3A. Gallery Grid Refinement
- Reduce from 3 columns to 2 columns (larger thumbnails, more breathing room)
- Add 2pt gap between thumbnails
- Add long-press to select (with checkmark overlay) for multi-select
- Add full-screen preview on tap (single-select mode) with swipe to dismiss

#### 3B. Album Navigation
- Add album selector at the top: "Recents", "Favorites", "Camera Roll", "Screenshots"
- Uses MediaLibrary.getAlbums() on native
- Selected album persists across picker sessions

#### 3C. Recent Assets Section
- Add "Recently Used" horizontal scroll at the top of the gallery (last 10 assets used in creator)
- Stored locally (AsyncStorage) — no back-end needed
- Tap to quickly re-add

#### 3D. Product Picker Polish
- Improve product tile art direction: larger image (120x120), brand label, price, availability badge
- Add "Tagged in your looks" section showing products already used
- Add search with recent searches dropdown

#### 3E. Inline Camera in Picker
- Add a camera button at the top-right of the gallery
- Tapping opens CreatorCamera inline (modal) and returns captured image to picker
- Removes the need to leave the picker to capture

**Files touched:**
- `frontend/src/creator/CreatorAssetPicker.tsx`
- `frontend/src/creator/CreatorEntryScreen.tsx`

---

### Phase 4: Back-End Foundation (Back-End)
**Goal:** Build the data infrastructure that a flagship creator experience requires.

#### 4A. Analytics Foundation
**New migration:** `060_creator_analytics.sql`
```sql
CREATE TABLE creator_analytics_events (
  id BIGSERIAL PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('look', 'poster', 'story', 'document')),
  content_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'like', 'save', 'comment', 'share', 'product_click', 'profile_visit')),
  viewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX creator_analytics_events_idx ON creator_analytics_events (creator_id, event_type, created_at DESC);
CREATE INDEX creator_analytics_content_idx ON creator_analytics_events (content_type, content_id, created_at DESC);

CREATE TABLE creator_analytics_daily (
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content_type TEXT NOT NULL,
  content_id TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  product_clicks INTEGER NOT NULL DEFAULT 0,
  profile_visits INTEGER NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(5, 4) NOT NULL DEFAULT 0,
  PRIMARY KEY (creator_id, date, content_type, content_id)
);
```

**New endpoints:**
- `POST /creator/analytics/events` — log event (called from client on engagement)
- `GET /creator/analytics/summary` — overall stats (total views, likes, saves, engagement rate, top content)
- `GET /creator/analytics/timeline` — time-series data (daily/weekly/monthly)
- `GET /creator/analytics/:contentId` — per-content breakdown

**Background job:** Aggregate raw events into `creator_analytics_daily` every hour

#### 4B. Scheduling
**New migration:** `061_creator_scheduling.sql`
```sql
ALTER TABLE looks ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE posters ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE creator_documents ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS looks_scheduled_idx ON looks (creator_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS posters_scheduled_idx ON posters (creator_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS creator_documents_scheduled_idx ON creator_documents (creator_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
```

**New endpoint:**
- `PATCH /creator/documents/:documentId/schedule` — set/unset scheduled_for

**Background job:** Every 60s, find content where `scheduled_for <= NOW()` and `status = 'draft'`, publish it

#### 4C. Product Tag Expansion
**New migration:** `062_poster_product_tags.sql`
```sql
CREATE TABLE poster_tags (
  id TEXT PRIMARY KEY,
  poster_id TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  x NUMERIC(5, 4) NOT NULL CHECK (x >= 0 AND x <= 1),
  y NUMERIC(5, 4) NOT NULL CHECK (y >= 0 AND y <= 1),
  click_count INTEGER NOT NULL DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX poster_tags_poster_idx ON poster_tags (poster_id);
CREATE INDEX poster_tags_listing_idx ON poster_tags (listing_id);
```

**New endpoints:**
- `POST /posters/:posterId/tags` — add product tag
- `GET /posters/:posterId/tags` — list tags
- `DELETE /posters/:posterId/tags/:tagId` — remove tag
- `POST /posters/:posterId/tags/:tagId/click` — record click (increments click_count)

#### 4D. Seed Data Enhancement
**Update:** `backend/api/scripts/seed-dev-data.ts`
- Add 5 looks with product tags, varied statuses (published, draft, archived)
- Add 3 poster stories with frames, stickers, reactions
- Add 2 creator documents with layer compositions
- Add engagement data (likes, saves, comments, views, reactions)
- Add creator analytics events for the past 7 days

**Files touched:**
- `backend/api/src/db/migrations/060_creator_analytics.sql` (new)
- `backend/api/src/db/migrations/061_creator_scheduling.sql` (new)
- `backend/api/src/db/migrations/062_poster_product_tags.sql` (new)
- `backend/api/src/routes/creatorDocuments.ts` (scheduling endpoint)
- `backend/api/src/routes/creatorAnalytics.ts` (new)
- `backend/api/src/index.ts` (poster tag endpoints, analytics endpoints)
- `backend/api/scripts/seed-dev-data.ts` (creator seed data)

---

### Phase 5: Monetization Foundation (Back-End)
**Goal:** Unlock creator revenue streams beyond Co-Own.

#### 5A. Affiliate Link System
**New migration:** `063_creator_affiliate.sql`
```sql
CREATE TABLE affiliate_links (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  destination_url TEXT NOT NULL,
  commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE affiliate_clicks (
  id BIGSERIAL PRIMARY KEY,
  affiliate_link_id TEXT NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
  clicker_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  converted BOOLEAN NOT NULL DEFAULT FALSE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  commission_gbp NUMERIC(12, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX affiliate_clicks_link_idx ON affiliate_clicks (affiliate_link_id, created_at DESC);
```

**New endpoints:**
- `POST /affiliate/links` — generate affiliate link for a listing
- `GET /creator/affiliate/performance` — click count, conversion rate, commission earned
- `GET /creator/affiliate/payouts` — payout history

#### 5B. Creator Tips
**New migration:** `064_creator_tips.sql`
```sql
CREATE TABLE creator_tips (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipper_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_gbp NUMERIC(12, 2) NOT NULL CHECK (amount_gbp > 0),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX creator_tips_creator_idx ON creator_tips (creator_id, created_at DESC);
```

**New endpoints:**
- `POST /creator/:creatorId/tip` — send a tip
- `GET /creator/tips/received` — tips received by authenticated creator
- `GET /creator/tips/sent` — tips sent by authenticated user

**Files touched:**
- `backend/api/src/db/migrations/063_creator_affiliate.sql` (new)
- `backend/api/src/db/migrations/064_creator_tips.sql` (new)
- `backend/api/src/routes/creatorAffiliate.ts` (new)
- `backend/api/src/routes/creatorTips.ts` (new)
- `backend/api/src/index.ts` (route registration)

---

### Phase 6: Visual Polish Pass (Front-End)
**Goal:** Elevate every remaining surface to flagship quality.

#### 6A. Skeleton Loading
- Replace all ActivityIndicator instances in creator screens with skeleton screens matching the final layout
- Gallery: skeleton grid (2-col, 6 placeholder tiles)
- Layers sheet: skeleton list (4 placeholder rows)
- Template browser: skeleton grid (2-col, 4 placeholder cards)
- Analytics (new): skeleton chart, skeleton summary cards

#### 6B. Empty State Art Direction
- Camera permission denied: illustrated icon + "Enable camera to create" + Settings button
- Gallery empty: illustrated icon + "No photos yet" + "Capture your first" button
- Layers empty: illustrated icon + "Add your first layer" + tool suggestions
- Templates empty: illustrated icon + "No templates match" + "Start from blank" button
- Analytics empty: illustrated icon + "No data yet" + "Publish to see insights"

#### 6C. Motion Consistency
- All sheet presentations: spring (damping 0.7, stiffness 300), 220ms
- All mode switches: content crossfade 160ms
- All button presses: scale 0.97, 120ms
- All list item presses: opacity 0.7, 100ms
- All reduced-motion: instant transitions, no spring, no scale

#### 6D. Typography Hierarchy
- Context headers (CreateCameraScreen): upgrade from Type.caption to Type.body with semibold weight
- Tool labels: Type.caption with medium weight, 80% opacity
- Layer names: Type.caption with regular weight, 60% opacity
- Analytics numbers: Type.title with bold weight
- Analytics labels: Type.caption with medium weight, 50% opacity

**Files touched:**
- All creator screen and component files (skeleton + empty state + motion)
- `frontend/src/theme/Type.ts` (if typography tokens need adjustment)

---

## IMPLEMENTATION ORDER

| Phase | Focus | Impact | Effort | Dependencies |
|-------|-------|--------|--------|-------------|
| **1** | Camera Experience | Highest user-visible impact | Medium | None |
| **2** | Studio Editor Polish | High for active creators | Medium | None |
| **3** | Asset Picker Elevation | Medium, quality-of-life | Medium | None |
| **4** | Back-End Foundation | Enables analytics + scheduling + tags | High | None |
| **5** | Monetization Foundation | Unlocks creator revenue | Medium | Phase 4 |
| **6** | Visual Polish Pass | Elevates all remaining surfaces | Low | Phases 1-5 |

**Recommended execution:** Phases 1 and 4 in parallel (front + back), then 2 and 3, then 5, then 6.

---

## SUCCESS CRITERIA

A flagship creator department must achieve:

- [ ] Camera opens in <500ms, capture is instant, preview is immediate
- [ ] Swipe gestures work for mode switching, gallery access, and dismissal
- [ ] Post-capture quick-review shows before committing to studio
- [ ] Camera controls rail has flip, flash, zoom, timer, grid
- [ ] Studio has smart alignment guides and canvas zoom
- [ ] Asset picker has 2-col grid, full-screen preview, album navigation
- [ ] Layers sheet has 56x56 thumbnails and drag-to-reorder
- [ ] Back-end has analytics events, daily aggregation, and summary endpoint
- [ ] Back-end has scheduled publishing with background job
- [ ] Product tags work in posters (not just looks) with click tracking
- [ ] Affiliate link system generates trackable links with commission calculation
- [ ] Seed data includes realistic creator content with engagement
- [ ] All loading states use skeletons matching final layout
- [ ] All empty states are art-directed with guidance and action
- [ ] All motion is consistent, restrained, with reduced-motion fallbacks
- [ ] TypeScript clean, all tests pass, no runtime crashes

---

## CONSTRAINTS

- **Canonical implementation:** Modify existing screens/components, no `V2`/`Final`/`Flagship` suffixes
- **Preserve functionality:** All existing handlers, navigation, integrations must continue working
- **Proportional changes:** Touch only files required by each phase; fix coupled layers together
- **Truthful UI:** No fabricated analytics, no fake success states, no "coming soon" controls
- **State coverage:** Every screen must handle loading, populated, empty, error, permission denied
- **Accessibility:** All controls have labels, state is announced, touch targets ≥44pt
- **Performance:** Preserve virtualization, memoization, stable keys, limited rerenders
