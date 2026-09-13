import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Control } from '../../theme/designTokens';
import { AppInput } from '../ui/AppInput';
import { AppButton } from '../ui/AppButton';
import { createLoginScreenStyles } from './loginScreenStyles';

/** Shared trust header for both 2FA challenge blocks — identical markup in
 *  the original screen, extracted once to keep the two blocks in sync. */
function TwoFactorHeader() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createLoginScreenStyles(colors), [colors]);
  return (
    <View style={styles.twoFactorHeader}>
      <View style={[styles.twoFactorIcon, { backgroundColor: colors.commerceTrustSubtle }]}>
        <Ionicons name="checkmark-circle-outline" size={16} color={colors.commerceTrust} />
      </View>
      <Text style={styles.twoFactorTitle} maxFontSizeMultiplier={1.3}>Two-factor authentication</Text>
    </View>
  );
}

export interface LoginTwoFactorFieldsProps {
  twoFactorCode: string;
  onTwoFactorCodeChange: (value: string) => void;
  recoveryCode: string;
  onRecoveryCodeChange: (value: string) => void;
}

/**
 * Inline 2FA challenge for the password-login flow — authenticator code plus
 * an optional recovery code. Rendered only when the backend answers with a
 * two-factor error code; extraction-only, markup verbatim.
 */
export const LoginTwoFactorFields: React.FC<LoginTwoFactorFieldsProps> = ({
  twoFactorCode,
  onTwoFactorCodeChange,
  recoveryCode,
  onRecoveryCodeChange,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createLoginScreenStyles(colors), [colors]);
  return (
    <View style={styles.twoFactorGroup}>
      <TwoFactorHeader />
      <AppInput
        label="Authenticator code"
        placeholder="123456"
        keyboardType="number-pad"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={6}
        value={twoFactorCode}
        onChangeText={onTwoFactorCodeChange}
      />

      <Text style={styles.twoFactorHint} maxFontSizeMultiplier={1.3}>
        Lost access? Use a recovery code below instead.
      </Text>

      <AppInput
        label="Recovery code (optional)"
        placeholder="ABCD-1234"
        autoCapitalize="characters"
        autoCorrect={false}
        value={recoveryCode}
        onChangeText={onRecoveryCodeChange}
      />
    </View>
  );
};

export interface LoginOtpTwoFactorFieldsProps {
  otpUseRecovery: boolean;
  otpTwoFactorCode: string;
  onOtpTwoFactorCodeChange: (value: string) => void;
  otpRecoveryCode: string;
  onOtpRecoveryCodeChange: (value: string) => void;
  onToggleUseRecovery: () => void;
  isVerifying: boolean;
  onVerify: () => void;
  onCancel: () => void;
}

/**
 * Inline 2FA challenge for the OTP flow. The backend does NOT consume the
 * OTP challenge when TWO_FACTOR_REQUIRED is returned, so the same
 * challengeId + OTP code are retried with the code collected here.
 * Extraction-only — markup, labels and hitSlop verbatim.
 */
export const LoginOtpTwoFactorFields: React.FC<LoginOtpTwoFactorFieldsProps> = ({
  otpUseRecovery,
  otpTwoFactorCode,
  onOtpTwoFactorCodeChange,
  otpRecoveryCode,
  onOtpRecoveryCodeChange,
  onToggleUseRecovery,
  isVerifying,
  onVerify,
  onCancel,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createLoginScreenStyles(colors), [colors]);
  return (
    <View style={styles.otpTwoFactorGroup}>
      <TwoFactorHeader />
      <Text style={styles.otpTwoFactorBody} maxFontSizeMultiplier={1.3}>
        Enter the code from your authenticator app to continue signing in.
      </Text>

      {otpUseRecovery ? (
        <AppInput
          label="Recovery code"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect={false}
          value={otpRecoveryCode}
          onChangeText={onOtpRecoveryCodeChange}
        />
      ) : (
        <AppInput
          label="Authenticator code"
          placeholder="000000"
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={6}
          autoFocus
          value={otpTwoFactorCode}
          onChangeText={onOtpTwoFactorCodeChange}
        />
      )}

      <Pressable
        onPress={onToggleUseRecovery}
        hitSlop={Control.hit / 2}
        accessibilityRole="button"
        accessibilityLabel={otpUseRecovery ? 'Use authenticator code instead' : 'Use recovery code instead'}
        style={styles.otpTwoFactorToggle}
      >
        <Text style={styles.otpTwoFactorToggleText} maxFontSizeMultiplier={1.3}>
          {otpUseRecovery ? 'Use authenticator code' : 'Use recovery code'}
        </Text>
      </Pressable>

      <AppButton
        title={isVerifying ? 'Verifying...' : 'Verify'}
        style={styles.otpVerifyBtn}
        titleStyle={styles.otpVerifyText}
        variant="primary"
        size="md"
        onPress={onVerify}
        disabled={isVerifying}
        loading={isVerifying}
        accessibilityLabel="Verify two-factor code"
        hapticFeedback="medium"
      />

      <Pressable
        onPress={onCancel}
        hitSlop={Control.hit / 2}
        accessibilityRole="button"
        accessibilityLabel="Cancel two-factor"
        accessibilityHint="Returns to the OTP input"
        style={styles.otpTwoFactorCancel}
      >
        <Text style={styles.otpTwoFactorCancelText} maxFontSizeMultiplier={1.3}>
          Cancel
        </Text>
      </Pressable>
    </View>
  );
};
