# Task 4 — Review-Fix Report

**Date:** 2026 fix pass (fresh-context review findings)
**Scope:** Exactly the 5 review findings; nothing else touched.
**Repo:** C:\Users\User\Desktop\thryftverse-upgrade (branch worktree, uncommitted campaign state)

---

## Status: COMPLETE — all 5 findings fixed, verification green

---

## Fixes applied

### 1. HIGH — MyProfileScreen.tsx: floating cover edit button spinner → shared UploadProgressRing

**File:** `frontend/src/screens/MyProfileScreen.tsx`

- **Ring selection:** Two implementations exist. The listing one
  (`frontend/src/components/listing/UploadProgressRing.tsx`) requires
  `status/reducedMotion/onRetry/retryLabel` (all required) and renders a
  full-bleed absolutely-positioned overlay — does not fit the floating-button
  slot. The **flagship one** (`frontend/src/components/flagship/FlagshipProfileMedia.tsx`,
  `UploadProgressRing`, props `progress?: number` 0–1 + `active: boolean` +
  `size`) fits exactly and matches the visual grammar (28pt, 2.5pt stroke,
  white arc on `rgba(0,0,0,0.35)` disc). Imported the existing component —
  no inline replication needed.
- **Import:** `import { UploadProgressRing } from '../components/flagship/FlagshipProfileMedia';`
  — matches the established direct-import pattern already used by
  `components/profile/ProfileMediaEditor.tsx` and `EditProfilePreview.tsx`
  (the flagship barrel `components/flagship/index.ts` does not re-export the ring).
- **Usage (line ~918):** replaced
  `<ActivityIndicator size="small" color={colors.scrimTextPrimary} />` with
  `<UploadProgressRing progress={coverState.progress} active={coverState.status === 'uploading'} size={28} />`.
  `size={28}` mirrors the flagship cover ring inside the identical 34pt
  (`Space.xl + 2`) visible disc.
- **Preserved:** 44pt hit target (`styles.coverEditTarget` uses `Control.hit`
  width/height), `onPress={pickCover}`, `hapticFeedback="light"`,
  `disabled`, `accessibilityRole="button"`, dynamic
  `accessibilityLabel` (uploadingCover/changeCover), and
  `accessibilityState={{ disabled, busy }}` — all untouched.
- `ActivityIndicator` import kept (still used at lines ~1094/~1290).

### 2. MEDIUM — FlagshipProfileMedia.tsx: `createStyles(colors: any)` → proper type

**File:** `frontend/src/components/flagship/FlagshipProfileMedia.tsx` (line ~340)

- `ThemeColors` **is** exported from `frontend/src/theme/ThemeContext.tsx`
  (line 24, `export interface ThemeColors`), so per the finding the direct
  import was used: `import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';`.
- `const createStyles = (colors: ThemeColors) => StyleSheet.create({ ... })`.
- Note: the grep-established pattern `ReturnType<typeof useAppTheme>['colors']`
  (used in ProductCard, EmptyState, YourAlgorithmScreen, etc.) is type-identical
  to `ThemeColors` (`useAppTheme(): ThemeContextValue` whose `colors: ThemeColors`);
  the direct named-type import was chosen as it is the cleaner form and is
  exactly what the finding prescribes when the type is exported. Zero `any`
  remains in the file's style factory; all consumed keys (`surfaceAlt`,
  `danger`, `scrimTextPrimary`, `background`, `surface`, `brand`) exist on
  `ThemeColors`.

### 3. MEDIUM — FlagshipProfileMedia.tsx: accessibility on the local UploadProgressRing

**File:** `frontend/src/components/flagship/FlagshipProfileMedia.tsx` (ring container, ~line 299)

- Prop names verified first: component receives `progress` (default 0) + `active`.
- Ring container (`Reanimated.View`) now carries:
  - `accessibilityRole="progressbar"`
  - `accessibilityValue={{ min: 0, max: 1, now: Math.round(progress * 100) }}`
    — written as `progress * 100` (not `progress ?? 0`) because `progress` is
    destructured with `= 0`, so it is guaranteed `number`; `?? 0` would be
    dead code.
  - `accessibilityLabel={accessibilityLabel}` via a new optional
    `accessibilityLabel?: string` prop defaulting to `'Uploading'`
    (opt-in overridable per the finding's "via a prop if the component
    structure allows").
- `pointerEvents="none"` and fade/arc behaviour unchanged; both existing
  consumers (cover ring 28pt, avatar ring 20pt) inherit the a11y props
  automatically.

### 4. MEDIUM — CreatorSlider.tsx: opt-in `valueLabel` prop

**File:** `frontend/src/creator/controls/CreatorSlider.tsx`

- Added `valueLabel?: string` to `CreatorSliderProps` (documented: pre-formatted
  label replacing the numeric `displayValue` in the label row; opt-in).
- Destructured `valueLabel` in the component.
- Label row now renders `{valueLabel ?? displayValue}` (line ~343).
- **No existing consumer changed** — prop is optional and defaults to the
  previous behaviour; `accessibilityValue.text` intentionally left as
  `displayValue` per the narrow finding scope.

### 5. LOW — AIPhotoEnhancementScreen.tsx: remove instructional a11y clause

**File:** `frontend/src/screens/AIPhotoEnhancementScreen.tsx` (line ~448)

- `accessibilityLabel` reworded from
  `` `Comparison photo. ${descriptiveText}. Drag the slider to compare before and after.` ``
  to `` `Comparison photo. ${descriptiveText}.` `` — descriptive only.
- Edited with the edit tool (no PowerShell string ops); UTF-8 verified intact
  (em-dash U+2014 and ellipsis U+2026 both present — see verification).

---

## Files changed

| File | Change |
|---|---|
| `frontend/src/screens/MyProfileScreen.tsx` | +1 import; ActivityIndicator → `UploadProgressRing` (progress/active/size 28) in floating cover edit button |
| `frontend/src/components/flagship/FlagshipProfileMedia.tsx` | `type ThemeColors` import; `createStyles(colors: ThemeColors)`; ring `accessibilityRole`/`accessibilityValue`/`accessibilityLabel` (+ optional label prop, default 'Uploading') |
| `frontend/src/creator/controls/CreatorSlider.tsx` | Optional `valueLabel?: string` prop; `{valueLabel ?? displayValue}` in label row |
| `frontend/src/screens/AIPhotoEnhancementScreen.tsx` | Instructional clause removed from comparison `accessibilityLabel` |

**Not touched (per constraints):** CreatorCropSheet.tsx, ListingMediaStudio.tsx,
footers, BottomSheet*, ThemeContext.tsx, en.json, listing/UploadProgressRing.tsx.
No new dependencies. No `any` introduced.

---

## Verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `cd frontend; node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | **0 errors in all 4 touched files.** 2 errors remain in `src/__tests__/coownAssetDetailRuntime.test.tsx` — an *untracked new file* (`??` in git status) belonging to a different parallel campaign task (co-own asset detail), outside this task's scope and untouched. Note: the previously-reported TradeConfirmScreen.tsx baseline error no longer appears — the working tree has drifted since the reviewer's baseline due to concurrent campaign tasks; no error originates from Task-4 files. |
| ESLint | `node ./node_modules/eslint/bin/eslint.js src/screens/MyProfileScreen.tsx src/components/flagship/FlagshipProfileMedia.tsx src/creator/controls/CreatorSlider.tsx` | **0 errors** (exit 0). 170 warnings, all pre-existing warning-class noise (i18next literal strings, a11y-hint suggestions, unused vars, max-lines). One new *warning* on the ring's `accessibilityLabel` (has-label-no-hint) — intentional; hints don't apply to a progressbar. |
| Encoding | `node -e "...c.includes('\u2014') && c.includes('\u2026')"` | `ok true` — AIPhotoEnhancementScreen.tsx UTF-8 intact (em-dash + ellipsis present). |

---

## Concerns / notes for the parent agent

1. **Baseline drift (not caused by this task):** tsc now reports 2 errors in the
   untracked `frontend/src/__tests__/coownAssetDetailRuntime.test.tsx`
   (`CoOwnCandleRange` unresolved at line 210; spread-type error at line 61) and
   no longer reports the TradeConfirmScreen baseline error. Both deltas come
   from other parallel tasks' concurrent edits to the shared tree. Per
   "fix EXACTLY these, nothing else", the coown test file was left alone —
   the owning task should resolve it before the campaign's final gate.
2. **Ring a11y nesting:** the progressbar now sits inside the cover
   `AnimatedPressable` (role button). This is what the finding asked for; on
   iOS/Android the ring reads as a separate progressbar element while the
   button keeps its own (status-aware) label. No behavioural regression
   observed at type/lint level; a device smoke test of VoiceOver/TalkBack on
   the uploading state is recommended at campaign QA.
3. `valueLabel` affects only the visual label row, not
   `accessibilityValue.text` — kept minimal per the finding. If a consumer
   later wants the a11y value to match, extend `accessibilityValue.text` to
   `valueLabel ?? displayValue` in a follow-up.
