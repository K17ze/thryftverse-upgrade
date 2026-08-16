# Creator Camera, Gallery & Media Pipeline V3

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Two creation modes

### Instant
Camera opens directly.
Capture → lightweight review → edit/share.

### Library creation
Select multiple media → immediate useful preview/composition.

Both are legitimate and should feel different.

## Camera control budget

Default:
- close;
- flash when relevant;
- flip;
- shutter/record;
- gallery.

Secondary:
- timer;
- grid;
- multi-capture;
- extra zoom controls.

Do not permanently show a vertical control rail unless real usage data supports it.

## Poster camera

After capture:
- Use
- Retake
- Add another

Save-to-gallery is secondary.

## Look camera

Prioritize photo/gallery and subject framing. Story-only modes should not automatically leak into Look.

## One media acquisition model

At boundary normalize:
- local asset ID;
- URI;
- kind;
- width/height;
- durationMs;
- MIME;
- file size when available;
- orientation;
- permission/availability state.

Then preflight:
- duration;
- size;
- codec;
- missing local file;
- limited-library permission.

## Gallery semantics

Poster: selection number = frame order.

Look: selection number = initial composition order.

Do not call Look selection “photos” if video is supported.

## Upload lifecycle

Per asset:
- preparing
- uploading
- processing
- ready
- retryable failure
- terminal failure

Do not invent global percentages for server work with unknown duration.

Prefer:
`Uploading 2 of 4`
`Processing video`
`Frame 3 needs retry`

## Authenticity/provenance

Track when known:
- captured in-app;
- imported;
- edited;
- generated/AI-modified.

This metadata primarily supports marketplace trust and provenance. It should not clutter ordinary social publishing.
