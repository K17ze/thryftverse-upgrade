# Project Storage, Upload and Publish Robustness

## ProjectStore

### What is good
- real filesystem abstraction;
- project JSON;
- AssetRegistry copies media;
- crash journal concept;
- image thumbnail generation.

### What must change

#### Make it canonical
Current CreatorContext still loads/saves legacy AsyncStorage drafts as primary paths and treats ProjectStore as additive. Reverse this relationship:
- project package = source of truth;
- AsyncStorage = lightweight index/preferences only.

#### Path construction
Use Expo path primitives directly and verify on iOS/Android:
```ts
new Directory(Paths.document, 'creator_projects')
```

#### Atomic checkpointing
Current delete-final-then-move-temp sequence has an interruption window. Keep:
- current good checkpoint;
- temp candidate;
- journal;
- atomic replacement semantics verified per platform.

#### Schema validation
Every project load must run a runtime schema validator.

#### Migration safety
Never “stamp current” simply because a migration is missing. If migration is unavailable:
- preserve original;
- mark unsupported/recovery-needed;
- do not mutate version;
- log the exact version path gap.

#### Asset ownership
Prove all acquisition paths import durable media:
- camera;
- gallery;
- media replace;
- Look media;
- video.

Document should refer to stable asset IDs/project paths, not transient gallery/cache URI as sole truth.

#### Proxies/thumbnails
Add video:
- proxies;
- key thumbnails;
- timeline frame thumbs;
- waveform cache.

---

# Upload

## Current reality

The queue is durable; the transfer is not truly resumable.

Problems:
- whole file becomes a Blob;
- one PUT;
- retry restarts byte zero;
- no multipart/TUS session;
- no part/ETag persistence;
- progress effectively occurs at completion;
- `bytesTotal: 0` prevents size probing;
- video is queued as `image/*`;
- background native transfer is unproven;
- relative presign endpoint must be verified against the native API base.

## Correct transport

Choose a supported resumable protocol:
- S3 multipart;
- TUS;
- cloud-provider resumable session.

Persist:
- session/upload ID;
- parts/byte ranges;
- completed ETags;
- retries;
- expiration;
- remote key.

Resume at the last completed part.

## Real progress

Progress = actual transmitted bytes / total bytes. UI interpolation may smooth it visually, but never fabricate stage percentages as transport truth.

## Background transfer

Use native background mechanisms where possible and test:
- app background;
- screen lock;
- process kill/relaunch;
- Wi‑Fi→cellular;
- offline→online.

## MIME

Derive from asset metadata, e.g. image/jpeg, image/png, video/mp4, video/quicktime, audio/m4a.

## Publish transaction

1. validate project;
2. ensure required assets uploaded;
3. serialize/render canonical document;
4. publish idempotently;
5. schedule if requested;
6. mark local project published only after server confirmation;
7. retain recoverable project until confirmed.

## Failure matrix

Test:
- presign 401/500;
- expired signed URL;
- PUT 5xx;
- offline mid-part;
- app background/kill;
- low disk;
- server success + client timeout;
- duplicate Publish taps.

A flagship creator should never lose work because the network changed.
