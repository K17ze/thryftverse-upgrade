# 09 — Visual System, Motion and Accessibility Specification

## Visual thesis

Flagship creator UI is not "more design." It is **less chrome with better decisions**.

### Target visual hierarchy
1. user's media;
2. selected object;
3. current action;
4. essential navigation;
5. everything else.

## Surface hierarchy

### Level 0 — Canvas
Full-bleed Poster or neutral Look workspace.

### Level 1 — Floating controls
No visible card unless contrast requires it.
Use:
- icon;
- text;
- subtle scrim;
- blur only under small controls over unpredictable media.

### Level 2 — Context rail
Thin, thumb-accessible, horizontally scrollable if necessary.

### Level 3 — Precision sheet
Rounded sheet, one level of elevation, no nested cards.

### Level 4 — Full browser
Media library/product search/templates where dense content is justified.

## Remove visual anti-patterns

- card inside sheet inside card;
- gold gradients as routine progress or active state;
- multiple competing pill styles;
- permanent descriptive labels under every tool;
- every icon given its own accent color;
- decorative shadows on editing controls;
- oversized headings inside immersive creator.

## Color

Media carries color.

UI:
- black/white adaptive contrast;
- neutral dark editor surfaces;
- one brand accent for primary/selected states;
- danger only for destructive state;
- success only for genuine success.

No "luxury = gold" assumption.

## Typography

Use a compact UI type system separate from creative text fonts.

UI:
- 11–12 pt metadata;
- 13–15 pt tool/secondary;
- 16–17 pt controls;
- 17–20 pt sheet titles where needed.

Avoid giant page titles inside full-screen creator.

## Iconography

One icon family.
Consistent:
- stroke weight;
- filled active state if supported;
- 20–24 pt visual size inside 44–48 pt target.

No mix of unrelated metaphor families.

## Tool rail geometry

Project target:
- 48 pt target;
- 8–12 pt inter-target spacing;
- visual icon 21–24;
- max 5–6 primary actions visible;
- More always last when needed.

## Bottom sheets

### Open
- 220–320 ms project range depending travel;
- interactive drag;
- spring at rest;
- canvas remains stable.

### Detents
Use meaningful detents:
- 25–30% quick tool;
- 50–60% browse;
- full only if search/library requires.

## Motion system

### Motion categories

**Tap**
- 80–140 ms perceived press/release;
- scale ~0.96–0.98, subtle.

**Selection**
- short spring;
- no bounce circus.

**Object lift**
- slight scale/shadow during drag;
- haptic when picked/snapped.

**Panel**
- physical sheet motion;
- interruptible.

**Thumbnail → canvas**
- shared spatial continuity where reliable.

### Reduce Motion
When enabled:
- no parallax;
- no large scale morph;
- no repeated pulse;
- simple fades/crossfades;
- preserve state clarity.

## Snapping

Guides:
- canvas center;
- edges;
- peer centers;
- equal spacing;
- safe zones.

Haptic:
- one light pulse on entering snap;
- no repeated vibration while held.

## Accessibility

### Touch
Project standard:
- ≥44×44 pt for all primary editor targets;
- 48×48 preferred for high-frequency actions.

### Drag alternatives
Required for:
- object move;
- z-order;
- frame reorder;
- trim precision.

### Labels
Icons need:
- accessibilityLabel;
- state (`selected`, `disabled`, etc.);
- helpful hint only where action is non-obvious.

### Media
Publish preflight exposes:
- accessibility description / alt text;
- captions/subtitles status for relevant video.

### Color
Do not encode:
- selected;
- error;
- active clip;
- upload state
using color alone.

### Keyboard/external input
Existing desktop/tablet shortcuts are useful. Add discoverability under Help/Shortcuts rather than requiring memory.

## Visual quality gate

No component is accepted from static implementation alone.

For each major state capture:
- iPhone small;
- iPhone large;
- representative Android;
- dark mode;
- light mode if creator supports it;
- reduced motion;
- font scaling;
- permission denied;
- empty;
- loading;
- populated;
- selected;
- error.

## Anti-AI visual test

Ask:
- does the screen have too many equally rounded cards?
- are gradients used to simulate taste rather than communicate state?
- are generic icons + centered text making it look generated?
- does every state use the same layout template?
- is there excessive explanatory copy?
- are controls evenly distributed rather than hierarchically composed?
- are microinteractions decorative rather than task-linked?

If yes, simplify and art-direct.
