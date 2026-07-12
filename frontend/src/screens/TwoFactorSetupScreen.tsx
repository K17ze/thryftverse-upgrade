import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  TextInput,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import { requestTwoFactorEnrollment, verifyTwoFactorEnrollment, disableTwoFactor } from '../services/authApi';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { FlagshipStickyFooter } from '../components/flagship/FlagshipStickyFooter';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import QRCode from 'qrcode';
import * as Clipboard from 'expo-clipboard';

type Props = StackScreenProps<RootStackParamList, 'TwoFactorSetup'>;

type Phase = 'setup' | 'verify' | 'recovery' | 'disable' | 'disable-confirm';

const OTP_CELLS = 6;

export default function TwoFactorSetupScreen({ navigation }: Props) {
  const { show } = useToast();
  const haptic = useHaptic();
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const setTwoFactorEnabled = useStore((state) => state.setTwoFactorEnabled);

  const [phase, setPhase] = useState<Phase>(twoFactorEnabled ? 'disable' : 'setup');
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isLoadingEnrollment, setIsLoadingEnrollment] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showManualKey, setShowManualKey] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [codesCopied, setCodesCopied] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableRecoveryCode, setDisableRecoveryCode] = useState('');
  const [isDisabling, setIsDisabling] = useState(false);

  const otpRefs = useRef<(TextInput | null)[]>([]);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_CELLS).fill(''));

  const canVerify = otpDigits.join('').length === OTP_CELLS && !isLoadingEnrollment && !isVerifying;
  const canDisable = (disableCode.trim().length > 0 || disableRecoveryCode.trim().length > 0) && !isDisabling;

  // ── Sensitive value cleanup on unmount ──
  useEffect(() => {
    return () => {
      setManualKey('');
      setOtpauthUrl('');
      setQrDataUrl('');
      setCode('');
      setOtpDigits(Array(OTP_CELLS).fill(''));
      setRecoveryCodes([]);
      setDisableCode('');
      setDisableRecoveryCode('');
    };
  }, []);

  const fetchEnrollment = useCallback(async () => {
    setIsLoadingEnrollment(true);
    setErrorMsg('');
    setQrDataUrl('');
    setManualKey('');
    setOtpauthUrl('');
    try {
      const result = await requestTwoFactorEnrollment();
      setManualKey(result.secret);
      setOtpauthUrl(result.otpauthUrl);
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to start two-factor setup.');
      setErrorMsg(parsed.message);
    } finally {
      setIsLoadingEnrollment(false);
    }
  }, []);

  useEffect(() => {
    if (phase === 'setup' && !twoFactorEnabled) {
      void fetchEnrollment();
    }
  }, [phase, twoFactorEnabled, fetchEnrollment]);

  useEffect(() => {
    if (!otpauthUrl) return;
    let cancelled = false;
    QRCode.toDataURL(otpauthUrl, { width: 240, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => { cancelled = true; };
  }, [otpauthUrl]);

  // ── OTP cell handling ──
  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (errorMsg) setErrorMsg('');
    if (digit && index < OTP_CELLS - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_CELLS).split('');
    const next = Array(OTP_CELLS).fill('');
    digits.forEach((d, i) => { next[i] = d; });
    setOtpDigits(next);
    if (digits.length > 0) {
      otpRefs.current[Math.min(digits.length, OTP_CELLS - 1)]?.focus();
    }
  };

  const handleCopyKey = async () => {
    if (!manualKey) return;
    await Clipboard.setStringAsync(manualKey);
    show('Manual key copied', 'success');
  };

  const handleVerify = async () => {
    const fullCode = otpDigits.join('');
    if (fullCode.length !== OTP_CELLS) {
      setErrorMsg('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setErrorMsg('');
    setIsVerifying(true);
    try {
      const result = await verifyTwoFactorEnrollment(fullCode);
      setTwoFactorEnabled(true);
      setRecoveryCodes(result.recoveryCodes);
      setPhase('recovery');
      haptic.medium();
      show('Two-factor authentication enabled', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to verify the provided code.');
      setErrorMsg(parsed.message);
      haptic.light();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyRecoveryCodes = async () => {
    if (recoveryCodes.length === 0) return;
    await Clipboard.setStringAsync(recoveryCodes.join('\n'));
    setCodesCopied(true);
    show('Recovery codes copied', 'success');
    setTimeout(() => setCodesCopied(false), 3000);
  };

  const handleRecoveryDone = () => {
    // Clear sensitive recovery codes from state before leaving
    setRecoveryCodes([]);
    setManualKey('');
    setOtpauthUrl('');
    setQrDataUrl('');
    setOtpDigits(Array(OTP_CELLS).fill(''));
    navigation.goBack();
  };

  const handleDisable2FA = async () => {
    const normalizedCode = disableCode.replace(/\s+/g, '').trim();
    const normalizedRecovery = disableRecoveryCode.trim().toUpperCase();
    if (!normalizedCode && !normalizedRecovery) {
      show('Enter your authenticator code or a recovery code.', 'error');
      return;
    }
    setIsDisabling(true);
    try {
      await disableTwoFactor({
        code: normalizedCode || undefined,
        recoveryCode: normalizedRecovery || undefined,
      });
      setTwoFactorEnabled(false);
      haptic.medium();
      show('Two-factor authentication disabled', 'info');
      navigation.goBack();
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to disable two-factor authentication.');
      show(parsed.message, 'error');
      haptic.light();
    } finally {
      setIsDisabling(false);
    }
  };

  const handleBack = () => {
    if (phase === 'verify') {
      setPhase('setup');
    } else if (phase === 'recovery') {
      handleRecoveryDone();
    } else if (phase === 'disable-confirm') {
      setDisableCode('');
      setDisableRecoveryCode('');
      setPhase('disable');
    } else {
      navigation.goBack();
    }
  };

  // ── Phase: disable (overview when 2FA is already enabled) ──
  const renderDisableOverview = () => (
    <>
      <View style={styles.phaseIntro}>
        <View style={[styles.statusBadge, { backgroundColor: `${Colors.success}15` }]}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
          <Text style={[styles.statusBadgeText, { color: Colors.success }]}>Protected</Text>
        </View>
        <Text style={styles.phaseTitle}>Two-factor authentication is on</Text>
        <Text style={[styles.phaseBody, { color: Colors.textSecondary }]}>
          Your account requires a verification code from your authenticator app in addition to your password.
        </Text>
      </View>

      <View style={styles.infoStack}>
        <View style={[styles.infoRow, { borderColor: Colors.border }]}>
          <Ionicons name="phone-portrait-outline" size={20} color={Colors.textSecondary} />
          <View style={styles.infoText}>
            <Text style={[styles.infoLabel, { color: Colors.textPrimary }]}>Authenticator app</Text>
            <Text style={[styles.infoValue, { color: Colors.textMuted }]}>Open your app to get codes</Text>
          </View>
        </View>
        <View style={[styles.infoRow, { borderColor: Colors.border }]}>
          <Ionicons name="key-outline" size={20} color={Colors.textSecondary} />
          <View style={styles.infoText}>
            <Text style={[styles.infoLabel, { color: Colors.textPrimary }]}>Recovery codes</Text>
            <Text style={[styles.infoValue, { color: Colors.textMuted }]}>Generated when you enabled 2FA</Text>
          </View>
        </View>
        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
          <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} />
          <View style={styles.infoText}>
            <Text style={[styles.infoLabel, { color: Colors.textPrimary }]}>Login protection</Text>
            <Text style={[styles.infoValue, { color: Colors.textMuted }]}>Required at every sign-in</Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: Space.lg }}>
        <AppButton
          title="Disable 2FA"
          onPress={() => { haptic.medium(); setPhase('disable-confirm'); }}
          variant="secondary"
          size="md"
        />
      </View>
    </>
  );

  // ── Phase: disable-confirm ──
  const renderDisableConfirm = () => (
    <>
      <View style={styles.phaseIntro}>
        <View style={[styles.statusBadge, { backgroundColor: `${Colors.danger}15` }]}>
          <Ionicons name="shield-outline" size={18} color={Colors.danger} />
          <Text style={[styles.statusBadgeText, { color: Colors.danger }]}>Remove protection</Text>
        </View>
        <Text style={styles.phaseTitle}>Confirm with a code</Text>
        <Text style={[styles.phaseBody, { color: Colors.textSecondary }]}>
          Enter your authenticator code or a recovery code to disable 2FA. Your account will be protected by password only.
        </Text>
      </View>

      <View style={styles.disableForm}>
        <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>Authenticator code</Text>
        <TextInput
          style={[styles.textInput, { color: Colors.textPrimary, borderColor: Colors.border, backgroundColor: Colors.surface }]}
          value={disableCode}
          onChangeText={(v) => setDisableCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="123456"
          placeholderTextColor={Colors.textMuted}
          maxLength={6}
          editable={!isDisabling}
        />
        <Text style={[styles.inputDivider, { color: Colors.textMuted }]}>or</Text>
        <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>Recovery code</Text>
        <TextInput
          style={[styles.textInput, { color: Colors.textPrimary, borderColor: Colors.border, backgroundColor: Colors.surface }]}
          value={disableRecoveryCode}
          onChangeText={setDisableRecoveryCode}
          placeholder="XXXX-XXXX"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
          editable={!isDisabling}
        />
      </View>
    </>
  );

  // ── Phase: setup (QR + manual key) ──
  const renderSetup = () => (
    <>
      <View style={styles.phaseIntro}>
        <Text style={styles.phaseTitle}>Add an authenticator app</Text>
        <Text style={[styles.phaseBody, { color: Colors.textSecondary }]}>
          Scan this QR code with Google Authenticator, Authy, or 1Password. Then enter the 6-digit code to verify.
        </Text>
      </View>

      <View style={styles.qrContainer}>
        {isLoadingEnrollment ? (
          <View style={styles.qrLoading}>
            <ActivityIndicator color={Colors.textPrimary} size="large" />
            <Text style={[styles.qrLoadingText, { color: Colors.textMuted }]}>Generating secure secret…</Text>
          </View>
        ) : qrDataUrl ? (
          <View style={[styles.qrFrame, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <Image
              source={{ uri: qrDataUrl }}
              style={styles.qrImage}
              onError={() => setQrDataUrl('')}
            />
          </View>
        ) : (
          <View style={[styles.qrError, { borderColor: `${Colors.danger}30` }]}>
            <Ionicons name="alert-circle-outline" size={28} color={Colors.danger} />
            <Text style={[styles.qrErrorText, { color: Colors.danger }]}>Could not generate QR code</Text>
            <AnimatedPressable onPress={() => void fetchEnrollment()} scaleValue={0.96}>
              <Text style={[styles.qrRetry, { color: Colors.brand }]}>Try again</Text>
            </AnimatedPressable>
          </View>
        )}
      </View>

      {/* Manual key with reveal toggle */}
      {!isLoadingEnrollment && manualKey ? (
        <View style={styles.manualKeySection}>
          <Pressable
            onPress={() => setShowManualKey(!showManualKey)}
            style={styles.manualKeyToggle}
            accessibilityRole="button"
            accessibilityLabel={showManualKey ? 'Hide manual key' : 'Show manual key'}
          >
            <Ionicons name={showManualKey ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textSecondary} />
            <Text style={[styles.manualKeyToggleText, { color: Colors.textSecondary }]}>
              {showManualKey ? 'Hide manual key' : 'Enter key manually'}
            </Text>
          </Pressable>
          {showManualKey ? (
            <View style={[styles.manualKeyBox, { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border }]}>
              <Text style={[styles.manualKeyValue, { color: Colors.textPrimary }]} numberOfLines={2}>
                {manualKey}
              </Text>
              <AnimatedPressable onPress={handleCopyKey} scaleValue={0.92} hapticFeedback="light">
                <Ionicons name="copy-outline" size={20} color={Colors.brand} />
              </AnimatedPressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {errorMsg ? (
        <Text style={styles.errorText}>{errorMsg}</Text>
      ) : null}

      <View style={{ marginTop: Space.md }}>
        <AppButton
          title="Continue to verification"
          onPress={() => { haptic.light(); setPhase('verify'); setErrorMsg(''); }}
          variant="primary"
          size="md"
          disabled={isLoadingEnrollment || !qrDataUrl}
        />
      </View>
    </>
  );

  // ── Phase: verify (6-cell OTP input) ──
  const renderVerify = () => (
    <>
      <View style={styles.phaseIntro}>
        <Text style={styles.phaseTitle}>Enter verification code</Text>
        <Text style={[styles.phaseBody, { color: Colors.textSecondary }]}>
          Open your authenticator app and enter the 6-digit code shown for Thryftverse.
        </Text>
      </View>

      <View style={styles.otpRow}>
        {otpDigits.map((digit, i) => (
          <TextInput
            key={i}
            ref={(ref) => { otpRefs.current[i] = ref; }}
            style={[
              styles.otpCell,
              {
                color: Colors.textPrimary,
                borderColor: digit ? Colors.brand : Colors.border,
                backgroundColor: Colors.surface,
              },
            ]}
            value={digit}
            onChangeText={(value) => {
              if (value.length > 1) {
                handleOtpPaste(value);
              } else {
                handleOtpChange(i, value);
              }
            }}
            onKeyPress={(e) => handleOtpKeyPress(i, e.nativeEvent.key)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            accessibilityLabel={`Verification code digit ${i + 1}`}
          />
        ))}
      </View>

      {errorMsg ? (
        <Text style={styles.errorText}>{errorMsg}</Text>
      ) : null}

      <View style={{ marginTop: Space.md }}>
        <AppButton
          title={isVerifying ? 'Verifying…' : 'Enable 2FA'}
          onPress={() => void handleVerify()}
          variant="primary"
          size="md"
          disabled={!canVerify}
          loading={isVerifying}
        />
      </View>
    </>
  );

  // ── Phase: recovery (persistent display) ──
  const renderRecovery = () => (
    <>
      <View style={styles.phaseIntro}>
        <View style={[styles.statusBadge, { backgroundColor: `${Colors.success}15` }]}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
          <Text style={[styles.statusBadgeText, { color: Colors.success }]}>Enabled</Text>
        </View>
        <Text style={styles.phaseTitle}>Save your recovery codes</Text>
        <Text style={[styles.phaseBody, { color: Colors.textSecondary }]}>
          These one-time codes let you access your account if you lose your authenticator device. Store them somewhere safe.
        </Text>
      </View>

      <View style={[styles.recoveryCodesContainer, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        {recoveryCodes.map((code, i) => (
          <Reanimated.View
            key={i}
            entering={FadeInDown.duration(200).delay(i * 50)}
            style={[
              styles.recoveryCodeRow,
              i < recoveryCodes.length - 1 && { borderBottomColor: Colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}
          >
            <Text style={[styles.recoveryCodeIndex, { color: Colors.textMuted }]}>{i + 1}</Text>
            <Text style={[styles.recoveryCodeValue, { color: Colors.textPrimary }]}>{code}</Text>
          </Reanimated.View>
        ))}
      </View>

      <View style={styles.recoveryActions}>
        <AnimatedPressable
          onPress={handleCopyRecoveryCodes}
          style={[styles.recoveryActionBtn, { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border }]}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Copy all recovery codes"
        >
          <Ionicons name={codesCopied ? 'checkmark' : 'copy-outline'} size={18} color={codesCopied ? Colors.success : Colors.textPrimary} />
          <Text style={[styles.recoveryActionText, { color: Colors.textPrimary }]}>
            {codesCopied ? 'Copied' : 'Copy all'}
          </Text>
        </AnimatedPressable>
      </View>

      <Text style={[styles.recoveryWarning, { color: Colors.textMuted }]}>
        Each code can only be used once. You will not see these again.
      </Text>
    </>
  );

  const showFooter = phase === 'verify' || phase === 'disable-confirm' || phase === 'recovery';

  const footerActions = (() => {
    if (phase === 'verify') {
      return [{
        label: isVerifying ? 'Verifying…' : 'Enable 2FA',
        onPress: () => void handleVerify(),
        variant: 'primary' as const,
        disabled: !canVerify,
        loading: isVerifying,
      }];
    }
    if (phase === 'disable-confirm') {
      return [{
        label: isDisabling ? 'Disabling…' : 'Disable 2FA',
        onPress: () => void handleDisable2FA(),
        variant: 'danger' as const,
        disabled: !canDisable,
        loading: isDisabling,
      }];
    }
    if (phase === 'recovery') {
      return [{
        label: 'I have saved my codes',
        onPress: handleRecoveryDone,
        variant: 'primary' as const,
      }];
    }
    return [];
  })();

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Two-Factor Authentication"
          subtitle={twoFactorEnabled ? 'Enabled' : 'Setup'}
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      stickyFooter={showFooter && footerActions.length > 0 ? (
        <FlagshipStickyFooter actions={footerActions} />
      ) : undefined}
    >
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.xxl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          <Reanimated.View entering={FadeIn.duration(300)}>
            {phase === 'disable' && renderDisableOverview()}
            {phase === 'disable-confirm' && renderDisableConfirm()}
            {phase === 'setup' && renderSetup()}
            {phase === 'verify' && renderVerify()}
            {phase === 'recovery' && renderRecovery()}
          </Reanimated.View>
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  phaseIntro: {
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.xs,
  },
  phaseTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  phaseBody: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight + 2,
    letterSpacing: Type.body.letterSpacing,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: Space.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginBottom: Space.xs,
  },
  statusBadgeText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  // Info stack (disable overview)
  infoStack: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoText: {
    flex: 1,
    gap: 2,
  },
  infoLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  infoValue: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  // Disable confirm form
  disableForm: {
    gap: Space.xs,
  },
  inputLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  textInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 2,
    minHeight: 48,
  },
  inputDivider: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingVertical: Space.xs,
    letterSpacing: Type.caption.letterSpacing,
  },
  // QR
  qrContainer: {
    alignItems: 'center',
    paddingVertical: Space.md,
  },
  qrFrame: {
    padding: Space.sm,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  qrImage: {
    width: 240,
    height: 240,
    borderRadius: Radius.lg,
  },
  qrLoading: {
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xl,
  },
  qrLoadingText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  qrError: {
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    width: 240,
  },
  qrErrorText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  qrRetry: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  // Manual key
  manualKeySection: {
    gap: Space.sm,
  },
  manualKeyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs,
  },
  manualKeyToggleText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  manualKeyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  manualKeyValue: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 1,
  },
  // OTP cells
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.md,
  },
  otpCell: {
    flex: 1,
    aspectRatio: 0.75,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    fontSize: 24,
    fontFamily: Typography.family.bold,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  errorText: {
    color: Colors.danger,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    marginTop: Space.sm,
    letterSpacing: Type.caption.letterSpacing,
  },
  // Recovery codes
  recoveryCodesContainer: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: Space.md,
  },
  recoveryCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
  },
  recoveryCodeIndex: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    width: 20,
    textAlign: 'right',
  },
  recoveryCodeValue: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 2,
  },
  recoveryActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  recoveryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    borderRadius: Radius.md,
    paddingVertical: Space.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  recoveryActionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  recoveryWarning: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight + 2,
    letterSpacing: Type.caption.letterSpacing,
    textAlign: 'center',
  },
});
