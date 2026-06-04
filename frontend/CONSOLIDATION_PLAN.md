# Phase 2 — Safe Consolidation Plan

**Generated:** 2026-06-04  
**Principle:** Lowest risk first. No redesign. No layout changes. No new abstractions.

---

## Risk Definitions

- **Low:** Zero or near-zero consumer impact. File deletion with no ripple. Simple prop removal.
- **Medium:** Requires updating imports across multiple files, but replacements are mechanical (1:1 mapping).
- **High:** Changes component APIs, affects layout logic, or touches >20 files with non-mechanical edits.

---

## Order of Execution

### Batch A — Low Risk: Delete Unused Components (0 imports)

| # | Action | File(s) | LOC | Risk | Replacement |
|---|--------|---------|-----|------|-------------|
| A1 | Delete `AppCard` | `components/ui/AppCard.tsx` | 98 | Low | None — unused. |
| A2 | Delete `PriceChart` | `components/ui/PriceChart.tsx` | ~200 | Low | None — unused. |
| A3 | Delete `ChatMessageList` | `components/ChatMessageList.tsx` | ~170 | Low | None — unused. |
| A4 | Delete `ChatMessageItem` | `components/ChatMessageItem.tsx` | ~190 | Low | None — only parent was A3. |
| A5 | Delete `MediaMessageBubble` | `components/chat/MediaMessageBubble.tsx` | ~130 | Low | None — unused. |
| A6 | Delete `MentionHighlight` | `components/chat/MentionHighlight.tsx` | ~45 | Low | None — unused. |
| A7 | Delete `NewMessagesSeparator` | `components/chat/NewMessagesSeparator.tsx` | ~45 | Low | None — unused. |
| A8 | Delete `PulseDot` | `components/chat/PulseDot.tsx` | ~40 | Low | None — unused. |
| A9 | Delete `TypingIndicator` | `components/chat/TypingIndicator.tsx` | ~90 | Low | None — unused. |

**Dependencies:** None.  
**Validation:** `tsc --noEmit` after deletions to ensure no hidden imports.

---

### Batch B — Low Risk: Remove Dead Props & Tokens

| # | Action | Files | Est. Edits | Risk | Replacement |
|---|--------|-------|------------|------|-------------|
| B1 | Remove `variant="glass"` from `AppInput` usages | LoginScreen (5), SignUpScreen (3), MakeOfferScreen (2), BidComposer (1) | 11 | Low | Remove prop only. `AppInput` already ignores it. |
| B2 | Replace `Colors.glassBg` → `Colors.surfaceAlt` | 55 files | ~110 refs | Low | Global find/replace. No semantic change (tokens map identically). |
| B3 | Replace `Colors.glassBorder` → `Colors.border` | 55 files | ~111 refs | Low | Global find/replace. No semantic change. |
| B4 | Remove `glassBg` and `glassBorder` from `colors.ts` | `constants/colors.ts` | 4 lines | Low | After B2/B3 complete, delete the deprecated keys from both `DARK_COLORS` and `LIGHT_COLORS`. |

**Dependencies:** B4 depends on B2/B3.  
**Validation:** `tsc --noEmit` after each batch.

---

### Batch C — Low Risk: Inline Trivial Wrappers

| # | Action | Files | Est. Edits | Risk | Replacement |
|---|--------|-------|------------|------|-------------|
| C1 | Replace `SharedTransitionImage` with `Reanimated.Image` | 16 files | 16 imports | Low | `import { SharedTransitionImage }` → `import Reanimated from 'react-native-reanimated'`, replace JSX tag. |
| C2 | Replace `SharedTransitionView` with `Reanimated.View` | 16 files | 16 imports | Low | Same pattern as C1. |
| C3 | Delete wrapper files after C1/C2 | `components/SharedTransitionImage.tsx`, `components/SharedTransitionView.tsx` | — | Low | Only after all consumers updated. |

**Dependencies:** C3 depends on C1/C2.  
**Validation:** Search for any remaining imports before deleting files.

---

### Batch D — Low Risk: Unify Header Components

| # | Action | Files | Est. Edits | Risk | Replacement |
|---|--------|-------|------------|------|-------------|
| D1 | Merge `SettingsHeader` props into `ScreenHeader` | `components/ui/ScreenHeader.tsx` | ~20 | Low | Add any missing props from `SettingsHeader` (e.g., `title` centering logic) to `ScreenHeader`. |
| D2 | Replace `SettingsHeader` imports with `ScreenHeader` | 15 files | 15 imports | Low | Mechanical import swap. |
| D3 | Delete `SettingsHeader` after D2 | `components/settings/SettingsHeader.tsx` | — | Low | Only after all consumers updated. |
| D4 | Remove unused inline header styles from screens that now use `ScreenHeader` | WriteReviewScreen, WithdrawScreen, etc. | ~60 LOC | Low | Delete `header`, `backBtn`, `headerTitle` styles that are no longer referenced. |

**Dependencies:** D2 depends on D1. D3 depends on D2. D4 is independent.  
**Validation:** Run app, navigate to settings subpages, verify back buttons work.

---

### Batch E — Medium Risk: Remove Deprecated Compatibility Layers

| # | Action | Files | Est. Edits | Risk | Replacement |
|---|--------|-------|------------|------|-------------|
| E1 | Delete `constants/typography.ts` wrapper | `constants/typography.ts` | 98 LOC | Medium | Update 89 files to import `Type, Typography` from `../theme/designTokens` instead. |
| E2 | Delete `GlassSurface.tsx` passthrough | `components/ui/GlassSurface.tsx` | 108 LOC | Medium | Update 30 files: replace `GlassCard`/`GlassSurface`/`GlassHeader`/`GlassBottomBar` with `View`. Remove `intensity`, `tint`, `contentStyle`, `borderPosition` props. |
| E3 | Delete `GlowSurface.tsx` passthrough | `components/ui/GlowSurface.tsx` | 60 LOC | Medium | Update 9 files: unwrap children from `<GlowSurface>` wrapper. |
| E4 | Inline `GlassIconButton` consumers | 3 files | 3 usages | Medium | Replace `GlassIconButton` with `AnimatedPressable` + `View` + `Ionicons`. Delete `GlassIconButton.tsx`. |
| E5 | Replace `GlassSearchPill` with standard search | 3 files | 3 usages | Medium | Replace with `AppInput` or a local `View` + `TextInput`. Delete `GlassSearchPill.tsx`. |

**Dependencies:** E2/E3/E4/E5 all depend on updating consumers before deleting files.  
**Validation:** `tsc --noEmit` after every sub-batch.

---

### Batch F — Medium Risk: Replace Single-Usage Components

| # | Action | Files | Est. Edits | Risk | Replacement |
|---|--------|-------|------------|------|-------------|
| F1 | Replace `Skeleton` with `SkeletonLoader` in BrowseScreen | `screens/BrowseScreen.tsx` | 1 import | Medium | Swap import and JSX tag. Delete `components/ui/Skeleton.tsx`. |
| F2 | Replace `AmbientGradient` with static background in AuthLandingScreen | `screens/AuthLandingScreen.tsx` | 1 import | Medium | Remove animated gradient wrapper, use `Colors.background`. Delete `components/ui/AmbientGradient.tsx`. |

**Dependencies:** F1 depends on `SkeletonLoader` having the same API (verify first). F2 depends on AuthLandingScreen not breaking without animation.  
**Validation:** Visual check of BrowseScreen loading state and AuthLandingScreen background.

---

### Batch G — Medium Risk: Chat Functional Restoration

| # | Action | Files | Est. Edits | Risk | Replacement |
|---|--------|-------|------------|------|-------------|
| G1 | Verify `ChatScreen` has no broken JSX from previous refactors | `screens/ChatScreen.tsx` | — | Medium | Run TypeScript check. Fix any mismatched tags or missing props. |
| G2 | Remove dead chat component imports from `ChatScreen` | `screens/ChatScreen.tsx` | ~5 imports | Low | Remove any imports of deleted components from Batch A. |
| G3 | Verify `ComposerInput`, `MessageBubble`, `ChatHeader` are functional | 3 files | — | Medium | Run app, open chat, type message, send. |

**Dependencies:** G2 depends on Batch A.  
**Validation:** Manual chat smoke test.

---

## Summary Table

| Batch | Risk | Files Touched | Est. LOC Removed | Est. Import Lines Removed |
|-------|------|---------------|------------------|---------------------------|
| A | Low | 9 | ~1,008 | 0 |
| B | Low | 55 | 0 (props only) | 0 |
| C | Low | 16 | 29 | 32 |
| D | Low | 15 | ~120 (SettingsHeader) + ~60 styles | 15 |
| E | Medium | 89 + 30 + 9 + 3 + 3 | 98 + 108 + 60 + 68 + 115 | ~120 |
| F | Medium | 2 | ~180 + 270 | 2 |
| G | Medium | 1 | 0 | ~5 |
| **Total** | | **~120 files** | **~2,200–2,500 component LOC** | **~170 import lines** |

---

## Do NOT Touch (High Risk)

| Item | Reason |
|------|--------|
| `components/ui/Text.tsx` | 21 consumers. Deleting would require rewriting text rendering across 21 files. Mark deprecated instead. |
| `components/ui/ActivityBadge` | 1 consumer (ItemDetailScreen). Low LOC but part of active feature. |
| `SettingsCard` | 3 consumers. Barely used but safe. Keep. |
| Inline card styles across 50+ screens | Would require redesigning each screen. Out of scope. |
| Any layout/spacing changes | User explicitly forbade redesign. |
| Any animation additions/removals beyond passthrough wrappers | User explicitly forbade redesign. |
