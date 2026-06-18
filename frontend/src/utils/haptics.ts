import * as Haptics from 'expo-haptics';

export enum HapticType {
  LIGHT = 'light',
  MEDIUM = 'medium',
  HEAVY = 'heavy',
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
}

/**
 * Trigger haptic feedback for better UX
 * @param type - Type of haptic feedback
 */
export async function triggerHaptic(type: HapticType): Promise<void> {
  try {
    switch (type) {
      case HapticType.LIGHT:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case HapticType.MEDIUM:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case HapticType.HEAVY:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case HapticType.SUCCESS:
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case HapticType.ERROR:
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case HapticType.WARNING:
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
    }
  } catch (e) {
    // Haptics not available on all devices
    console.warn('Haptics not available:', e);
  }
}

/**
 * Quick haptic helpers for common interactions
 */
export const haptics = {
  tap: () => triggerHaptic(HapticType.LIGHT),
  press: () => triggerHaptic(HapticType.MEDIUM),
  success: () => triggerHaptic(HapticType.SUCCESS),
  error: () => triggerHaptic(HapticType.ERROR),
  like: () => triggerHaptic(HapticType.MEDIUM),
  save: () => triggerHaptic(HapticType.SUCCESS),

  // NEW: Signature tactile vocabulary for ThryftVerse
  scrollSnap: () => triggerHaptic(HapticType.LIGHT),
  priceTick: () => triggerHaptic(HapticType.LIGHT),
  imagePeek: () => triggerHaptic(HapticType.LIGHT),
  auctionTick: () => triggerHaptic(HapticType.WARNING),
  coOwnPulse: () => triggerHaptic(HapticType.MEDIUM),
  bundleAdd: () => triggerHaptic(HapticType.SUCCESS),
  glassTap: () => triggerHaptic(HapticType.LIGHT),
  heavyPress: () => triggerHaptic(HapticType.HEAVY),
  warning: () => triggerHaptic(HapticType.WARNING),
  selection: () => triggerHaptic(HapticType.LIGHT),
};

/**
 * Map a pressable scale value to the most appropriate haptic intensity.
 * Used by AnimatedPressable when autoHaptic is enabled.
 */
export function hapticForScale(scale: number): HapticType {
  if (scale <= 0.92) return HapticType.HEAVY;
  if (scale <= 0.95) return HapticType.MEDIUM;
  if (scale <= 0.97) return HapticType.LIGHT;
  return HapticType.LIGHT;
}