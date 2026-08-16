# Source-Level Creator Findings

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## `CreateCameraScreen.tsx`

Current behaviour:
- Search / Look / Poster camera modes.
- Gallery supports ordered multi-select.
- Gallery requests quality `0.92`.
- after capture/gallery, navigation transitions into `CreatorStudio`.

Phase 6:
- retain acquisition features;
- remove perceptual route discontinuity;
- preserve originals.

## `CreatorCamera.tsx`

Current:
- tap photo / hold video;
- timer/grid/multi behind Tools;
- recent media carousel;
- quick review;
- zoom;
- focus;
- 15-second recording cap.

Phase 6:
- simplify visible animation/chrome;
- use real device lens terminology only if actual lens selection exists;
- integrate into session;
- reevaluate video cap by product requirement.

## `PosterComposerScreen.tsx`

Current:
- dedicated frame-native implementation;
- good architectural separation.

Phase 6:
- make it feel less like a document editor;
- real timeline when video;
- continuous capture.

## `CreatorCanvas.tsx`

Strong:
- gestures;
- snapping/guides;
- broad layer rendering.

Weak:
- fake font diversity;
- effect catalogue too prominent;
- lots of tool-architecture language.

## `mediaUploadPipeline.ts`

Current:
- uploads URI, replaces document URI.

Phase 6:
- move to MediaAssetRef with derivative metadata.

## `mediaUpload.ts`

Strong:
- presign;
- finalize;
- publishability;
- canonical URL;
- processing polling.

Preserve.

## Backend media assets

Strong data model:
- dimensions;
- duration;
- blurhash;
- focal;
- derivatives;
- lifecycle.

Gap:
- production derivative worker is not evidenced by repository search.
