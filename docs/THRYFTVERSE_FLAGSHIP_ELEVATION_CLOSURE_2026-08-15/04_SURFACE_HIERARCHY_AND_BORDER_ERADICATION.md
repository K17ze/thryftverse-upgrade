# Surface Hierarchy V2 — Border Eradication Without Losing Affordance

## Objective

The current defect is not “borders are ugly.” It is that visible boundaries are doing work that spacing, typography, alignment and content should do.

Do not mass-delete strokes. Make strokes scarce enough to carry meaning.

# Five visual planes

## Plane 0 — Canvas
Default screen background. No card, no border.
Use for headings, descriptions, identity, metadata and ordinary navigation.

## Plane 1 — Quiet Group
Group with proximity, soft tonal change **or** dividers. Usually not both.
Use for settings groups and seller tools.

## Plane 2 — Functional Object
A visible boundary is appropriate:
- field;
- transaction control;
- filter;
- selection;
- order lifecycle object;
- editor/media crop.

## Plane 3 — Elevated State/Action
Use sparingly:
- sticky action dock;
- checkout total;
- critical attention;
- authenticated certificate.

## Plane 4 — Overlay
Sheet, modal, floating toolbar, transient glass navigation.

# Stroke policy

Allowed:
| Context | Rule |
|---|---|
| field | restrained fill or 0–1px stroke |
| focused field | emphasis state |
| divider | platform hairline |
| selected item | semantic emphasis |
| error | semantic stroke/tint |
| order book/data table | structural hairlines |
| certificate/document | subtle boundary |
| sheet/modal | material/elevation, avoid redundant inner outline |

Forbidden as a default pattern:
```ts
section: {
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: Radius.lg,
  padding: 16,
}
```
when the only semantic reason is “this is another section.”

# Primitive migration

## `FlagshipFormSection`
Make API:
```ts
variant?: 'flat' | 'grouped' | 'state' | 'critical'
```
Default `flat`.

- `flat`: no border/background.
- `grouped`: optional tonal group, no outer stroke by default.
- `state`: semantic leading state/tint.
- `critical`: warning/security/payment only.

## `PremiumTextField` and `AppInput`
Add:
```ts
appearance?: 'filled' | 'outline' | 'underline'
```
Suggested:
- settings/utility: filled;
- auth/standalone: outline;
- dense authoring: underline/flat row.

Focused/error state can temporarily strengthen the boundary.

## `FlagshipNavigationRow`
Create a canonical transparent row:
```tsx
<FlagshipNavigationRow
  title="Delivery"
  subtitle="Small parcel · Buyer pays"
  trailing="chevron"
/>
```
Default is transparent with optional bottom divider.

## `FlagshipMetricLine`
Prefer open-space numeric hierarchy to 2×2 boxed metric cells:
```text
Available balance                    £182.40
Orders to ship                             2
Active listings                            14
```

# Radius rule

Avoid “rounded rectangle soup.”

- media: 8–12
- field: 10–12
- primary button: pill if appropriate
- grouped rows: one outer 12–16 radius
- modal: 20–24
- avatar: circle
- ordinary section: no radius because no container

`Radius.xxl` must be reserved for dominant/floating objects, not ordinary content.

# Shadow rule

For normal content separation choose one:
- tonal difference;
- elevation;
- stroke.

Do not stack shadow + border + tinted surface by default.

# Icon containment

Default: glyph directly on canvas.

Contain icon only for:
- selected mode;
- primary shortcut;
- status;
- avatar/fallback;
- media contrast;
- strong functional control.

# Section rhythm examples

Utility:
```text
Title

Section label
Row
divider
Row

24–32

Section label
Field
Field
```

Commerce:
```text
Media
12
Identity
8
Trust facts
16
Primary action
24
Description
24
Seller
24
Buying details
```

# Static gate

Add `check:surface-density` that reviews:
- >5 screen-local `borderWidth` declarations;
- 3+ large-radius bordered containers;
- repeated `surface + border + radius`;
- `FlagshipFormSection` wrapping already-bordered inputs;
- nested surface primitives.

This is a human-review trigger, with exceptions for data tables, order book, editor canvases and complex financial sheets.

# Visual acceptance

A migration only passes after native screenshots prove:
- fewer visible rectangles;
- hierarchy remains obvious;
- dark mode retains control separation;
- focus/error state remains accessible;
- no loss of tap affordance;
- the page does not become blank/unfinished.

Removing borders without rebuilding hierarchy is a failed migration.
