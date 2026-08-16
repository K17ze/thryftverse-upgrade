# Media, photography, video and visual search

## Media is the brand surface

Thryftverse competes in a category where the user's item photography is more visually important than most UI decoration.

## Listing media contract

### Cover
- first image is explicitly cover;
- full object visible for marketplace search;
- no collage as cover for ordinary item listing;
- focal point preserved.

### Evidence
Category-specific prompts:
- label/serial/authenticity;
- flaw;
- sole/heel for footwear;
- seams/hardware for bags;
- ingredient/seal for permitted cosmetics where relevant;
- receipt/proof where allowed.

### Video
Video belongs in same gallery:
- thumbnail has play marker;
- user can scrub/play fullscreen;
- mute state remembered per session where appropriate;
- no auto-audio.

## Discovery crops
Feed may crop for rhythm, but detail fullscreen must preserve original.

Store:
- width;
- height;
- aspect ratio;
- focal point where available;
- media kind;
- duration;
- poster frame.

## Visual Search
Current 2026 reference behavior supports an image/object as query.

Thryftverse next:
1. capture/upload image;
2. detect/select region or let user crop;
3. search similar inventory;
4. refinement:
   - category;
   - color;
   - style;
   - price;
   - size;
5. preserve selected visual crop while filtering.

Do not put an “AI” badge on results.

## Failure
- reserve geometry;
- use subtle placeholder;
- retry only when likely recoverable;
- never collapse a tile after media fails.

## Acceptance
Run a media QA set with:
- portrait;
- landscape;
- square;
- ultrawide;
- transparent PNG;
- HEIC;
- 4K photo;
- short video;
- corrupted video;
- missing dimensions.
