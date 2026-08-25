# ThryftVerse Flagship Upgrade — Keyboard & Input Accessories

**Component deep-dive:** every keyboard avoiding view, input accessory bar, keyboard toolbar, and return key behavior in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §17 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram's chat input bar sticks above the keyboard with a smooth animation. The bar has: text input, camera icon, photo icon, GIF icon, and send button. When the keyboard opens, the bar slides up with the keyboard (not a jump). When the keyboard dismisses, the bar slides back down. Instagram's lesson: **the input bar and keyboard are one unit — they move together.**

### Snapchat (2026)
Snapchat's chat uses an input accessory bar above the keyboard with formatting options (stickers, attachments, voice). The bar is always visible when the keyboard is open. The return key sends the message (not a newline). Snapchat's lesson: **the input accessory bar is where formatting actions live — don't put them in the main UI.**

### eBay (2026)
eBay's checkout forms use `KeyboardAvoidingView` with smooth scroll-to-focus behavior. When the user taps a text field, the form scrolls to keep the field visible above the keyboard. A "Done" button in the input accessory bar dismisses the keyboard. eBay's lesson: **forms must scroll-to-focus and have a "Done" button — the user should never be unable to see the field they're typing in.**

### Cross-cutting 2026 consensus
- **KeyboardAvoidingView** on every screen with text inputs.
- **Input accessory bar** above keyboard with "Done" button for forms, formatting for chat.
- **Scroll-to-focus** — form scrolls to keep the active field visible.
- **Return key behavior** — "Next" to move to next field, "Done" to dismiss keyboard.
- **Smooth animation** — input bar slides with keyboard, not jumps.
- **`react-native-keyboard-aware-scroll-view`** or Reanimated-based custom solution.
- **Tap-outside to dismiss** — tap anywhere outside the input to dismiss keyboard.

---

## 2. Psychology & Principles

### The hidden input problem
The most common keyboard UX defect: the user taps a text field, the keyboard opens and covers the field, and the user can't see what they're typing. This is frustrating and causes typing errors. The 2026 standard: `KeyboardAvoidingView` + scroll-to-focus on every form.

### The "Done" button problem
On iOS, there's no standard way to dismiss the keyboard — the user must tap outside. On Android, the back button dismisses it. An input accessory bar with a "Done" button provides a consistent dismiss mechanism on both platforms. Without it, iOS users are stuck.

### Return key as navigation
In a multi-field form, the return key should move to the next field ("Next"), not submit the form or insert a newline. On the last field, it should be "Done" to dismiss the keyboard. This lets the user fill the entire form without lifting their finger from the keyboard.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Keyboard handling usage

| Metric | Count | Notes |
|--------|-------|-------|
| Files with `KeyboardAvoidingView` or `KeyboardAware` | ~133 matches | Some usage |
| Shared KeyboardAvoidingView wrapper | **None** | Each screen configures its own |
| Input accessory bar component | **None** | No `InputAccessoryView` usage |
| Keyboard toolbar component | **None** | No "Done" button bar |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No shared KeyboardAvoidingView wrapper** — each screen configures its own | Multiple screens | Medium |
| 2 | **No input accessory bar** — no "Done" button above keyboard | Global | High |
| 3 | **No keyboard toolbar component** — no formatting bar for chat | ChatScreen | Medium |
| 4 | **Inconsistent return key behavior** — some forms use 'done', some 'next', some 'default' | Multiple forms | Medium |
| 5 | **No scroll-to-focus** on some forms — inputs can be hidden by keyboard | Some form screens | High |
| 6 | **No tap-outside-to-dismiss** on some screens | Some form screens | Medium |
| 7 | **133 inline KeyboardAvoidingView usages** — no shared pattern | Multiple files | Low |
| 8 | **No smooth keyboard animation** on some screens — input bar jumps instead of sliding | Some chat screens | Low |

---

## 4. Micro Improvements

### M1 — Create shared KeyboardAvoidingScreen wrapper
```tsx
interface KeyboardAvoidingScreenProps {
  children: React.ReactNode;
  behavior?: 'padding' | 'height' | 'position';
  scrollEnabled?: boolean;
}
```
Wraps children with `KeyboardAvoidingView` + `ScrollView` with scroll-to-focus. Handles iOS/Android differences.

### M2 — Create shared InputAccessoryBar component
```tsx
interface InputAccessoryBarProps {
  visible: boolean;
  onDone: () => void;
  rightLabel?: string;  // default "Done"
  leftContent?: React.ReactNode;  // optional formatting actions
}
```
Renders above the keyboard using `InputAccessoryView` (iOS) or a fixed-position bar (Android). "Done" button on the right.

### M3 — Standardize return key behavior
- **Multi-field forms:** `returnKeyType="next"` with `onSubmitEditing` focusing next field
- **Single-field forms:** `returnKeyType="done"` with `blurOnSubmit={true}`
- **Chat:** `returnKeyType="send"` with `onSubmitEditing` sending message

### M4 — Add tap-outside-to-dismiss everywhere
Wrap all form screens with `TouchableWithoutFeedback onPress={Keyboard.dismiss}`. Or use a shared `DismissKeyboardArea` component.

### M5 — Add scroll-to-focus on all forms
Ensure that when a text field is focused, the form scrolls to keep it visible above the keyboard. Use `scrollTo` on the focused input's `onFocus`.

### M6 — Add keyboard toolbar for chat
In ChatScreen, add an input accessory bar with: sticker icon, photo icon, camera icon. The bar slides with the keyboard.

---

## 5. Macro Improvements

### A1 — Keyboard handling system
Create a unified family:
- `KeyboardAvoidingScreen` — wrapper with KeyboardAvoidingView + ScrollView + scroll-to-focus
- `InputAccessoryBar` — toolbar above keyboard with "Done" button
- `ChatInputBar` — chat-specific input bar that sticks above keyboard with formatting actions
- `useKeyboardAnimation` — hook for smooth keyboard show/hide animations (Reanimated)

### A2 — Consistent keyboard UX
Every screen with text inputs should:
1. Use `KeyboardAvoidingScreen` wrapper
2. Have an `InputAccessoryBar` with "Done" button
3. Use correct `returnKeyType` per field position
4. Dismiss keyboard on tap-outside
5. Scroll-to-focus on field focus
6. Animate smoothly with keyboard

---

## 6. Flagship Acceptance Criteria

- **Shared KeyboardAvoidingScreen** on every form screen
- **InputAccessoryBar** with "Done" button on every form
- **ChatInputBar** that sticks above keyboard with formatting actions
- **Consistent returnKeyType** — "next" in multi-field, "done" on last, "send" in chat
- **Tap-outside to dismiss** on all form screens
- **Scroll-to-focus** on all forms
- **Smooth keyboard animation** — input bar slides, not jumps
- **Accessibility** — keyboard announcements for screen readers

### Thumbnail test
N/A (keyboard behavior is interaction-level, not visual at 25% scale). Instead: **field visibility test** — when the keyboard is open, the active text field must be fully visible above the keyboard with the "Done" button accessible.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — KeyboardAvoidingScreen | Low | All forms |
| P0 | M2 — InputAccessoryBar | Medium | All forms |
| P1 | M5 — Scroll-to-focus | Low | Form UX |
| P1 | M3 — Standardize returnKeyType | Low | Form UX |
| P1 | M4 — Tap-outside dismiss | Low | Form UX |
| P2 | M6 — Chat keyboard toolbar | Medium | Chat UX |
| P3 | A1 — Full keyboard system | High | All keyboard surfaces |
| P3 | A2 — Consistent keyboard UX | High | Consistency |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `keyboardAvoiding.behavior` | 'padding' (iOS), 'height' (Android) | Platform-specific |
| `keyboardAvoiding.keyboardVerticalOffset` | Platform.select({ ios: 0, android: 0 }) | |
| `inputAccessory.height` | 44pt | Control.touchable |
| `inputAccessory.background` | colors.surface | |
| `inputAccessory.borderColor` | colors.hairline | Top border |
| `inputAccessory.doneLabel` | "Done" | Right-aligned |
| `inputAccessory.doneColor` | colors.brand | |
| `chatInputBar.height` | 44pt + safe area | |
| `chatInputBar.background` | colors.surface | |
| `returnKey.multiField` | 'next' | |
| `returnKey.lastField` | 'done' | |
| `returnKey.chat` | 'send' | |
| `keyboard.animation` | withTiming 250ms | Smooth slide |
| `keyboard.dismissOnTap` | true | Tap-outside |

---

*Generated 2026-08-18. Sources: production codebase audit, Instagram chat input bar patterns, eBay checkout keyboard handling, react-native-keyboard-aware-scroll-view docs.*
