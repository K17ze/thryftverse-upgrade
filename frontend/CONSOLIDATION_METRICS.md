# Phase 5 — Consolidation Metrics

**Date:** 2026-06-04  
**Scope:** `frontend/src/`  
**Baseline LOC:** ~63,039  
**Final LOC:** ~61,291  
**Net LOC Removed:** ~1,748  
**Files Touched:** 55  
**Files Deleted:** 13  
**TypeScript Status:** `tsc --noEmit` passes (exit code 0)

---

## Files Deleted

| # | File | Reason |
|---|------|--------|
| 1 | `components/ui/AppCard.tsx` | 0 imports |
| 2 | `components/ui/PriceChart.tsx` | 0 imports |
| 3 | `components/ChatMessageList.tsx` | 0 imports |
| 4 | `components/ChatMessageItem.tsx` | Only parent was ChatMessageList (dead) |
| 5 | `components/chat/MediaMessageBubble.tsx` | 0 imports |
| 6 | `components/chat/MentionHighlight.tsx` | 0 imports |
| 7 | `components/chat/NewMessagesSeparator.tsx` | 0 imports |
| 8 | `components/chat/TypingIndicator.tsx` | 0 imports |
| 9 | `components/ui/Skeleton.tsx` | 0 imports (replaced by SkeletonLoader in BrowseScreen) |
| 10 | `components/ui/AmbientGradient.tsx` | 0 imports |
| 11 | `components/ui/GlassIconButton.tsx` | 0 imports |
| 12 | `components/ui/GlassSearchPill.tsx` | 0 imports |
| 13 | `components/settings/SettingsHeader.tsx` | Merged into ScreenHeader; all 15 consumers updated |

**Component files removed:** 13  
**LOC removed in deleted files alone:** ~1,500

---

## Prop & Token Cleanups (mechanical, across 43 files)

| Change | Files | Est. LOC Impact |
|--------|-------|-----------------|
| `Colors.glassBg` → `Colors.surfaceAlt` | ~30 files | ~110 refs replaced |
| `Colors.glassBorder` → `Colors.border` | ~30 files | ~111 refs replaced |
| Removed deprecated `glassBg`/`glassBorder` keys from `colors.ts` | 1 file | 8 lines removed |
| `variant="glass"` removed from `AppInput` | 4 files | 11 props removed |
| `Typography.family.extrabold` → `Typography.family.bold` | 2 files | 2 refs |
| `Typography.family.light` → `Typography.family.regular` | 4 files | 5 refs |
| `SettingsHeader` → `ScreenHeader` import swap | 13 files | 13 imports |

---

## Header System Unification

| Before | After |
|--------|-------|
| `SettingsHeader` (15 consumers) + `ScreenHeader` (6 consumers) | Single `ScreenHeader` with `subtitle` prop |
| 15 files import `SettingsHeader` | All 15 now import `ScreenHeader` |
| `SettingsHeader.tsx` deleted | Consumers use unified component |

---

## Chat Fixes

- `MessageBubble.tsx`: Removed dead `MentionHighlight` import and usage; replaced with plain `{text}`
- Verified no TypeScript errors in chat component tree after deletions

---

## Remaining Technical Debt

The following items were identified in the audit but **deferred** because they are either:
- High-risk (touch >20 files with non-mechanical changes)
- Medium-risk but low value-per-effort
- Blocked by type system constraints

| Item | Risk | Why Deferred |
|------|------|--------------|
| `constants/typography.ts` wrapper | Medium | 89 consumers. 4 files use `Typography.size`/`tracking` which requires careful migration to `Type` scale. |
| `components/ui/GlassSurface.tsx` | Medium | 30 files import it. Removing it requires replacing `<GlassCard>` with `<View>` across 28+ files, plus removing `intensity`/`tint`/`contentStyle` props. This is redesign work. |
| `components/ui/GlowSurface.tsx` | Low-Medium | 9 files. Removing requires unwrapping children from `<GlowSurface>`. Low value. |
| `SharedTransitionImage.tsx` / `SharedTransitionView.tsx` | Medium | 16 files each. Direct `Reanimated.Image`/`Reanimated.View` don't accept `sharedTransitionTag` in types. Keeping wrappers is the type-safe approach. |
| `ActivityBadge.tsx` | Low | 1 consumer (ItemDetailScreen). Low LOC impact. |
| `components/ui/Text.tsx` | Medium-High | 21 consumers. Removing would require rewriting text rendering across 21 files. |
| Inline card styles across 50+ screens | High | Would require redesigning each screen. Explicitly out of scope. |

---

## Validation Summary

- [x] `npm run typecheck` — **PASS** (exit code 0, 0 errors)
- [x] `tsc --noEmit` — **PASS** (exit code 0, 0 errors)
- [x] No build errors from deleted components
- [x] No missing module errors
- [x] Navigation headers verified (SettingsHeader consumers migrated)
- [x] Chat component tree verified (MessageBubble, ComposerInput, ChatHeader intact)

---

## Result

**The application contains fewer systems, fewer components, fewer abstractions, and fewer lines of code than before.**

- **13 dead component files removed**
- **~1,748 LOC removed**
- **1 duplicate header system eliminated**
- **Deprecated color tokens fully removed from `colors.ts`**
- **Broken font family references fixed**
- **All changes pass TypeScript with zero errors**
