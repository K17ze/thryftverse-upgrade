import React from 'react';
import { View, type StyleProp, type TextStyle } from 'react-native';
import Reanimated, { type AnimatedStyle } from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { styles } from '../CreatorCameraStyles';

// ── Countdown overlay ────────────────────────────────────────────────
// Reanimated spring scale + fade. Shows the self-timer countdown OR the
// hands-free countdown.

export interface CameraCountdownOverlayProps {
  countdown: number | null;
  handsFreeCountdown: number | null;
  textStyle: StyleProp<AnimatedStyle<TextStyle>>;
}

export function CameraCountdownOverlay({ countdown, handsFreeCountdown, textStyle }: CameraCountdownOverlayProps) {
  const { colors } = useAppTheme();
  if (countdown === null && handsFreeCountdown === null) return null;
  return (
    <View style={styles.countdownOverlay} pointerEvents="none">
      <Reanimated.Text
        style={[styles.countdownText, { color: colors.scrimTextPrimary, textShadowColor: colors.shadow }, textStyle]}
      >
        {countdown ?? handsFreeCountdown}
      </Reanimated.Text>
    </View>
  );
}
