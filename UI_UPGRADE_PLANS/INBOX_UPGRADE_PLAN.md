# InboxScreen UI/UX Upgrade Plan

## Aesthetic Direction (from Reference Analysis)

The reference images show a luxury dark-themed messaging interface with:
- **Deep charcoal/black backgrounds** (`#0A0A0A` / `#121212`)
- **Gold/amber accent ring** on avatars and unread indicators
- **Glassmorphism message bubbles** — frosted translucent cards with subtle border glow
- **Generous vertical spacing** — not cramped, breathing room between threads
- **Oversized circular avatars** (56-64px) with thin gold border for verified users
- **Typography hierarchy**: Large bold section title, medium username, muted snippet
- **Swipe actions with gradient backgrounds** — amber-to-gold for pin, deep red for delete
- **Floating search bar** with glassmorphism effect, not a flat input
- **Segment control as a floating pill** with blurred background, not inline chips

---

## Current State Audit

### `InboxScreen.tsx`

| Element | Current State | Issues |
|---------|---------------|--------|
| Header | Solid `Colors.surface` block with "Inbox" title + 2 icon buttons | No glassmorphism; `scrollY` tracked but unused for header blur |
| Search | `AppInput` with solid `Colors.surface` bg inside header | Flat; should use `GlassSurface` or translucent styling |
| Segment control | `AppSegmentControl` with solid `Colors.brand` active chip | Functional; glassmorphism wrapper would elevate it |
| Message cards | `Colors.surface` card, `shadowOpacity: 0.05` | Should use existing `GlassCard` for translucency + blur |
| Avatars | 52px plain circle | No gold ring for unread; no glow effect |
| Online dot | 14px circle, 3px border | Too prominent; should be 10px, 2.5px border |
| Unread dot | Static 10px solid gold circle | Should pulse subtly for attention |
| Item preview | 36px thumbnail + title + price crammed in card row | Clutters the list card; remove from inbox, show only in Chat |
| Swipe actions | Solid `Colors.danger` / `Colors.brand` 80px blocks | Functional but harsh; soften with opacity/gradient |
| List entrance | `FadeInDown` staggered | Already good — keep as-is |
| Empty state | `EmptyState` with `chatbubbles-outline` | Functional; could use `GlowOrb` for premium feel |

### `ChatScreen.tsx` + Chat Components

| Element | Current State | Issues |
|---------|---------------|--------|
| ChatHeader | `BlurView` + avatar + title + subtitle | **Already premium** — keep as-is |
| MessageBubble (me) | `Colors.brand` gold bubble with tail radius | **Already premium** — keep as-is |
| MessageBubble (them) | `Colors.surface` solid gray bubble | Should use `GlassSurface` for translucency |
| ComposerInput | `Colors.surface` pill with gold send button | Should use `GlassSurface` for the pill container |
| Offer/Status cards | `ChatCard` variant `surface`/`tint` | Swap to `GlassCard` for consistency |
| Date pills | `Colors.surface` background | Could be more subtle/glass |
| Selection toolbar | Solid row | Could use `GlassHeader` style |

---

## Upgrade Plan

### InboxScreen Changes

#### 1. Header
- **Current**: Solid `Colors.surface` block.
- **Change**: Remove the solid background. Use `GlassHeader` from `components/ui/GlassSurface` so the header floats with blur over the list content.
- **Scroll animation**: The `scrollY` shared value already exists but is unused. Wire it up with `useAnimatedStyle` to crossfade the header from transparent to `GlassHeader` intensity after ~40px of scroll.
- **Icon buttons**: Keep existing `AnimatedPressable` but swap background from `Colors.surface` to `rgba(255,255,255,0.05)` with `borderColor: Colors.border` for a softer glass look.

#### 2. Search Bar
- **Current**: `AppInput` with solid `Colors.surface` container (`searchWrap` style).
- **Change**: Swap the `searchWrap` style to use `GlassSurface` or manually set `backgroundColor: 'rgba(255,255,255,0.04)'`, `borderWidth: 0.5`, `borderColor: 'rgba(255,255,255,0.08)'`. Keep the `BlurView` wrapper from `GlassSurface` for true glassmorphism.
- **Focus**: On focus, animate border to `Colors.brand` at 30% opacity.

#### 3. Segment Control
- **Current**: `AppSegmentControl` with solid `Colors.brand` active chip.
- **Change**: Wrap the segment strip in a `GlassCard` (intensity=25) so it floats as a pill. Keep active chip as `Colors.brand` but with `borderColor: Colors.brand` instead of full solid fill, or use a gold-tinted glass background. Inactive chips stay transparent.

#### 4. Message Cards
- **Current**: Solid `Colors.surface` with `shadowOpacity: 0.05`.
- **Change**: Swap `messageCard` style to use `GlassCard` from `components/ui/GlassSurface` (intensity=30, tint="dark", borderRadius=20). This gives true translucency + blur.
- **Active press**: Already uses `scaleValue: 0.98` on `AnimatedPressable` — keep.

#### 5. Avatars
- **Current**: 52px plain circle. Online dot is 14px (too large).
- **Change**:
  - Create `AvatarRing` component (see New Components below).
  - Replace `CachedImage` avatar in Inbox with `<AvatarRing size={52} uri={...} isOnline={...} isUnread={item.unread} />`.
  - Online dot shrinks from 14px to 10px, border from 3px to 2.5px.
  - Unread state adds a soft gold outer glow via `GlowSurface`.

#### 6. Unread Indicator
- **Current**: Static 10px `Colors.brand` circle.
- **Change**: Replace with `<PulseDot />` (see New Components). Subtle scale 1→1.6 + opacity pulse.

#### 7. Item Preview Row
- **Current**: 36px thumbnail + title + price crammed inside the card.
- **Change**: **Remove** the `itemPreview` block from `InboxScreen` message cards entirely. The item context already appears in `ChatScreen` via `TaggedItemCard`. The inbox list should be clean: avatar + name + snippet + time only.

#### 8. Swipe Actions
- **Current**: Solid `Colors.danger` (delete) and `Colors.brand` (pin), 80px wide.
- **Change**: Soften backgrounds using opacity:
  - Pin: `backgroundColor: 'rgba(212,175,55,0.15)'` instead of solid `Colors.brand`
  - Delete: `backgroundColor: 'rgba(255,77,77,0.15)'` instead of solid `Colors.danger`
  - Keep icons in their respective colors but at full opacity for contrast.

#### 9. Empty State
- **Current**: `EmptyState` component with `chatbubbles-outline`.
- **Change**: Keep `EmptyState` but swap icon to `mail-unread-outline`. Wrap the icon in `GlowOrb` (size=120, intensity=0.12, color=Colors.brand) for a subtle premium halo behind the icon.

---

### ChatScreen Changes

#### 1. MessageBubble ("them" messages)
- **Current**: `backgroundColor: Colors.surface` solid gray.
- **Change**: Swap `bubbleThem` style from `Colors.surface` to use `GlassSurface` (intensity=20, tint="dark"). The bubble stays rounded with `borderBottomLeftRadius` tail. This makes received messages feel like they're floating on glass rather than sitting on a solid block.

#### 2. ComposerInput
- **Current**: `Colors.surface` pill container.
- **Change**: Swap `pill` style in `ComposerInput` from `Colors.surface` to `GlassSurface` (intensity=25, tint="dark", borderRadius=999). Keep the gold send button exactly as-is.

#### 3. Offer / Status / Date Cards
- **Current**: `ChatCard` variant `surface` or `tint`.
- **Change**: Swap all `ChatCard` usages in `ChatScreen` to `GlassCard` (intensity=30). This includes offer cards, purchase status cards, and date pills.

#### 4. Selection Toolbar
- **Current**: Solid `Colors.background` row.
- **Change**: Swap to `GlassBottomBar` from `components/ui/GlassSurface` for a frosted floating toolbar effect.

---

### New Components (Only 2)

#### `AvatarRing`
```tsx
interface AvatarRingProps {
  size?: number;        // default 52
  uri?: string;
  isOnline?: boolean;
  isUnread?: boolean;   // adds gold glow
  ringWidth?: number;   // default 2
}
// Uses CachedImage + View ring + GlowSurface for unread glow + online dot
```

#### `PulseDot`
```tsx
interface PulseDotProps {
  size?: number;        // default 8
  color?: string;       // default Colors.brand
}
// Reanimated: scale pulses 1→1.6, opacity 0.6→0 in loop
```

---

## What Already Exists (Do Not Rebuild)

| Component | File | Notes |
|-----------|------|-------|
| `GlassCard` / `GlassSurface` | `components/ui/GlassSurface.tsx` | Already has blur, border, radius, shadow |
| `GlowSurface` | `components/ui/GlowSurface.tsx` | Animated pulsing glow |
| `AppButton` | `components/ui/AppButton.tsx` | Has `gold`, `primary`, `secondary` variants |
| `AnimatedPressable` | `components/AnimatedPressable.tsx` | Scale + haptic feedback |
| `AppSegmentControl` | `components/ui/AppSegmentControl.tsx` | Existing segment control — needs styling pass |
| `SkeletonLoader` | `components/SkeletonLoader.tsx` | Shimmer skeletons already exist |
| `ChatHeader` | `components/chat/ChatHeader.tsx` | Already uses `BlurView` — good |
| `MessageBubble` | `components/chat/MessageBubble.tsx` | Already has tail radius, gold for "me" — solid foundation |

## File Modifications

| File | Action | Details |
|------|--------|---------|
| `frontend/src/screens/InboxScreen.tsx` | Style refactor | Swap solid `Colors.surface` cards to `GlassCard`; swap search to glassmorphism `AppInput`; add `AvatarRing`; resize online dot; remove cramped item preview row |
| `frontend/src/screens/ChatScreen.tsx` | Style refactor | Swap `MessageBubble` "them" background from solid `Colors.surface` to translucent glass; swap `ComposerInput` pill to `GlassSurface`; swap `ChatCard` (offer/status) to glass variants |
| `frontend/src/components/AvatarRing.tsx` | **Create** | Circular avatar with gold ring + unread glow + online dot. Size variants: sm/md/lg |
| `frontend/src/components/PulseDot.tsx` | **Create** | Animated pulsing dot (scale 1→1.6, opacity 0.6→0) for unread indicator |

---

## Design Tokens

No new tokens needed. Use existing:
- `Colors.brand`, `Colors.surface`, `Colors.border`, `Colors.textPrimary`, `Colors.textSecondary`, `Colors.textMuted`
- `Space`, `Radius`, `Type` from `theme/designTokens`
- `GlassCard` / `GlassSurface` from `components/ui/GlassSurface` (already built)

---

## Feature Preservation Checklist
- [ ] Conversation list with search/filter
- [ ] All / Unread / Groups segment filtering
- [ ] Swipe to delete (right) and pin (left)
- [ ] Unread dot and bold styling for unread messages
- [ ] Draft indicator
- [ ] Item preview (relocated or simplified)
- [ ] Pull-to-refresh
- [ ] Empty state with CTA
- [ ] Navigation to Chat screen on tap
- [ ] Mark as read on open
- [ ] Group chat avatar (`people` icon)
- [ ] Online indicator dot
- [ ] Pinned conversation sorting (pinned first)

---

## Success Criteria
1. Header transitions from transparent to frosted glass on scroll
2. Message cards use glassmorphism, not flat surfaces
3. Avatars have gold accent rings for premium feel
4. Unread indicator uses animated pulse dot
5. Swipe actions use gradient backgrounds matching the luxury aesthetic
6. Search bar floats with glassmorphism effect
7. Segment control has smooth sliding indicator
8. All existing functionality preserved exactly
9. No inline `IS_LIGHT ? ... : ...` color constants
10. Typography uses `Type` tokens exclusively
