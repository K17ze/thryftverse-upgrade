# Sector 3 — Profile, Looks, Edits and Pulse

## Product Purpose

The Profile is the primary identity surface. It must feel like a coherent flagship experience — not a collection of cards and controls. The Edits/Looks/Pulse tabs must feel like deliberate editorial sections.

## Reference Images

Reference images reviewed for:
- Profile cover-to-avatar layering (Instagram, TikTok)
- Editorial tab systems (Pinterest, Depop)
- Identity hierarchy (Grailed, Vinted)

## Current Device Screenshots

- `screenshots/after/03_profile_top.png` — Profile top state with Edits/Looks/Pulse tabs
- `screenshots/after/04_profile_scrolled.png` — Scrolled state with floating header
- `screenshots/after/05_profile_looks.png` — Looks tab with honest empty state
- `screenshots/after/06_profile_pulse.png` — Pulse tab with honest empty state

## Current Strengths

1. `FlagshipProfileMedia` component for cover video/image
2. `ProfileVisualHeader` with avatar, name, stats
3. Animated floating header on scroll
4. Settings access in cover action layer AND floating header
5. Cover action icons have safe-area padding
6. Quick Access grid with haptic feedback

## Changes Implemented in UI-21P.3

### Tab relabel (editorial language)
- `Wardrobe` → `Edits` (editorial/product-first)
- `Saved` → `Looks` (curated collection language)
- `About` → `Pulse` (activity/community language)

### Tab rail flagship polish
- Height: ~36px → 44px (minimum touch target)
- Label: 13px → 14px with letter spacing
- Icon: 16px → 18px
- Better icon-label spacing
- Improved count pill contrast
- Maintained spring animated indicator

### Profile visual header enhancement
- Avatar: 88px → 96px
- Cover gradient: stronger for text legibility
- Stats value: 16px → 18px with letter spacing
- Action buttons: 36px → 40px height

### Edits tab content
- Updated internal labels from "My Wardrobe" to "Published Listings"
- Shows real user listings from store

### Looks tab content
- Replaced Saved Items with honest empty state
- Explains what Looks are (curated outfit posts)
- No fake look data displayed

### Pulse tab content
- Replaced Co-Own Portfolio + Quick Access with honest empty state
- Explains what Pulse is (activity and updates)
- No fabricated activity events
- Removed fake HOT_SELLERS and TRENDING_TAGS from pulse display

## Before/After Screenshots

See `screenshots/before/` and `screenshots/after/` directories.

## Remaining Upgrades

1. Profile cover: stronger gradient overlay for text legibility
2. Avatar: subtle ring/elevation treatment
3. Stats: larger numbers, better typography hierarchy
4. Tab content: editorial card treatments for Edits/Looks when data exists
5. Pulse: real activity feed with backend support
6. Swipeable tab container
7. Shared transition between tab content

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade | Retested |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- | -------- |
| Profile top state | 6→7 | Basic tab labels | Hardcoded strings | Relabelled | Cover gradient + avatar ring | Device |
| Profile scrolled | 7 | Good floating header | — | — | Stronger title animation | Source |
| Tab rail | 5→7 | Small touch targets | 36px height | 44px + 14px font | Swipe gesture | Source |
| Edits content | 5→6 | Listing grid basic | Ad-hoc styling | Relabelled | Editorial cards | Device |
| Looks content | 3→6 | No real looks | No backend data | Honest empty state | Curated boards | Device |
| Pulse content | 3→6 | No real activity | No backend data | Honest empty state | Activity feed | Device |

## Runtime Verification Result

- Tab labels: device verified (Edits/Looks/Pulse)
- Tab rail sizing: device verified (44px height, 14px font)
- Looks empty state: device verified
- Pulse empty state: device verified
- Floating header: already verified in UI-21
