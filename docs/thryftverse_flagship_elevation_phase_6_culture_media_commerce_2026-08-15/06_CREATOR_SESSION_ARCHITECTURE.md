# Creator Session Architecture — Merge Acquisition and Editing

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## The current UX discontinuity

Current source has a capable `CreatorCamera`, but `CreateCameraScreen` moves the user into `CreatorStudio` after capture/gallery selection.

That technically preserves data, but psychologically it creates:

`capture product` → `editing product`

instead of one continuous creation instrument.

The user is correct to perceive media and editing as two different systems.

## Phase 6 architecture

Create one **CreatorSession** state machine.

```ts
type CreatorStage =
  | 'acquire'
  | 'compose'
  | 'timeline'
  | 'preview'
  | 'publish';

interface CreatorSession {
  id: string;
  type: 'poster' | 'look';
  mediaBin: MediaAssetRef[];
  document: CreatorDocument;
  selection: ...
  stage: CreatorStage;
}
```

The route/session remains mounted.

## Poster flow

Open Poster:
- camera is the default viewport;
- capture;
- captured image becomes current frame immediately;
- editing controls appear over/around the same media;
- swipe/capture-next returns camera transiently or opens acquisition overlay;
- gallery adds frames into same session;
- user never experiences a new application shell.

## Look flow

Open Look:
- canvas/source tray;
- Camera or Library is a drawer/overlay/source mode;
- capture inserts object/media directly into the current composition;
- dismiss acquisition returns to exact canvas state.

## Visual Search

Can share acquisition primitives without sharing Creator document semantics.

## State persistence

Session saves:
- document state;
- selected media;
- uploaded asset IDs;
- pending local media;
- current stage;
- undo history policy.

## Navigation

Avoid `navigate('CreatorStudio')` as the normal capture completion.

Prefer:
- one route;
- modal/overlay transitions;
- session reducer.

## Back button

Acquire → close session.
Compose with changes → persist draft automatically then close.
Do not repeatedly ask “Save draft?” if autosave is reliable.

## Performance

Camera can suspend rather than unmount where safe.
Release camera resource when editor is fully engaged if required by platform.
Prewarm editor font/assets while acquisition is active.

## Acceptance

A screen recording of:
`open Poster → take photo → add caption → capture second clip → reorder → publish`
must look like one continuous tool.
