# Haptic Grammar

## Principles
1. Haptics are punctuation, not a soundtrack
2. Use for confirm and reward, not constantly
3. Respect Reduce Motion and system haptic settings
4. Pre-warm generators before they're needed
5. Pair with visual feedback, never alone

## When to use haptics
- ✅ Task completion (success, error, warning)
- ✅ Key confirmations (checkout, offer accepted)
- ✅ Selection changes (picker, toggle, tab switch)
- ✅ Destructive actions (delete, remove)
- ✅ Achievement moments (celebration)

## When NOT to use haptics
- ❌ Every tap on a scrollable list
- ❌ Every keystroke
- ❌ Background sync or polling
- ❌ Animations that already have visual feedback
- ❌ More than once per second

## Intent mapping
See `platform/haptics/` for the canonical haptic engine and intent presets.

## Accessibility
- All haptics respect `AccessibilityInfo.isReduceMotionEnabled()`
- If reduce motion is on, haptics are suppressed
- Visual feedback must accompany haptics — never rely on haptics alone
