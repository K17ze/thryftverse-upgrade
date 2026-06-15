# Sector 3 — Profile, Looks, Edits and Pulse

## Product Purpose

The Profile is the primary identity surface. It must feel like a coherent flagship experience — not a collection of cards and controls. The Edits/Looks/Pulse tabs must feel like deliberate editorial sections.

## Reference Images

Reference images reviewed for:
- Profile cover-to-avatar layering (Instagram, TikTok)
- Editorial tab systems (Pinterest, Depop)
- Identity hierarchy (Grailed, Vinted)

## Current Device Screenshots

See `screenshots/before/` and `screenshots/after/`.

## Current Strengths

1. `FlagshipProfileMedia` component for cover video/image
2. `ProfileVisualHeader` with avatar, name, stats
3. Animated floating header on scroll
4. Settings access in cover action layer AND floating header
5. Cover action icons have safe-area padding
6. Quick Access grid with haptic feedback

## Current Visual Weaknesses

1. Tab labels "Wardrobe/Saved/About" felt basic and non-editorial
2. Tab rail touch targets were below 44px
3. Tab text at 13px felt small
4. Profile content sections lacked visual separation
5. Empty states were functional but not premium
6. Cover-to-avatar layering could be stronger
7. Stats row lacked visual weight

## Navigation Weaknesses

1. No swipe between tabs (would require gesture handler architecture)
2. Tab content jumps when switching (no shared transition)

## Feature-Depth Weaknesses

1. "Edits" tab shows listings — should feel more editorial
2. "Looks" tab shows saved items — should feel like curated collections
3. "Pulse" tab is basic — needs activity/community depth
4. No profile preview in Settings

## Root Causes in Source

1. `activeTab: 'wardrobe' | 'saved' | 'about'` — basic naming
2. `ProfileTabRail` tab height ~36px — below minimum
3. No shared swipeable tab container
4. Content sections use ad-hoc styling

## Changes Implemented in This Phase

### Tab relabel (editorial language)
- `Wardrobe` → `Edits` (editorial/product-first)
- `Saved` → `Looks` (curated collection language)
- `About` → `Pulse` (activity/community language)

### Tab rail flagship polish
- Height: ~36px → 44px (minimum touch target)
- Label: 13px → 14px with letter spacing
- Icon: 16px → 18px
- Better icon-label spacing (marginRight vs gap)
- Improved count pill contrast
- Maintained spring animated indicator

## Before/After Screenshots

See `screenshots/before/profile-top.png` and `screenshots/after/profile-top.png`.

## Remaining Upgrades

1. Profile cover: stronger gradient overlay for text legibility
2. Avatar: subtle ring/elevation treatment
3. Stats: larger numbers, better typography hierarchy
4. Tab content: editorial card treatments for Edits/Looks
5. Pulse: activity feed with real state
6. Swipeable tab container
7. Shared transition between tab content

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade | Retested |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- | -------- |
| Profile top state | 6→7 | Basic tab labels | Hardcoded strings | Relabelled | Cover gradient + avatar ring | Device pending |
| Profile scrolled | 7 | Good floating header | — | — | Stronger title animation | Source |
| Tab rail | 5→7 | Small touch targets | 36px height | 44px + 14px font | Swipe gesture | Source |
| Edits content | 5 | Listing grid basic | Ad-hoc styling | — | Editorial cards | Not yet |
| Looks content | 5 | Saved grid basic | Ad-hoc styling | — | Curated boards | Not yet |
| Pulse content | 4 | No real activity | Not implemented | — | Activity feed | Not yet |

## Runtime Verification Result

- Tab labels: source verified (Edits/Looks/Pulse)
- Tab rail sizing: source verified (44px height, 14px font)
- Floating header: already verified in UI-21
