import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, type StyleProp, type ViewStyle } from 'react-native';
import type { AnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Video, ResizeMode } from '../../../components/compat/Video';
import { styles } from '../CreatorCameraStyles';

// ── Quick-review overlay ─────────────────────────────────────────────

export interface CameraReviewOverlayProps {
  uri: string | null;
  kind: 'image' | 'video';
  animatedStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  insets: EdgeInsets;
  isVisualSearch: boolean;
  onRetake: () => void;
  onConfirm: () => void;
}

export function CameraReviewOverlay({
  uri,
  kind,
  animatedStyle,
  insets,
  isVisualSearch,
  onRetake,
  onConfirm }: CameraReviewOverlayProps) {
  const { colors } = useAppTheme();
  if (!uri) return null;
  return (
    <Reanimated.View
      style={[
        styles.reviewOverlay,
        { backgroundColor: colors.background },
        animatedStyle,
      ]}
    >
      {kind === 'video' ? (
        // Review a recorded clip with real playback — an <Image> cannot
        // decode a local .mp4 and would render a blank frame.
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Recorded video preview"
          accessibilityHint="Plays the recorded clip on loop"
        >
          <Video
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted={false}
          />
        </View>
      ) : (
        <Image source={{ uri }} style={styles.reviewImage} />
      )}

      {/* Top scrim for close-area legibility over bright captures */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
        style={styles.reviewTopScrim}
        pointerEvents="none"
      />

      {/* Retake — top-left quiet text-only button (no icon chrome).
          Saving lives in the editor, not the camera review, so the
          only secondary affordance is retake. */}
      <Pressable
        style={({ pressed }) => [styles.reviewRetakeBtn, { top: Math.max(insets.top, 16) + 8 }, pressed && styles.reviewRetakePressed]}
        onPress={onRetake}
        hitSlop={12}
        accessibilityLabel="Retake photo"
        accessibilityHint="Discards the current photo and returns to the camera"
        accessibilityRole="button"
      >
        <Text style={[styles.reviewRetakeText, { color: colors.scrimTextPrimary }]}>Retake</Text>
      </Pressable>

      {/* Use — single confident primary action, full-width brand
          button at the bottom. One obvious next step, not a row of
          equals. */}
      <View style={[styles.reviewPrimaryWrap, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        <Pressable
          style={({ pressed }) => [styles.reviewPrimaryFullBtn, { backgroundColor: colors.textPrimary }, pressed && styles.reviewPrimaryPressed]}
          onPress={onConfirm}
          hitSlop={16}
          accessibilityLabel={isVisualSearch ? 'Search with this photo' : 'Use this photo'}
          accessibilityHint={isVisualSearch ? 'Starts a visual search with the captured photo' : 'Opens the studio editor with this photo'}
          accessibilityRole="button"
        >
          <Text style={[styles.reviewPrimaryFullLabel, { color: colors.background }]}>
            {isVisualSearch ? 'Search' : 'Use'}
          </Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
}
