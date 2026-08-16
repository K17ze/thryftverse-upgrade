# Text and Editorial System — Zero-Gap Specification

## Current validation

Text is richer than before, but color and effect controls are still shallow enough to make the editor feel template-like.

### Current gaps
- exact HEX absent;
- hue only, not full color selection;
- no independent stroke/shadow/background colors;
- Thin/Thick and Soft/Strong do not persist separate parameters;
- rich typography is limited;
- captions/transcript timing is not at competitor depth;
- text animation rendering is not yet connected to a canonical temporal clock.

## 1. Real text model

```ts
type CreatorTextStyle = {
  fontFamilyId: string;
  fontWeight: number | string;
  italic: boolean;
  underline: boolean;
  letterSpacing: number;
  lineHeight: number;
  alignment: 'left'|'center'|'right'|'justify';
  fill: CreatorColor;
  opacity: number;
  background?: { color: CreatorColor; radius: number; paddingX: number; paddingY: number };
  stroke?: { color: CreatorColor; width: number };
  shadow?: { color: CreatorColor; blur: number; offsetX: number; offsetY: number };
  animation?: TextAnimationSpec;
};
```

Every visible UI control must map to a distinct persisted value.

## 2. Curated fonts, not font-count theater

Launch with 8–12 excellent archetypes:
- neutral sans;
- geometric sans;
- condensed display;
- editorial serif;
- high-contrast serif;
- rounded;
- marker/hand;
- signature;
- poster;
- mono/typewriter.

Each needs reliable loading, glyph coverage and fallback. Avoid filling the list with novelty scripts simply to increase count.

## 3. Preview the user's real words

Font/style rail should render the actual selected text. Recognition beats remembering a font name.

## 4. Inline editing

Tap Text:
- keyboard opens immediately;
- live text appears on canvas;
- compact font/color/style rail sits near keyboard;
- user can drag text after typing without exiting through multiple sheets.

## 5. Formatting

At least whole-layer:
- bold;
- italic;
- underline;
- alignment;
- letter spacing;
- line spacing.

If rich spans are implemented, they must be fully represented in renderer/export rather than a UI-only selection state.

## 6. Captions

A 2026 zero-gap video creator needs:
- speech-to-text;
- editable transcript;
- timing;
- style;
- safe-zone handling;
- per-line/per-word timing if the pipeline supports it robustly.

## 7. Text timing and animation

Poster text gets canonical `timeRange`. Animation has:
- entrance;
- emphasis/loop optional;
- exit;
- duration;
- delay;
- easing.

Do not store only a name if the UI exposes strength or duration.

## 8. WYSIWYG gate

The exact font/effect/color/animation visible in the editor must render identically in:
- preview;
- viewer;
- exported/flattened derivative.
