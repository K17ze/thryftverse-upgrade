# VISUAL_AUDIT.md

> **Per-section before/after + reference image side-by-side**
> Captures the visual diff between target and implementation
> Each section lists reference image(s) and pass/fail visual criteria

---

## How to Use This File

After each screen is refactored:
1. Capture Puppeteer screenshot of the live screen (dark theme, populated state)
2. Open the reference image in `reference/`
3. Compare side-by-side
4. Mark each criterion ⬜ / 🟡 / ✅
5. Note discrepancies in the **Discrepancies** row
6. Re-refactor if discrepancies are significant

---

## Section-by-Section Audit

### 00 — Overall Aesthetic

**Reference**: `reference/overall outlook.jpeg`, `overall reference.jpeg`, `overall reference.jpg`

| Criterion | Status | Notes |
|---|---|---|
| Background is `#0A0A0A` (deep black, not pure, not gray) | ⬜ | |
| Brand color is `#D4AF37` (antique gold) | ⬜ | |
| Cards appear translucent (BlurView or rgba alpha) | ⬜ | |
| Typography has negative letter-spacing on headlines | ⬜ | |
| Generous whitespace (no crowding) | ⬜ | |
| Section labels are small uppercase muted (Type.meta) | ⬜ | |
| Prices in gold (Colors.brand) | ⬜ | |
| Tinted icon containers with `${color}20` bg | ⬜ | |
| Spring-based animations (no linear) | ⬜ | |
| Outline icon style (not filled) | ⬜ | |

**Screenshot path**: `screenshots/overall-dark.png`
**Discrepancies**: _none yet_

---

### 12 — Settings & Security (USER PRIORITY)

**Reference**: `reference/settings reference.jpeg`, `settings reference.png`, `settingsreen.jpeg`, `edit profile settings reference .jpeg`

#### SettingsScreen

| Criterion | Status | Notes |
|---|---|---|
| Profile preview card is glass (translucent, hairline border) | ⬜ | |
| Profile avatar has gold ring (if verified) | ⬜ | |
| Settings groups have tinted icon containers (32×32, borderRadius 10, `${color}20` bg) | ⬜ | |
| Section labels are uppercase muted (Type.meta) | ⬜ | |
| Gold active toggles (NOT green iOS) | ⬜ | |
| Search bar is floating glass pill (GlassSearchPill) | ⬜ | |
| Row separator is hairline (Glass.border) | ⬜ | |
| Logout button is red-tinted (destructive) | ⬜ | |
| Version text is small, centered, muted | ⬜ | |
| Stagger entrance animation on rows | ⬜ | |

**Screenshot path**: `screenshots/settings.png`
**Discrepancies**: _none yet_

#### AccountSettingsScreen

| Criterion | Status | Notes |
|---|---|---|
| Form is grouped into glass cards per section | ⬜ | |
| Section labels (Personal Details, Preferences, etc.) uppercase muted | ⬜ | |
| All inputs are glass (AppInput variant="glass") | ⬜ | |
| Toggles are gold (PremiumToggle) | ⬜ | |
| Save button is gold primary CTA with glow | ⬜ | |

**Screenshot path**: `screenshots/account-settings.png`
**Discrepancies**: _none yet_

#### EditProfileScreen

| Criterion | Status | Notes |
|---|---|---|
| Avatar picker at top (100px circular with camera overlay) | ⬜ | |
| Camera overlay is gold circular with dark icon | ⬜ | |
| Form sections in glass cards | ⬜ | |
| Floating labels uppercase muted | ⬜ | |
| Save button sticky bottom with glow | ⬜ | |

**Screenshot path**: `screenshots/edit-profile.png`
**Discrepancies**: _none yet_

---

### 13a — Create Poster (USER PRIORITY)

**Reference**: `reference/edits,looks,pulse reference.jpeg` (Edits/Poster portion)

#### CreatePosterScreen

| Criterion | Status | Notes |
|---|---|---|
| Minimal floating header (GlassHeader) | ⬜ | |
| Canvas is square or 4:5 portrait in glass card | ⬜ | |
| Floating tool panel on left/right (NOT docked) | ⬜ | |
| Active tool has gold border + tinted bg | ⬜ | |
| Color picker is floating glass pill | ⬜ | |
| Selected color swatch has gold border + scale 1.15 | ⬜ | |
| Text editor uses glass card + AppInput variant="glass" | ⬜ | |
| Font size chips are glass pills | ⬜ | |
| Template/sticker picker is bottom sheet (glass) | ⬜ | |
| Action bar uses GlassBottomBar | ⬜ | |
| Publish CTA is gold with GlowSurface | ⬜ | |

**Screenshot path**: `screenshots/create-poster.png`
**Discrepancies**: _none yet_

#### PosterViewerScreen

| Criterion | Status | Notes |
|---|---|---|
| Full-bleed hero image | ⬜ | |
| Floating header with BlurView | ⬜ | |
| Creator row uses AvatarRing | ⬜ | |
| Stats in gold | ⬜ | |
| Description in glass card | ⬜ | |
| Related posters carousel | ⬜ | |
| Action bar with Save/Share/Comment | ⬜ | |

**Screenshot path**: `screenshots/poster-viewer.png`
**Discrepancies**: _none yet_

---

### 13b — Create Look (USER PRIORITY)

**Reference**: `reference/edits,looks,pulse reference.jpeg` (Looks portion)

#### CreateLookScreen

| Criterion | Status | Notes |
|---|---|---|
| Canvas is 4:5 portrait in glass card | ⬜ | |
| Empty canvas has GlowOrb + shirt icon | ⬜ | |
| Style tags are multi-select glass pills | ⬜ | |
| Active tag has gold border + tinted bg | ⬜ | |
| Item picker is bottom sheet (glass) | ⬜ | |
| Tabs use AppSegmentControl variant="glass" | ⬜ | |
| Item cards use GlassCard | ⬜ | |
| Caption uses AppInput variant="glass" | ⬜ | |
| Tagged people use AvatarRing size={32} | ⬜ | |
| Publish CTA is gold with GlowSurface | ⬜ | |
| Stagger entrance animation | ⬜ | |

**Screenshot path**: `screenshots/create-look.png`
**Discrepancies**: _none yet_

---

### 07 — Inbox & Chat

**Reference**: `reference/inbox messages.png`, `message reference .jpeg`

#### InboxScreen

| Criterion | Status | Notes |
|---|---|---|
| Header is floating (GlassHeader) with scroll-aware blur | ⬜ | |
| Search bar is GlassSearchPill | ⬜ | |
| Segment control is glass pill | ⬜ | |
| Message cards are glass (GlassCard intensity=30) | ⬜ | |
| Avatars have gold ring for unread (AvatarRing isUnread) | ⬜ | |
| Unread dot is PulseDot (animated) | ⬜ | |
| Online dot is 10px green | ⬜ | |
| Swipe actions use soft gradient backgrounds | ⬜ | |
| Empty state has GlowOrb + mail-unread icon | ⬜ | |

**Screenshot path**: `screenshots/inbox.png`
**Discrepancies**: _none yet_

#### ChatScreen

| Criterion | Status | Notes |
|---|---|---|
| Header is BlurView (ChatHeader) | ⬜ | |
| Sent bubbles are gold (Colors.brand) | ⬜ | |
| Received bubbles are glass (GlassCard intensity=20) | ⬜ | |
| Composer pill is glass (GlassCard intensity=25) | ⬜ | |
| Offer cards are glass with gold accent | ⬜ | |
| Selection toolbar is GlassBottomBar | ⬜ | |

**Screenshot path**: `screenshots/chat.png`
**Discrepancies**: _none yet_

---

### 08 — Profile & Social

**Reference**: `reference/saved_closet .jpeg`, `edit profile settings reference .jpeg`

#### MyProfileScreen

| Criterion | Status | Notes |
|---|---|---|
| Parallax cover image | ⬜ | |
| LinkedIn-style hero (avatar 100px + name + handle) | ⬜ | |
| Avatar has gold ring if verified | ⬜ | |
| Stats in gold (Type.title in Colors.brand) | ⬜ | |
| Quick access cards in GlassCard | ⬜ | |
| Tabs use AppSegmentControl variant="glass" | ⬜ | |

**Screenshot path**: `screenshots/my-profile.png`
**Discrepancies**: _none yet_

#### ClosetScreen

| Criterion | Status | Notes |
|---|---|---|
| Filter chips are glass pills at top | ⬜ | |
| Active chip has gold border | ⬜ | |
| Grid is 2-3 columns | ⬜ | |
| Cards full-bleed with bottom gradient overlay | ⬜ | |
| Title + price floating on gradient | ⬜ | |
| Empty state has GlowOrb + bookmark icon | ⬜ | |

**Screenshot path**: `screenshots/closet.png`
**Discrepancies**: _none yet_

---

### Other Sections (lighter audit)

#### HomeScreen

| Criterion | Status |
|---|---|
| BlurView floating header | ⬜ |
| Masonry grid (ProductCardV2) | ⬜ |
| Story bubbles with gradient rings | ⬜ |
| StaggeredGridEntrance | ⬜ |
| Pull-to-refresh | ⬜ |

**Screenshot path**: `screenshots/home.png`

#### ItemDetailScreen

| Criterion | Status |
|---|---|
| Parallax hero image | ⬜ |
| BlurView floating header | ⬜ |
| DoubleTapHeart overlay | ⬜ |
| Seller row uses AvatarRing | ⬜ |
| Price in gold (Type.priceLarge) | ⬜ |
| Sticky Make Offer / Buy Now CTAs | ⬜ |

**Screenshot path**: `screenshots/item-detail.png`

#### SellScreen

| Criterion | Status |
|---|---|
| Dashed border upload zone | ⬜ |
| GlowOrb behind camera icon | ⬜ |
| Glass form section cards | ⬜ |
| Listing type chips with gold active border | ⬜ |
| Co-own card has gold tint when active | ⬜ |
| Price input 28px bold | ⬜ |
| Publish CTA in GlowSurface | ⬜ |

**Screenshot path**: `screenshots/sell.png`

---

## Cross-Cutting Quality Checks

### Foundation Quality

| Check | Status | Notes |
|---|---|---|
| No `fontSize: 14` anywhere in screens | ⬜ | |
| No `fontFamily:` outside `theme/` | ⬜ | |
| No hardcoded `#0A0A0A` outside `constants/` | ⬜ | |
| No `IS_LIGHT ?` color logic | ⬜ | |
| All `AppCard variant="surface"` swapped | ⬜ | |

### Component Adoption

| Check | Status | Notes |
|---|---|---|
| No bare `<Pressable>` (all use AnimatedPressable) | ⬜ | |
| No bare `<Image>` (all use CachedImage) | ⬜ | |
| No bare `<Switch>` (all use PremiumToggle) | ⬜ | |
| No bare `<TextInput>` (all wrapped in AppInput/GlassSearchPill) | ⬜ | |
| All avatars use AvatarRing | ⬜ | |

### Accessibility

| Check | Status |
|---|---|
| All touch targets ≥ 44pt | ⬜ |
| All icons have accessibilityLabel | ⬜ |
| All text passes 4.5:1 contrast | ⬜ |
| All toggles announce state | ⬜ |
| All cards have accessibilityRole | ⬜ |
| Reduced motion verified (parallax disabled) | ⬜ |

### Performance

| Check | Status |
|---|---|
| No BlurView in scrollable lists | ⬜ |
| No shimmer animations in reduced motion | ⬜ |
| Stagger cap at 15 items (675ms max) | ⬜ |
| CachedImage used everywhere (not bare Image) | ⬜ |

---

## Screenshot Capture Procedure

```bash
# 1. Start the app
cd frontend
npm start

# 2. For each screen, use Puppeteer to navigate and capture
# Example: SettingsScreen
puppeteer navigate "http://localhost:19006/settings"
puppeteer screenshot "screenshots/settings.png"

# 3. Compare side-by-side with reference
# Open reference/settings reference.jpeg next to screenshots/settings.png
```

### Recommended Screenshot Script (Puppeteer)

```javascript
const screens = [
  { name: 'auth-landing', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'home', path: '/home' },
  { name: 'item-detail', path: '/item/123' },
  { name: 'sell', path: '/sell' },
  { name: 'inbox', path: '/inbox' },
  { name: 'chat', path: '/chat/456' },
  { name: 'my-profile', path: '/profile/me' },
  { name: 'closet', path: '/closet' },
  { name: 'balance', path: '/balance' },
  { name: 'orders', path: '/orders' },
  { name: 'settings', path: '/settings' },
  { name: 'create-poster', path: '/create-poster' },
  { name: 'create-look', path: '/create-look' },
  { name: 'notifications', path: '/notifications' },
];

for (const screen of screens) {
  await page.goto(`http://localhost:19006${screen.path}`);
  await page.waitForSelector('main', { timeout: 10000 });
  await page.waitForTimeout(1500); // Let animations settle
  await page.screenshot({ path: `screenshots/${screen.name}.png`, fullPage: false });
}
```

---

## Visual Diff Methodology

For each screen, do a **side-by-side** check:

| Check | Method |
|---|---|
| **Color** | Eyedropper both images, verify hex codes match tokens |
| **Spacing** | Use Figma overlay or measure px between elements |
| **Typography** | Compare font size, weight, letter-spacing visually |
| **Components** | Verify GlassCard, AvatarRing, PulseDot, PremiumToggle are used as specified |
| **Animation** | Confirm spring physics, stagger entrance, haptic feedback |

### Per-Section Pass Threshold

A section passes visual audit if **≥ 90% of criteria are marked ✅** (with notes for any 🟡 or ⬜).

If a section fails, return to the relevant per-section `.md` and re-implement the failing criteria before marking `EXECUTION_TRACKER.md` row as done.

---

## Reference Image Index (14 images)

| Image | Section | Pass Status |
|---|---|---|
| `overall outlook.jpeg` | 00 (master) | ⬜ |
| `overall reference.jpeg` | 00 (master) | ⬜ |
| `overall reference.jpg` | 00 (master, alt) | ⬜ |
| `settings reference.jpeg` | 12 | ⬜ |
| `settings reference.png` | 12 (alt) | ⬜ |
| `settingsreen.jpeg` | 12 (alt) | ⬜ |
| `edit profile settings reference .jpeg` | 12 + 08 | ⬜ |
| `inbox messages.png` | 07 | ⬜ |
| `message reference .jpeg` | 07 | ⬜ |
| `edits,looks,pulse reference.jpeg` | 13a + 13b + 14 | ⬜ |
| `saved_closet .jpeg` | 08 | ⬜ |
| `extra reference.jpeg` | cross-cutting | ⬜ |
| `extra reference (2).jpeg` | cross-cutting | ⬜ |
| `extra reference for structuring llayout .jpeg` | 00 (layout) | ⬜ |

**Total**: 14/14 reference images with pass tracking.

---

## Changelog

- 2026-06-02: VISUAL_AUDIT.md created as part of BATCH 5. All criteria start as ⬜.
