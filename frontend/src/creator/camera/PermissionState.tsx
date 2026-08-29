import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import { Radius, Space, FontFamily } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';

export interface PermissionStateProps {
  /**
   * Permission status:
   *   - `loading`       — permission not yet resolved (spinner).
   *   - `denied`        — permanently denied (Settings CTA).
   *   - `undetermined`  — not yet asked (enable CTA).
   *   - `unavailable`   — no camera hardware on this device (gallery fallback only).
   */
  status: 'loading' | 'denied' | 'undetermined' | 'unavailable';
  /** Whether the poster mode is active (drives the empty-state copy). */
  isPoster: boolean;
  /** Entrance progress 0→1 — drives the spring slide-up + fade. */
  entrance: SharedValue<number>;
  /** Called when the user taps the primary enable/Settings CTA.
   *  Not rendered for the `unavailable` status. */
  onEnable: () => void;
  /** Called when the user picks the gallery fallback. */
  onGallery: () => void;
}

/**
 * Camera permission states with art-directed empty states.
 *
 * Four states are handled:
 *   1. **loading** — a centred spinner on the black overlay.
 *   2. **denied** — the user permanently denied access; a Settings deep-link
 *      CTA plus a gallery fallback.
 *   3. **undetermined** — permission has not been asked for yet; an enable
 *      CTA plus a gallery fallback.
 *   4. **unavailable** — no camera hardware on this device (e.g. simulator);
 *      a camera-outline icon, an informational message, and a gallery
 *      fallback. No Settings CTA — Settings cannot add camera hardware.
 *
 * The denied/undetermined/unavailable cards spring up + fade in via `entrance`.
 */
export function PermissionState({
  status,
  isPoster,
  entrance,
  onEnable,
  onGallery }: PermissionStateProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: interpolate(entrance.value, [0, 1], [24, 0], Extrapolation.CLAMP) },
    ] }));

  if (status === 'loading') {
    return (
      <View style={styles.overlay}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  // ── No camera hardware (simulator or device without a camera) ──
  // Distinct from permission-denied: Settings cannot fix missing hardware,
  // so there is no Settings CTA — only the gallery fallback so the user
  // can still create content.
  if (status === 'unavailable') {
    return (
      <View style={styles.overlay}>
        <Reanimated.View style={[styles.content, entranceStyle]} accessibilityRole="text" accessibilityLabel="Camera not available on this device">
          <Ionicons name="camera-outline" size={IconGrammar.hero} color={colors.textSecondary} style={styles.unavailableIcon} />
          <Text style={styles.title}>Camera not available</Text>
          <Text style={styles.text}>
            {`This device doesn't have a camera. You can still create ${isPoster ? 'your story' : 'your look'} from your gallery.`}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.galleryFallbackBtn, pressed && styles.btnPressed]}
            onPress={onGallery}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
            accessibilityHint="Opens your photo gallery so you can pick media to create with"
          >
            <Text style={styles.galleryFallbackText}>Choose from gallery</Text>
          </Pressable>
        </Reanimated.View>
      </View>
    );
  }

  const isDenied = status === 'denied';

  return (
    <View style={styles.overlay}>
      <Reanimated.View style={[styles.content, entranceStyle]}>
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
          accessibilityRole="button"
          accessibilityLabel={isDenied ? 'Open camera settings' : 'Enable camera'}
          accessibilityHint={
            isDenied
              ? 'Opens device settings so you can allow camera access'
              : 'Requests permission to use the camera'
          }
        >
          <Text style={styles.btnText}>{isDenied ? 'Open Settings' : 'Enable Camera'}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.galleryFallbackBtn, pressed && styles.btnPressed]}
          onPress={onGallery}
          accessibilityRole="button"
          accessibilityLabel="Use gallery instead"
        >
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
    justifyContent: 'center' },
  content: {
    alignItems: 'center',
    gap: Space.smMd,
    paddingHorizontal: 40 },
  unavailableIcon: {
    marginBottom: Space.xs },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    color: colors.textPrimary,
    marginTop: Space.xs },
  text: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    color: colors.textSecondary,
    textAlign: 'center' },
  btn: {
    marginTop: Space.md,
    height: 50,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center' },
  btnText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    color: colors.textInverse },
  galleryFallbackBtn: {
    marginTop: Space.sm,
    height: 44,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    justifyContent: 'center' },
  galleryFallbackText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }] } });

// Re-export Linking for callers that want the open-settings helper.
export { Linking };
