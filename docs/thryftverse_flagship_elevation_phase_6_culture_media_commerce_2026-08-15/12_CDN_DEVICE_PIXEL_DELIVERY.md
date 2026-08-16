# CDN & Device-Pixel Delivery Contract

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## One resolution API

Remove provider-specific URL rewriting from random components over time.

Create:

```ts
getMediaDeliveryUrl(asset, {
  role: 'grid'|'detail'|'zoom'|'avatar'|'poster',
  layoutWidthDp,
  dpr,
  formatSupport,
})
```

## Target width

`ceil(layoutWidthDp × dpr × overscan)`

Clamp:
- max feed variant;
- max memory safe.

## Variant selection

Prefer server-declared derivative URL rather than string-hacking a CDN URL.

Fallback URL transforms can remain for third-party legacy media.

## Role rules

### Grid
Nearest physical-size derivative.

### Detail
At least screen physical width.

### Zoom
Higher-resolution derivative, fetched lazily.

### Avatar
Small square derivative.

### Poster/Look viewer
Role based on rendered canvas physical width.

## Multiple source URLs

API summary should include:
- canonical;
- variants;
- width/height;
- blurhash;
- focal.

## Data saver

Allow user/system network policy to lower variant.

Do not secretly degrade all users.

## Prefetch

Prefetch:
- first screen;
- next viewport;
not entire feed.

## Cache key

Variant URL + asset version/revocation identifier.

## Revocation

If moderation/revocation removes asset:
- app must invalidate cached/prefetched content according to policy.
