import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Reanimated, { FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AnimatedPressable } from '../AnimatedPressable';
import { createLoginScreenStyles } from './loginScreenStyles';

export interface LoginStatusFooterProps {
  infoMsg: string;
  errorMsg: string;
  onSignUpPress: () => void;
}

/**
 * Login status footer — animated info/error live regions plus the sign-up
 * switch row. Entering/exiting/layout animations honour Reduce Motion
 * exactly as the original screen did. Extraction-only, markup verbatim.
 */
export const LoginStatusFooter: React.FC<LoginStatusFooterProps> = ({
  infoMsg,
  errorMsg,
  onSignUpPress,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createLoginScreenStyles(colors), [colors]);
  const reducedMotionEnabled = useReducedMotion();

  const statusEnterAnimation = reducedMotionEnabled
    ? undefined
    : FadeInUp.springify().damping(20);
  const statusExitAnimation = reducedMotionEnabled ? undefined : FadeOutUp;
  const layoutAnimation = reducedMotionEnabled ? undefined : Layout.springify();

  return (
    <View style={styles.footer}>
      {!!infoMsg && !errorMsg && (
        <Reanimated.Text
          entering={statusEnterAnimation}
          exiting={statusExitAnimation}
          layout={layoutAnimation}
          style={styles.infoText}
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.4}
        >
          {infoMsg}
        </Reanimated.Text>
      )}

      {!!errorMsg && (
        <Reanimated.Text
          entering={statusEnterAnimation}
          exiting={statusExitAnimation}
          layout={layoutAnimation}
          style={styles.errorText}
          accessibilityLiveRegion="assertive"
          maxFontSizeMultiplier={1.4}
        >
          {errorMsg}
        </Reanimated.Text>
      )}

      <View style={styles.switchRow}>
        <Text style={styles.switchText} maxFontSizeMultiplier={1.3}>New to Thryftverse?</Text>
        <AnimatedPressable
          onPress={onSignUpPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Create account"
          accessibilityHint="Opens the sign-up screen"
        >
          <Text style={styles.switchLink} maxFontSizeMultiplier={1.3}>Create account</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
};
