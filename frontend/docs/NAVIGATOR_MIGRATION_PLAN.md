# Navigator Migration Plan — @react-navigation/stack → @react-navigation/native-stack

> **Status:** Navigator migration COMPLETE. Screen type import migration
> COMPLETE. All 114 screen/component/test files migrated.

---

## 1. What was done

### 1.1. AppNavigator.tsx (COMPLETE)

**File:** `frontend/src/navigation/AppNavigator.tsx`

Migrated from `createStackNavigator` (`@react-navigation/stack`) to
`createNativeStackNavigator` (`@react-navigation/native-stack`).

All ~80 routes preserved. All screen options preserved with API-equivalent
mappings:

| JS stack option | native-stack equivalent | Notes |
|---|---|---|
| `CardStyleInterpolators.forHorizontalIOS` | default push | native-stack does horizontal push automatically |
| `CardStyleInterpolators.forVerticalIOS` | `presentation: 'modal'` | native modal presentation |
| `cardStyle` | `contentStyle` | renamed in native-stack |
| `transitionSpec` (open/close) | removed | native handles transition timing |
| `gestureDirection` | removed | native infers from presentation mode |
| `cardOverlayEnabled` | removed | `transparentModal` provides overlay automatically |
| `animationEnabled: false` | `animation: 'none'` | native-stack API |
| `headerShown` | `headerShown` | same |
| `gestureEnabled` | `gestureEnabled` | same |
| `presentation: 'modal'` | `presentation: 'modal'` | same |
| `presentation: 'transparentModal'` | `presentation: 'transparentModal'` | same |

The `Motion` import (`../constants/motion`) was removed — transition
durations are now handled natively and are no longer configurable via
`transitionSpec`.

### 1.2. TabNavigator.tsx (COMPLETE)

**File:** `frontend/src/navigation/TabNavigator.tsx`

Updated `useNavigation` type parameter from `StackNavigationProp` to
`NativeStackNavigationProp` (from `@react-navigation/native-stack`).

### 1.3. types.ts — compatibility shim (COMPLETE)

**File:** `frontend/src/navigation/types.ts`

Added re-exports of `NativeStackScreenProps` and
`NativeStackNavigationProp` from `@react-navigation/native-stack` so
screens can import them from `../navigation/types` during incremental
migration.

---

## 2. Screen type import migration (COMPLETE)

### 2.1. Screen type imports — DONE

All 114 screen, component, and test files have been migrated from
`@react-navigation/stack` to `@react-navigation/native-stack`:

```tsx
// Before
import { StackScreenProps } from '@react-navigation/stack';
import { StackNavigationProp } from '@react-navigation/stack';
// After
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
```

All type references updated:

```tsx
// Before
type Props = StackScreenProps<RootStackParamList, 'ScreenName'>;
// After
type Props = NativeStackScreenProps<RootStackParamList, 'ScreenName'>;

// Before
const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
// After
const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
```

Files migrated (114 total):
- 106 screen files in `frontend/src/screens/`
- 4 component files in `frontend/src/components/` (EditTab, LooksTab,
  PulseTab, ProfileLooksGrid)
- 1 test file in `frontend/src/__tests__/discoverySurfaces.test.ts`
- 3 navigator files already migrated (AppNavigator, TabNavigator, types.ts)

The `import type` qualifier was preserved where present. No logic, JSX,
handlers, or comments were modified — only import sources and type
references.

### 2.2. API differences to audit per screen

Some screens may use `StackNavigationProp`-specific methods that differ on
`NativeStackNavigationProp`:

- `navigation.setOptions()` — works on both, but option types differ
  (e.g., `cardStyle` → `contentStyle`, no `cardStyleInterpolator`)
- `navigation.dangerouslyGetParent()` — works on both
- `navigation.addListener('transitionStart', ...)` — JS-stack-only event,
  native-stack uses `transitionStart` and `transitionEnd` events
- `navigation.setParams()` — works on both

Any screen using `cardStyleInterpolator`, `transitionSpec`, or
`gestureDirection` in `setOptions` calls will need updating.

### 2.3. Remove @react-navigation/stack dependency (READY)

All screen imports have been migrated. No file in `frontend/src/` imports
from `@react-navigation/stack` anymore (only documentation comments in
`navigation/types.ts` reference the old package name).

The dependency can now be safely removed from `package.json`:

```bash
cd frontend && npm uninstall @react-navigation/stack
```

Then run typecheck to confirm no remaining imports. The dependency is
intentionally left in `package.json` for now as a safety net.

---

## 3. Migration execution plan

### Phase 1: Navigator migration (DONE)
- ✅ AppNavigator.tsx — `createNativeStackNavigator`
- ✅ TabNavigator.tsx — `NativeStackNavigationProp`
- ✅ types.ts — compatibility shim

### Phase 2: Screen type imports (DONE)
All 114 files migrated in a single pass:

- ✅ All screen files — `NativeStackScreenProps` / `NativeStackNavigationProp`
- ✅ All component files — `NativeStackNavigationProp`
- ✅ Test file — mock updated to `@react-navigation/native-stack`
- ✅ `import type` qualifier preserved where present
- ✅ No logic, JSX, handlers, or comments modified

### Phase 3: Cleanup (READY — dependency removal pending)
- ✅ All `@react-navigation/stack` imports eliminated from source code
- ⬜ Remove `@react-navigation/stack` from `package.json` (safe to do now)
- ⬜ Run `npm run typecheck` — should be clean
- ⬜ Run full test suite

---

## 4. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Type errors in ~100 screen files | MEDIUM | `@react-navigation/stack` stays installed; imports still resolve |
| Screen using JS-stack-only `setOptions` | LOW | Audit `setOptions` calls during Phase 2 |
| Transition timing changes | LOW | Native transitions are smoother; durations no longer customizable |
| `headerMode: 'float'` not available | NONE | App uses `headerShown: false` everywhere — no float headers |
| `detachInactiveScreens` | NONE | Same API in native-stack |
| Gesture behaviour changes | LOW | `gestureEnabled` preserved; native handles direction automatically |

---

## 5. Why native-stack

- **Performance:** Native `UINavigationController` (iOS) and `Fragment`
  (Android) instead of JS-driven screen transitions
- **Shared element transitions:** Required for Reanimated 4
  `sharedTransitionTag` support
- **Native features:** Large titles, form sheets, transparent modals with
  native backdrop
- **Memory:** Native screen detachment is more aggressive, reducing memory
  footprint for deep navigation stacks
- **Smoothness:** 60fps transitions guaranteed by the native animator
