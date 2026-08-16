# Media Pipeline and Carousel Prompt

## Mission

Create one canonical, accessible image/video system used by Direct, Auction and Co-Own while preserving family-specific presentation.

## Backend

- Implement the canonical media shape defined in `08_MEDIA_CAROUSEL_IMAGE_VIDEO_AUDIT.md`.
- Return it from all three detail contracts.
- Verify object ownership, checksum, content type, dimensions, duration, moderation and poster linkage.
- Add unique ordering and atomic reorder with optimistic version.
- Add safe delete/takedown semantics.
- Define per-family count, video duration and payload limits.
- Freeze/version media when a lot or ownership offering is published.
- Generate responsive image derivatives and video poster/transcode states.

## Frontend

- Replace URL/type heuristics.
- Preserve current item between inline and fullscreen.
- Implement object-safe fit and explicit focal crop.
- Enable an adaptive thumbnail/scrubber treatment.
- Add poster, play, loading, buffering, retry and unavailable states.
- Pause video offscreen, on background, and when obscured.
- Initialize playback only for the active/adjacent page.
- Support alt text, ordinal/type semantics, captions metadata and accessible navigation.
- Resolve pan/pinch/paging gestures on real devices.
- Respect reduced motion, mute choice and connectivity constraints.

## Visual treatment

- Direct: neutral/editorial object stage.
- Auction: evidence-preserving lot stage; media version visibly stable after opening.
- Co-Own: gallery may include object, provenance, condition and custody evidence; clearly distinguish product media from documents.

## Tests

Cover image-only, mixed, portrait, landscape, slow load, broken poster, playback failure, reorder conflict, takedown, background/foreground, fullscreen index, VoiceOver/TalkBack and width matrix.

## Evidence

Provide API samples, media-state diagrams, resource/performance measurement, runtime test output and native captures for every family with at least one mixed-media fixture.

## Prohibited closure shortcuts

- detecting media type from file extensions;
- displaying a client-supplied unverified poster;
- source-string tests as carousel proof;
- resetting fullscreen to index zero;
- using `cover` for every product asset;
- claiming Co-Own video support from a mocked local array.

