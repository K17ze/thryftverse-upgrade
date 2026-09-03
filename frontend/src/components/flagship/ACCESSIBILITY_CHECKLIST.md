# Accessibility Checklist

## Perceivable
- [ ] All images have appropriate alt text (accessibilityLabel)
- [ ] Decorative images are hidden from screen readers (accessible={false})
- [ ] Text has 4.5:1 contrast ratio (normal text)
- [ ] Text has 3:1 contrast ratio (large text)
- [ ] No information conveyed by color alone

## Operable
- [ ] All interactive elements are at least 44x44pt
- [ ] Small targets have hitSlop
- [ ] Focus order matches visual hierarchy
- [ ] Modals trap focus and restore on dismiss
- [ ] No keyboard traps

## Understandable
- [ ] accessibilityLabel is concise and descriptive
- [ ] accessibilityHint explains the result of the action
- [ ] accessibilityState reflects current state (selected, disabled, expanded)
- [ ] Error messages are announced (accessibilityLiveRegion)

## Robust
- [ ] Respect Reduce Motion (substitute opacity for large shifts)
- [ ] Respect system font scaling (layouts reflow without clipping)
- [ ] Test with VoiceOver (iOS)
- [ ] Test with TalkBack (Android)
