# Upload Experience — High Fidelity Without Friction

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Principle

High-quality source upload should feel invisible.

## Capture

Camera source should preserve the best stable output the platform gives.

## Library

Avoid unnecessary pre-upload JPEG recompression.

Current gallery request uses `quality: 0.92`; Phase 6 should test `quality: 1` / original-preserving behaviour across platform and file types.

## Upload

Background-capable pipeline:
- immediate local preview;
- start upload;
- continue editing;
- persist local reference;
- retry;
- publish waits for ready media.

The user should not stare at a modal upload screen.

## Resumability

For very large videos/high-value media:
- multipart/resumable uploads are worth considering.

## Processing UI

Human language:
- `Preparing media…`
- `Checking media…`
- `Ready`

Do not expose:
`moderation_pending` / job IDs.

## Publish

If processor still working:
keep draft.
Do not publish low-quality fallback if final derivative is required.

## Failure

Image upload failed:
- keep local media;
- retry;
- do not destroy composition.

## Slow network

Give:
- continue in background;
- network indication only if useful;
- avoid lowering permanent source quality without consent.
