# 04 — Creator Psychology and Interaction Principles

## Why psychology matters here

The "2016 feeling" is rarely one visual token. It is the accumulation of:
- visible complexity;
- mode switching;
- delayed feedback;
- low preview certainty;
- static configuration;
- destructive anxiety;
- weak continuity between choice and result.

## Principle 1 — Direct manipulation

Shneiderman's direct-manipulation model remains highly relevant:
- the object of interest stays visible;
- actions are rapid and incremental;
- actions are reversible;
- users manipulate representations instead of issuing abstract commands.

### Apply to ThryftVerse

Bad:
`Text → sheet → type → choose style → close → select text → move`

Better:
`Text → keyboard appears over live canvas → type directly → font/color rail previews on object → drag object immediately`

Bad:
`Media → picker → select → close → context menu → crop sheet`

Better:
`tap photo → quick actions appear → Crop enters in-canvas crop mode while composition remains visible`

## Principle 2 — Progressive disclosure

A creator should not see all available power at once.

### Default Poster photo tools
- Text
- Stickers
- Music
- Effects
- Draw
- More

### Default Poster video tools
- Timeline
- Text
- Music
- Effects
- Stickers
- More

### Selected photo
- Crop
- Replace
- Adjust
- Effects
- Cutout (only when real)
- More

### Selected text
- Edit
- Style
- Color
- Align
- Animate
- More

### Selected video clip
- Trim
- Split
- Speed
- Volume
- Crop
- Replace

Only show what applies.

## Principle 3 — Recognition over recall

Replace textual abstract presets with the user's own rendered content.

Examples:
- layout thumbnail;
- font sample with user's words;
- transition preview;
- filter preview;
- crop aspect preview;
- effect thumbnail.

A label may remain, but should not carry all the meaning.

## Principle 4 — Successful default

A user should get something publishable without understanding the editor.

### Look
Select 3 photos:
1. auto-detect useful crops;
2. create one strong composition;
3. show alternatives;
4. allow manual refinement.

### Poster
Select 4 media assets:
1. preserve order;
2. give sensible durations;
3. create a playable preview immediately;
4. show a frame strip/timeline;
5. allow trim/reorder.

This mirrors the general Quick Cut pattern: a coherent result appears before deep configuration.

## Principle 5 — Perceptual continuity

The canvas should not disappear every time a tool opens.

Use three panel levels:
- **micro rail** — 56–76 pt, immediate contextual actions;
- **half sheet** — browse/search/precision controls while canvas remains visible;
- **full screen** — only when the task truly needs focus, e.g. large media library or detailed timeline.

## Principle 6 — Reversibility and low-risk exploration

Every meaningful edit:
- undoable;
- redoable;
- autosaved after semantic commit;
- recoverable after crash.

Continuous gestures should not create dozens of history entries.

History labels should be human:
- `Move photo`
- `Change font`
- `Trim clip`
- `Apply Oslo filter`
- `Reorder frame`

## Principle 7 — Spatial stability

Frequent controls should live in consistent zones.

Don't:
- move `Next` around;
- swap icon order unpredictably;
- resize the canvas when keyboard/panel opens unless required.

Do:
- anchor primary commit action in top-right;
- anchor current-tool controls to bottom;
- let tool details expand upward;
- maintain canvas center/scale.

## Principle 8 — Fitts-style acquisition

High-frequency actions should be large, near thumb zones, and tolerant.

ThryftVerse project target:
- minimum primary touch target: 44×44 pt;
- preferred high-frequency target: 48×48 pt;
- keep hit slop where visual icon is smaller;
- destructive actions separated from common actions.

These are project targets, not a claim that WCAG AA requires 44 pt.

## Principle 9 — Motor/accessibility alternatives

Any drag-only operation needs a non-drag alternative.

Examples:
- reorder frames: drag + Move left/right buttons;
- crop: pinch + numeric/preset aspect controls;
- move object: drag + alignment controls;
- resize: pinch + size slider;
- rotate: gesture + 90°/fine rotation controls.

## Principle 10 — Delight is a consequence, not decoration

Useful delight:
- selection snaps;
- object lift during drag;
- alignment guide haptics;
- magnetic placement;
- preview scrub response;
- thumbnail morph into canvas;
- subtle success continuity.

Useless delight:
- confetti after routine publish;
- glowing every tool;
- constant breathing animations;
- glass on every surface;
- spring animation on static text.

## Principle 11 — Agency over automation

Automated layout/AI should be:
- previewed;
- reversible;
- attributable (`Suggested layout`);
- opt-in;
- never silently applied after user manually composed.

## Principle 12 — Reduce decision entropy

At each stage, one action should dominate.

### Entry
`Capture` or `Choose media`

### Editor
`Create`

### Publish preflight
`Share`

Secondary decisions should not compete equally.

## Interaction anti-pattern checklist

Reject a UI if:
- [ ] the user needs to understand `layer`, `page`, `z-index`, or `document` terminology;
- [ ] more than 6 primary tool actions compete at once;
- [ ] the canvas vanishes for a routine visual adjustment;
- [ ] a preset has no visual preview when a preview is technically feasible;
- [ ] a gesture cannot be undone;
- [ ] a disabled control appears as if it should work;
- [ ] a modal closes without obvious effect;
- [ ] the user needs two different places to perform the same action;
- [ ] output after publish can visually differ from preview;
- [ ] the system requests permissions before intent justifies them.
