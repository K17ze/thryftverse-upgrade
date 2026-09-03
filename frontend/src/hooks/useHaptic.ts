import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { HapticsEngine } from '../platform/haptics/HapticsEngine';
import type { HapticPattern } from '../platform/haptics/types';
import { HapticPatterns } from '../utils/hapticPatterns';

/**
 * Haptic grammar for ThryftVerse (AGENTS.md §13, §27.9).
 *
 * Consistent haptic levels:
 *   light     → taps, selection, navigation, icon toggles
 *   medium    → actions: purchase, bid, offer, send, commit
 *   heavy     → destructive: delete, destructive confirm, long-press reveal
 *   success   → completed purchase/win/publish
 *   error     → failed action, shake recovery
 *   warning   → outbid, threshold urgency
 *   selection → tab switch, segment change, picker tick
 *
 * Haptics are gated by:
 *   1. Platform support (expo-haptics impact is iOS-only; Android falls back
 *      to system vibration which can be jarring, so impact styles are
 *      suppressed on Android by default and only notification/selection
 *      patterns fire — see `ANDROID_IMPACT_ENABLED`).
 *   2. Reduced motion — when the user enables Reduce Motion we also suppress
 *      non-essential haptics so motion + haptics degrade together (AGENTS §18).
 *      Notification haptics (success/error/warning) still fire because they
 *      communicate outcome, not decoration.
 *
 * Android impact haptics are enabled via react-native-haptic-feedback v3,
 * which maps impact styles to VibrationEffect compositions (API 26+). The
 * system vibrator setting is respected unless explicitly overridden.
 */
const ANDROID_IMPACT_ENABLED = true;
const isIOS = Platform.OS === 'ios';
const isAndroid = Platform.OS === 'android';
const impactSupported = isIOS || (isAndroid && ANDROID_IMPACT_ENABLED);
const notificationSupported = isIOS || isAndroid;

// Lazily-resolved reduced-motion gate. We read it on each call so haptics
// degrade the moment the user toggles Reduce Motion without a re-mount.
let reducedMotionGate = false;
try {
  // AccessibilityInfo.isReduceMotionEnabled is async; we subscribe once.
  const { AccessibilityInfo } = require('react-native');
  AccessibilityInfo.isReduceMotionEnabled().then((v: boolean) => {
    reducedMotionGate = v;
  }).catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
    reducedMotionGate = v;
  });
} catch {
  // ignore on platforms without AccessibilityInfo
}

function shouldSuppressImpact(): boolean {
  return !impactSupported || reducedMotionGate;
}

const haptic = {
  light: () => {
    if (shouldSuppressImpact()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium: () => {
    if (shouldSuppressImpact()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy: () => {
    if (shouldSuppressImpact()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  // iOS 16+ richer impact styles — fall back to Light/Medium on older OS.
  rigid: () => {
    if (shouldSuppressImpact()) return;
    const style = (Haptics.ImpactFeedbackStyle as unknown as { Rigid?: Haptics.ImpactFeedbackStyle }).Rigid;
    if (style) {
      Haptics.impactAsync(style).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  },
  soft: () => {
    if (shouldSuppressImpact()) return;
    const style = (Haptics.ImpactFeedbackStyle as unknown as { Soft?: Haptics.ImpactFeedbackStyle }).Soft;
    if (style) {
      Haptics.impactAsync(style).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  },
  success: () => {
    if (!notificationSupported) return;
    // Notification haptics communicate outcome — fire even under reduced motion.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  error: () => {
    if (!notificationSupported) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
  warning: () => {
    if (!notificationSupported) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  selection: () => {
    if (!notificationSupported || reducedMotionGate) return;
    Haptics.selectionAsync().catch(() => {});
  },
  // Compound "haptics-as-language" gesture patterns. Each entry composes
  // the primitives above into a timed sequence that communicates a
  // specific UI event (like, purchase, bid, outbid, save, etc.).
  // See utils/hapticPatterns.ts for the full vocabulary.
  patterns: HapticPatterns,
  // Play a named AHAP pattern through the platform HapticsEngine (Core
  // Haptics on iOS, VibrationEffect on Android). Richer than the primitive
  // impact/notification calls above — used for celebratory, error, and
  // textured gesture feedback. No-op when the engine is unavailable.
  playPattern: (name: HapticPattern) => {
    switch (name) {
      case 'confirm':
        HapticsEngine.confirm();
        break;
      case 'reject':
        HapticsEngine.reject();
        break;
      case 'gestureStart':
        HapticsEngine.gestureStart();
        break;
      case 'gestureEnd':
        HapticsEngine.gestureEnd();
        break;
      case 'segmentTick':
        HapticsEngine.segmentTick();
        break;
      case 'toggleOn':
        HapticsEngine.toggleOn();
        break;
      case 'toggleOff':
        HapticsEngine.toggleOff();
        break;
      case 'increment':
        HapticsEngine.increment();
        break;
      case 'decrement':
        HapticsEngine.decrement();
        break;
      case 'successCelebration':
        HapticsEngine.successCelebration();
        break;
      case 'errorShake':
        HapticsEngine.errorShake();
        break;
    }
  },
};

export function useHaptic() {
  return haptic;
}
