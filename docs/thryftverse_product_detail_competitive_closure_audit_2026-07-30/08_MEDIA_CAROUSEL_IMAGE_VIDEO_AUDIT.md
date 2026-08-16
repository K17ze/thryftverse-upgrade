# Image/Video Carousel and Media Pipeline Audit

## Verification verdict

| Listing family | Multiple images | Typed video | Fullscreen | Production verdict |
|---|---|---|---|---|
| Direct | Yes, URL strings | Heuristic only | Yes | Partial |
| Auction | Yes | Yes | Yes | Best current path, still incomplete |
| Co-Own | No; single image | No | Image-only outcome | Not implemented |

The claim “multiple product pictures and videos are reflected as a complete carousel across all listing types” is false at the audited SHA.

## Shared frontend findings

1. Product imagery uses fixed-height `cover`, which can crop the object.
2. Thumbnail strip support exists but is not enabled by any of the three screens.
3. Count-badge accessibility language says “Image” even on video.
4. Swipe changes are not announced to assistive technology.
5. Video autoplays muted and loops while showing native controls, creating conflicting expectations.
6. There is no authored poster-to-first-frame transition, buffering state, retry state or video error surface.
7. Captions, transcript, alt text and duration are absent from the media contract.
8. Every rendered video page may create playback resources; adjacent-only preload and cache budgets are undefined.
9. Fullscreen opening can reset to item zero.
10. Failed scroll-to-index recovery is empty.
11. Pinch/pan and horizontal paging need physical gesture-conflict testing.
12. Media itself is not a consistent fullscreen affordance; the count badge carries the action.

## Backend/media findings

- `listing_media` stores useful type/poster/blurhash/focal metadata, but Direct discards it.
- `sort_order` is indexed but not uniqueness-constrained per listing; duplicate positions can produce unstable ordering.
- No complete batch reorder/delete contract was found.
- No explicit product-media count, video duration or total payload budget is enforced.
- Poster URL is accepted without proving it belongs to a finalized, authorized media asset.
- Active listing media may remain mutable after it becomes transactional evidence for an auction/ownership asset.
- Reads do not consistently join media against current moderation/takedown state.

## Canonical media contract

```json
{
  "id": "media_id",
  "type": "image|video",
  "url": "signed_or_cdn_url",
  "posterUrl": "required_for_video",
  "altText": "product-specific description",
  "width": 1600,
  "height": 2000,
  "durationMs": 8200,
  "blurhash": "...",
  "focalPoint": {"x": 0.5, "y": 0.42},
  "fitHint": "contain|cover",
  "sortOrder": 0,
  "status": "ready",
  "version": 3
}
```

Only applicable fields should be present. Clients must not infer type from file extensions.

## Target carousel behaviour

- Show the full object by default using aspect metadata.
- Use an editorial crop only when `fitHint=cover` and focal point is approved.
- Preserve active index between inline and fullscreen.
- Provide swipe, thumbnail, tap and accessible Previous/Next navigation.
- Pause video when offscreen, backgrounded, sheet-covered or fullscreen-dismissed.
- Start video intentionally: default poster with a play affordance; remember mute only within the session.
- Show deterministic loading, unavailable and retry states.
- Preload adjacent posters/images; initialize video playback only near the active page.
- Expose “Video 2 of 5, 8 seconds” semantics.
- Respect reduced motion and platform autoplay/data preferences.

## Publishing/integrity requirements

- Finalize uploads through verified object metadata/checksum.
- Validate poster ownership and readiness.
- Enforce unique `(owner_type, owner_id, sort_order)`.
- Perform reorder atomically with optimistic versioning.
- Freeze or version media once an auction starts or an ownership offering is published.
- Preserve audit history for replacement/takedown.
- Define limits per listing mode and enforce them server-side.

## Media test matrix

Test image-only, video-only where permitted, mixed image/video, portrait/landscape/square, corrupt poster, playback failure, slow network, duplicate order, removed asset, background/foreground, reduced motion, VoiceOver/TalkBack, and 320–430 widths.

