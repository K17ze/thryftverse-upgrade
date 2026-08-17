# Codebase Refactor Action Matrix

| File | Problem | Required change |
|---|---|---|
| `CreatorEntryScreen.tsx` | menu-first 2×2 intent dashboard | replace with camera-root capture hub |
| `CreatorCamera.tsx` | rich capability + review interruption | simplify default chrome, own mode switch, direct editor handoff |
| `CreatorStudioShell.tsx` | internal dispatch is fine | keep dedicated composers; route only after acquisition |
| `LookComposerScreen.tsx` | multiple simultaneous rails and huge orchestration | one lower-surface state machine; remove permanent layout rails |
| `LookAutoLayoutBar.tsx` | duplicate layout exposure | merge/remove from default |
| `LayoutPreviewRail.tsx` | useful contextual surface | render only after Layout tap |
| `LookSourceTray.tsx` | permanent competing surface | convert to Items drawer |
| `AIEffectBrowserSheet.tsx` | over-signaled AI subsystem | fold under Effects |
| `CameraEffectBar.tsx` | not truly live if post-capture | move behind Tools/editor |
| `InCanvasCropOverlay.tsx` | correct direction | promote to canonical crop UX |
| `CreatorCropSheet.tsx` | separate tool-page fallback | retire mainstream use |
| `MediaBrowserSheet` | good abstraction | launch directly from camera, confirm → editor |

## New capture architecture

```text
creator/capture/
  CreatorCaptureScreen.tsx
  CreatorModeSwitch.tsx
  CaptureToolsSheet.tsx
  CaptureToEditorRouter.ts
  useCreatorCaptureMode.ts
```

## Bottom-surface state

Look and Poster should structurally prevent rail pileups through one state value, e.g. `tools | items | layout | effects | timeline | null`. Only one major lower surface renders at once.

## PR requirement

Every new creator surface must state which existing surface it replaces, or why permanent additional chrome is unavoidable.
