# Task 23 — Accessibility fixes (M1–M5) — Report

**Status:** DONE_WITH_CONCERNS (all five items implemented; concerns listed below)
**Typecheck:** `tsc --noEmit -p tsconfig.json` → **0 errors** (verified twice)

## M1 — SwipeableRow missing accessibilityActions — FIXED

`frontend/src/components/SwipeableRow.tsx`

- Added `accessibilityActions` + `onAccessibilityAction` to the row's outer
  accessible `View` (~line 297–343). Actions exposed:
  - `activate` → `onPress` (only listed when `onPress` is provided)
  - `longpress` → `onLongPress` (only when `onLongPress` is provided)
  - `leadingAction` (label = `leftAction.label`) → `leftAction.onPress`
  - `trailingAction` (label = `rightAction.label`) → `rightAction.onPress`
- Handlers dispatch through the existing `*Ref`s, so the same callbacks the
  swipe gesture fires are invoked from the iOS rotor / TalkBack actions menu.
- Updated the component doc comment to describe the new a11y surface.

`frontend/src/screens/InboxScreen.tsx` (~line 645)

- Wired `onPress` (open conversation: `markConversationRead` + `navigate('Chat')`)
  and `onLongPress` (`handleQuickActions`) onto the `SwipeableRow` call — the
  same handlers the inner `InboxConversationRow` pressable uses.
- Why needed: the outer `View` is `accessible`, so on iOS the row collapses
  into a single element; without `activate`, a VoiceOver user could not open
  the conversation at all, and without the custom actions "mark read"/
  "archive" were swipe-only.
- Gesture-ownership analysis: `ownsTapGestures` makes the row's PanResponder
  claim only `onStartShouldSetResponder` (bubble phase) — the inner
  `AnimatedPressable` is deeper and still wins responder negotiation for
  touches that land on it, so press feedback and tap behavior for sighted
  users are unchanged. Touches on the gaps now also open the conversation
  (previously dead) — consistent with the row's announced role.
- Net result for the inbox row: VoiceOver/TalkBack users get *activate* (open
  thread), *longpress* (quick actions: Mute/Pin/Delete), *"Mark read/unread"*,
  and *"Archive"* as named actions. The two previously unreachable features
  are now reachable.

## M2 — Android focus escape behind sheets — FIXED (with a deliberate deviation)

The audit asked to "move hiding to the screen root, matching
`InboxScreen.tsx:688`". I investigated the mechanism: `BottomSheet`,
`ActionSheet`, `ConfirmationSheet`, `ShareSheet`, `MakeOfferSheet`,
`SizeGuideSheet`, `FullscreenMediaViewer` all render **in-tree** (absolute-fill
`View`s — no RN `Modal`), and `accessibilityViewIsModal` is **iOS-only** (no
Android implementation exists in `ReactAndroid`). `accessibilityElementsHidden`
/ `importantForAccessibility="no-hide-descendants"` hide **descendants too** —
so putting those props on a root that contains the sheets would hide the open
sheet itself and leave screen-reader users stranded. The literal "hide the
root" instruction (and the existing InboxScreen implementation) is itself
buggy in that respect.

Implementation — a single `flex: 1` wrapper (`styles.a11yContentWrap`)
carrying `accessibilityElementsHidden` + `importantForAccessibility` around
**all behind-the-sheet content, but not the sheets**:

- `frontend/src/screens/ItemDetailScreen.tsx`
  - Hoisted `anyOverlayVisible` (same flag set as before: collection modal,
    share, fullscreen viewer, size guide, Q&A, purchase details, overflow,
    make offer, condition info).
  - Wrapper wraps the collapsed header chrome, the `Reanimated.ScrollView`
    (props removed from it), and `CommerceActionDock` (Buy now / Make offer).
  - All sheets stay as siblings outside the wrapper. `SaveToCollectionModal`
    uses a real RN `Modal` anyway.
- `frontend/src/screens/CheckoutScreen.tsx`
  - Hoisted `anySheetVisible` (add card, payment selector, breakdown,
    confirm sheet).
  - Wrapper wraps header, offline banner, progress row, partial-data prompt,
    ScrollView (props removed), the sticky **pay footer** (Apple Pay /
    Google Pay / Pay), and `CheckoutProgressOverlay`. Sheets stay outside.
- `frontend/src/screens/InboxScreen.tsx`
  - Same correction applied: hiding moved off the `SafeAreaView` root onto
    an inner `a11yContentWrap`, so the open `ActionSheet`/`ConfirmationSheet`
    are no longer hidden from TalkBack/VoiceOver (previously they were —
    the cited reference pattern was itself broken).

No visual change: the wrapper is `flex: 1` inside a `flex: 1` root and all
overlay siblings are `absoluteFill`-anchored, so geometry is identical.

## M3 — Toast never announced — FIXED

`frontend/src/components/Toast.tsx`

- `accessibilityLiveRegion="polite"` on the toast container (TalkBack).
- `AccessibilityInfo.announceForAccessibility(message)` on show, matching the
  `InAppNotificationBanner` pattern (covers VoiceOver).
- `accessibilityRole="alert"` on the toast container.
- Close button labelled: `accessibilityLabel="Dismiss notification"` +
  `accessibilityRole="button"` on the `AnimatedPressable`.

Note: on Android the live region + explicit announce can produce a duplicate
announcement on some OS versions — accepted, mirrors the existing banner.

## M4 — Inert settings toggles — FIXED (removed)

Consumers audited: `reducedMotion` → `useReducedMotion`; `highContrast` →
`ThemeContext` (`applyHighContrast`); `textSize` → `components/ui/Text.tsx`;
`boldText` → **only the settings preview itself**; `screenReaderHints` →
**nothing**. There is no mechanism to apply font weight or per-element hints
to ~2,600 raw `<Text>` nodes — both toggles were decorative (Truthful UI
violation), so they were removed end-to-end:

- `src/preferences/accessibilityPreferences.ts` — fields dropped from
  `AccessibilityPreferences` and defaults (old stored blobs merge harmlessly).
- `src/context/AccessibilityPreferencesContext.tsx` — fields, setters, and
  context values removed.
- `src/screens/AccessibilitySettingsScreen.tsx` — "Bold text" row removed
  from Display; the entire "Screen reader" section removed (it contained only
  the dead toggle); preview no longer branches on `boldText`.

`textSize` kept — it has real consumers (~30 files via `components/ui/Text`).
Its section copy was corrected from the false "throughout the app" claim to
"areas of the app that use ThryftVerse text styles … device's text size
setting, which applies everywhere".

## M5 — maxFontSizeMultiplier caps — FIXED

All `maxFontSizeMultiplier={1.4}` → `{2}`:

- `src/components/ui/AppButton.tsx` (shared CTA title, line ~155)
- `src/screens/ItemDetailScreen.tsx` (9 spots)
- `src/screens/CheckoutScreen.tsx` (25 spots — pay button, wallet buttons,
  order-summary rows, progress labels, retry CTAs)
- Extended to the same screen's rendered components:
  `src/components/commerce/detail/CommerceActionDock.tsx` (Sold/Reserved/
  Paused state badges), `CommerceIdentityBlock.tsx` (condition chip, size
  guide link, attributes), `CommerceTrustDossier.tsx` (trust facts).
- `CommerceDetailStateDock` CTA labels were already uncapped.

## Verification performed

1. `tsc --noEmit -p tsconfig.json` → 0 errors (ran twice).
2. Swipe actions reachable: `accessibilityActions` on the grouped row element
   expose activate / longpress / "Mark read|unread" / "Archive"; wired to the
   same handlers as the swipe gesture.
3. TalkBack containment: behind-sheet content is now under a single
   `no-hide-descendants` container on all three screens; sheets render
   outside it so they remain interactive (verified structurally — device
   testing still recommended).

## Concerns / residual items

- **No `coown/` files touched**; no navigation, analytics, or haptics changed.
- Residual `maxFontSizeMultiplier` < 2 exists elsewhere in the repo (e.g.,
  other components); only the audited screens/components were raised.
- `accessibilityRole="alert"` + live region + `announceForAccessibility` may
  double-announce on some Android builds — mirrors the reference banner.
- iOS `accessible` grouping means inner elements of `SwipeableRow` children
  are collapsed into the row — this is pre-existing behavior, now mitigated
  by the row-level actions.
- `AccessibilityPreferencesContext` no longer exposes `boldText`/
  `screenReaderHints`; the persisted AsyncStorage key is unchanged and stale
  stored values are ignored.
