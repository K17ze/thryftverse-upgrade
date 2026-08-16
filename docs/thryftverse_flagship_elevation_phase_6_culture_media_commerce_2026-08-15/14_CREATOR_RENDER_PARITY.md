# Creator Edit → Preview → Published Render Parity

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Current risk

An editor can feel excellent but fail if the published object changes:
- crop;
- text metrics;
- image quality;
- positions;
- video timing.

## Requirement

The document is the source of truth.

Preview and viewer use the same renderer wherever possible.

## Golden creator cases

Poster:
- one image + serif caption;
- video + text;
- 5 frames mixed;
- rotated product tag;
- drawing;
- dark/bright media.

Look:
- 5 items;
- crop;
- product hotspot;
- text;
- source swap.

Capture:
- iPhone/Android.

## Compare

- layer bounding boxes;
- font metrics;
- focal crop;
- colour;
- line breaks;
- ordering;
- timing.

## Server rendering

If you later generate server thumbnails/poster frames:
ensure the server renderer follows the same composition specification.

Do not substitute a server screenshot with different fonts.

## Versioning

Creator documents need renderer/schema version.

Published legacy content must not visually shift when future typography defaults change.
