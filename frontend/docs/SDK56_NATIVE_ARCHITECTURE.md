# SDK 56 Native Architecture

## Overview

Thryftverse has been upgraded from Expo SDK 54 → 55 → 56 with a comprehensive native platform foundation. This document describes the architecture, breaking changes, and platform adapters.

## SDK 56 Upgrade Summary

### Core Dependencies

| Package | SDK 54 | SDK 56 |
|---------|--------|--------|
| expo | ~54.0.0 | ~56.0.0 |
| react | 18.3.1 | 19.2.3 |
| react-native | 0.79.5 | 0.85.3 |
| typescript | ~5.9.0 | ~6.0.3 |
| @expo/vector-icons | (deprecated) | replaced by @expo/ui icons |

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

### Native UI (`src/platform/native/`)

| Adapter | Wraps | Purpose |
|---------|-------|---------|
| `NativeSheet` | `@expo/ui` BottomSheet | Modal bottom sheet with snap points |
| `NativePicker` | `@expo/ui` Picker | Native dropdown/wheel picker |
| `NativeMenu` | Custom overlay | Context menu with destructive/disabled options |
| `NativeSegmentedControl` | Custom | Segmented tab selector |
| `NativePager` | ScrollView-based | Paged content with tab bar |

### Keyboard (`src/platform/keyboard/`)

| Adapter | Wraps | Purpose |
|---------|-------|---------|
| `KeyboardProvider` | `react-native-keyboard-controller` | Root keyboard context provider |
| `KeyboardDock` | `KeyboardStickyView` | Dock content above keyboard |
| `KeyboardAwareStickyAction` | `KeyboardAwareScrollView` | Scrollable content with sticky action bar |

### Server State (`src/platform/server/`)

| Adapter | Wraps | Purpose |
|---------|-------|---------|
| `ServerStateProvider` | `@tanstack/react-query` QueryClientProvider | Root server state provider |
| `queryClient` | `QueryClient` | Default config (5min staleTime, 2 retries) |
| `queryKeys` | — | Typed query key factory (user, listing, auction, chat, discover) |

### Forms (`src/platform/forms/`)

| Adapter | Wraps | Purpose |
|---------|-------|---------|
| `ControlledAppInput` | `react-hook-form` Controller + TextInput | Text input with validation |
| `ControlledSelect` | Controller + NativePicker | Select with native picker |
| `ControlledToggle` | Controller + `@expo/ui` Switch | Toggle switch |
| `FormErrorSummary` | `FieldErrors` | Renders field error messages |
| `useUnsavedFormGuard` | — | Dirty state guard hook |

### Media (`src/platform/media/`)

| Adapter | Wraps | Purpose |
|---------|-------|---------|
| `mediaTransforms` | `expo-image-manipulator` | compress, resize, crop, rotate, flip |

### Monitoring (`src/platform/monitoring/`)

| Adapter | Wraps | Purpose |
|---------|-------|---------|
| `Sentry` | `@sentry/react-native` | Lazy-init proxy (no-op in Expo Go) |
| `initSentry` | — | Runtime Sentry initialization with DSN |
| `AppErrorBoundary` | React.Component | Error boundary with Sentry capture |

## Validation

All changes validated with:
- `npx expo install --check` — Dependencies up to date
- `npx expo-doctor` — 21/21 checks passed
- `npm run typecheck` — TypeScript compilation clean
- `npm run verify:phase` — 312 tests passed, 27 skipped, 0 failed
- `platformCapabilities.test.ts` — 30 platform adapter coverage tests

## Testing

Platform capability tests in `src/__tests__/platformCapabilities.test.ts` verify:
- All adapter files exist and export correct interfaces
- Barrel exports are complete
- SDK 56 configuration (EAS Update, plugins, splash, channels)
- No top-level splash field (migrated to plugin)

## Commit History

1. `chore(platform): upgrade Expo SDK 55 to 56` — Core upgrade with breaking change fixes
2. `feat(platform): add native UI and keyboard foundation` — @expo/ui + keyboard adapters
3. `feat(platform): add server state and form foundation` — React Query + React Hook Form adapters
4. `feat(platform): add media transformation service` — expo-image-manipulator adapter
5. `feat(platform): configure monitoring and EAS Update` — Sentry + expo-updates config
6. `test(platform): add platform capability coverage tests` — 30 adapter coverage tests
