/**
 * HapticsEngine — Core Haptics abstraction for ThryftVerse.
 *
 * Wraps `react-native-haptic-feedback` v3 to provide:
 *   - A superset of the expo-haptics API (impact, notification, selection)
 *   - The new v3 haptic types (confirm, reject, gestureStart, toggleOn, …)
 *   - Custom AHAP patterns for celebrations and error shakes
 *   - Global enable/disable and per-call options passthrough
 *   - Worklet-compatible synchronous triggers (safe to call from Reanimated)
 *
 * On iOS, custom patterns use Core Haptics (`CHHapticEngine`) via the
 * `triggerPattern()` API. On Android, the library maps `HapticEvent[]`
 * sequences to `VibrationEffect.createWaveform`.
 *
 * The native module is loaded lazily via `require()` so that the file never
 * crashes at import time if the native module isn't linked (e.g. in tests or
 * web environments). All public methods are synchronous, fire-and-forget,
 * and silently no-op when the module is unavailable or haptics are disabled.
 *
 * @see https://mkuczera.github.io/react-native-haptic-feedback/
 */

import { Platform } from 'react-native';

// Type-only imports — erased at compile time, safe even if the native
// module isn't linked at runtime.
import type {
  HapticFeedbackTypes,
  HapticEvent,
  HapticOptions,
} from 'react-native-haptic-feedback';

import { HapticPatternRegistry, ahapToHapticEvents } from './hapticPatterns';
import type {
  HapticImpactStyle,
  HapticNotificationType,
  HapticsEngineConfig,
} from './types';

// ─── Lazy native-module loader ──────────────────────────────────────────────

/**
 * The typed shape of the `react-native-haptic-feedback` default export.
 * Used so the lazy `require()` result is properly typed.
 */
type HapticFeedbackModule = typeof import('react-native-haptic-feedback');

let _module: HapticFeedbackModule | null = null;
let _loadAttempted = false;

/**
 * Lazily require the native haptic-feedback module.
 * Returns `null` if the module isn't linked or can't be evaluated.
 * The result is cached so the `require()` call happens at most once.
 */
function getHapticFeedback(): HapticFeedbackModule | null {
  if (_loadAttempted) return _module;
  _loadAttempted = true;
  try {
    // require() so a missing native module doesn't crash at import time.
    _module = require('react-native-haptic-feedback');
  } catch {
    _module = null;
  }
  return _module;
}

// ─── Impact style → HapticFeedbackTypes mapping ─────────────────────────────

/**
 * Mapping from our public `HapticImpactStyle` union to the string values
 * expected by `HapticFeedback.trigger()`. We use string literals because
 * the `HapticFeedbackTypes` enum values are identical to their keys (e.g.
 * `HapticFeedbackTypes.impactLight === 'impactLight'`), and the library's
 * `trigger()` accepts `keyof typeof HapticFeedbackTypes`.
 */
const IMPACT_TYPE_MAP: Record<HapticImpactStyle, keyof typeof HapticFeedbackTypes> = {
  light: 'impactLight',
  medium: 'impactMedium',
  heavy: 'impactHeavy',
  rigid: 'rigid',
  soft: 'soft',
};

const NOTIFICATION_TYPE_MAP: Record<HapticNotificationType, keyof typeof HapticFeedbackTypes> = {
  success: 'notificationSuccess',
  warning: 'notificationWarning',
  error: 'notificationError',
};

// ─── Engine state ───────────────────────────────────────────────────────────

const isIOS = Platform.OS === 'ios';

/**
 * Whether haptics are globally enabled. When `false`, all triggers are
 * no-ops. Controlled by `configure()` / `setEnabled()` and typically
 * reflects a user preference from MMKV or the OS setting.
 */
let hapticsEnabled = true;

/**
 * Default options passed to every `trigger()` call. Set by `configure()`.
 */
let defaultOptions: HapticOptions = {
  enableVibrateFallback: false,
  ignoreAndroidSystemSettings: false,
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Configure the haptics engine.
 *
 * @param config - Engine configuration. All fields are required so callers
 *                 make an explicit choice about every dimension.
 */
export function configure(config: HapticsEngineConfig): void {
  hapticsEnabled = config.enabled;
  defaultOptions = {
    enableVibrateFallback: config.enableVibrateFallback,
    ignoreAndroidSystemSettings: config.ignoreAndroidSystemSettings,
  };
  // Propagate the kill-switch to the native library as well.
  const mod = getHapticFeedback();
  if (mod) {
    try {
      mod.setEnabled(config.enabled);
    } catch {
      // ignore
    }
  }
}

/**
 * Enable or disable haptics globally.
 * When disabled, all trigger methods become no-ops.
 */
export function setEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
  const mod = getHapticFeedback();
  if (mod) {
    try {
      mod.setEnabled(enabled);
    } catch {
      // ignore
    }
  }
}

/**
 * Returns whether haptics are currently enabled.
 */
export function isEnabled(): boolean {
  return hapticsEnabled;
}

/**
 * The core trigger function. Wraps `HapticFeedback.trigger()` with the
 * engine's enabled-state gate and default options.
 *
 * Safe to call from Reanimated worklets — the underlying native call is
 * synchronous and does not cross the JS bridge on the New Architecture.
 *
 * @param type - A `HapticFeedbackTypes` key (e.g. `'impactLight'`,
 *               `'selection'`, `'confirm'`).
 * @param options - Per-call options that override the engine defaults.
 */
export function trigger(
  type: keyof typeof HapticFeedbackTypes,
  options?: HapticOptions,
): void {
  if (!hapticsEnabled) return;
  const mod = getHapticFeedback();
  if (!mod) return;
  try {
    mod.trigger(type, { ...defaultOptions, ...options });
  } catch {
    // Haptics not available — swallow silently.
  }
}

/**
 * Trigger an impact haptic.
 * @param style - light, medium, heavy, rigid, or soft.
 */
export function triggerImpact(style: HapticImpactStyle): void {
  const type = IMPACT_TYPE_MAP[style];
  if (!type) return;
  trigger(type);
}

/**
 * Trigger a notification haptic.
 * @param type - success, warning, or error.
 */
export function triggerNotification(type: HapticNotificationType): void {
  const feedbackType = NOTIFICATION_TYPE_MAP[type];
  if (!feedbackType) return;
  trigger(feedbackType);
}

/**
 * Trigger a light selection tick.
 */
export function triggerSelection(): void {
  trigger('selection');
}

// ─── v3 built-in haptic type shortcuts ──────────────────────────────────────

/** A crisp double-tap that says "yes, confirmed". Uses the v3 `confirm` type. */
export function confirm(): void {
  trigger('confirm');
}

/** A soft buzz that says "no, rejected". Uses the v3 `reject` type. */
export function reject(): void {
  trigger('reject');
}

/** A light tick when a gesture begins. Uses the v3 `gestureStart` type. */
export function gestureStart(): void {
  trigger('gestureStart');
}

/** A slightly heavier tick when a gesture completes. Uses the v3 `gestureEnd` type. */
export function gestureEnd(): void {
  trigger('gestureEnd');
}

/** A very light tick for segment control changes. Uses the v3 `segmentTick` type. */
export function segmentTick(): void {
  trigger('segmentTick');
}

/** A warm, rising pattern for toggle on. Uses the v3 `toggleOn` type. */
export function toggleOn(): void {
  trigger('toggleOn');
}

/** A cool, falling pattern for toggle off. Uses the v3 `toggleOff` type. */
export function toggleOff(): void {
  trigger('toggleOff');
}

/** A light tick for stepper increment. */
export function increment(): void {
  trigger('impactLight');
}

/** A light tick for stepper decrement. */
export function decrement(): void {
  trigger('impactLight');
}

// ─── Custom AHAP pattern shortcuts ──────────────────────────────────────────

/**
 * Fire a custom event sequence via `triggerPattern()`.
 * Used for patterns that go beyond the built-in v3 types.
 */
function firePatternEvents(events: HapticEvent[]): void {
  if (!hapticsEnabled) return;
  const mod = getHapticFeedback();
  if (!mod) return;
  try {
    mod.triggerPattern(events, defaultOptions);
  } catch {
    // Haptics not available — swallow silently.
  }
}

/**
 * Fire a custom `HapticEvent[]` sequence through the native pattern player.
 *
 * On iOS the events are rendered through Core Haptics (`CHHapticEngine`).
 * On Android the library maps the event sequence to a
 * `VibrationEffect.createWaveform` composition. Exposed so the AHAP loader
 * can play author-defined patterns alongside the built-in shortcuts.
 *
 * Safe to call from Reanimated worklets — the underlying native call is
 * synchronous and JSI-backed on the New Architecture.
 *
 * @param events - The haptic event sequence to play.
 */
export function triggerPatternEvents(events: HapticEvent[]): void {
  firePatternEvents(events);
}

/**
 * A custom pattern for success — two taps with rising intensity.
 * Communicates a significant positive outcome (offer accepted, payment
 * completed, auction won).
 */
export function successCelebration(): void {
  const definition = HapticPatternRegistry.successCelebration;
  const events = ahapToHapticEvents(definition.ahap);
  firePatternEvents(events);
}

/**
 * A custom pattern for errors — three sharp taps.
 * Communicates failure with a mechanical, urgent feel without being
 * alarming.
 */
export function errorShake(): void {
  const definition = HapticPatternRegistry.errorShake;
  const events = ahapToHapticEvents(definition.ahap);
  firePatternEvents(events);
}

// ─── Engine singleton ───────────────────────────────────────────────────────

/**
 * The HapticsEngine singleton — a stable object with all haptic methods.
 *
 * This object is referentially stable (module-level singleton) so it is safe
 * to use in dependency arrays and to share across components. Every method
 * is synchronous and worklet-compatible (the underlying native calls are
 * JSI-backed on the New Architecture).
 */
export const HapticsEngine = {
  configure,
  setEnabled,
  isEnabled,
  trigger,
  triggerImpact,
  triggerNotification,
  triggerSelection,
  triggerPatternEvents,
  confirm,
  reject,
  gestureStart,
  gestureEnd,
  segmentTick,
  toggleOn,
  toggleOff,
  increment,
  decrement,
  successCelebration,
  errorShake,
};

/**
 * Whether the haptics platform is iOS. On iOS, custom patterns use Core
 * Haptics (`CHHapticEngine`). On Android, the library uses
 * `VibrationEffect.createWaveform`.
 */
export const isHapticsPlatformIOS = isIOS;
