# Accessibility Acceptance Tests

These Maestro flows test critical user journeys with assistive technology focus.

## Prerequisites
- Maestro CLI installed (`curl -Ls "https://get.maestro.mobile" | bash`)
- iOS Simulator or Android Emulator running
- App installed on simulator/emulator

## Running flows

```bash
# Run all accessibility flows
maestro test .maestro/flows/accessibility/

# Run a specific flow
maestro test .maestro/flows/accessibility/auth-voiceover.yaml

# Run with a specific device
maestro test --device "iPhone 15 Pro" .maestro/flows/accessibility/auth-voiceover.yaml
```

## VoiceOver/TalkBack setup

### iOS (VoiceOver)
1. Open Simulator
2. Settings → Accessibility → VoiceOver → Enable
3. Run flows

### Android (TalkBack)
1. Open Emulator
2. Settings → Accessibility → TalkBack → Enable
3. Run flows

## What these tests verify
- Focus order matches visual order
- All interactive elements have accessibility labels
- Screen reader can navigate through the full journey
- Error messages are announced
- Form fields are properly labeled
- Navigation elements are distinguishable

## Adding new flows
1. Create a new YAML file in this directory
2. Tag it with `accessibility` and the screen reader (`voiceover` or `talkback`)
3. Test with the actual screen reader enabled
4. Verify every `assertVisible` and `tapOn` has a descriptive `label`
