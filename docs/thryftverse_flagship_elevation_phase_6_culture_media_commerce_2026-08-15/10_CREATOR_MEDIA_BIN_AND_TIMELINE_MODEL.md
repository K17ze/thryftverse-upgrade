# Creator Media Bin & Timeline Data Model

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Why a media bin is needed

The current document often stores URI strings directly in layers. This makes:
- variant switching;
- quality selection;
- processing state;
- source reuse;
- relinking
harder.

## New reference model

```ts
interface CreatorMediaAsset {
  localId: string;
  mediaAssetId?: string;
  sourceUri?: string;
  canonicalUrl?: string;

  kind: 'image'|'video';
  width: number;
  height: number;
  durationMs?: number;
  blurhash?: string;
  focalPoint?: {x:number;y:number};

  derivatives?: {
    variant: string;
    url: string;
    width?: number;
    height?: number;
    durationMs?: number;
  }[];

  uploadState:
    | 'local'
    | 'uploading'
    | 'processing'
    | 'ready'
    | 'failed';
}
```

Layers reference `mediaRefId`, not only a URL.

## Benefits

- edit preview uses correct variant;
- viewer uses larger variant;
- upload retry does not mutate every layer manually;
- multiple layers can reference same source;
- server cutout becomes another derivative;
- thumbnail/poster becomes derivative;
- source stays intact.

## Poster timeline

A video/frame model needs:

```ts
interface TimelineClip {
  id: string;
  mediaRefId: string;
  sourceInMs: number;
  sourceOutMs: number;
  timelineStartMs: number;
  playbackRate: number;
  volume: number;
}
```

Overlay layers can carry active ranges.

## Look

Look does not need a timeline.
The same media bin is shared, but its canvas only references objects.

## Migration

Support old documents:
- detect URI;
- create transient MediaRef;
- migrate on save;
- never break published legacy Poster/Look.
