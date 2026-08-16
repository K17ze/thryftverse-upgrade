# 08 — Architecture, Data Model, Performance, Draft and Upload Reconstruction

## 1. Creator architecture target

```text
creator/
  core/
    CreatorSessionProvider.tsx
    operations/
    history/
    projectStore/
    upload/
    rendering/
    mediaCache/
    analytics/
  entry/
    CreatorEntry.tsx
    MediaBrowser/
    Camera/
  poster/
    PosterComposer.tsx
    timeline/
    tools/
  look/
    LookComposer.tsx
    sourceDrawer/
    layout/
    tools/
  tools/
    text/
    media/
    stickers/
    audio/
    drawing/
    commerce/
  surfaces/
    ContextToolRail.tsx
    PrecisionSheet.tsx
    OverflowMenu.tsx
    PublishPreflight.tsx
```

## 2. Document V2

Current normalized layer model is a good start but too shallow for rich temporal editing.

Recommended additions:

```ts
type CreatorDocumentV2 = {
  id: string;
  version: 2;
  type: 'look' | 'poster';
  canvas: CanvasSpec;
  assets: Record<string, AssetRef>;
  pages?: LookPage[];            // compatibility / Look
  sequence?: PosterClip[];       // Poster
  layers: CreatorLayerV2[];
  audioTracks?: AudioTrack[];
  transitions?: Transition[];
  metadata: CreatorMetadata;
  renderVersion: string;
  updatedAt: string;
}

type CreatorLayerV2 = {
  id: string;
  type: LayerType;
  transform: Transform2D;
  timeRange?: { startMs: number; endMs: number };
  opacity: number;
  blendMode?: BlendMode;
  effects?: EffectNode[];
  maskRef?: string;
  animation?: KeyframeTrack[];
  payload: unknown;
}
```

## 3. Asset registry

Do not duplicate raw URIs across every layer.

```ts
type AssetRef = {
  id: string;
  sourceUri: string;
  localProjectUri?: string;
  remoteUri?: string;
  mediaType: 'image'|'video'|'audio';
  width?: number;
  height?: number;
  durationMs?: number;
  contentHash?: string;
  proxyUri?: string;
  thumbnailUri?: string;
  uploadState: 'local'|'queued'|'uploading'|'remote'|'failed';
}
```

Benefits:
- one upload per asset;
- cache/proxy management;
- replacement;
- garbage collection;
- stable recovery.

## 4. History

Current `HistoryStack` stores up to 50 complete document snapshots.

For small projects this is simple and safe, but it can become wasteful as project state grows.

Move toward semantic transactions:
- operation type;
- before patch;
- after patch;
- label;
- timestamp.

Examples:
- `MOVE_LAYER`
- `RESIZE_LAYER`
- `TRIM_CLIP`
- `ADD_TEXT`
- `CHANGE_FONT`
- `APPLY_LAYOUT`

### Gesture lifecycle

During drag:
- transforms live in shared values;
- React document is not updated every frame.

On end:
- one semantic commit;
- one history entry;
- one autosave schedule.

## 5. Autosave

Current interval constant is 5 seconds. Prefer event-driven debounce plus lifecycle hooks.

Save:
- after semantic edit debounce (e.g. 800–1500 ms project target);
- background/app inactive;
- before publish;
- before leaving editor.

Use atomic write:
1. write temp;
2. fsync/close;
3. rename to project.json.

Maintain lightweight journal for crash recovery.

## 6. Durable media import

When user commits selection/capture:
- create stable asset ID;
- copy media into project-controlled storage if needed;
- preserve original metadata;
- generate thumbnail/proxy;
- store source URI only as provenance.

Do not rely on transient cache URI as the only source.

## 7. Upload manager

### Required job model

```ts
type UploadJob = {
  id: string;
  projectId: string;
  assetId: string;
  localUri: string;
  remoteKey?: string;
  bytesTotal?: number;
  bytesSent: number;
  attempt: number;
  state: 'queued'|'uploading'|'paused'|'failed'|'complete';
  lastError?: string;
}
```

### Behavior
- persist jobs;
- bounded concurrency 2–3;
- exponential backoff + jitter;
- idempotent remote key;
- cancel;
- resume;
- background-native path where supported;
- publish waits on required jobs, not on unrelated derived previews.

## 8. Renderer ownership

A single render contract should power:
- editor;
- preview;
- export;
- viewer where feasible;
- generated cover/thumbnail.

Avoid parallel style interpretation in serializer and viewer.

Add:
`renderVersion`.

Old content uses old render rules or migration.

## 9. Performance budgets

These are **ThryftVerse acceptance targets**, not claims about competitor internal SLAs.

### Frame rate
- minimum interaction target: 60 FPS;
- exploit 120 Hz displays when the platform allows;
- <1% visibly dropped frames in common edit gestures on test devices.

### Interaction latency
- press visual feedback: same frame where practical;
- tool rail open: perceived immediate;
- cached sheet open target: ≤150–200 ms;
- first gallery thumbnails: stream progressively, do not block on entire page;
- effect preview: low-res first, refine if necessary.

### Memory
Budget by active project class:
- 1 photo;
- 6-photo Look;
- 3× 1080p clips;
- 10-frame Poster;
- stress project.

Do not keep decoded full-resolution images for every layer simultaneously.

## 10. Reanimated/RNGH rules

- animate transforms/opacity rather than layout when possible;
- avoid JS reads of shared values in hot paths;
- avoid React state updates each gesture frame;
- use worklets for direct manipulation;
- commit only on gesture end;
- test New Architecture performance on actual RN 0.86 devices.

## 11. Skia role

Use Skia for:
- composition;
- filter previews;
- masks;
- drawing;
- thumbnail variants;
- possibly timeline preview frames.

Do not force Skia to own platform camera capture itself.

## 12. Thumbnail/proxy service

Create internal service:
- image thumbnails at required DPR;
- video proxy generation;
- timeline frame extraction;
- cover generation;
- effect thumbnail cache.

Cache key:
`assetHash + renderVersion + operationHash + dimensions`.

## 13. Analytics

Track friction, not vanity.

Examples:
- creator entry source;
- time to first media;
- time to first successful canvas;
- tool open → cancel without change;
- undo within 3s of tool commit;
- publish failure;
- draft recovery;
- cutout failure;
- timeline trim usage;
- pinned tool;
- abandonment state.

Never use analytics to silently rearrange controls mid-session.

## 14. Test architecture

Unit:
- operations;
- migrations;
- timing;
- upload jobs.

Integration:
- camera/gallery → editor;
- project save/reopen;
- clip trim → viewer/export;
- offline publish retry.

Visual:
- canonical document fixtures → editor/preview/viewer screenshots.

Device:
- gesture smoothness;
- keyboard;
- low-memory;
- permission states;
- Android/iOS media URI behavior.
