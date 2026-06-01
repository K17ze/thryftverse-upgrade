# SellScreen (Upload) UI/UX Upgrade Plan

## Aesthetic Direction (from Reference Images)

The reference images show a premium dark upload/create flow with:
- **Dramatic photo upload zone** — large area with dashed border or prominent camera icon
- **Dark cards with subtle borders** for form sections
- **Gold accents** on active states and primary CTAs
- **Large price input typography** for currency fields
- **Clean picker rows** with right-aligned values and chevrons
- **Floating/sticky CTA** at bottom

---

## Honest Audit: What I Got Wrong vs Reality

My original plan proposed creating 8+ new components and a heavy rewrite. After auditing the actual `SellScreen.tsx`, most of that was unnecessary:

| My Original Claim | Reality |
|------------------|---------|
| "Price prefix is small, no large typography" | Price input already uses **28px bold** (`Type.body.size` at 28, `Typography.family.bold`) — **already large** |
| "CTA is standard, no gold gradient/shimmer" | CTA already uses `variant="primary"` (gold `Colors.brand`) when ready, `variant="secondary"` when not — **already correct** |
| "Readiness bar too thick, no glow" | Readiness bar already uses **spring animation**, gold fill on complete — **already good** |
| "Error banner needs replacing with field glow" | Error banner + shake animation already works well — **keep as-is** |
| "Need StepDots, GlassInputV2, etc." | App already has `AppInput`, `AppCard`, `AppButton`, `AppSegmentControl` — **reuse, don't recreate** |
| "Need floating labels" | `AppInput` already supports labels — **already exists** |
| "Listing type chips not glass" | Current chips are functional with icon + label + active gold state — **good enough** |

---

## Current State Audit (`SellScreen.tsx`)

| Element | Current State | Gap |
|---------|---------------|-----|
| Header | "Scan Item" title, close + flash icons in `Colors.surface` circles | Title is confusing; buttons are solid |
| Photo upload (empty) | `AppCard variant="surface"` with 64px camera icon circle + 2 buttons | Functional but small; could be more dramatic with dashed border |
| Photo upload (photos) | `SortablePhotoStrip` with reorder/add | Functional — keep |
| Readiness bar | Custom `ReadinessBar` with spring-animated gold fill | **Already good** — keep as-is |
| Listing type selector | 3 horizontal chips inside `AppCard`, active = solid `Colors.brand` | Functional; could use glass styling |
| Form inputs | `AppInput` inside `AppCard variant="surface"` | Solid cards; swap to `GlassCard` |
| Picker rows | `PickerRow` with `Colors.surface` bg, `Colors.border` divider | Solid rows; swap container to `GlassCard` |
| Price input | `AppInput` with currency prefix, **28px bold** text | **Already premium** — keep styling |
| Co-own card | `AppCard variant="elevated"` with toggle + inputs | Solid card; swap to `GlassCard`; add gold border when active |
| Auction card | `AppCard variant="elevated"` with input + segment | Solid card; swap to `GlassCard` |
| Readiness card | `AppCard` with bar + chips + hint | Solid card; swap to `GlassCard` |
| CTA | `AppButton` sticky footer, gold when ready, muted when not | **Already correct** — keep; optional `GlowSurface` behind ready CTA |
| Error | Red text banner + shake | Functional — keep |
| Animations | `FadeInDown` staggered entrances | **Already correct** — keep |

---

## Upgrade Plan

### 1. Header
- **Current**: "Scan Item" title with solid `Colors.surface` icon buttons.
- **Change**:
  - Rename title from "Scan Item" to **"New Listing"** or **"Sell"** — clearer intent.
  - Swap `iconBtn` background from `Colors.surface` to translucent `rgba(255,255,255,0.05)` with `borderColor: Colors.border` for glass button look.

### 2. Photo Upload Zone (Empty State)
- **Current**: `AppCard variant="surface"` with camera icon + Camera/Gallery buttons.
- **Change**: Make it more dramatic and inviting:
  - Remove the `AppCard` wrapper.
  - Create a larger dashed-border area: `borderWidth: 1.5`, `borderStyle: 'dashed'`, `borderColor: 'rgba(255,255,255,0.12)'`, `borderRadius: 24px`.
  - Background: `rgba(255,255,255,0.015)` (barely visible).
  - Camera icon: 48px in `Colors.brand` with subtle `GlowSurface` behind it.
  - Title: "Add Photos" in `Type.subtitle` (18px, bold).
  - Subtitle: "Take photos or upload from gallery" in `Type.caption`, `Colors.textMuted`.
  - Action buttons: Keep existing `AppButton` Camera/Gallery but style them as glass pills or use the existing buttons — they already work.
- **Alternative (simpler)**: Keep the current `AppCard` structure but swap to `GlassCard` and increase vertical padding for a more spacious feel. The dashed border is optional — not critical.

### 3. Listing Type Selector
- **Current**: Custom chips inside `AppCard`, active = solid `Colors.brand`.
- **Change**: Swap the `AppCard` wrapper to `GlassCard` (intensity=25). Keep the chip layout but soften inactive chips:
  - Inactive: `backgroundColor: 'rgba(255,255,255,0.03)'`, `borderColor: 'rgba(255,255,255,0.06)'`
  - Active: Keep `Colors.brand` but add `shadowColor: Colors.brand`, `shadowOpacity: 0.08` for subtle glow

### 4. Form Inputs (Title, Description)
- **Current**: `AppInput` inside `AppCard variant="surface"`.
- **Change**: Swap `AppCard` wrapper to `GlassCard` (intensity=20, tint="dark", borderRadius=16).
- Keep `AppInput` exactly as-is — it already handles labels, placeholders, and helper text.

### 5. Picker Rows (Category, Brand, Size, Condition)
- **Current**: `PickerRow` inside `AppCard variant="surface"`, `Colors.border` dividers.
- **Change**: Swap `AppCard` wrapper to `GlassCard` (intensity=20, borderRadius=16).
- Keep `PickerRow` styling but soften the row background from `Colors.surface` to transparent (since the `GlassCard` provides the surface).

### 6. Price Input
- **Current**: `AppInput` with currency prefix, **28px bold** text inside `AppCard`.
- **Change**: Swap `AppCard` to `GlassCard` (intensity=20, borderRadius=16).
- Keep the 28px bold input styling — **already premium**.

### 7. Co-Own Card
- **Current**: `AppCard variant="elevated"` with toggle and share fields.
- **Change**:
  - Swap to `GlassCard` (intensity=25, borderRadius=16).
  - When `coOwnEnabled` is true, add gold tint to border: `borderColor: 'rgba(212,175,55,0.15)'`.
  - Keep existing toggle and inputs — functional.

### 8. Auction Card
- **Current**: `AppCard variant="elevated"` with bid input and duration segment.
- **Change**: Swap to `GlassCard` (intensity=25, borderRadius=16).

### 9. Readiness Card
- **Current**: `AppCard variant="surface"` with `ReadinessBar` + chips + hint.
- **Change**: Swap to `GlassCard` (intensity=20, borderRadius=16).
- Keep `ReadinessBar` with spring animation — **already good**.

### 10. Sticky Footer / CTA
- **Current**: `AppButton` in sticky footer, primary (gold) when ready, secondary when not.
- **Change**: Keep exactly as-is — **already correct**.
- **Optional enhancement**: Wrap the ready-state CTA in `GlowSurface` (intensity=0.1, color=Colors.brand) for a subtle premium halo effect behind the button.

### 11. Error State
- **Current**: Red text banner in sticky footer + shake animation on the entire form.
- **Change**: Keep as-is. The shake + banner is a clear, accessible pattern. Targeting individual fields with red glow is over-engineering for this flow.

---

## What Already Exists (Do Not Rebuild)

| Component | File | Notes |
|-----------|------|-------|
| `GlassCard` / `GlassSurface` | `components/ui/GlassSurface.tsx` | Reusable glassmorphism with BlurView |
| `AppInput` | `components/ui/AppInput.tsx` | Already has labels, prefixes, helper text, multiline |
| `AppButton` | `components/ui/AppButton.tsx` | Has `primary` (gold), `secondary` variants |
| `AppSegmentControl` | `components/ui/AppSegmentControl.tsx` | Already used for co-own toggle and auction duration |
| `AppCard` | `components/ui/AppCard.tsx` | Used throughout; swap to `GlassCard` |
| `AnimatedPressable` | `components/AnimatedPressable.tsx` | Scale + haptic already integrated |
| `SortablePhotoStrip` | `components/SortablePhotoStrip.tsx` | Photo reordering already works |
| `ReadinessBar` | Inline in `SellScreen.tsx` | Spring-animated progress bar — already good |
| `PickerRow` | Inline in `SellScreen.tsx` | Functional picker row — keep |

---

## File Modifications

| File | Action | Details |
|------|--------|---------|
| `frontend/src/screens/SellScreen.tsx` | Style refactor | Swap all `AppCard` wrappers to `GlassCard`; soften header buttons; optionally enhance empty photo upload zone |
| `frontend/src/components/SortablePhotoStrip.tsx` | Optional tweak | Add gold border on primary/selected photo |

---

## Design Tokens

No new tokens needed. Use existing:
- `Colors.brand`, `Colors.surface`, `Colors.border`, `Colors.textPrimary`, `Colors.textMuted`
- `Space`, `Radius`, `Type` from `theme/designTokens`
- `GlassCard` from `components/ui/GlassSurface`
- `GlowSurface` from `components/ui/GlowSurface` (optional CTA halo)

---

## Feature Preservation Checklist
- [ ] Camera permission + capture
- [ ] Gallery permission + select
- [ ] Photo reordering (SortablePhotoStrip)
- [ ] Photo limit (10 max)
- [ ] Co-own auto-populates auth photos from base photos
- [ ] Listing type: Marketplace / Co-Own / Auction
- [ ] Co-own toggle with share count + share price bidirectional math
- [ ] Auction starting bid input + duration selector
- [ ] Title, description, category, brand, size, condition fields
- [ ] Price input with currency prefix (28px bold)
- [ ] All picker bottom sheets (Category, Condition, Size, Brand)
- [ ] Readiness tracking (photos, details, description, price, co-own fields)
- [ ] Flow step tracking
- [ ] Publish validation with shake animation
- [ ] Co-own publish routes to CreateCoOwn with prefill
- [ ] Marketplace publish routes to ListingSuccess
- [ ] Error messaging for validation failures
- [ ] Keyboard avoiding behavior
- [ ] Sticky footer CTA with ready/not-ready states

---

## Success Criteria
1. All `AppCard` wrappers swapped to `GlassCard` for translucency
2. Header title changed from "Scan Item" to "New Listing" (or similar)
3. Header buttons use translucent glass styling
4. Photo upload empty state is more spacious (dashed border optional)
5. Co-own card gets gold tint border when active
6. Price input keeps its existing 28px bold styling
7. CTA remains gold when ready (already correct)
8. Readiness bar, animations, and validation logic preserved exactly
9. No new components created unnecessarily
10. All existing functionality preserved exactly
