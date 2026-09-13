import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { createLoginScreenStyles } from './loginScreenStyles';

export interface LoginSocialSectionProps {
  socialLoading: 'google' | 'apple' | null;
  isSubmitting: boolean;
  hasGoogleOAuth: boolean;
  onAppleSignIn: () => void;
  onGoogleSignIn: () => void;
}

/**
 * Social sign-in row — Apple always, Google only when OAuth client ids are
 * configured. Extraction-only: divider copy, a11y labels/hints, disabled and
 * loading treatment are verbatim from the original screen.
 */
export const LoginSocialSection: React.FC<LoginSocialSectionProps> = ({
  socialLoading,
  isSubmitting,
  hasGoogleOAuth,
  onAppleSignIn,
  onGoogleSignIn,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createLoginScreenStyles(colors), [colors]);
  const disabled = !!socialLoading || isSubmitting;

  return (
    <>
      {/* Social login — per 2026 research, social sign-in below the
          primary email/password path gives users a low-friction
          alternative. Full-width labeled buttons, not icon circles. */}
      <View style={styles.socialDivider}>
        <View style={styles.socialDividerLine} />
        <Text style={styles.socialDividerText} maxFontSizeMultiplier={1.3}>or continue with</Text>
        <View style={styles.socialDividerLine} />
      </View>

      <View style={styles.socialGroup}>
        <AnimatedPressable
          style={[styles.socialFullBtn, disabled && styles.socialBtnDisabled]}
          activeOpacity={0.85}
          onPress={onAppleSignIn}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
          accessibilityHint="Sign in using your Apple ID"
        >
          {socialLoading === 'apple' ? (
            <ActivityIndicator color={colors.textPrimary} size="small" />
          ) : (
            <>
              <Ionicons name="logo-apple" size={20} color={colors.textPrimary} />
              <Text style={styles.socialFullText} maxFontSizeMultiplier={1.2}>Continue with Apple</Text>
            </>
          )}
        </AnimatedPressable>

        {hasGoogleOAuth ? (
          <AnimatedPressable
            style={[styles.socialFullBtn, disabled && styles.socialBtnDisabled]}
            activeOpacity={0.85}
            onPress={onGoogleSignIn}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            accessibilityHint="Sign in using your Google account"
          >
            {socialLoading === 'google' ? (
              <ActivityIndicator color={colors.textPrimary} size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
                <Text style={styles.socialFullText} maxFontSizeMultiplier={1.2}>Continue with Google</Text>
              </>
            )}
          </AnimatedPressable>
        ) : null}
      </View>
    </>
  );
};
