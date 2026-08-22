/**
 * Barrel export for the ThryftVerse Core Haptics abstraction.
 *
 * This module provides a superset of the expo-haptics API built on
 * react-native-haptic-feedback v3 (Core Haptics on iOS, VibrationEffect
 * on Android).
 *
 * @example
 * // Hook-based usage (React components)
 * import { useHaptics } from '@/platform/haptics';
 * const haptics = useHaptics();
 * haptics.confirm();
 *
 * @example
 * // Direct engine usage (worklets, non-React code)
 * import { HapticsEngine } from '@/platform/haptics';
 * HapticsEngine.toggleOn();
 *
 * @example
 * // Migration from expo-haptics
 * // Before: Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
 * // After:  haptics.impact('light')
 */

// Engine — direct access for worklets and non-React code
export {
  HapticsEngine,
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
  isHapticsPlatformIOS,
} from './HapticsEngine';

// React hook
export { useHaptics } from './useHaptics';

// Pattern registry and conversion utility
export { HapticPatternRegistry, ahapToHapticEvents } from './hapticPatterns';

// AHAP file loader and cross-platform pattern player
export { loadAhapPattern, playAhapPattern } from './ahapLoader';

// Types
export type {
  HapticImpactStyle,
  HapticNotificationType,
  HapticPattern,
  AndroidVibrationPattern,
  AhapEventParameterID,
  AhapDynamicParameterID,
  AhapEventParameterValue,
  AhapParameterCurveControlPoint,
  AhapEventPattern,
  AhapParameterCurvePattern,
  AhapPattern,
  CrossPlatformHapticPattern,
  HapticsEngineConfig,
  HapticsAPI,
} from './types';
