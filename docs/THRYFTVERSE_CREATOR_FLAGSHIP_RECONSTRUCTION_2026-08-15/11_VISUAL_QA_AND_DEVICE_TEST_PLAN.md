# 11 — Visual QA and Device Test Plan

## Purpose

A creator cannot be audited from source code alone.

The previous repo audits sometimes scored pattern presence rather than rendered quality. This plan makes that impossible.

## Device matrix

Minimum:
- small iPhone;
- large recent iPhone;
- mid-tier Android;
- flagship Android.

Optional:
- tablet / foldable if supported.

## Core fixture projects

### Poster fixtures
P01 — single portrait photo  
P02 — landscape photo in 9:16  
P03 — 3 photos  
P04 — single 15–30s video  
P05 — 3 video clips  
P06 — video + text + sticker + music  
P07 — 10 frames  
P08 — blank text poster  
P09 — low-light camera capture  
P10 — permission denied/revoked.

### Look fixtures
L01 — one portrait photo  
L02 — 2 photos  
L03 — 4 mixed aspect photos  
L04 — 6 photos  
L05 — photo + product  
L06 — 4 products  
L07 — overlapping cutout objects  
L08 — text-heavy editorial look  
L09 — sold/deleted product state  
L10 — permission/offline recovery.

## Screenshot states

For every fixture where applicable:
1. entry;
2. selected media;
3. first editor render;
4. tool open;
5. object selected;
6. precision edit;
7. undo;
8. publish preflight;
9. uploading;
10. success/error;
11. published viewer.

## Interaction recordings

Record at 60 fps or higher:
- camera open → capture;
- gallery → select 4;
- Poster trim;
- split;
- timeline scrub;
- text edit;
- Look layout change;
- product drag;
- object rotate/scale;
- publish under slow network.

## Comparison method

Do not demand pixel similarity to Instagram/Snapchat.

Compare:
- time to meaningful media;
- visible chrome count;
- number of modal transitions;
- number of taps to common outcome;
- canvas occupation percentage;
- tool discovery;
- preview availability;
- error/recovery burden.

## Perceptual visual checklist

### Canvas
- [ ] media is largest attention object;
- [ ] no unnecessary bounding card around full-bleed Poster;
- [ ] Look workspace boundary is clear without oversized framing.

### Top chrome
- [ ] one primary action;
- [ ] no dense cluster of equally weighted icons;
- [ ] contrast survives bright/dark media.

### Bottom tools
- [ ] ≤6 primary actions;
- [ ] active state unambiguous;
- [ ] labels don't create visual clutter;
- [ ] targets meet project size standard.

### Sheets
- [ ] canvas remains perceptually connected;
- [ ] no sheet-within-sheet;
- [ ] one clear task per sheet.

### Motion
- [ ] no jank;
- [ ] no repeated decorative animation;
- [ ] panels interruptible;
- [ ] Reduce Motion version understandable.

## Performance scenarios

Measure:
- first camera frame;
- media grid first thumbnails;
- scroll frame rate;
- 4K video source import;
- 6-image Look manipulate;
- effect scrub;
- timeline scrub;
- project save;
- publish queue.

## Network scenarios

- 3G/high latency;
- offline before publish;
- network loss at 20%;
- network loss at 80%;
- server 500;
- signed upload expiry;
- app background during upload;
- app kill during upload.

## Storage scenarios

- low disk;
- media source deleted from gallery after import;
- app cache cleared;
- project migration old schema;
- corrupt project JSON;
- large draft index.

## Accessibility scenarios

- VoiceOver / TalkBack;
- larger text;
- Reduce Motion;
- color differentiation;
- switch control / keyboard where supported;
- drag alternative for timeline and layer reorder.

## Release evidence folder

For each phase:

```text
docs/creator-elevation/evidence/<phase>/
  ios-small/
  ios-large/
  android-mid/
  android-flagship/
  recordings/
  metrics.json
  known-gaps.md
```

No phase gets marked complete without this evidence.
