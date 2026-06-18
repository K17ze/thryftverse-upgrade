# Sector 2 — Home, Discovery and Posters

## Product Purpose

The Home screen is the primary discovery surface. It must feel composed, intentional, and visually premium — not like unrelated components stacked vertically.

## Reference Images

Reference images reviewed for:
- Stories-style poster rails (Instagram, Snapchat)
- Editorial hero placement (Pinterest, Depop)
- Discovery grid density (Grailed, Vestiaire)

## Current Device Screenshots

- `screenshots/after/02_home.png` — Home with poster rail

## Current Strengths

1. Poster rail is positioned BEFORE editorial hero (UI-21 fix)
2. Editorial hero is conditional on real imagery (UI-21 fix)
3. Skeleton loaders match loaded tile positions
4. Masonry grid uses varied aspect ratios for visual interest
5. New listings banner with count

## Changes Implemented in UI-21P.3

### Poster rail sizing (flagship presence)
- Tile: 108×128 → 120×152 (+11% width, +19% height)
- Create icon: 36×36 → 40×40
- Create label: 10px → 11px
- Caption: 9px → 10px with better line height
- Meta labels: uppercase, letter-spaced
- Rail gap: 14px → 12px (tighter but still breathing)
- Skeleton loader: 108×128 → 120×152 (matches loaded)

### Poster Viewer upgrades
- Added `AppState` listener to pause auto-advance when app goes background
- Added media error state with honest "Unable to load media" overlay
- Added `onError` prop to `CachedImage` component for consumer error handling
- Progress segments already existed
- Tap left/right navigation already existed
- Press-and-hold pause already existed
- Close control already existed
- Author context already existed
- Timestamp already existed
- End-of-sequence behaviour already existed

## Before/After Screenshots

See `screenshots/before/` and `screenshots/after/` directories.

## Remaining Upgrades

1. Poster viewer: video-aware behaviour, actual playback state for video posters
2. Poster rail: author avatar overlay (when real data exists)
3. Section transitions: subtle gradient or divider between poster rail and editorial
4. Stories-style ring indicator for unseen posters
5. Pull-to-refresh haptic feedback

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade | Retested |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- | -------- |
| Home poster rail | 5→7 | Tiles too small | Hardcoded 108px | Enlarged to 120px | Stories ring + author | Device |
| Poster viewer | 4→6 | No pause on background | Not implemented | AppState pause + error state | Full video support | Source |
| Editorial hero | 6 | Conditional but basic | Empty URIs gate | Conditional render | Real content only | Source |
| Discovery grid | 7 | Good masonry | — | — | Pinterest-style | Source |
| New listings banner | 6 | Functional | — | — | Animated entrance | Source |

## Runtime Verification Result

- Poster tile sizing: device verified
- Caption readability: source verified
- Create tile: source verified
- Poster viewer AppState pause: source verified
- Poster viewer error state: source verified
