# 13a — Create Poster Playbook (DETAILED)

> Reference image: **`edits,looks,pulse reference.jpeg`** (covers Edits/Poster + Looks + Pulse)
> Screens: `CreatePosterScreen`, `PosterViewerScreen`
> Heritage plans: AESTHETIC_CROSSCHECK_PLAN §3, OTHER_SCREENS_UPGRADE_PLAN §3

---

## 1. Visual DNA (extracted from `edits,looks,pulse reference.jpeg`)

| Attribute | Spec |
|---|---|
| **Background** | `#0A0A0A` deep black |
| **Canvas** | Large central editing area showing poster preview (square or portrait) with floating glass control panels around it |
| **Top toolbar** | Minimal glass strip: back button (glass), title (Type.subtitle), preview/save actions |
| **Floating tool panels** | Glass cards floating over the canvas (NOT docked to edges); can be moved/repositioned |
| **Tool icons** | Tinted square containers (40×40, `borderRadius: 10`) with gold accent for active tool |
| **Color picker** | Horizontal row of color swatches in a glass pill; selected swatch has gold border + scale 1.1 |
| **Text editor** | Glass card with floating labels, font size selector (chips), color selector |
| **Sticker/element picker** | Bottom sheet with grid of items, each in glass card |
| **Layer list** (right side) | Vertical list of layers, each = small glass row with thumbnail + name + visibility toggle |
| **Action bar (bottom)** | Save / Share / Download — `AppButton` row in `GlassBottomBar` |
| **Style cards** (templates) | Horizontal scroll of full-bleed template previews in glass cards; selected = gold border + scale 1.02 |

---

## 2. Per-Screen Edits

### 2.1 `CreatePosterScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CreatePosterScreen.tsx`

**Edits**:

1. **Header** (minimal floating):
   - Replace solid header with `GlassHeader` (floating, blur)
   - Back button: glass icon button (Pattern 2)
   - Title: "Create Poster" (Type.subtitle)
   - Right action: "Preview" glass button
   - Cross-fade opacity 0→1 on scroll

2. **Canvas area** (large, central):
   - Square or 4:5 aspect ratio canvas
   - Background: `Glass.bg`
   - Border: 1px `Glass.border`
   - Border radius: `Radius.xl` (20)
   - Show poster preview in real-time
   - Subtle drop shadow: `Elevation.card`

3. **Floating tool panel** (left or right side):
   - `GlassCard intensity={30} borderRadius={16}`
   - Vertical column of tool icons (40×40 each, 8px spacing):
     - Text (`text-outline`)
     - Image (`image-outline`)
     - Sticker (`happy-outline`)
     - Shape (`shapes-outline`)
     - Color (`color-palette-outline`)
     - Template (`copy-outline`)
   - Active tool = `borderColor: Colors.brand` + `backgroundColor: 'rgba(212,175,55,0.12)'`

4. **Color picker** (when color tool active):
   - Floating glass pill near canvas
   - Horizontal row of color swatches (32px circular, 8px spacing)
   - Selected swatch = `borderColor: Colors.brand` + `transform: [{ scale: 1.15 }]`
   - Brand colors + theme colors

5. **Text editor** (when text tool active):
   - `GlassCard intensity={30} borderRadius={16}` floating
   - `AppInput variant="glass" multiline` (Type.body 15/500) for text
   - Font size chips: glass pills (8, 12, 16, 20, 24, 32, 48), active = gold border
   - Font style chips: Bold, Italic, Underline (glass pill toggles)
   - Color: small swatch row
   - Alignment: 3 glass icon buttons (left, center, right)

6. **Template/sticker picker** (bottom sheet):
   - `BottomSheet` (glass background)
   - Grid of items, each in `GlassCard intensity={20} borderRadius={12}`
   - Tap to apply to canvas

7. **Layer list** (collapsible, right side):
   - Glass vertical strip
   - Each layer = small row with thumbnail + name + visibility eye icon
   - Drag to reorder

8. **Action bar (sticky bottom)**:
   - `GlassBottomBar`
   - "Save Draft" (secondary)
   - "Share" (secondary)
   - "Publish" (primary, gold, with `GlowSurface`)

9. **Animations**:
   - `FadeInUp` staggered entrance for tool panel
   - Spring animation when canvas state changes
   - Haptic `light` on tool selection

**Result sketch** (top portion):
```tsx
<View style={{ flex: 1, backgroundColor: Colors.background }}>
  {/* Floating header */}
  <GlassHeader scrollY={scrollY}>
    <View style={styles.headerRow}>
      <GlassIconButton icon="arrow-back" onPress={handleBack} />
      <Text style={Type.subtitle}>Create Poster</Text>
      <GlassIconButton icon="eye-outline" onPress={handlePreview} />
    </View>
  </GlassHeader>

  {/* Canvas */}
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Animated.View style={[styles.canvas, animatedStyle]}>
      <PosterCanvas layers={layers} />
    </Animated.View>
  </View>

  {/* Floating tool panel */}
  <Animated.View style={[styles.toolPanel, { left: Space.md }]}>
    <GlassCard intensity={30} borderRadius={16} style={{ padding: Space.xs }}>
      {tools.map(t => (
        <AnimatedPressable key={t.id} onPress={() => setActiveTool(t.id)}
          style={{
            width: 40, height: 40, borderRadius: 10, marginVertical: 2,
            backgroundColor: activeTool === t.id ? 'rgba(212,175,55,0.12)' : 'transparent',
            borderWidth: 1, borderColor: activeTool === t.id ? Colors.brand : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Ionicons name={t.icon} size={20} color={activeTool === t.id ? Colors.brand : Colors.textPrimary} />
        </AnimatedPressable>
      ))}
    </GlassCard>
  </Animated.View>

  {/* Color picker (when color tool active) */}
  {activeTool === 'color' && (
    <Animated.View entering={FadeIn} style={[styles.colorPicker, { bottom: 100 }]}>
      <GlassCard intensity={30} borderRadius={999} style={{ padding: Space.xs, flexDirection: 'row' }}>
        {colors.map(c => (
          <AnimatedPressable key={c} onPress={() => setColor(c)}
            style={{
              width: 32, height: 32, borderRadius: 16, margin: 4,
              backgroundColor: c,
              borderWidth: 2, borderColor: color === c ? Colors.brand : 'transparent',
              transform: [{ scale: color === c ? 1.15 : 1 }],
            }} />
        ))}
      </GlassCard>
    </Animated.View>
  )}

  {/* Sticky bottom action bar */}
  <GlassBottomBar>
    <View style={{ flexDirection: 'row', gap: Space.sm }}>
      <AppButton variant="secondary" size="md" onPress={handleSaveDraft}>Save Draft</AppButton>
      <AppButton variant="secondary" size="md" onPress={handleShare}>Share</AppButton>
      <GlowSurface intensity={0.1} color={Colors.brand} borderRadius={12} style={{ flex: 1 }}>
        <AppButton variant="primary" size="md" fullWidth onPress={handlePublish}>Publish</AppButton>
      </GlowSurface>
    </View>
  </GlassBottomBar>
</View>
```

### 2.2 `PosterViewerScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/PosterViewerScreen.tsx`

**Edits**:
1. Hero: full-bleed poster image with `CachedImage`
2. Floating header: `BlurView` with back, share, like buttons
3. Creator row below: `AvatarRing` + name + follow button
4. Stats row: views, likes, shares (gold numbers)
5. Description card: `GlassCard intensity={25}`
6. Related posters carousel: horizontal scroll of `GlassCard` items
7. Like: `DoubleTapHeart` overlay
8. Action bar: Save / Share / Comment — `GlassBottomBar`
9. `FadeInUp` stagger

---

## 3. Component Dependencies

| Component | Required For | Status |
|---|---|---|
| `GlassCard` | All panels | ✅ |
| `GlassHeader` | Top header | ✅ |
| `GlassBottomBar` | Action bar | ✅ |
| `AppButton` | All CTAs | ✅ |
| `AppInput variant="glass"` | Text editor | ❌ Enhance AppInput per 02 §3 |
| `GlowSurface` | Publish CTA | ✅ |
| `AvatarRing` | Creator row | ✅ |
| `CachedImage` | Poster preview | ✅ |
| `DoubleTapHeart` | Like gesture | ✅ |
| `AnimatedPressable` | All tool buttons | ✅ |

---

## 4. Acceptance Criteria

- [ ] All tool panels use `GlassCard` (floating, NOT docked)
- [ ] Active tool has gold border + tinted background
- [ ] Color swatches: selected has gold border + scale 1.15
- [ ] Text editor uses `AppInput variant="glass"`
- [ ] Template/sticker picker uses `BottomSheet` (glass)
- [ ] All CTAs use `GlowSurface` + `AppButton variant="primary"`
- [ ] `FadeInUp` stagger present
- [ ] `npm run typecheck` passes
- [ ] Visual diff vs `edits,looks,pulse reference.jpeg` ≥ 90%

---

## 5. Feature Preservation Checklist

### CreatePosterScreen
- [ ] Canvas with multiple layers
- [ ] Text tool with font size, style, color, alignment
- [ ] Image tool (upload from gallery/camera)
- [ ] Sticker/element library
- [ ] Shape tool
- [ ] Color picker
- [ ] Template library
- [ ] Layer reordering, visibility toggle, delete
- [ ] Undo/Redo
- [ ] Save draft
- [ ] Share to story / feed
- [ ] Publish to ThryftVerse feed

### PosterViewerScreen
- [ ] Full-bleed poster display
- [ ] Creator info
- [ ] Like, save, share, comment
- [ ] Related posters
- [ ] Tap to view creator profile
- [ ] Pull to dismiss

---

**Next**: Read `13b_CREATE_LOOK.md` for the Create Look screen.
