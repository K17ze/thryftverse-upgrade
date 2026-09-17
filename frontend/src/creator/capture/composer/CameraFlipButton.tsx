import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { styles } from '../CreatorCameraStyles';

// ── Flip camera ──────────────────────────────────────────────────────
// Transparent 44pt target. The bottom scrim provides legibility; no
// persistent dark plate.

export interface CameraFlipButtonProps {
  onPress: () => void;
}

export function CameraFlipButton({ onPress }: CameraFlipButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      style={({ pressed }) => [styles.flipBtn, pressed && { backgroundColor: colors.scrimTextTertiary, transform: [{ scale: 0.97 }] }]}
      onPress={onPress}
      hitSlop={12}
      accessibilityLabel="Flip camera"
      accessibilityHint="Switches between front and back camera"
      accessibilityRole="button"
    >
      <Ionicons name="camera-reverse-outline" size={22} color={colors.scrimTextPrimary} />
    </Pressable>
  );
}
