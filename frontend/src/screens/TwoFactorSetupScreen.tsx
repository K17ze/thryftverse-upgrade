import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Radius, Type , Typography  } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { requestTwoFactorEnrollment, verifyTwoFactorEnrollment } from '../services/authApi';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { AppInput } from '../components/ui/AppInput';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import QRCode from 'qrcode';
import * as Clipboard from 'expo-clipboard';

type Props = StackScreenProps<RootStackParamList, 'TwoFactorSetup'>;

export default function TwoFactorSetupScreen({ navigation }: Props) {
  const { show } = useToast();
  const setTwoFactorEnabled = useStore((state) => state.setTwoFactorEnabled);

  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isLoadingEnrollment, setIsLoadingEnrollment] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);

  const canEnable = code.trim().length === 6 && !isLoadingEnrollment && !isVerifying;

  const fetchEnrollment = async () => {
    setIsLoadingEnrollment(true);
    setErrorMsg('');
    setQrDataUrl('');
    try {
      const result = await requestTwoFactorEnrollment();
      setManualKey(result.secret);
      setOtpauthUrl(result.otpauthUrl);
      show('Authenticator secret generated. Add it in your app and verify.', 'info');
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to start two-factor setup.');
    } finally {
      setIsLoadingEnrollment(false);
    }
  };

  useEffect(() => {
    void fetchEnrollment();
  }, []);

  useEffect(() => {
    if (!otpauthUrl) return;
    let cancelled = false;
    QRCode.toDataURL(otpauthUrl, { width: 220, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => { cancelled = true; };
  }, [otpauthUrl]);

  const handleCopyKey = async () => {
    if (!manualKey) return;
    await Clipboard.setStringAsync(manualKey);
    show('Manual key copied to clipboard', 'success');
  };

  const handleEnable = async () => {
    if (code.trim().length !== 6) {
      setErrorMsg('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setErrorMsg('');
    setIsVerifying(true);
    try {
      const result = await verifyTwoFactorEnrollment(code.trim());
      setTwoFactorEnabled(true);
      const recoveryCodesText = result.recoveryCodes.join('\n');
      await Clipboard.setStringAsync(recoveryCodesText);
      show('Recovery codes copied to clipboard', 'success');
      Alert.alert(
        '2FA Enabled',
        `Save these recovery codes in a secure location:\n\n${recoveryCodesText}`,
        [
          {
            text: 'Done',
            onPress: () => navigation.goBack(),
          },
        ]
      );
      show('Two-factor authentication enabled', 'success');
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to verify the provided code.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Two-Factor Authentication" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Reanimated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: Space.sm, paddingBottom: Space.xl }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Explanation */}
            <SettingsSection title="Security" noCard>
              <SettingsInfoBanner
                text="Two-factor authentication adds an extra layer of security to your account. Even if your password is compromised, your account stays protected."
                icon="shield-checkmark-outline"
                variant="info"
              />
            </SettingsSection>

            {/* QR / Secret */}
            <SettingsSection title="Setup">
              <View style={styles.qrWrap}>
                {isLoadingEnrollment ? (
                  <ActivityIndicator color={Colors.textPrimary} size="large" />
                ) : qrDataUrl ? (
                  <Image source={{ uri: qrDataUrl }} style={styles.qrImage} />
                ) : (
                  <View style={styles.qrError}>
                    <Ionicons name="alert-circle-outline" size={32} color={Colors.danger} />
                    <Text style={styles.qrErrorText}>Could not generate QR code</Text>
                  </View>
                )}

                {!isLoadingEnrollment && !!manualKey && (
                  <View style={styles.manualKeyWrap}>
                    <Text style={styles.manualKeyLabel}>Manual key</Text>
                    <View style={styles.manualKeyRow}>
                      <Text style={styles.manualKeyValue} numberOfLines={1}>{manualKey}</Text>
                      <AnimatedPressable onPress={handleCopyKey} hapticFeedback="light" scaleValue={0.92}>
                        <Ionicons name="copy-outline" size={20} color={Colors.brand} />
                      </AnimatedPressable>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.otpauthUrlWrap}>
                <Text style={styles.otpauthUrlText} numberOfLines={2}>
                  {otpauthUrl || 'Generating secure enrollment secret...'}
                </Text>
              </View>

              <View style={styles.refreshWrap}>
                <AppButton
                  title={isLoadingEnrollment ? 'Refreshing...' : 'Generate new secret'}
                  onPress={() => void fetchEnrollment()}
                  variant="secondary"
                  size="sm"
                  disabled={isLoadingEnrollment}
                />
              </View>
            </SettingsSection>

            {/* Verification */}
            <SettingsSection title="Verify">
              <View style={{ paddingHorizontal: Space.md }}>
                <AppInput
                  label="Verification code"
                  value={code}
                  onChangeText={(value) => {
                    const digitsOnly = value.replace(/\D/g, '').slice(0, 6);
                    setCode(digitsOnly);
                    if (errorMsg) setErrorMsg('');
                  }}
                  keyboardType="number-pad"
                  placeholder="123456"
                  maxLength={6}
                  containerStyle={{ marginBottom: Space.sm }}
                />
                {!!errorMsg && (
                  <Text style={styles.errorText}>{errorMsg}</Text>
                )}
              </View>
            </SettingsSection>

            {/* CTA */}
            <View style={{ paddingHorizontal: Space.md, marginTop: Space.md, marginBottom: Space.xl }}>
              <AppButton
                title={isVerifying ? 'Verifying...' : 'Enable 2FA'}
                onPress={() => void handleEnable()}
                variant="primary"
                size="md"
                disabled={!canEnable}
                style={{ borderRadius: Radius.xl }}
              />
            </View>
          </ScrollView>
        </Reanimated.View>
      </KeyboardAvoidingView>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  qrWrap: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    gap: Space.md,
  },
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: Radius.lg,
  },
  qrError: {
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.lg,
  },
  qrErrorText: {
    color: Colors.danger,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  manualKeyWrap: {
    width: '100%',
    paddingHorizontal: Space.md,
    gap: Space.xs,
  },
  manualKeyLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
  },
  manualKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  manualKeyValue: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  otpauthUrlWrap: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
  },
  otpauthUrlText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    letterSpacing: Type.meta.letterSpacing,
  },
  refreshWrap: {
    alignItems: 'center',
    paddingBottom: Space.md,
  },
  errorText: {
    color: Colors.danger,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    marginBottom: Space.sm,
    letterSpacing: Type.caption.letterSpacing,
  },
});