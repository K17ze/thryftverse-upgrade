# Task 8 — F14: Reduced-Motion Entry Points Consistency Fix

**Status:** DONE
**Date:** 2025 (current session)
**Scope:** `frontend/src` — pure import-path migration, no visual or behavioral changes.

---

## 1. Defect Summary

`useReducedMotion` had two entry points:

- **Correct:** shared hook `frontend/src/hooks/useReducedMotion.ts` — ORs the OS
  "Reduce Motion" / "Remove animations" setting with the in-app accessibility
  preference (`AccessibilityPreferencesContext`) and subscribes to OS changes via
  `AccessibilityInfo.addEventListener('reduceMotionChanged', ...)`. Returns
  `boolean`.
- **Wrong:** `useReducedMotion` from `react-native-reanimated` — reads the OS
  setting captured at app start, never re-renders on changes, and ignores the
  in-app preference entirely. Returns `boolean` (confirmed against
  `frontend/node_modules/react-native-reanimated/lib/typescript/hook/useReducedMotion.d.ts`).

The task brief listed 6 offending files; a full-tree scan found **32 files**
importing `useReducedMotion` from `react-native-reanimated`. All 32 were
migrated.

---

## 2. Return-Type Verification

- Reanimated `useReducedMotion(): boolean` — startup snapshot of the OS flag.
- Shared `useReducedMotion(): boolean` — `osReducedMotion || inAppReducedMotion`.

**No return-type mismatch.** Every call site consumes the value as a plain
`boolean` (`const reduceMotion = useReducedMotion()` / `const reducedMotion = …`),
so the migration is type-identical at every call site.

`useCreatorPublishWorkflow.ts` is a hook file (not a component); the shared hook
works identically there — it was migrated the same way.

`AccessibilityPreferencesProvider` is mounted in `frontend/App.tsx`, so the
shared hook's context dependency is satisfied everywhere in the app tree.

---

## 3. Files Migrated (32)

### `frontend/src/creator/` (hook path `../hooks/useReducedMotion`)
| File | Change |
|---|---|
| `CreatorAnimations.tsx` | standalone reanimated import repointed |
| `CreatorDraftListScreen.tsx` | specifier removed from reanimated import; shared import added |
| `CreatorLayersSheet.tsx` | specifier removed; shared import added |
| `CreatorPreviewOverlay.tsx` | specifier removed; shared import added |
| `CreatorToolDock.tsx` | standalone reanimated import repointed |
| `useCreatorPublishWorkflow.ts` | specifier removed; shared import added |

### `frontend/src/creator/controls/` (`../../hooks/useReducedMotion`)
`CreatorDestructiveButton.tsx`, `CreatorIconButton.tsx`,
`CreatorPrimaryButton.tsx`, `CreatorSegmentControl.tsx`, `CreatorSlider.tsx`,
`CreatorToggle.tsx`, `CreatorToolButton.tsx` — all had a standalone
`import { useReducedMotion } from 'react-native-reanimated'` line repointed to
the shared hook.

### `frontend/src/creator/color/` (`../../hooks/useReducedMotion`)
`AlphaSlider.tsx`, `GradientEditor.tsx`, `HueSlider.tsx`, `SVPlane.tsx` —
standalone import repointed.

### `frontend/src/creator/dock/` (`../../hooks/useReducedMotion`)
`Tooltip.tsx` — standalone import repointed.

### `frontend/src/creator/surfaces/` (`../../hooks/useReducedMotion`)
`CutoutPreviewSheet.tsx`, `FolderOrganizeSheet.tsx` — specifier removed from
reanimated import; shared import added.

### `frontend/src/creator/tools/*/` (`../../../hooks/useReducedMotion`)
| File | Change |
|---|---|
| `audio/VoiceoverRecorderSheet.tsx` | see §4 — dual-hook redundancy normalized |
| `commerce/ProductBrowserSheet.tsx` | specifier removed; shared import added |
| `drawing/DrawingWorkspace.tsx` | standalone import repointed |
| `effects/AutoAdjustButton.tsx` | standalone import repointed |
| `stickers/StickerPinOverlay.tsx` | standalone import repointed |
| `text/InlineTextEditor.tsx` | specifier removed; shared import added |

### `frontend/src/components/` (`../../` or `../../../hooks/useReducedMotion`)
| File | Change |
|---|---|
| `charts/BarChart.tsx` | `useReducedMotion` removed from `{ useDerivedValue, … }` reanimated import; shared import added |
| `charts/LineChart.tsx` | same as BarChart |
| `common/AnimatedNumber.tsx` | specifier removed; shared import added |
| `common/AppIconButton.tsx` | standalone import repointed |
| `poster/CreativeToolbar.tsx` | specifier removed; shared import added |
| `poster/filters/FilterStrip.tsx` | standalone import repointed (`../../../hooks/…`) |

---

## 4. Special Case — `VoiceoverRecorderSheet.tsx`

This file imported **both** hooks and ORed them:

```ts
const hookReducedMotion = useHookReducedMotion();          // shared hook (aliased)
const reanimatedReducedMotion = useReducedMotion();        // reanimated
const reducedMotion = hookReducedMotion || reanimatedReducedMotion;
```

Since the shared hook already ORs the OS setting with the in-app preference,
`reanimatedReducedMotion` was fully subsumed — the expression was redundant.
Normalized to:

```ts
const reducedMotion = useReducedMotion();  // shared hook, unaliased
```

The `useReducedMotion as useHookReducedMotion` alias was removed and the
specifier dropped from the reanimated import. Behavior is identical or better
(now also reacts to live OS setting changes).

---

## 5. Verification

1. **Residual-import scan** — Node script scanning every `.ts/.tsx/.js/.jsx`
   under `frontend/src` for `useReducedMotion` inside a
   `from 'react-native-reanimated'` import statement:
   **`NONE — all migrated`** (0 remaining).
2. **tsc** —
   `cd frontend; node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
   → **exit 0, zero diagnostics** (empty output file). No
   `useReducedMotion`/`ReducedMotion`-related errors; the project compiles clean.
3. `useCreatorPublishWorkflow.ts` is a hook module — shared hook works the same.
   Verified its call site (`const reduceMotion = useReducedMotion()` at line ~332)
   expects a boolean; shared hook returns boolean. ✔

---

## 6. Constraints Honored

- No visual layout changes — import lines only (plus the redundant-expression
  collapse in `VoiceoverRecorderSheet`, which is behavior-identical).
- No new features.
- `frontend/src/components/coown/` untouched — none of the 32 offenders were in
  that tree; `CoOwnSegmentNav.tsx` / `CoOwnPriceTick.tsx` / `CoOwnRiskDisclosure.tsx`
  already used the shared hook.
- Shared `useReducedMotion` hook not modified.
- Pure import-path migration.

---

## 7. Concerns

- **None blocking.** One note: files that capture `reduceMotion` inside
  Reanimated worklets (e.g. `useAnimatedStyle`) get the same stale-closure
  semantics under both hooks — the migration neither improves nor regresses
  worklet-captured values; JS-thread usage (the overwhelming majority) now
  correctly reacts to OS + in-app changes.
- Test files mock the shared hook (`vi.mock('../hooks/useReducedMotion', …)`)
  and are unaffected. Reanimated's own `useReducedMotion` is not re-mocked
  anywhere under `src/` — no stale mocks to clean.
