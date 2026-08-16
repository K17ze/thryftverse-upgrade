# Device Visual QA + Release Gates

## Device set
- smaller iPhone;
- current large iPhone;
- mid-range Android;
- flagship Android.

## Required Poster recording
1. open creator;
2. capture/import 3 videos;
3. scrub;
4. trim;
5. split;
6. change speed;
7. add text;
8. set exact text HEX;
9. add native effect;
10. time sticker;
11. add music;
12. keyframe one object;
13. publish with network interruption;
14. view published result.

## Required Look recording
1. choose 4 photos;
2. inspect live layouts;
3. exact background color;
4. custom gradient;
5. true cutout/refine;
6. product drag;
7. multi-select align/distribute;
8. publish/view.

## Media contrast states
Capture creator chrome over:
- bright white image;
- dark image;
- high-detail image;
- face behind top chrome;
- black/white background;
- landscape/portrait media.

## Button state matrix
Every core control:
- idle;
- pressed;
- selected;
- disabled;
- loading;
- error/failure if applicable.

## Color tests
- #000000;
- #FFFFFF;
- #9B0202;
- #00FF00;
- alpha;
- invalid HEX;
- pasted HEX;
- recent/project color;
- eyedropper;
- gradient stops.

## Timeline truth tests
- overlay before/after trim;
- 0.5×/2× speed;
- split/reorder;
- transition;
- keyframe;
- captions;
- music/fade;
- pause/play/seek.

Verify canvas, timeline timecode and actual media never drift.

## Robustness
- kill during save;
- kill during upload;
- delete original gallery item;
- low disk;
- airplane mode;
- network handoff;
- expired presign;
- server success/client timeout.

## Performance
Collect:
- frame times;
- dropped frames;
- memory;
- input latency;
- gallery thumbnail time;
- effect preview time;
- timeline scrub latency.

## Hard release gates
No flagship tag if:
- filter preview differs from output;
- Canvas ignores authored effects/masks/keyframes;
- text effect loses authored parameters;
- Cutout UI is exposed without functioning provider;
- project recovery loses a source asset;
- uploader restarts but UI claims resume;
- primary target below standard;
- active tool state ambiguous;
- device evidence missing.
