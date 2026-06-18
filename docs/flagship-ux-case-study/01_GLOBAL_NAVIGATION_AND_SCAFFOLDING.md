# Sector 1 — Global Navigation and Screen Scaffolding

## Product Purpose

Provide a consistent, predictable structural foundation across all screens so users never feel disoriented when navigating between tabs, subpages, modals, and forms.

## Reference Images

Reference images in `reference images/` directory reviewed for header patterns, spacing rhythm, and navigation affordances.

## Current Device Screenshots

Captured during UI-21P.2 session on POCO M2 Pro.

## Current Strengths

- `useSafeAreaInsets` used consistently across major screens
- `ProfileTabRail` already has animated sliding indicator
- `MyProfileScreen` has floating header transition
- `HomeScreen` has collapsible app header
- `SettingsScreen` has search bar and identity card

## Current Visual Weaknesses

1. **Header action inconsistency**: Some screens use 44×44 back buttons, others use smaller or differently styled ones
2. **Title positioning**: Some titles are left-aligned, some centered, some large (28px), some small (17px)
3. **Right actions**: Ad-hoc — some have text, some icons, some nothing
4. **Horizontal padding**: 16px on some screens, 20px on others, `Space.md` inconsistently applied
5. **Section spacing**: No standardised section gap — some screens feel cramped, others too loose
6. **Sticky footer patterns**: `ItemDetailScreen`, `SellScreenV2`, `CheckoutScreen` each implement their own

## Navigation Weaknesses

- No shared `FlagshipScreen` scaffold
- No shared `FlagshipHeaderAction` primitive
- No shared `FlagshipStickyFooter`
- Bottom tab bar has good spring animation but some inactive states feel muted

## Root Causes in Source

1. Each screen invents its own header/back button/title pattern
2. No enforced horizontal padding constant
3. No shared sticky footer component
4. `Space` tokens exist but are not consistently used

## Proposed Flagship Architecture

1. **`FlagshipScreen`** — wraps screen with consistent safe area, padding, scroll behaviour
2. **`FlagshipHeaderAction`** — 44×44 pressable with consistent hover/press feedback
3. **`FlagshipStickyFooter`** — respects `insets.bottom`, uses consistent padding and shadow
4. **`FlagshipSection`** — standardised section with title, spacing, and divider

## Changes Implemented in This Phase

### ProfileTabRail enhancements
- Increased tab height from ~36px to 44px (minimum touch target)
- Increased label font from 13px to 14px with letter spacing
- Better icon-to-label spacing
- Maintained animated spring indicator

### MyProfileScreen tab relabel
- Changed `Wardrobe/Saved/About` to `Edits/Looks/Pulse`
- More editorial/product-appropriate language

### HomeScreen poster rail sizing
- Increased poster tiles from 108×128 to 120×152
- Larger create-poster icon (36→40)
- Better caption typography (9px→10px)
- Tighter gap (14→12) while maintaining breathing room

## Before/After Screenshots

See `screenshots/before/` and `screenshots/after/` directories.

## Remaining Upgrades

1. Create `FlagshipScreen` shared scaffold
2. Create `FlagshipHeaderAction` primitive
3. Create `FlagshipStickyFooter`
4. Standardise all Settings subpage headers
5. Enforce `Space.md` horizontal padding consistently

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade | Retested |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- | -------- |
| MyProfileScreen | 6 | Tab labels basic | Hardcoded strings | Relabelled | Animated transitions | Device |
| HomeScreen | 6 | Poster tiles small | Hardcoded 108px | Resized to 120px | Stories-style ring | Device |
| SettingsScreen | 7 | Already upgraded in UI-18 | — | — | Subpage standardisation | Source |
| ItemDetailScreen | 6 | Floating buy bar styling | Inline styles | Safe area fix | Sticky footer primitive | Source |
| CheckoutScreen | 6 | Footer safe area | Hardcoded padding | Safe area fix | Shared footer | Source |

## Runtime Verification Result

- Profile tab rail: larger touch targets verified via source
- Poster rail: larger tiles verified via source
- Settings: already upgraded in UI-18
