# Engineering Architecture, Motion, Performance & Media Pipeline

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Architectural diagnosis

The app has very large screen/creator files. Examples observed in the audited tree include ~60–100KB screen modules and a ~178KB `CreatorAssetPicker.tsx`.

Large files are not automatically bad, but here they create UI drift because:
- state;
- network logic;
- presentation;
- animation;
- accessibility;
- styles;
- screen-specific primitives

are often co-located.

The next flagship push needs **presentation architecture**, not just refactoring for style.

---

## Target layering

### 1. Domain/query
Server calls, validation, mutation, cache.

### 2. View model
Converts domain state into:
- presentation state;
- permitted actions;
- sections;
- labels;
- severity.

### 3. Feature components
Commerce, Poster, profile, auction, Co-Own primitives.

### 4. Global UI
Text, button, row, header, sheet, media, state canvas, action dock.

### 5. Screen composition
Screen files become orchestration/layout, not every detail.

---

## Screen complexity budget

Guideline:
- screen composition preferably <400–700 LOC;
- complex feature controller can be larger, but isolated;
- styles in feature component or generated theme styles;
- transaction state machine tested independently.

Do not refactor solely to hit a line count. Refactor when a module has more than one reason to change.

---

## Canonical primitives to converge

- `ScreenShell`
- `TopBar`
- `SectionHeader`
- `UtilityRow`
- `MediaCarousel`
- `MediaAcquireSheet`
- `UploadTray`
- `ProductTile`
- `SellerRow`
- `TrustDisclosure`
- `StickyActionBar`
- `TransactionSummary`
- `StateCanvas`
- `EmptyState`
- `ErrorState`
- `Skeleton`
- `FilterSortBar`
- `CollectionCover`

Existing components should be mapped to these concepts rather than duplicated.

---

## Expo / React Native baseline

The repo is already on a current stack:
- Expo 57;
- React Native 0.86;
- React 19.2;
- FlashList 2.2.1;
- Reanimated 4.5 family.

Do not upgrade simply for novelty. Use the current stack correctly.

### FlashList v2

Current Shopify guidance emphasizes:
- profile in release mode;
- memoize props;
- remove damaging nested arbitrary `key` usage;
- use `getItemType` for heterogeneous rows;
- valid `keyExtractor`;
- account for recycling state;
- v2 no longer needs old size-estimation props.

The latest branch already had to introduce a web `ScrollView` fallback for a FlashList viewability callback issue. Therefore web parity needs an explicit list policy, not assumption.

### List policy
Create `LIST_RENDERING_POLICY.md`:
- native masonry feed → FlashList v2;
- simple bounded list → FlatList/ScrollView if justified;
- web fallback where FlashList behavior is unsupported/unstable;
- every deviation documented with performance test.

---

## Media pipeline

Build one canonical media object:

```ts
type MediaAsset = {
  id: string;
  localUri?: string;
  remoteUri?: string;
  kind: 'image' | 'video';
  width: number;
  height: number;
  durationMs?: number;
  mimeType?: string;
  posterUri?: string;
  focalPoint?: {x:number; y:number};
  crop?: {...};
  uploadState: 'local'|'queued'|'uploading'|'uploaded'|'failed';
  progress?: number;
};
```

Stop reconstructing media kind from URL suffix whenever authoritative metadata exists.

Pipeline:
pick/capture → validate → normalize metadata → local preview → optional edit → enqueue → upload → attach → publish.

Support cancellation/retry and background/resume.

---

## Motion architecture

One global motion contract:
- durations;
- springs;
- reduced-motion behavior;
- gesture thresholds.

No local “magic” values unless interaction physics require them and are documented.

### Gesture matrix
For each media/editor screen document competing gestures:
- tap;
- double tap;
- long press;
- horizontal pan;
- vertical dismiss;
- pinch;
- rotate.

Define precedence. Test real devices.

---

## Performance

### Metrics
- JS frame time;
- UI frame time;
- p95 time to interactive;
- first image;
- first video frame;
- memory after 10 min scroll;
- memory after repeated Poster edit/view;
- list dropped frames;
- cold/warm route transition;
- upload throughput.

### Release-mode device set
At minimum:
- compact iPhone;
- current regular iPhone;
- older/low-memory iPhone supported by deployment target;
- mid Android;
- low/mid Android;
- web Safari/Chrome.

---

## Caching/prefetch

- prefetch next visible media only;
- cancel obsolete fetch;
- avoid loading full-resolution media for grid thumbnails;
- keep poster images for video;
- preserve aspect ratio before image load;
- cache failure/retry sensibly.

---

## Testing

### Unit
presentation state + transformations.

### Component
critical states.

### Integration
sell publish, checkout, bid, Poster publish.

### Visual
golden screenshots.

### Device
gesture/media/performance.

Tests passing is necessary but insufficient: the latest HEAD reports 1178/1178 tests passing while the product can still visually be 6/10.

---

## P0 engineering backlog
- [ ] media contract convergence;
- [ ] split CreatorAssetPicker;
- [ ] split biggest screen presentation/state;
- [ ] token v2;
- [ ] list-rendering policy;
- [ ] visual regression harness;
- [ ] telemetry for media failure and route readiness.

## P1
- [ ] state-machine packages for transactions;
- [ ] performance budgets in CI/device QA;
- [ ] cross-platform primitive parity;
- [ ] remote editorial contract.

## P2
- [ ] targeted native modules only where measured bottleneck proves need;
- [ ] advanced caching/prefetch policy.
