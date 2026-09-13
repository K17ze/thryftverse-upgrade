import React, { useMemo } from 'react';
import { View, Keyboard } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppInput } from '../ui/AppInput';
import { AppButton } from '../ui/AppButton';
import { LoginOtpTwoFactorFields } from './LoginTwoFactorFields';
import { createLoginScreenStyles } from './loginScreenStyles';

export interface LoginOtpSectionProps {
  otpCode: string;
  onOtpCodeChange: (value: string) => void;
  canVerifyOtp: boolean;
  isOtpVerifying: boolean;
  onVerifyOtp: () => void;
  otpTwoFactorRequired: boolean;
  otpUseRecovery: boolean;
  otpTwoFactorCode: string;
  onOtpTwoFactorCodeChange: (value: string) => void;
  otpRecoveryCode: string;
  onOtpRecoveryCodeChange: (value: string) => void;
  onToggleOtpUseRecovery: () => void;
  isOtpTwoFactorVerifying: boolean;
  onVerifyOtpTwoFactor: () => void;
  onCancelOtpTwoFactor: () => void;
}

/**
 * OTP challenge block — code entry, verify action, and the inline 2FA
 * retry challenge when the backend answers TWO_FACTOR_REQUIRED. Rendered
 * only while an OTP challengeId is active. Extraction-only, markup verbatim.
 */
export const LoginOtpSection: React.FC<LoginOtpSectionProps> = ({
  otpCode,
  onOtpCodeChange,
  canVerifyOtp,
  isOtpVerifying,
  onVerifyOtp,
  otpTwoFactorRequired,
  otpUseRecovery,
  otpTwoFactorCode,
  onOtpTwoFactorCodeChange,
  otpRecoveryCode,
  onOtpRecoveryCodeChange,
  onToggleOtpUseRecovery,
  isOtpTwoFactorVerifying,
  onVerifyOtpTwoFactor,
  onCancelOtpTwoFactor,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createLoginScreenStyles(colors), [colors]);

  return (
    <View style={styles.otpGroup}>
      <AppInput
        label="One-time code"
        placeholder="Enter OTP"
        keyboardType="number-pad"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={10}
        value={otpCode}
        onChangeText={onOtpCodeChange}
        onSubmitEditing={() => {
          Keyboard.dismiss();
          if (canVerifyOtp) {
            void onVerifyOtp();
          }
        }}
      />

      <AppButton
        title={isOtpVerifying ? 'Verifying...' : 'Verify OTP & Log In'}
        style={[styles.otpVerifyBtn, !canVerifyOtp && styles.primaryBtnDisabled]}
        titleStyle={styles.otpVerifyText}
        variant="primary"
        size="md"
        onPress={onVerifyOtp}
        disabled={!canVerifyOtp}
        accessibilityLabel="Verify OTP and log in"
        hapticFeedback="medium"
      />

      {otpTwoFactorRequired ? (
        <LoginOtpTwoFactorFields
          otpUseRecovery={otpUseRecovery}
          otpTwoFactorCode={otpTwoFactorCode}
          onOtpTwoFactorCodeChange={onOtpTwoFactorCodeChange}
          otpRecoveryCode={otpRecoveryCode}
          onOtpRecoveryCodeChange={onOtpRecoveryCodeChange}
          onToggleUseRecovery={onToggleOtpUseRecovery}
          isVerifying={isOtpTwoFactorVerifying}
          onVerify={onVerifyOtpTwoFactor}
          onCancel={onCancelOtpTwoFactor}
        />
      ) : null}
    </View>
  );
};
