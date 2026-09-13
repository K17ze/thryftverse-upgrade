# Task 26 — Accessibility Cleanup (Minor Findings)

## Status: DONE

## Summary

All five minor findings from the accessibility review are fixed. `tsc --noEmit` reports **0 errors**. The accessibility acceptance test file passes **5/5** tests (2 pre-existing Maestro file checks + 3 new `SwipeableRow` render tests).

## Fixes

### 1. `SwipeableRow` activate action — `src/creator/CreatorLayersSheet.tsx` (~line 501)

The layer row's `accessibilityHint` promised "Double tap to select" but no `activate` action was registered, so the gesture did nothing under VoiceOver/TalkBack. Fixed by wiring the row's handlers to the same callbacks the inner `PressScale` uses:

- `onPress={() => onSelect(layer.id)}` → registers the `activate` action (select layer).
- `onLongPress={() => onLongPressRow(layer.id)}` → registers the `longpress` action so screen-reader users can also reach reorder mode (previously unreachable — the `accessible` row collapses its children).
- `longPressActionLabel="Reorder layer"` → new optional prop on `SwipeableRow` (`src/components/SwipeableRow.tsx`, ~line 47 and ~line 310) that overrides the hardcoded `'Show actions'` label, which was correct for InboxScreen's quick-actions sheet but wrong here.

Touch behavior is unchanged: the inner `Pressable` (inside `PressScale`) claims the responder before the row's `PanResponder` — the same documented pattern InboxScreen already uses (see `InboxScreen.tsx:655-659`). The new props only affect the accessibility action surface.

### 2. Stale comments — `src/screens/AccessibilitySettingsScreen.tsx` (lines ~63 and ~162)

- "how their selected text size **and bold setting** will look" → "how their selected text size will look".
- "at the selected size **and weight**" → "at the selected size".

The neighbouring comment block at line ~80 already documents the `boldText`/`screenReaderHints` removal (audit M4) — left intact, it is accurate.

### 3. Toast double-announce risk — `src/components/Toast.tsx` (~line 50)

`accessibilityLiveRegion="polite"` (Android-only prop) and `AccessibilityInfo.announceForAccessibility` were both firing. On Android builds where TalkBack honours both, the message was announced twice. The explicit announce call is now gated to `Platform.OS === 'ios'` — live region covers TalkBack, the call covers VoiceOver. Comment updated to explain the split. `Platform` added to the `react-native` import.

### 4. Stale persisted keys — `src/preferences/accessibilityPreferences.ts` (`getStoredAccessibilityPreferences`)

The `{ ...DEFAULT, ...parsed }` merge let removed keys (`boldText`, `screenReaderHints`) ride the spread and persist in storage indefinitely. The loader now picks known keys explicitly, with type guards:

- `textSize` — validated against `TEXT_SIZE_SCALE` keys (unknown values fall back to `'medium'`).
- `reducedMotion` / `highContrast` — `typeof === 'boolean'` guard, else default.

Because `setStoredAccessibilityPreferences` writes back this filtered result, the next save also scrubs the stale keys from disk — no migration needed.

### 5. Unit coverage — `src/__tests__/accessibilityAcceptance.test.tsx`

Added a `SwipeableRow — accessibility actions` describe block using `react-test-renderer` (same approach as `creatorFlagshipGlyphs.test.tsx` / `swipeableMessage.test.tsx`):

- Asserts the `accessibilityActions` array is `['activate', 'longpress', 'leadingAction', 'trailingAction']` with correct labels (`Reorder layer`, `Lock`, `Delete`), plus `accessible` and `accessibilityRole="button"`.
- Asserts `onAccessibilityAction` dispatches each action name to the correct handler.
- Asserts `activate`/`longpress` are omitted when `onPress`/`onLongPress` aren't provided — the exact regression shape the review flagged.

### Supporting change — `src/__tests__/setup.ts`

The global `react-native` mock lacked `PanResponder`, `AccessibilityInfo`, `UIManager`, and `LayoutAnimation` — any component using them could not render in tests at all. Added minimal mocks (`PanResponder.create` returns the config as `panHandlers` so tests can inspect/invoke responder callbacks). Additive only: these were previously `undefined`, so no existing test could have depended on them.

## Verification

- `tsc --noEmit -p tsconfig.json` → **0 `error TS` matches** (clean).
- `npx vitest run src/__tests__/accessibilityAcceptance.test.tsx` → **5 passed / 0 failed**.

## Constraints honoured

- No visual layout changes (accessibility props, comments, and storage filtering only).
- No new features (`longPressActionLabel` is a small additive prop to keep an existing action label truthful).
- `frontend/src/components/coown/` untouched.
- No architectural changes.

## Concerns / notes for parent agent

- **Pre-existing gap (not fixed, out of scope):** in `CreatorLayersSheet`, the overflow action sheet (`front`/`back`/`duplicate`) remains unreachable for screen-reader users when a row is collapsed by `accessible` — the `longpress` action now enters reorder mode, which partially mitigates. If the review wants full parity, a `leadingAction`-style custom action for "More actions" could be added later.
- **Setup-mock blast radius:** adding `AccessibilityInfo`/`PanResponder`/`UIManager`/`LayoutAnimation` to the shared `react-native` mock enables code paths that previously could not run in tests. This is strictly additive, but if any unrelated test suite regresses, this file is the first place to look. Only the accessibility test file was run for this task.
- The `SwipeableRow` `accessibilityHint` still appends auto-generated swipe descriptions (`Swipe right to Lock. Swipe left to Delete.`) after the caller's hint, producing slight redundancy with the caller-provided "Swipe left to delete, swipe right to lock." Pre-existing behaviour; left as-is.
