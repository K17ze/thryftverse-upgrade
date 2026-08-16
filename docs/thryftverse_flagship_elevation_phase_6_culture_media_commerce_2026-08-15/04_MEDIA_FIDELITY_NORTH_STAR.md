# Media Fidelity North Star

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Product principle

For this customer profile, a soft image is not a small performance bug. It damages:
- perceived taste;
- seller trust;
- object value;
- authenticity evaluation;
- platform status.

Media fidelity is therefore a core product feature.

## Current strong foundation

Current source already has:
- `expo-image`;
- memory/disk caching;
- BlurHash;
- focal point;
- CDN resizing hooks;
- backend media assets;
- derivatives;
- dimensions;
- duration;
- moderation;
- canonical URLs.

Phase 6 should exploit that foundation rather than introduce another media library.

## Critical current defect: logical width != device pixel width

`HomeDiscoveryCard` passes roughly:

`downscaleWidth = tileWidth`

where `tileWidth` is React Native layout width in logical points/dp.

On a high-density phone:

```text
180 dp × 3 device pixel ratio = 540 physical px
```

Requesting a 180-pixel image for that tile can produce a visibly soft result.

### Fix

```ts
const targetPixels = Math.ceil(
  layoutWidthDp * PixelRatio.get() * overscanFactor
);
```

Use an overscan around 1.05–1.2 and then snap to a derivative bucket.

## Variant ladder

Illustrative, tune through measurement:

- tiny: 160–240 px;
- grid1: 360 px;
- grid2: 540 px;
- grid3: 720 px;
- detail: 1080–1440 px;
- zoom: 2048–2560 px;
- source: original.

Do not generate every possible width per asset.

## Selection

The backend or CDN should select the nearest >= target pixel size.

The app should send:
- target physical width;
- intended role;
- DPR.

## Fullscreen viewer

Use progressive stages:

1. immediate detail derivative;
2. high-res/zoom derivative;
3. original only if user zoom/request and policy allows.

Do not decode a 12MP source into every feed card.

## Gallery picker

Current `CreateCameraScreen` requests ImagePicker quality `0.92`.

Phase 6 should preserve original-quality source whenever practical:
- request original/highest quality;
- do not destructively re-encode before upload merely to reduce size;
- let the server generate delivery derivatives.

If platform picker returns an already-rendered copy, store original metadata where available.

## Colour

Preserve colour correctly:
- orientation;
- ICC profile handling;
- wide-gamut conversion policy;
- avoid double compression;
- ensure thumbnails and detail are visually consistent.

On capable devices, investigate extended dynamic range/HDR only after cross-device QA.

## Video

Maintain:
- source master;
- poster image;
- short preview;
- 720p/1080p delivery;
- adaptive streaming if scale justifies;
- audio-normalization policy;
- rotation/aspect metadata.

## Metrics

Track:
- pixels delivered / pixels displayed;
- blurry media reports;
- decode time;
- first media paint;
- CDN cache hit;
- derivative miss;
- zoom derivative latency;
- upload processing time;
- image/video failure.

## Release gate

A Retina/high-DPR media sharpness test is mandatory.

Compare:
- source crop;
- grid screenshot at native resolution;
- fullscreen;
- 2× pinch.

A thumbnail should never visibly degrade the photographed object on a flagship device.
