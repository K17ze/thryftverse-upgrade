import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { type AnimatedStyle } from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { styles } from '../CreatorCameraStyles';

// ── Camera initialization loading overlay ────────────────────────────
// Shown between permission granted and cameraReady=true. A subtle
// spinner on the dark preview communicates "starting" instead of a
// black screen with no feedback.

export interface CameraInitOverlayProps {
  showInitLabel: boolean;
  spinnerStyle: StyleProp<AnimatedStyle<ViewStyle>>;
}

export function CameraInitOverlay({ showInitLabel, spinnerStyle }: CameraInitOverlayProps) {
  const { colors } = useAppTheme();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.cameraInitOverlay, { backgroundColor: colors.mediaOverlayScrim }]} />
      <View style={styles.cameraInitSpinnerWrap}>
        <Reanimated.View style={[styles.cameraInitSpinner, { borderColor: colors.scrimTextTertiary, borderTopColor: colors.scrimTextPrimary }, spinnerStyle]} />
        {showInitLabel && (
          <Text style={[styles.cameraInitLabel, { color: colors.scrimTextSecondary }]}>Starting camera</Text>
        )}
      </View>
    </View>
  );
}
