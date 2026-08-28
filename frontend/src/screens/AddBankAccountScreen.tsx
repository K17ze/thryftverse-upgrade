import React, { useEffect, useMemo, useState } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { formatCountryPolicyScope, isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { buildBankAccountPaymentMethod } from '../utils/checkoutFlow';
import { createUserPaymentMethod } from '../services/commerceApi';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { parseApiError } from '../lib/apiClient';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { t } from '../i18n';


type Props = NativeStackScreenProps<RootStackParamList, 'AddBankAccount'>;

export default function AddBankAccountScreen({ navigation }: Props) {
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(true);
  const [countryCapabilities, setCountryCapabilities] = useState<UserCountryCapabilities | null>(null);
  const currentUser = useStore((state) => state.currentUser);
  const savePaymentMethod = useStore((state) => state.savePaymentMethod);
  const { show } = useToast();

  useEffect(() => {
    let cancelled = false;

    const hydrateCapabilities = async () => {
      if (!currentUser?.id) {
        setCountryCapabilities(null);
        setIsLoadingCapabilities(false);
        return;
      }

      try {
        const capabilities = await getUserCountryCapabilities(currentUser.id);
        if (!cancelled) {
          setCountryCapabilities(capabilities);
        }
      } catch {
        if (!cancelled) {
          setCountryCapabilities(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCapabilities(false);
        }
      }
    };

    void hydrateCapabilities();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const formatSortCode = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 6);
    if (clean.length >= 4) return `${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4)}`;
    if (clean.length >= 2) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
    return clean;
  };

  const isComplete = accountName.trim().length >= 2 && accountNumber.length === 8 && sortCode.replace(/-/g, '').length === 6;

  const bankAllowed = isPaymentMethodAllowed(countryCapabilities, 'bank_account');

  const policyLabel = useMemo(() => {
    if (!countryCapabilities) {
      return null;
    }

    return formatCountryPolicyScope(countryCapabilities);
  }, [countryCapabilities]);

  const handleSaveBank = async () => {
    if (!bankAllowed) {
      show('Bank accounts are unavailable for your country policy.', 'error');
      return;
    }

    if (!isComplete || isSaving) {
      return;
    }

    const localPaymentMethod = buildBankAccountPaymentMethod(accountNumber.slice(-4), sortCode);

    setIsSaving(true);
    let shouldCloseScreen = true;
    try {
      const userId = currentUser?.id ?? 'u1';
      const saved = await createUserPaymentMethod(userId, {
        type: 'bank_account',
        label: localPaymentMethod.label,
        details: localPaymentMethod.details,
        isDefault: true,
      });

      savePaymentMethod({
        id: saved.id,
        type: saved.type,
        label: saved.label,
        details: saved.details ?? undefined,
        isDefault: saved.isDefault,
      });
      show('Bank account saved', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to save bank account right now.');
      shouldCloseScreen = false;
      show(parsed.message, 'error');
    } finally {
      setIsSaving(false);
      if (shouldCloseScreen) {
        navigation.goBack();
      }
    }
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Add bank account"
          subtitle="For withdrawals"
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.xxl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {isLoadingCapabilities ? (
          <FlagshipState variant="loading" />
        ) : !bankAllowed ? (
          <FlagshipState
            variant="empty"
            icon="ban-outline"
            title="Bank payouts unavailable"
            subtitle="Bank withdrawals unavailable in your region."
          />
        ) : (
          <>
            {/* Posture summary — flat canvas, no card chrome */}
            <View style={styles.postureSummary}>
              <Text style={[styles.postureTitle, { color: colors.textPrimary }]}>
                Bank account for payouts
              </Text>
              <Text style={[styles.postureSubtitle, { color: colors.textSecondary }]}>
                Withdrawals take 1-3 business days
              </Text>
            </View>

            {policyLabel ? (
              <Text style={[styles.policyLabel, { color: colors.textMuted }]}>
                Policy scope: {policyLabel}
              </Text>
            ) : null}

            {/* Form section — flat canvas, hairline separators */}
            <SettingsSection title="Account details">
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Account holder name</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.textPrimary }]}
                  value={accountName}
                  onChangeText={setAccountName}
                  placeholder="Full name on account"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  selectionColor={colors.brand}
                  accessibilityLabel="Account holder name"
                  accessibilityHint="Enter the full legal name on the bank account"
                />
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Account number</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.textPrimary }]}
                  value={accountNumber}
                  onChangeText={v => setAccountNumber(v.replace(/\D/g, '').slice(0, 8))}
                  placeholder="8 digits"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  selectionColor={colors.brand}
                  maxLength={8}
                  accessibilityLabel="Account number"
                  accessibilityHint="Enter your 8-digit account number"
                />
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Sort code</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.textPrimary }]}
                  value={sortCode}
                  onChangeText={v => setSortCode(formatSortCode(v))}
                  placeholder="00-00-00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  selectionColor={colors.brand}
                  maxLength={8}
                  accessibilityLabel="Sort code"
                  accessibilityHint="Enter the 6-digit sort code"
                />
              </View>
            </SettingsSection>

            {/* Trust note — bank-level encryption */}
            <SettingsInfoBanner
              tone="success"
              icon="shield-checkmark-outline"
              title="Bank-level security"
              description="Your account details are protected by bank-level encryption."
            />

            {/* Save button */}
            <AppButton
              title={isSaving ? 'Saving...' : 'Save bank account'}
              onPress={handleSaveBank}
              disabled={!isComplete || isSaving || !bankAllowed}
              loading={isSaving}
              style={styles.saveBtn}
              accessibilityLabel={isSaving ? 'Saving bank account' : 'Save bank account'}
              accessibilityHint="Saves this bank account for withdrawals"
            />
          </>
        )}
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    postureSummary: {
      paddingVertical: Space.sm,
    },
    postureTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    postureSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
    },
    policyLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      textAlign: 'center',
      marginTop: Space.xs,
      marginBottom: Space.md,
      letterSpacing: Type.caption.letterSpacing,
    },
    fieldRow: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
    },
    fieldLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      marginBottom: Space.xs,
    },
    fieldInput: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.medium,
      paddingVertical: Space.xs,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
    },
    saveBtn: {
      borderRadius: Radius.full,
    },
  });
}
