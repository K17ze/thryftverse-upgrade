# Icons, Buttons and Control Craft

## Diagnosis

The new ContextToolRail fixed information hierarchy more than visual craft. It remains visibly generic because:
- creative concepts are represented by general Ionicons;
- tool buttons are plain Pressables;
- there is no true selected/active tool state in the model;
- tiny permanent labels make the rail look like a settings toolbar;
- target sizes are inconsistent across other tools;
- multiple bespoke button styles coexist.

## 1. Purpose-built creator glyph layer

Create `CreatorGlyph`.

Continue using platform/library icons for universally understood actions:
- close;
- back;
- play/pause;
- search;
- delete;
- share;
- camera flip.

Create/refine dedicated glyphs for editorial concepts:
- trim;
- split;
- crop;
- rotate;
- cutout/mask;
- keyframe;
- speed curve;
- waveform;
- layers;
- arrange;
- bring forward/back;
- gradient;
- eyedropper;
- opacity;
- text background;
- stroke;
- shadow;
- safe zone;
- product tag.

### Optical system
- 24×24 viewBox;
- consistent 1.75–2.0 stroke;
- consistent caps/joins;
- matched optical weight;
- selected variants where meaningful;
- pixel alignment at common DPR.

## 2. Creator button primitives

Create:
- `CreatorIconButton`;
- `CreatorToolButton`;
- `CreatorSegmentButton`;
- `CreatorPrimaryButton`;
- `CreatorDestructiveButton`.

Every primitive must define:
- idle;
- pressed;
- selected;
- disabled;
- loading;
- keyboard focus;
- destructive.

## 3. Main tool button

Project target:
- 48×48 hit target preferred;
- 22–24 glyph;
- press scale ~0.97 plus subtle contrast backplate;
- selected state uses shape/backplate + glyph treatment, not color alone;
- loading replaces glyph or shows unobtrusive progress.

No decorative gradient as routine active state.

## 4. Add active state to tool model

```ts
active?: boolean;
selectedStyle?: 'fill'|'accent'|'indicator';
```

Examples:
- Effects active when effect stack non-empty;
- Cutout active when mask attached;
- Mute active when volume=0;
- Safe Zone active while visible;
- Grid/Flash reflect state.

## 5. Label strategy

Use icon-only for universally familiar high-frequency actions. Use icon+label for ambiguous creative tools. Overflow menu can show full labels.

Avoid treating every icon as unfamiliar forever.

## 6. Media contrast

Controls float over unpredictable images. Use:
- tiny dark translucent backplates;
- local top/bottom scrims;
- subtle shadow;
- blur only where necessary.

Do not cover the canvas in glass surfaces.

## 7. Press feedback

ContextToolRail should use a specialized UI-thread press primitive. Current plain Pressable makes the flagship motion system inconsistent.

Feedback goals:
- visual response in the same frame;
- light haptic;
- no bounce circus;
- no arbitrary delay.

## 8. Touch audit

Every creator control must have at least 44pt interactive area, 48pt preferred for common tools. Visual circles can be smaller only when invisible hit target is expanded.

Audit DrawingWorkspace's 40px controls explicitly.

## 9. Icon QA

Test each glyph at 20–24px:
- optical balance;
- semantic comprehension;
- dark/light media;
- selected state;
- RTL mirroring where needed.

## 10. Why this matters psychologically

A decade-polished editor creates trust through repeatable motor and visual grammar. Users should not have to re-learn whether “selected” means red icon, filled circle, opacity change, border, or no change on every tool.
