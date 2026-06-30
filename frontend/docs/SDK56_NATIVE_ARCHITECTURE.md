# SDK 56 Native Architecture

## Overview

Thryftverse has been upgraded from Expo SDK 54 → 55 → 56 with a platform adapter foundation. This document describes the architecture, breaking changes, platform adapters, and their runtime activation status.

## SDK 56 Upgrade Summary

### Core Dependencies

| Package | SDK 54 | SDK 55 | SDK 56 |
|---------|--------|--------|--------|
| expo | ~54.0.0 | ~55.0.0 | ~56.0.0 |
| react | 18.3.1 | 19.2.0 | 19.2.3 |
| react-native | 0.79.5 | 0.83.6 | 0.85.3 |
| typescript | ~5.9.0 | ~5.9.2 | ~6.0.3 |
| @expo/vector-icons | installed | installed | installed (retained, not replaced) |

### Breaking Changes Fixed

1. **`StyleSheet.absoluteFillObject` removed** — Replaced with `StyleSheet.absoluteFill` across 40 files
2. **`Clipboard.setString` removed** — Replaced with `Clipboard.setStringAsync` in ChatScreen
3. **`StatusBar.backgroundColor` prop removed** — Removed from App.tsx
4. **Splash config migration** — Moved from top-level `"splash"` field to `expo-splash-screen` config plugin
5. **`expo-media-library` Asset API** — `Asset.uri` property replaced with `Asset.getUri()` method; BottomControlBar updated with optional `uri` field
6. **`expo-modules-core` direct dependency** — Removed; types resolve through transitive dependencies

### Configuration Changes

- **Splash screen**: Config moved to `expo-splash-screen` plugin in `app.json`
- **EAS Update**: Added `updates.url`, `checkAutomatically: ON_LOAD`, `runtimeVersion: { policy: "sdkVersion" }`
- **EAS channels**: Added channels to all build profiles (development, preview, production)
- **Plugins**: Added `expo-updates` and `@sentry/react-native` to `app.json` plugins

## Platform Adapter Architecture

All platform adapters live in `src/platform/` with barrel exports from `src/platform/index.ts`.

### Adapter Status Notation

Each adapter is classified as:
- **Created** — Adapter file exists with correct imports and exports
- **Mounted** — Adapter is wired into the application root or a real screen
- **Runtime-validated** — Adapter has been exercised in a running development build
- **Device-validated** — Adapter has been verified on a physical device or emulator

### Native UI (`src/platform/native/`)

| Adapter | Wraps | Implementation Type | Created | Mounted | Runtime | Device |
|---------|-------|---------------------|---------|---------|---------|--------|
| `NativeSheet` | `@expo/ui` BottomSheet | Real production — wraps native BottomSheet | Yes | No | No | No |
| `NativePicker` | `@expo/ui` Picker | Real production — wraps native Picker | Yes | No | No | No |
| `NativeMenu` | React Native Pressable/View | Custom fallback — no `@expo/ui` equivalent | Yes | No | No | No |
| `NativeSegmentedControl` | React Native Pressable/View | Custom fallback — no `@expo/ui` equivalent | Yes | No | No | No |
| `NativePager` | React Native ScrollView | Custom fallback — no `@expo/ui` equivalent | Yes | No | No | No |

### Keyboard (`src/platform/keyboard/`)

| Adapter | Wraps | Created | Mounted | Runtime | Device |
|---------|-------|---------|---------|---------|--------|
| `KeyboardProvider` | `react-native-keyboard-controller` | Yes | No | No | No |
| `KeyboardDock` | `KeyboardStickyView` | Yes | No | No | No |
| `KeyboardAwareStickyAction` | `KeyboardAwareScrollView` | Yes | No | No | No |

### Server State (`src/platform/server/`)

| Adapter | Wraps | Created | Mounted | Runtime | Device |
|---------|-------|---------|---------|---------|--------|
| `ServerStateProvider` | `@tanstack/react-query` QueryClientProvider | Yes | No | No | No |
| `queryClient` | `QueryClient` | Yes | No | No | No |
| `queryKeys` | — | Yes | No | No | No |

### Forms (`src/platform/forms/`)

| Adapter | Wraps | Created | Mounted | Runtime | Device |
|---------|-------|---------|---------|---------|--------|
| `ControlledAppInput` | `react-hook-form` Controller + TextInput | Yes | No | No | No |
| `ControlledSelect` | Controller + NativePicker | Yes | No | No | No |
| `ControlledToggle` | Controller + `@expo/ui` Switch | Yes | No | No | No |
| `FormErrorSummary` | `FieldErrors` | Yes | No | No | No |
| `useUnsavedFormGuard` | — | Yes | No | No | No |

### Media (`src/platform/media/`)

| Adapter | Wraps | Created | Mounted | Runtime | Device |
|---------|-------|---------|---------|---------|--------|
| `mediaTransforms` | `expo-image-manipulator` | Yes | No | No | No |

Operations implemented: compress, resize, crop, rotate, flip.
Missing capabilities: normalizeImage, resizeForUpload, cropToAspectRatio, createThumbnail, exportImage, orientation handling, output format/MIME metadata.

### Monitoring (`src/platform/monitoring/`)

| Adapter | Wraps | Created | Mounted | Runtime | Device |
|---------|-------|---------|---------|---------|--------|
| `Sentry` | `@sentry/react-native` (lazy require) | Yes | No | No | No |
| `initSentry` | — | Yes | No | No | No |
| `AppErrorBoundary` | React.Component + Sentry | Yes | No | No | No |

## Missing Runtime Validation

The following gaps remain after PLATFORM-01:

1. **KeyboardProvider not mounted at App.tsx root** — adapter created but not integrated
2. **ServerStateProvider not mounted at App.tsx root** — adapter created but not integrated
3. **Sentry not initialised at app startup** — `initSentry()` not called in App.tsx
4. **AppErrorBoundary not replacing the old ErrorBoundary** — both exist; old one is used
5. **No React Query mobile integration** — no NetInfo onlineManager, no AppState focusManager, no cache lifecycle
6. **No pilot query migrated to TanStack Query** — no feature uses the query infrastructure
7. **No keyboard pilot in any screen** — CreateGroupChatScreen still uses KeyboardAvoidingView
8. **Media transforms incomplete** — 5 of 10 required operations missing
9. **No Expo UI Host strategy** — NativeSheet/NativePicker/ControlledToggle may fail without Host ancestor
10. **No EAS build evidence** — no native build has been attempted
11. **No device validation** — ADB not available on the development machine
12. **`lint:design-tokens` script missing** — package.json references a non-existent script

## Testing

Platform capability tests in `src/__tests__/platformCapabilities.test.ts` are **static source-string checks**, not behavioural tests. They verify:
- Adapter files exist and contain expected import strings
- Barrel exports contain expected names
- SDK 56 configuration values in app.json/eas.json

They do **not** verify runtime rendering, provider mounting, or native module behaviour.

## Commit History (PLATFORM-01: 10 commits)

1. `42e10ab` — chore(platform): restore verification baseline
2. `b75c50f` — test(platform): retire 31 obsolete static guardrail tests
3. `4258db2` — chore(platform): upgrade Expo SDK 54 to 55
4. `2859f71` — chore(platform): upgrade Expo SDK 55 to 56
5. `b9693e8` — feat(platform): add native UI and keyboard foundation
6. `edb3205` — feat(platform): add server state and form foundation
7. `23051ae` — feat(platform): add media transformation service
8. `994c9ef` — feat(platform): configure monitoring and EAS Update
9. `ec56be1` — test(platform): add platform capability coverage tests
10. `b3ccdad` — docs(platform): document SDK 56 native architecture
