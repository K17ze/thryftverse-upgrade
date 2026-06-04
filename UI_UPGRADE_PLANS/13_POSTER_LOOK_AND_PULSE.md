# 13 — Poster, Look & Pulse Playbook

> Screens: `CreatePosterScreen`, `PosterViewerScreen`, `CreateLookScreen`
> Heritage plans: AESTHETIC_CROSSCHECK_PLAN §3, OTHER_SCREENS_UPGRADE_PLAN §3
> Reference images: inherits from `edits,looks,pulse reference.jpeg` (master aesthetic)

---

## 1. Current State Snapshot

| Screen | Existing Quality | Gap |
|---|---|---|
| `CreatePosterScreen` | Functional canvas editor with solid tool panels and raw input fields | All panels → `GlassCard`; inputs → `AppInput variant="glass"`; no solid surfaces |
| `PosterViewerScreen` | Basic viewer with bare image and solid action rows | Wrap all rows in `GlassCard`; header → `GlassHeader`; add `FadeInUp` stagger |
| `CreateLookScreen` | Outfit canvas with solid picker cards and bottom sheet | All cards → `GlassCard`; tags → glass pills; inputs → `AppInput variant="glass"` |

**Honest audit verdict**: All three screens are feature-complete but visually flat. Every container uses solid `Colors.surface` or bare `View` wrappers. The work is uniform Pattern 1 (Solid→Glass) across the entire Poster/Look/Pulse surface, plus floating tool panels and glass picker rows.

---

## 2. Per-Screen Edits

### 2.1 `CreatePosterScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CreatePosterScreen.tsx`

**Edits**:

1. **Header** (minimal floating):
   - Replace solid header block with `GlassHeader` (floating, blur)
   - Back button: `GlassIconButton` (Pattern 2)
   - Title: "Create Poster" in `Type.subtitle`
   - Right action: "Preview" `GlassIconButton` with `eye-outline`
   - Cross-fade opacity 0→1 on scroll over first 40px

2. **Canvas area** (large, central):
   - Square or 4:5 aspect ratio canvas
   - Background: `Glass.bg` (`rgba(255,255,255,0.03)`)
   - Border: 1px `Glass.border` (`rgba(255,255,255,0.08)`)
   - `borderRadius: 20`
   - Subtle drop shadow: `Elevation.card`
   - Show poster preview in real-time

3. **Floating tool panel** (left side):
   - `GlassCard intensity={30} borderRadius={16}`
   - Vertical column of tool icons (40×40 tinted square containers, `borderRadius: 10`, 8px spacing):
     - Text (`text-outline`)
     - Image (`image-outline`)
     - Sticker (`happy-outline`)
     - Shape (`shapes-outline`)
     - Color (`color-palette-outline`)
     - Template (`copy-outline`)
   - Active tool: `borderColor: Colors.brand` + `backgroundColor: 'rgba(212,175,55,0.12)'`
   - Inactive tool: `borderColor: 'transparent'` + `backgroundColor: 'transparent'`

4. **Color picker** (when color tool active):
   - Floating glass pill near canvas
   - Horizontal row of color swatches (32px circular, 8px spacing)
   - Selected swatch: `borderColor: Colors.brand` + `transform: [{ scale: 1.15 }]`
   - Unselected swatch: `borderColor: 'transparent'`
   - Wrap swatch row in `GlassCard intensity={30} borderRadius={999}`

5. **Text editor** (when text tool active):
   - `GlassCard intensity={30} borderRadius={16}` floating over canvas
   - `AppInput variant="glass" multiline` (3 rows) for poster text
   - Font size chips: glass pills (8, 12, 16, 20, 24, 32, 48), active = `borderColor: Colors.brand`
   - Font style chips: Bold, Italic, Underline — glass pill toggles, active = gold tint
   - Color: small swatch row inside the same card
   - Alignment: 3 glass icon buttons (left, center, right)

6. **Template / sticker picker** (bottom sheet):
   - `BottomSheet` with glass background (`backgroundColor: Glass.bg`)
   - Grid of items, each in `GlassCard intensity={20} borderRadius={12}`
   - Tap to apply to canvas
   - Selected template: `borderColor: Colors.brand` + `scale: 1.02`

7. **Layer list** (collapsible, right side):
   - Glass vertical strip: `GlassCard intensity={25} borderRadius={16}`
   - Each layer = small row with thumbnail + layer name + visibility eye icon
   - Active layer: `borderColor: Colors.brand`
   - Drag handle for reorder

8. **Action bar (sticky bottom)**:
   - `GlassBottomBar` with `backgroundColor: Glass.bgLight`
   - "Save Draft" — `AppButton variant="secondary" size="md"`
   - "Share" — `AppButton variant="secondary" size="md"`
   - "Publish" — `AppButton variant="primary" size="lg"` wrapped in `GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16}`

9. **Animations**:
   - `FadeInUp` staggered entrance for tool panel (delay 45ms per tool)
   - `FadeInDown` staggered entrance for layer list
   - Spring animation when canvas state changes
   - Haptic `light` on tool selection
   - `FadeIn` on color picker appearance

**Result sketch** (top portion):
```tsx
<View style={{ flex: 1, backgroundColor: Colors.background }}>
  <GlassHeader scrollY={scrollY}>
    <View style={styles.headerRow}>
      <GlassIconButton icon="arrow-back" onPress={handleBack} />
      <Text style={Type.subtitle}>Create Poster</Text>
      <GlassIconButton icon="eye-outline" onPress={handlePreview} />
    </View>
  </GlassHeader>

  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Animated.View style={[styles.canvas, animatedStyle]}>
      <PosterCanvas layers={layers} />
    </Animated.View>
  </View>

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

  <GlassBottomBar>
    <View style={{ flexDirection: 'row', gap: Space.sm }}>
      <AppButton variant="secondary" size="md" onPress={handleSaveDraft}>Save Draft</AppButton>
      <AppButton variant="secondary" size="md" onPress={handleShare}>Share</AppButton>
      <GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16} style={{ flex: 1 }}>
        <AppButton variant="primary" size="lg" fullWidth onPress={handlePublish}>Publish</AppButton>
      </GlowSurface>
    </View>
  </GlassBottomBar>
</View>
```

---

### 2.2 `PosterViewerScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/PosterViewerScreen.tsx`

**Edits**:

1. **Background**: `Colors.background` (`#0A0A0A`) everywhere; no solid surface cards

2. **Hero**: full-bleed poster image with `CachedImage`; aspect ratio preserved; double-tap to like via `DoubleTapHeart` overlay

3. **Floating header**: `GlassHeader` with scroll-aware blur
   - Back: `GlassIconButton` (Pattern 2)
   - Share: `GlassIconButton icon="share-outline"`
   - Like: `GlassIconButton icon="heart-outline"` (filled when liked)

4. **Creator row** (below hero):
   - `GlassCard intensity={25} borderRadius={16}`
   - `AvatarRing size={48}` + creator name in `Type.bodyEmphasis`
   - Follow button: `AppButton variant="primary" size="sm"` (gold when not following, ghost when following)
   - `FadeInUp` entrance, delay 100ms

5. **Stats row** (views, likes, shares, reposts):
   - Inside same `GlassCard` as creator row or separate `GlassCard intensity={20} borderRadius={16}`
   - Metric numbers in `Type.price` (20/700) in `Colors.brand` (gold `#D4AF37`)
   - Labels in `Type.meta` (11/600, uppercase, `Colors.textMuted`)

6. **Description card**:
   - `GlassCard intensity={25} borderRadius={16}`
   - Title: `Type.subtitle`
   - Body: `Type.body` in `Colors.textSecondary`
   - Hashtags: `Type.body` in `Colors.brand`
   - Timestamp: `Type.caption` in `Colors.textMuted`

7. **Comments preview row** (tap to expand):
   - `GlassCard intensity={20} borderRadius={16}`
   - Latest 2 comments: `AvatarRing size={28}` + username + snippet
   - "View all N comments" link in `AppButton variant="ghost"`

8. **Related posters carousel** (bottom):
   - Horizontal scroll
   - Each item: `GlassCard intensity={20} borderRadius={16}` with poster thumbnail + creator name
   - `FadeInUp` stagger (delay 45ms per card)

9. **Sticky action bar**:
   - `GlassBottomBar`
   - "Save" (secondary), "Share" (secondary), "Comment" (primary, gold `GlowSurface`)

10. **Entrance animations**:
    - `FadeInUp` stagger for creator row, stats, description, comments, related carousel
    - Stagger delay: 80ms per section

---

### 2.3 `CreateLookScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CreateLookScreen.tsx`

**Edits**:

1. **Header** (floating, minimal):
   - `GlassHeader` (floating blur)
   - Back button: `GlassIconButton` (Pattern 2)
   - Title: "New Look" in `Type.subtitle`
   - Right action: "Preview" `GlassIconButton` with `eye-outline`
   - Cross-fade opacity 0→1 on scroll

2. **Canvas area** (top 55% of screen):
   - Aspect ratio 4:5 (portrait)
   - Background: customizable (white, beige, gradient, image)
   - Border: 1px `Glass.border`
   - `borderRadius: 20`
   - Drop shadow: `Elevation.card`
   - Wrap canvas in `GlassCard intensity={20} borderRadius={20}`
   - Empty state: `GlowOrb` (size 120, gold, intensity 0.1) + `shirt-outline` icon (48px, `Colors.brand`) + "Tap items below to start" in `Type.body` `Colors.textMuted`
   - Drop zone: items dragged here from picker snap to grid with spring physics

3. **Background color / pattern picker** (top right of canvas, floating):
   - Small floating `GlassCard intensity={30} borderRadius={999}` with color swatches
   - Swatches: 24px circles, 6px spacing
   - Selected swatch: `borderColor: Colors.brand` + `scale: 1.1`
   - Options: White, Beige, Gradient, Image upload

4. **Style tags** (below canvas):
   - Horizontal scroll of glass pills
   - Each pill: `paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999`
   - Background: `Glass.bgLight`; active: `rgba(212,175,55,0.12)`
   - Border: `Glass.border` (1px); active: `Colors.brand`
   - Text: `Type.body`; active: `Colors.brand`
   - Multi-select enabled
   - Tags: "Casual", "Streetwear", "Luxury", "Vintage", "Formal", "Athleisure", "Y2K"

5. **Item picker** (bottom 45%):
   - `BottomSheet` with glass background (`backgroundColor: Glass.bg`)
   - Tabs: `AppSegmentControl variant="glass"` (My Closet / Browse / Trending)
   - Horizontal scroll of item cards
   - Each card: `GlassCard intensity={20} borderRadius={12}`, width 100px
     - `CachedImage` square thumbnail (`aspectRatio: 1`, `borderRadius: 8`)
     - Brand name: `Type.caption` in `Colors.textMuted`, 1 line
     - Price: `Type.bodyEmphasis` in `Colors.brand`
   - Tap card to add item to canvas (`ScaleIn` spring animation on entry)
   - Long-press canvas item to remove (`FadeOut` + haptic `medium`)

6. **Canvas item** (when added):
   - Draggable image via `react-native-gesture-handler` `PanGestureHandler`
   - Resizable from corner handles (pinch or drag handles)
   - Selected state: `borderColor: Colors.brand` (1px dashed)
   - Delete (×) button at top-right when selected: `GlassIconButton` size 24
   - Animated entry: `ScaleIn` spring (`stiffness: 200, damping: 15`)
   - z-index managed by tap-to-bring-to-front

7. **Caption input** (collapsible, below style tags):
   - `AppInput variant="glass" multiline` (3 rows)
   - Placeholder: "Describe your look..."
   - `borderRadius: 16`
   - `FadeInUp` when expanded

8. **Tag people** (collapsible):
   - Horizontal row of `AvatarRing size={32}` for tagged friends
   - "+" `GlassIconButton` to open friend picker
   - Picker rows: `GlassCard intensity={20} borderRadius={12}` with `AvatarRing` + name

9. **Action bar** (sticky bottom):
   - `GlassBottomBar`
   - "Save Draft" — `AppButton variant="secondary" size="md"`
   - "Share" — `AppButton variant="secondary" size="md"`
   - "Publish" — `AppButton variant="primary" size="lg"` wrapped in `GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16}`

10. **Animations**:
    - `FadeInUp` for picker entrance (delay 100ms)
    - `ScaleIn` for canvas items (spring)
    - `FadeInDown` stagger for style tags (delay 45ms per tag)
    - Spring drag physics on canvas items
    - Haptic `light` on item add, `medium` on item remove

**Result sketch** (canvas + tags + picker):
```tsx
<View style={{ flex: 1, backgroundColor: Colors.background }}>
  <GlassHeader scrollY={scrollY}>
    <View style={styles.headerRow}>
      <GlassIconButton icon="arrow-back" onPress={handleBack} />
      <Text style={Type.subtitle}>New Look</Text>
      <GlassIconButton icon="eye-outline" onPress={handlePreview} />
    </View>
  </GlassHeader>

  <View style={{ padding: Space.md, paddingBottom: 0 }}>
    <GlassCard intensity={20} borderRadius={20} style={{ aspectRatio: 4/5, padding: Space.lg, justifyContent: 'center', alignItems: 'center' }}>
      {items.length === 0 ? (
        <View style={{ alignItems: 'center' }}>
          <GlowOrb size={120} color={Colors.brand} intensity={0.1} />
          <Ionicons name="shirt-outline" size={48} color={Colors.brand} />
          <Text style={{ ...Type.body, color: Colors.textMuted, marginTop: Space.md }}>Tap items below to start</Text>
        </View>
      ) : (
        items.map((item, i) => (
          <DraggableCanvasItem key={item.id} item={item} onRemove={() => removeItem(item.id)} />
        ))
      )}
    </GlassCard>
  </View>

  <ScrollView horizontal showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ paddingHorizontal: Space.md, paddingVertical: Space.md, gap: Space.sm }}>
    {styleTags.map(tag => (
      <AnimatedPressable key={tag} onPress={() => toggleTag(tag)}
        style={{
          paddingHorizontal: Space.md, paddingVertical: Space.sm,
          borderRadius: 999,
          backgroundColor: selectedTags.includes(tag) ? 'rgba(212,175,55,0.12)' : Glass.bgLight,
          borderWidth: 1,
          borderColor: selectedTags.includes(tag) ? Colors.brand : Glass.border,
        }}>
        <Text style={{ ...Type.body, color: selectedTags.includes(tag) ? Colors.brand : Colors.textPrimary }}>{tag}</Text>
      </AnimatedPressable>
    ))}
  </ScrollView>

  <BottomSheet>
    <View style={{ padding: Space.md }}>
      <AppSegmentControl
        segments={[
          { label: 'My Closet', value: 'closet' },
          { label: 'Browse', value: 'browse' },
          { label: 'Trending', value: 'trending' },
        ]}
        value={pickerTab} onChange={setPickerTab}
        variant="glass"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: Space.md, gap: Space.sm }}>
        {pickerItems.map(item => (
          <AnimatedPressable key={item.id} onPress={() => addToCanvas(item)}>
            <GlassCard intensity={20} borderRadius={12} style={{ width: 100, padding: Space.xs }}>
              <CachedImage uri={item.image} style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }} />
              <Text style={{ ...Type.caption, color: Colors.textMuted, marginTop: 4 }} numberOfLines={1}>{item.brand}</Text>
              <Text style={{ ...Type.bodyEmphasis, color: Colors.brand }}>{item.price}</Text>
            </GlassCard>
          </AnimatedPressable>
        ))}
      </ScrollView>
    </View>
  </BottomSheet>

  <GlassBottomBar>
    <View style={{ flexDirection: 'row', gap: Space.sm }}>
      <AppButton variant="secondary" size="md" onPress={handleSaveDraft}>Save Draft</AppButton>
      <AppButton variant="secondary" size="md" onPress={handleShare}>Share</AppButton>
      <GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16} style={{ flex: 1 }}>
        <AppButton variant="primary" size="lg" fullWidth onPress={handlePublish}>Publish</AppButton>
      </GlowSurface>
    </View>
  </GlassBottomBar>
</View>
```

---

## 3. Component Dependencies

| Component | Required For | Created? |
|---|---|---|
| `GlassCard` | All panels, cards, picker items | ✅ Exists |
| `GlassHeader` | CreatePoster, CreateLook floating header | ✅ Exists |
| `GlassBottomBar` | All sticky action bars | ✅ Exists |
| `GlassIconButton` | Header buttons, tool icons, delete handles | ✅ Exists |
| `AppButton variant="primary" size="lg"` | Publish CTAs | ✅ Exists |
| `AppButton variant="secondary" size="md"` | Save Draft / Share | ✅ Exists |
| `AppInput variant="glass"` | Text editor, caption input | ❌ Enhance AppInput per `02_SHARED_COMPONENTS.md` §3 |
| `AppSegmentControl variant="glass"` | Item picker tabs | ❌ Add `variant="glass"` if missing |
| `GlowSurface` | Primary CTA halos | ✅ Exists |
| `GlowOrb` | Canvas empty states | ✅ Exists |
| `AvatarRing` | Creator row, tag people, comment rows | ✅ Exists |
| `CachedImage` | Poster hero, item thumbnails, layer thumbnails | ✅ Exists |
| `DoubleTapHeart` | PosterViewer like gesture | ✅ Exists |
| `AnimatedPressable` | Tool buttons, swatches, cards | ✅ Exists |
| `FadeInUp` / `FadeInDown` | Staggered entrances | ✅ Exists |
| `ScaleIn` (Reanimated) | Canvas item entry | ✅ Exists |
| `BottomSheet` | Template picker, item picker | ✅ Exists |
| `DraggableCanvasItem` | CreateLook canvas | ⚠️ Custom — ensure gesture handler setup |

---

## 4. Acceptance Criteria

- [ ] All cards across all 3 screens use `GlassCard` (intensity 20–30, borderRadius 16–20) — Pattern 1
- [ ] All form inputs use `AppInput variant="glass"`
- [ ] All primary CTAs use `AppButton variant="primary" size="lg"`
- [ ] All secondary CTAs use `AppButton variant="secondary" size="md"`
- [ ] No solid `Colors.surface` backgrounds remain on any card, row, or panel
- [ ] Background is consistently `#0A0A0A` (`Colors.background`) on all root views
- [ ] Gold accent (`#D4AF37` / `Colors.brand`) used for active states, selected borders, primary CTAs, and stats numbers
- [ ] `FadeInUp` / `FadeInDown` stagger present on tool panels, layer lists, style tags, related carousels, and form sections
- [ ] `GlassHeader` used on `CreatePosterScreen` and `CreateLookScreen` with scroll-aware blur
- [ ] `GlassBottomBar` used on all 3 screens for sticky action rows
- [ ] Active tool in `CreatePosterScreen` has gold border + tinted background
- [ ] Selected color swatch has gold border + scale 1.15
- [ ] Selected style tag has gold border + tinted background
- [ ] `PosterViewerScreen` uses `DoubleTapHeart` overlay
- [ ] `PosterViewerScreen` creator row uses `AvatarRing`
- [ ] All bare `Image` replaced with `CachedImage`
- [ ] `npm run typecheck` passes for all 3 files
- [ ] Visual diff against `edits,looks,pulse reference.jpeg` ≥ 90% match

---

## 5. Feature Preservation Checklist

### CreatePosterScreen
- [ ] Canvas renders poster preview in real-time
- [ ] Tool panel switches active tool on tap
- [ ] Text tool: add/edit text layers with font size, style, color, alignment
- [ ] Image tool: add image layers from gallery/camera
- [ ] Sticker tool: add stickers from bottom sheet grid
- [ ] Shape tool: add basic shapes (rect, circle, line)
- [ ] Color tool: change layer color or canvas background
- [ ] Template tool: apply preset templates
- [ ] Layer list: reorder, toggle visibility, delete layers
- [ ] Save Draft persists to local / backend
- [ ] Share opens native share sheet with rendered poster
- [ ] Publish creates public poster post
- [ ] Undo / redo stack intact
- [ ] Haptics on tool selection and layer operations

### PosterViewerScreen
- [ ] Full-bleed poster hero image
- [ ] Double-tap to like with heart animation
- [ ] Back, share, like header buttons
- [ ] Creator info + follow toggle
- [ ] Stats: views, likes, shares, reposts
- [ ] Description, hashtags, timestamp
- [ ] Comments preview + expand to full comments
- [ ] Related posters horizontal carousel
- [ ] Save to collection
- [ ] Report poster
- [ ] Loading state (`SkeletonLoader`)

### CreateLookScreen
- [ ] Canvas drop zone with 4:5 aspect ratio
- [ ] Background color/pattern picker (white, beige, gradient, image)
- [ ] Style tags multi-select
- [ ] Item picker bottom sheet with 3 tabs (My Closet, Browse, Trending)
- [ ] Tap item to add to canvas
- [ ] Drag to reposition canvas items
- [ ] Resize canvas items from corner handles
- [ ] Delete canvas item (× button or long-press)
- [ ] Caption input (multiline)
- [ ] Tag people with friend picker
- [ ] Save Draft persists look draft
- [ ] Share opens native share sheet
- [ ] Publish creates public look post
- [ ] Price total optional display (sum of items on canvas)
- [ ] Haptics on add, remove, and snap actions

---

**Next**: Read `14_NOTIFICATIONS_AND_ACTIVITY.md` for Notifications, Activity Feed, and Pulse screens.
