# 13b — Create Look Playbook (DETAILED)

> Reference image: **`edits,looks,pulse reference.jpeg`** (covers Edits/Poster + Looks + Pulse)
> Screens: `CreateLookScreen`, `OutfitBuilderScreen`
> Heritage plans: AESTHETIC_CROSSCHECK_PLAN §3, OTHER_SCREENS_UPGRADE_PLAN §3

---

## 1. Visual DNA (extracted from `edits,looks,pulse reference.jpeg`)

The "Looks" portion of the reference image shows an **outfit builder / collage canvas** where users pick items from their closet (or browse new) and arrange them into a styled look.

| Attribute | Spec |
|---|---|
| **Background** | `#0A0A0A` deep black |
| **Canvas** | Portrait or square area to drag/drop clothing items onto a mannequin or flat-lay background |
| **Item picker** | Bottom sheet (glass) with tabs (My Closet, Browse, Trending) showing items in a horizontal scroll of small glass cards |
| **Item cards** (in picker) | Small square `GlassCard` with image + brand + price; tap to add to canvas |
| **Canvas items** | Draggable + resizable item images; each has a small delete (×) button on press |
| **Color palette** (top) | Horizontal swatches in a glass pill; selected swatch changes background of flat-lay |
| **Style tags** (chips) | Glass pills: "Casual", "Streetwear", "Luxury", "Vintage" — multi-select |
| **Caption input** | `AppInput variant="glass" multiline` (3 rows) |
| **Tag people** | AvatarRing small (32px) row at bottom; tap to add friend |
| **Action bar** | Save Draft / Share / Publish — `GlassBottomBar` with gold primary |

---

## 2. Per-Screen Edits

### 2.1 `CreateLookScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CreateLookScreen.tsx`

**Edits**:

1. **Header** (floating, minimal):
   - `GlassHeader` (floating blur)
   - Back button (glass, Pattern 2)
   - Title: "New Look" (Type.subtitle)
   - Right action: "Preview" glass button

2. **Canvas area** (top 60% of screen):
   - Aspect ratio 4:5 (portrait)
   - Background: customizable (white, beige, gradient, image)
   - Border: 1px `Glass.border`
   - Border radius: `Radius.xl` (20)
   - Drop shadow: `Elevation.card`
   - Drop zone: items can be dragged here from picker
   - Empty state: `GlowOrb` + `shirt-outline` icon + "Tap items below to start"

3. **Background color/pattern picker** (top right of canvas):
   - Small floating glass pill with color swatches
   - Selected swatch = gold border
   - Options: White, Beige, Gradient, Image upload

4. **Style tags** (below canvas):
   - Horizontal scroll of glass pills
   - Multi-select
   - Active = gold border + tinted bg

5. **Item picker** (bottom 40%):
   - `BottomSheet` (glass background)
   - Tabs: `AppSegmentControl variant="glass"` (My Closet, Browse, Trending)
   - Horizontal scroll of item cards (each = `GlassCard intensity={20} borderRadius={12}` with image + brand + price)
   - Tap to add to canvas
   - Long-press on canvas item to remove

6. **Canvas item** (when added):
   - Draggable image (use `react-native-gesture-handler`)
   - Resizable from corners
   - Small delete (×) button at top-right when selected
   - Animated entry: `ScaleIn` spring

7. **Caption input** (collapsible):
   - `AppInput variant="glass" multiline`
   - Placeholder: "Describe your look..."

8. **Tag people** (collapsible):
   - Horizontal row of `AvatarRing size={32}` (added friends)
   - "+" glass icon button to open friend picker

9. **Action bar** (sticky bottom):
   - `GlassBottomBar`
   - Save Draft (secondary)
   - Share (secondary)
   - Publish (primary, gold, `GlowSurface`)

10. **Animations**:
    - `FadeInUp` for picker
    - `ScaleIn` for canvas items
    - Spring drag physics

**Result sketch**:
```tsx
<View style={{ flex: 1, backgroundColor: Colors.background }}>
  {/* Floating header */}
  <GlassHeader scrollY={scrollY}>
    <View style={styles.headerRow}>
      <GlassIconButton icon="arrow-back" onPress={handleBack} />
      <Text style={Type.subtitle}>New Look</Text>
      <GlassIconButton icon="eye-outline" onPress={handlePreview} />
    </View>
  </GlassHeader>

  {/* Canvas */}
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

  {/* Style tags */}
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

  {/* Item picker (bottom sheet) */}
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
        {items.map(item => (
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

### 2.2 `OutfitBuilderScreen.tsx` (REFACTOR — if separate from CreateLook)

**File**: `frontend/src/screens/OutfitBuilderScreen.tsx`

**Edits** (similar to CreateLook but with more advanced features):
1. Same canvas + picker structure as CreateLook
2. **Add** category sections in picker (Tops, Bottoms, Shoes, Accessories)
3. **Add** color coordination tool (suggest items that match)
4. **Add** "Save to Closet as outfit" option
5. **Add** price total (sum of all items on canvas) at bottom
6. Same glass styling throughout

---

## 3. Component Dependencies

| Component | Required For | Status |
|---|---|---|
| `GlassCard` | All | ✅ |
| `GlassHeader` | Top header | ✅ |
| `GlassBottomBar` | Action bar | ✅ |
| `BottomSheet` | Item picker | ✅ |
| `AppButton` | All CTAs | ✅ |
| `AppSegmentControl variant="glass"` | Picker tabs | ❌ Add `variant` if missing |
| `AppInput variant="glass"` | Caption | ❌ Enhance AppInput per 02 §3 |
| `GlowSurface` | Publish CTA | ✅ |
| `GlowOrb` | Canvas empty state | ✅ |
| `AvatarRing` | Tagged people | ✅ |
| `CachedImage` | Item images | ✅ |
| `AnimatedPressable` | All chips/cards | ✅ |

---

## 4. Acceptance Criteria

- [ ] Canvas area is a glass card (4:5 aspect ratio)
- [ ] Empty state has `GlowOrb` + icon
- [ ] Canvas items are draggable + resizable + deletable
- [ ] Item picker is a `BottomSheet` (glass)
- [ ] Item picker tabs use `AppSegmentControl variant="glass"`
- [ ] Style tags are multi-select glass pills
- [ ] Caption uses `AppInput variant="glass"`
- [ ] Tagged people use `AvatarRing size={32}`
- [ ] Publish CTA uses `GlowSurface` + `AppButton variant="primary"`
- [ ] `FadeInUp` stagger present
- [ ] `npm run typecheck` passes
- [ ] Visual diff vs `edits,looks,pulse reference.jpeg` ≥ 90% (Look portion)

---

## 5. Feature Preservation Checklist

### CreateLookScreen
- [ ] Canvas with draggable items
- [ ] Multi-item support
- [ ] Background color/pattern picker
- [ ] Style tag multi-select (Casual, Streetwear, etc.)
- [ ] Item picker with tabs (Closet, Browse, Trending)
- [ ] Caption input
- [ ] Tag people
- [ ] Save draft
- [ ] Share
- [ ] Publish to feed
- [ ] Save as outfit in closet

### OutfitBuilderScreen
- [ ] All CreateLook features
- [ ] Category sections (Tops, Bottoms, Shoes, Accessories)
- [ ] Color coordination
- [ ] Price total
- [ ] Save as outfit

---

## 6. Reference Image Verification (TODO)

When `edits,looks,pulse reference.jpeg` is accessible, verify:
- [ ] Canvas: portrait or square area for outfit composition
- [ ] Item picker: bottom sheet with item thumbnails
- [ ] Style tags: glass pill chips, multi-select
- [ ] Color/background picker: visible in image
- [ ] Action bar: at bottom, with primary CTA in gold
- [ ] Spacing: generous between elements (luxury feel)

---

**Next**: Read `14_NOTIFICATIONS_AND_ACTIVITY.md` for Notifications, Invites, Auctions, MyBids, AssetDetail, AssetLeaderboard screens.
