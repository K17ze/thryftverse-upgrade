import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { HapticPatterns } from '../utils/hapticPatterns';

const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

const haptic = {
  light: () => {
    if (isSupported) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium: () => {
    if (isSupported) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy: () => {
    if (isSupported) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  success: () => {
    if (isSupported) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  error: () => {
    if (isSupported) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
  warning: () => {
    if (isSupported) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  selection: () => {
    if (isSupported) Haptics.selectionAsync().catch(() => {});
  },
  // Compound "haptics-as-language" gesture patterns. Each entry composes
  // the primitives above into a timed sequence that communicates a
  // specific UI event (like, purchase, bid, outbid, save, etc.).
  // See utils/hapticPatterns.ts for the full vocabulary.
  patterns: HapticPatterns,
};

export function useHaptic() {
  return haptic;
}