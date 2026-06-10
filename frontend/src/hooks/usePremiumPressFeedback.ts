import React from 'react';
import { useHaptic } from './useHaptic';

export type PressFeedbackIntensity = 'subtle' | 'standard' | 'emphatic' | 'none';

interface PressFeedbackConfig {
  /** Scale multiplier on press (default 0.97 for standard) */
  scaleValue?: number;
  /** Opacity on press (default undefined = no opacity change) */
  activeOpacity?: number;
  /** Haptic intensity */
  haptic?: PressFeedbackIntensity;
  /** Whether to trigger haptic on pressIn (default) or press */
  hapticTiming?: 'pressIn' | 'press';
}

const INTENSITY_MAP: Record<PressFeedbackIntensity, { scale: number; haptic: 'light' | 'medium' | 'heavy' | 'none' }> = {
  subtle: { scale: 0.985, haptic: 'light' },
  standard: { scale: 0.97, haptic: 'medium' },
  emphatic: { scale: 0.95, haptic: 'heavy' },
  none: { scale: 1, haptic: 'none' },
};

/**
 * Returns consistent press feedback props for AnimatedPressable.
 *
 * Usage:
 *   const pressFeedback = usePremiumPressFeedback('standard');
 *   <AnimatedPressable {...pressFeedback} onPress={handlePress}>
 */
export function usePremiumPressFeedback(
  intensity: PressFeedbackIntensity = 'standard',
  overrides?: Partial<PressFeedbackConfig>
): {
  scaleValue: number;
  activeOpacity?: number;
  hapticFeedback: 'none' | 'light' | 'medium' | 'heavy' | 'selection';
  disableAnimation: boolean;
} {
  const config = INTENSITY_MAP[intensity];

  return React.useMemo(
    () => ({
      scaleValue: overrides?.scaleValue ?? config.scale,
      activeOpacity: overrides?.activeOpacity,
      hapticFeedback: overrides?.haptic === 'none' ? 'none' : (overrides?.haptic ?? config.haptic) as any,
      disableAnimation: false,
    }),
    [config.scale, config.haptic, overrides]
  );
}

/**
 * Pre-built press feedback presets for common component types.
 */
export const PressPresets = {
  /** Product cards, board cards, image tiles */
  card: {
    scaleValue: 0.97,
    activeOpacity: 0.92,
    hapticFeedback: 'light' as const,
    disableAnimation: false,
  },
  /** Small icon buttons, save buttons */
  iconButton: {
    scaleValue: 0.88,
    activeOpacity: 0.8,
    hapticFeedback: 'light' as const,
    disableAnimation: false,
  },
  /** Primary CTA buttons */
  primaryButton: {
    scaleValue: 0.985,
    activeOpacity: 0.9,
    hapticFeedback: 'medium' as const,
    disableAnimation: false,
  },
  /** Destructive actions */
  destructive: {
    scaleValue: 0.98,
    activeOpacity: 0.85,
    hapticFeedback: 'heavy' as const,
    disableAnimation: false,
  },
  /** List rows, settings rows */
  listRow: {
    scaleValue: 0.99,
    activeOpacity: 0.95,
    hapticFeedback: 'light' as const,
    disableAnimation: false,
  },
  /** Tab rail items */
  tabItem: {
    scaleValue: 0.96,
    activeOpacity: 0.9,
    hapticFeedback: 'selection' as const,
    disableAnimation: false,
  },
} as const;
