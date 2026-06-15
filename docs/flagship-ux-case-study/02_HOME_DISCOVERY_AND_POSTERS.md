# Sector 2 — Home, Discovery and Posters

## Product Purpose

The Home screen is the primary discovery surface. It must feel composed, intentional, and visually premium — not like unrelated components stacked vertically.

## Reference Images

Reference images reviewed for:
- Stories-style poster rails (Instagram, Snapchat)
- Editorial hero placement (Pinterest, Depop)
- Discovery grid density (Grailed, Vestiaire)

## Current Device Screenshots

See `screenshots/before/` and `screenshots/after/`.

## Current Strengths

1. Poster rail is positioned BEFORE editorial hero (UI-21 fix)
2. Editorial hero is conditional on real imagery (UI-21 fix)
3. Skeleton loaders match loaded tile positions
4. Masonry grid uses varied aspect ratios for visual interest
5. New listings banner with count

## Current Visual Weaknesses

1. Poster tiles at 108×128 felt small and unremarkable
2. "Create Poster" tile looked basic — icon too small, label too small
3. Poster captions at 9px were barely readable
4. "Seen" vs "New" states had weak visual distinction
5. Section headers lacked visual weight
6. Poster rail had no author/avatar context
7. No gradient transition between sections

## Navigation Weaknesses

1. Poster viewer navigation: no tap-left/tap-right progress indication
2. No press-and-hold pause
3. No author information overlay in viewer

## Feature-Depth Weaknesses

1. Poster viewer is basic — lacks mature Stories interaction patterns
2. No progress segments at top
3. No reply/share actions (would be fake without real state)
4. No viewed-state persistence beyond memory

## Root Causes in Source

1. `posterCard: { width: 108 }` — hardcoded small size
2. `posterCaption: { fontSize: 9 }` — too small for readability
3. No `PosterViewer` progress indicator architecture
4. No poster author context in rail (would require real data)

## Changes Implemented in This Phase

### Poster rail sizing (flagship presence)
- Tile: 108×128 → 120×152 (+11% width, +19% height)
- Create icon: 36×36 → 40×40
- Create label: 10px → 11px
- Caption: 9px → 10px with better line height
- Rail gap: 14px → 12px (tighter but still breathing)
- Skeleton loader: 108×128 → 120×152 (matches loaded)

### Visual hierarchy
- Larger tiles create stronger visual presence near top of Home
- Better caption readability
- Create action feels more inviting

## Before/After Screenshots

See `screenshots/before/home-posters.png` and `screenshots/after/home-posters.png`.

## Remaining Upgrades

1. Poster viewer: progress segments, tap navigation, pause
2. Poster rail: author avatar overlay (when real data exists)
3. Section transitions: subtle gradient or divider between poster rail and editorial
4. Stories-style ring indicator for unseen posters
5. Pull-to-refresh haptic feedback

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade | Retested |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- | -------- |
| Home poster rail | 5→7 | Tiles too small | Hardcoded 108px | Enlarged to 120px | Stories ring + author | Device pending |
| Poster viewer | 4 | No progress/navigation | Not implemented | — | Full viewer upgrade | Not yet |
| Editorial hero | 6 | Conditional but basic | Empty URIs gate | Conditional render | Real content only | Source |
| Discovery grid | 7 | Good masonry | — | — | Pinterest-style | Source |
| New listings banner | 6 | Functional | — | — | Animated entrance | Source |

## Runtime Verification Result

- Poster tile sizing: source verified, device pending Fast Refresh
- Caption readability: source verified
- Create tile: source verified
