import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Linking } from 'react-native';
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Typography, Radius, Type, Space } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';

export interface PermissionStateProps {
  /**
   * Permission status:
   *   - `loading`     — permission not yet resolved (spinner).
   *   - `denied`      — permanently denied (Settings CTA).
   *   - `undetermined`— not yet asked (enable CTA).
   */
  status: 'loading' | 'denied' | 'undetermined';
  /** Whether the poster mode is active (drives the empty-state copy). */
  isPoster: boolean;
  /** Entrance progress 0→1 — drives the spring slide-up + fade. */
  entrance: SharedValue<number>;
  /** Called when the user taps the primary enable/Settings CTA. */
  onEnable: () => void;
  /** Called when the user picks the gallery fallback. */
  onGallery: () => void;
}

/**
 * Camera permission states with art-directed empty states.
 *
 * Three states are handled:
 *   1. **loading** — a centred spinner on the black overlay.
 *   2. **denied** — the user permanently denied access; a Settings deep-link
 *      CTA plus a gallery fallback.
 *   3. **undetermined** — permission has not been asked for yet; an enable
 *      CTA plus a gallery fallback.
 *
 * The denied/undetermined cards spring up + fade in via `entrance`.
 */
export function PermissionState({
  status,
  isPoster,
  entrance,
  onEnable,
  onGallery,
}: PermissionStateProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: interpolate(entrance.value, [0, 1], [24, 0], Extrapolation.CLAMP) },
    ],
  }));

  if (status === 'loading') {
    return (
      <View style={styles.overlay}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  const isDenied = status === 'denied';

  return (
    <View style={styles.overlay}>
      <Reanimated.View style={[styles.content, entranceStyle]}>
        <View style={styles.iconWrap}>
          <Ionicons name="camera-outline" size={48} color={colors.textPrimary} />
        </View>
        <Text style={styles.title}>
          {isDenied ? 'Camera access needed' : 'Access your camera'}
        </Text>
        <Text style={styles.text}>
          {isDenied
            ? `Enable camera permission in Settings to capture ${isPoster ? 'your story' : 'your look'}.`
            : `Capture photos and videos directly for your ${isPoster ? 'story' : 'look'}.`}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={onEnable}
        >
          <Text style={styles.btnText}>Enable Camera</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.galleryFallbackBtn, pressed && styles.btnPressed]}
          onPress={onGallery}
        >
          <Ionicons name="images-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.galleryFallbackText}>Use gallery instead</Text>
        </Pressable>
      </Reanimated.View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 18,
    color: colors.textPrimary,
    marginTop: Space.xs,
  },
  text: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    marginTop: Space.md,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: Radius.xxl,
    backgroundColor: colors.textPrimary,
  },
  btnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    color: colors.background,
  },
  galleryFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radius.full,
    backgroundColor: colors.surface,
  },
  galleryFallbackText: {
    color: colors.textSecondary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});

// Re-export Linking for callers that want the open-settings helper.
export { Linking };
