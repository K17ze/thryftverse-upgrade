# Creator Typography Engine — Real Fonts, Real Voice

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Current source problem

`CreatorCanvas.tsx` currently exposes creator text styles such as:
- headline;
- editorial;
- clean;
- compact;
- handwritten;
- bubble;
- deco;
- poster;
- squeeze;
- signature.

But they are mostly implemented using the same global Inter family with weight, italic, uppercase, tracking and size changes.

This is a textbook reason the creator can feel synthetic: the picker says the styles are different, but the rendered typography is not culturally distinct.

## Architectural fix

Create a **separate CreatorTypography system**.

Do not modify the UI typography system to carry creator fonts.

Suggested architecture:

```ts
type CreatorTypefaceId =
  | 'journal'
  | 'editorial'
  | 'clean'
  | 'archive'
  | 'statement'
  | 'caption'
  | 'note'
  | 'club';

interface CreatorTypefacePreset {
  id: CreatorTypefaceId;
  family: string;
  italicFamily?: string;
  weights: ...
  defaultTracking: number;
  lineHeightRatio: number;
  maxRecommendedChars?: number;
  backgroundTreatments: ...
}
```

## Candidate font directions

All final font licensing must be verified before embedding.

### Journal
A literary serif such as **Instrument Serif**.
Use:
- quiet lower-case captions;
- hotel/travel diary;
- personal note;
- Look title.

### Editorial
A stronger editorial serif such as **Newsreader** / another licensed optical serif.
Use:
- issue title;
- collection title;
- large 2–5 word statement.

### Clean
Existing **Inter** or another strong modern grotesk.
Use:
- normal caption;
- labels;
- creator @handle;
- small commerce tags.

### Archive
A restrained mono such as **IBM Plex Mono / DM Mono**.
Use:
- date;
- place;
- camera-like note;
- inventory/editorial issue number.

### Statement
A genuinely heavy grotesk/condensed option chosen under license review.
Use:
- very short words;
- event/drop title;
- cover statement.

### Note
Do **not** automatically add a cliché handwriting font.
Select one only after visual art-direction review against the target media.
A bad handwriting font is worse than no handwriting option.

## Font loading

Use static font files for consistent mobile support unless the selected platform/library has verified variable-font behaviour.

Load creator fonts lazily or at app bootstrap depending memory/latency.

Never share the font binaries outside the app/repository licensing model.

## Text presets are more than font family

Each preset needs:
- default size range;
- optical line height;
- letter spacing;
- alignment;
- casing;
- default max width;
- text background styles;
- shadow/scrim policy.

## Replace current effects

Default visible effects:
- None
- Shadow
- Label
- Highlight
- Soft plate

Move:
- neon;
- glow;
- novelty outline
into an optional playful/effects drawer, not the default aesthetic.

## Caption preset examples

### Film note
Small lower-left mono:
`CAPRI — 19:42`

### Editorial diary
Small serif italic:
`late lunch, no plans`

### Chapter
Large serif:
`RIVIERA`

### Quiet label
Small clean uppercase with translucent neutral plate:
`VILLA BELLEROSE`

### Statement
Large heavy grotesk:
`AFTER DARK`

## Viewer fidelity

The exact typography metrics used in edit must match preview/published render.
No “looks different after upload” acceptance.

## Tests

Golden render for every:
- font;
- size;
- line break;
- alignment;
- RTL where supported;
- emoji mixed;
- long caption;
- dark/light media;
- accessibility fallback.
