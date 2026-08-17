import React, { useEffect, useMemo, useState } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { formatCountryPolicyScope, isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { buildBankAccountPaymentMethod } from '../utils/checkoutFlow';
import { createUserPaymentMethod } from '../services/commerceApi';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { parseApiError } from '../lib/apiClient';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { Space, Radius, Type, Typography, LetterSpacing } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'AddBankAccount'>;

export default function AddBankAccountScreen({ navigation }: Props) {
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
  const reducedMotionEnabled = useReducedMotion();

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
      if (parsed.isNetworkError) {
        savePaymentMethod(localPaymentMethod);
        show('Bank account saved locally. Backend sync unavailable.', 'info');
      } else {
        shouldCloseScreen = false;
        show(parsed.message, 'error');
      }
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
            subtitle="Bank withdrawals are not available in your region. Switch your country policy to enable bank withdrawal rails."
          />
        ) : (
          <>
            {/* Hero summary — bank account purpose */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
              <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.heroRow}>
                  <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                    <Ionicons name="business" size={18} color={colors.textInverse} />
                  </View>
                  <View style={styles.heroText}>
                    <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                      Bank account for payouts
                    </Text>
                    <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                      Withdrawals take 1-3 business days
                    </Text>
                  </View>
                  <View style={[styles.heroBadge, { backgroundColor: colors.success + '15' }]}>
                    <Ionicons name="lock-closed" size={12} color={colors.success} />
                    <Text style={[styles.heroBadgeText, { color: colors.success }]}>Secure</Text>
                  </View>
                </View>
              </View>
            </Reanimated.View>

            {policyLabel ? (
              <Text style={[styles.policyLabel, { color: colors.textMuted }]}>
                Policy scope: {policyLabel}
              </Text>
            ) : null}

            {/* Form section */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                ACCOUNT DETAILS
              </Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
              </View>
            </Reanimated.View>

            {/* Security note */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
              <View style={styles.secureRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.brand} />
                <Text style={[styles.secureText, { color: colors.brand }]}>
                  Protected by bank-level encryption
                </Text>
              </View>
            </Reanimated.View>

            {/* Info card */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
              <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.infoText, { color: colors.textMuted }]}>
                  Withdrawals typically take 1-3 business days. You'll receive a confirmation email once initiated.
                </Text>
              </View>
            </Reanimated.View>

            {/* Save button */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
              <AppButton
                title={isSaving ? 'Saving...' : 'Save bank account'}
                onPress={handleSaveBank}
                disabled={!isComplete || isSaving || !bankAllowed}
                loading={isSaving}
                style={styles.saveBtn}
                accessibilityLabel={isSaving ? 'Saving bank account' : 'Save bank account'}
                accessibilityHint="Saves this bank account for withdrawals"
              />
            </Reanimated.View>
          </>
        )}
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.md,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: Space.xxl - Space.sm,
      height: Space.xxl - Space.sm,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
    },
    heroBadgeText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
    },
    policyLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      textAlign: 'center',
      marginTop: Space.xs,
      marginBottom: Space.md,
      letterSpacing: Type.caption.letterSpacing,
    },
    sectionLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: LetterSpacing.caps,
      textTransform: 'uppercase',
      marginBottom: Space.sm,
      marginLeft: Space.xs,
    },
    card: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: Space.md,
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
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.medium,
      paddingVertical: Space.xs,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
    },
    secureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      justifyContent: 'center',
      marginBottom: Space.md,
    },
    secureText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
    },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.lg,
      padding: Space.md,
      marginBottom: Space.lg,
    },
    infoText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight + 2,
    },
    saveBtn: {
      borderRadius: Radius.full,
    },
  });
}
