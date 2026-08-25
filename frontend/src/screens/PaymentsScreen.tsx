import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { formatCountryPolicyScope, isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { AddCardSheet } from '../components/checkout/AddCardSheet';
import {
  CommercePaymentMethod,
  deleteUserPaymentMethod,
  listUserPaymentMethods,
  setDefaultUserPaymentMethod,
} from '../services/commerceApi';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { useToast } from '../context/ToastContext';
import { AppButton } from '../components/ui/AppButton';
import { SettingsCell } from '../components/SettingsCell';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PremiumListSection } from '../components/ui/PremiumListSection';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { t } from '../i18n';

import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
type Props = NativeStackScreenProps<RootStackParamList, 'Payments'>;

export default function PaymentsScreen({ navigation }: Props) {
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const paymentPreferences = useStore((state) => state.paymentPreferences);
  const updatePaymentPreferences = useStore((state) => state.updatePaymentPreferences);
  const useBalance = paymentPreferences.useBalance;
  const [backendPaymentMethods, setBackendPaymentMethods] = useState<CommercePaymentMethod[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [addCardSheetVisible, setAddCardSheetVisible] = useState(false);
  const [countryCapabilities, setCountryCapabilities] = useState<UserCountryCapabilities | null>(null);
  const [isUpdatingDefault, setIsUpdatingDefault] = useState(false);
  const currentUser = useStore((state) => state.currentUser);
  const savePaymentMethod = useStore((state) => state.savePaymentMethod);
  const clearSavedPaymentMethod = useStore((state) => state.clearSavedPaymentMethod);
  const { show } = useToast();

  // ── Biometric gate (OWASP M5) ──
  // Payment methods are sensitive. Require biometric re-authentication before
  // revealing content. Falls through when biometric is unavailable.
  const biometricGate = useBiometricGate();

  const getCardBrand = (label: string) => {
    const lower = label.toLowerCase();
    if (lower.includes('visa')) return { name: 'Visa', icon: 'card' as const, color: '#1A1F71' };
    if (lower.includes('mastercard') || lower.includes('master')) return { name: 'Mastercard', icon: 'card' as const, color: '#EB001B' };
    if (lower.includes('amex') || lower.includes('american')) return { name: 'Amex', icon: 'card' as const, color: '#2E77BC' };
    if (lower.includes('discover')) return { name: 'Discover', icon: 'card' as const, color: '#FF6000' };
    return { name: 'Card', icon: 'card' as const, color: colors.textPrimary };
  };

  const syncPaymentMethods = useCallback(
    async (isCancelled?: () => boolean) => {
      const userId = currentUser?.id;
      if (!userId) {
        setIsSyncing(false);
        return;
      }
      setIsSyncing(true);
      try {
        const [methodsResult, capabilitiesResult] = await Promise.allSettled([
          listUserPaymentMethods(userId),
          getUserCountryCapabilities(userId),
        ]);
        if (isCancelled?.()) return;
        const methods = methodsResult.status === 'fulfilled' ? methodsResult.value : [];
        setBackendPaymentMethods(methods);
        const preferredMethod = methods.find((method) => method.isDefault) ?? methods[0];
        if (preferredMethod) {
          savePaymentMethod({
            id: preferredMethod.id,
            type: preferredMethod.type,
            label: preferredMethod.label,
            details: preferredMethod.details,
            isDefault: preferredMethod.isDefault,
          });
        } else {
          clearSavedPaymentMethod();
        }
        setCountryCapabilities(capabilitiesResult.status === 'fulfilled' ? capabilitiesResult.value : null);
      } catch {
        if (isCancelled?.()) return;
        setBackendPaymentMethods([]);
        setCountryCapabilities(null);
      } finally {
        if (!isCancelled?.()) setIsSyncing(false);
      }
    },
    [clearSavedPaymentMethod, currentUser?.id, savePaymentMethod]
  );

  useEffect(() => {
    let cancelled = false;
    void syncPaymentMethods(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [syncPaymentMethods]);

  const cardMethods = useMemo(
    () => backendPaymentMethods.filter((method) => method.type === 'card'),
    [backendPaymentMethods]
  );
  const defaultMethod = useMemo(
    () => backendPaymentMethods.find((method) => method.isDefault) ?? backendPaymentMethods[0] ?? null,
    [backendPaymentMethods]
  );

  const allowCards = isPaymentMethodAllowed(countryCapabilities, 'card');
  const allowApplePay = isPaymentMethodAllowed(countryCapabilities, 'apple_pay');
  const allowGooglePay = isPaymentMethodAllowed(countryCapabilities, 'google_pay');
  const policyLabel = formatCountryPolicyScope(countryCapabilities);

  const handleSetDefault = async (method: CommercePaymentMethod) => {
    if (isUpdatingDefault) return;
    setIsUpdatingDefault(true);
    const previous = [...backendPaymentMethods];
    setBackendPaymentMethods((prev) =>
      prev.map((item) => (
        item.id === method.id
          ? { ...item, isDefault: true }
          : { ...item, isDefault: false }
      ))
    );
    try {
      const methods = await setDefaultUserPaymentMethod(method.providerPaymentMethodId);
      setBackendPaymentMethods(methods);
      show(t('payments.toast.defaultUpdated'), 'success');
    } catch {
      show(t('payments.toast.defaultUpdateFailed'), 'error');
      setBackendPaymentMethods(previous);
    } finally {
      setIsUpdatingDefault(false);
    }
  };

  const handleRemovePaymentMethod = (method: CommercePaymentMethod) => {
    Alert.alert(
      t('payments.alert.removeTitle'),
      t('payments.alert.removeMessage', { label: method.label }),
      [
        { text: t('payments.alert.cancel'), style: 'cancel' },
        {
          text: t('payments.alert.remove'),
          style: 'destructive',
          onPress: async () => {
            const previous = backendPaymentMethods;
            setBackendPaymentMethods((prev) => prev.filter((m) => m.id !== method.id));
            show(t('payments.toast.removed'), 'info');
            const userId = currentUser?.id;
            if (!userId) return;
            try {
              await deleteUserPaymentMethod(userId, method.providerPaymentMethodId);
              if (method.id === defaultMethod?.id) {
                clearSavedPaymentMethod();
              }
            } catch {
              show(t('payments.toast.detachFailed'), 'error');
              setBackendPaymentMethods(previous);
            }
          },
        },
      ]
    );
  };

  const handlePaymentMethodPress = (method: CommercePaymentMethod) => {
    Alert.alert(
      method.label,
      method.details ?? t('payments.label.savedPaymentMethod'),
      [
        ...(method.isDefault
          ? []
          : [{ text: t('payments.alert.setAsDefault'), onPress: () => void handleSetDefault(method) }]),
        { text: t('payments.alert.remove'), style: 'destructive', onPress: () => handleRemovePaymentMethod(method) },
        { text: t('payments.alert.cancel'), style: 'cancel' },
      ]
    );
  };

  const renderPaymentMethodRows = (
    methods: CommercePaymentMethod[],
    allow: boolean,
    emptyTitle: string,
    emptySub: string,
    unavailableTitle: string,
    unavailableSub: string,
    iconOutline: React.ComponentProps<typeof Ionicons>['name']
  ) => {
    if (!allow) {
      return (
        <View
          style={styles.paymentRow}
        >
          <View style={styles.iconCircle}>
            <Ionicons name={iconOutline} size={20} color={colors.textPrimary} aria-hidden={true} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentTitle}>{unavailableTitle}</Text>
            <Text style={styles.paymentSub}>{unavailableSub}</Text>
          </View>
        </View>
      );
    }
    if (methods.length > 0) {
      return methods.map((method, idx) => {
        const brand = getCardBrand(method.brand);
        return (
          <AnimatedPressable
            key={method.id}
            style={[styles.paymentRow, idx < methods.length - 1 && styles.paymentRowBorder]}
            onPress={() => handlePaymentMethodPress(method)}
            scaleValue={0.98}
            hapticFeedback="light"
            activeOpacity={0.8}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${brand.color}12` }]}>
              <Ionicons name={brand.icon} size={20} color={brand.color} aria-hidden={true} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentTitle}>{method.label}</Text>
              <Text style={styles.paymentSub}>{method.details}</Text>
            </View>
            {method.isDefault ? (
              <View style={[styles.defaultBadge, { backgroundColor: `${colors.success}12` }]}>
                <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                <Text style={[styles.defaultText, { color: colors.success }]}>{t('payments.label.default')}</Text>
              </View>
            ) : null}
          </AnimatedPressable>
        );
      });
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name={iconOutline} size={28} color={colors.textMuted} aria-hidden={true} />
        <Text style={styles.emptyStateTitle}>{emptyTitle}</Text>
        <Text style={styles.emptyStateSub}>{emptySub}</Text>
      </View>
    );
  };

  const hasError = !isSyncing && backendPaymentMethods.length === 0 && countryCapabilities === null;

  // Auto-prompt biometric once availability is confirmed.
  useEffect(() => {
    if (biometricGate.status === 'locked' && !biometricGate.isAuthenticating) {
      void biometricGate.authenticate(t('payments.biometric.reason'));
    }
  }, [biometricGate.status, biometricGate.isAuthenticating, biometricGate.authenticate]);

  // ── Biometric gate: block sensitive content until authenticated ──
  if (biometricGate.status === 'pending' || biometricGate.status === 'locked') {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title={t('payments.header.title')}
            subtitle={t('payments.header.subtitle')}
            onBack={() => navigation.goBack()}
          />
        }
        scrollEnabled={false}
      >
        <BiometricGatePrompt
          gate={biometricGate}
          reason={t('payments.biometric.reason')}
          onBack={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t('payments.header.title')}
          subtitle={t('payments.header.subtitle')}
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => setAddCardSheetVisible(true)}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={t('payments.a11y.addPaymentMethod')}
            >
              <Ionicons name="add" size={22} color={colors.brand} aria-hidden={true} />
            </AnimatedPressable>
          }
        />
      }
    >
      {policyLabel ? (
        <Text style={styles.policyLabel}>{t('payments.policyLabel', { scope: policyLabel })}</Text>
      ) : null}

      {/* Hero summary — payment methods count + security status */}
      <View>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
              <Ionicons name="card" size={20} color={colors.textInverse} aria-hidden={true} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {defaultMethod ? t('payments.hero.methodCount', { count: backendPaymentMethods.length, plural: backendPaymentMethods.length === 1 ? '' : 's' }) : t('payments.hero.noMethod')}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {defaultMethod ? t('payments.hero.defaultSubtitle', { label: defaultMethod.label }) : t('payments.hero.addCardHint')}
              </Text>
            </View>
            {defaultMethod && (
              <View style={[styles.heroBadge, { backgroundColor: colors.successSubtle }]}>
                <Ionicons name="lock-closed-outline" size={12} color={colors.success} aria-hidden={true} />
                <Text style={[styles.heroBadgeText, { color: colors.success }]}>{t('payments.label.secure')}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {isSyncing && backendPaymentMethods.length === 0 && (
        <FlagshipState variant="loading" />
      )}

      {hasError ? (
        <FlagshipState
          variant="error"
          title={t('payments.error.loadFailed')}
          subtitle={t('payments.error.loadFailedSubtitle')}
          actionLabel={t('payments.error.retry')}
          onAction={() => void syncPaymentMethods()}
        />
      ) : (
        <>
          {/* Digital wallets — Apple Pay / Google Pay shown FIRST per 2026 UX
              research: "Place Google Pay at the top of the list of payment
              options, above manual entry fields for payment information."
              These are device-native biometric payment methods managed by the
              OS, not stored cards. Shown when the capability is allowed for
              the user's region and the platform supports it. */}
          {(allowApplePay || allowGooglePay) && (
            <View>
              <PremiumListSection title={t('payments.section.digitalWallets')}>
                {allowApplePay && Platform.OS === 'ios' && (
                  <View style={styles.walletRow}>
                    <View style={[styles.walletIcon, { backgroundColor: colors.textPrimary }]}>
                      <Ionicons name="logo-apple" size={20} color={colors.textInverse} aria-hidden={true} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.walletTitle}>{t('payments.wallet.applePay')}</Text>
                      <Text style={styles.walletSub}>{t('payments.wallet.applePaySub')}</Text>
                    </View>
                    <View style={[styles.walletBadge, { backgroundColor: colors.successSubtle }]}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                      <Text style={[styles.walletBadgeText, { color: colors.success }]}>{t('payments.wallet.ready')}</Text>
                    </View>
                  </View>
                )}
                {allowGooglePay && Platform.OS === 'android' && (
                  <View style={styles.walletRow}>
                    <View style={[styles.walletIcon, { backgroundColor: colors.textPrimary }]}>
                      <Ionicons name="logo-google" size={18} color={colors.textInverse} aria-hidden={true} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.walletTitle}>{t('payments.wallet.googlePay')}</Text>
                      <Text style={styles.walletSub}>{t('payments.wallet.googlePaySub')}</Text>
                    </View>
                    <View style={[styles.walletBadge, { backgroundColor: colors.successSubtle }]}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                      <Text style={[styles.walletBadgeText, { color: colors.success }]}>{t('payments.wallet.ready')}</Text>
                    </View>
                  </View>
                )}
              </PremiumListSection>
            </View>
          )}

          {/* Inline trust signal — placed near payment methods where card-
              security anxiety peaks. Per 2026 UX research: "A 'Secure
              checkout' message next to the card number field is more
              effective than security badges in the footer." */}
          <View style={[styles.inlineTrustRow, { borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.success} aria-hidden={true} />
            <Text style={[styles.inlineTrustText, { color: colors.textSecondary }]}>
              {t('payments.trust.inline')}
            </Text>
          </View>

          {/* Primary Payment Method Summary */}
          <View>
            {defaultMethod ? (
              <AnimatedPressable
                style={[styles.primaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handlePaymentMethodPress(defaultMethod)}
                activeOpacity={0.8}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={`Manage ${defaultMethod.label}`}
              >
                <View style={styles.primaryCardHeader}>
                  <Text style={[styles.primaryCardLabel, { color: colors.textMuted }]}>{t('payments.label.primaryMethod')}</Text>
                  <View style={[styles.defaultBadge, { backgroundColor: `${colors.success}12` }]}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                    <Text style={[styles.defaultText, { color: colors.success }]}>{t('payments.label.default')}</Text>
                  </View>
                </View>
                <View style={styles.primaryCardBody}>
                  <View style={[styles.brandIconCircle, { backgroundColor: `${getCardBrand(defaultMethod.brand).color}15` }]}>
                    <Ionicons
                      name="card"
                      size={22}
                      color={getCardBrand(defaultMethod.brand).color}
                      aria-hidden={true}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.primaryCardTitle}>{defaultMethod.label}</Text>
                    <Text style={styles.primaryCardSub}>{defaultMethod.details ?? (defaultMethod.type === 'card' ? t('payments.label.cardEnding') : t('payments.label.bankAccount'))}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
                </View>
              </AnimatedPressable>
            ) : (
              <View style={[styles.primaryCard, styles.primaryCardEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.brandIconCircle, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="card-outline" size={24} color={colors.textMuted} aria-hidden={true} />
                </View>
                <Text style={styles.primaryCardTitle}>{t('payments.hero.noMethod')}</Text>
                <Text style={styles.primaryCardSub}>{t('payments.hero.addCardHint')}</Text>
                <AnimatedPressable
                  style={[styles.primaryCardCta, { backgroundColor: colors.brand }]}
                  onPress={() => setAddCardSheetVisible(true)}
                  activeOpacity={0.85}
                  hapticFeedback="medium"
                >
                  <Ionicons name="add" size={16} color={colors.background} aria-hidden={true} />
                  <Text style={[styles.primaryCardCtaText, { color: colors.background }]}>{t('payments.a11y.addPaymentMethod')}</Text>
                </AnimatedPressable>
              </View>
            )}
          </View>

          {/* Preferences */}
          <View>
            <PremiumListSection title={t('payments.section.preferences')}>
              <SettingsCell
                icon="wallet-outline"
                iconColor={colors.brand}
                title={t('payments.preferences.useBalance')}
                subtitle={t('payments.preferences.useBalanceSub')}
                variant="toggle"
                toggleValue={useBalance}
                onToggle={(v) => updatePaymentPreferences({ useBalance: v })}
                isFirst
                isLast
              />
            </PremiumListSection>
          </View>

          {/* Cards */}
          <View>
            <PremiumListSection title={t('payments.section.cards')}>
              {renderPaymentMethodRows(
                cardMethods,
                allowCards,
                t('payments.cards.emptyTitle'),
                t('payments.cards.emptySub'),
                t('payments.cards.unavailableTitle'),
                t('payments.cards.unavailableSub'),
                'card-outline'
              )}
              {allowCards ? (
                <AppButton
                  title={t('payments.cards.addNew')}
                  icon={<Ionicons name="add" size={18} color={colors.textPrimary} aria-hidden={true} />}
                  style={styles.addBtn}
                  variant="secondary"
                  size="sm"
                  titleStyle={styles.addText}
                  contentStyle={styles.addBtnContent}
                  iconContainerStyle={styles.addIconWrap}
                  onPress={() => setAddCardSheetVisible(true)}
                  accessibilityLabel={t('payments.cards.addNew')}
                  accessibilityHint={t('payments.cards.a11y.opensCardSetup')}
                />
              ) : null}
            </PremiumListSection>
          </View>

          {/* Security note — retained below for detailed disclosure, but the
              primary trust signal now lives inline near the payment methods. */}
          <View>
            <View style={[styles.trustNote, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} aria-hidden={true} />
              <Text style={styles.trustNoteText}>
                {t('payments.trust.note')}
              </Text>
            </View>
          </View>

        </>
      )}

      <AddCardSheet
        visible={addCardSheetVisible}
        onDismiss={() => setAddCardSheetVisible(false)}
        onSuccess={() => {
          void syncPaymentMethods();
        }}
      />
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
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: Type.bodyStrong.size,
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
  securityBanner: {
    alignItems: 'center',
    marginBottom: Space.sm,
  },
  securityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
  },
  securityText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
  },
  policyLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.xs,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
    letterSpacing: Type.caption.letterSpacing,
  },
  // ── Digital wallet rows ──
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md - Space.xs,
  },
  walletIcon: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Space.sm + Space.xs,
  },
  walletTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: Space.xs,
    letterSpacing: Type.body.letterSpacing,
  },
  walletSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
  },
  walletBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  // ── Inline trust signal ──
  inlineTrustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.md,
  },
  inlineTrustText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  primaryCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    marginBottom: Space.md,
  },
  primaryCardEmpty: {
    alignItems: 'center',
    paddingVertical: Space.xl,
  },
  primaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.md,
  },
  primaryCardLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
  },
  primaryCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  primaryCardTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  primaryCardSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    marginTop: Space.xs / 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  primaryCardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    marginTop: Space.md,
  },
  primaryCardCtaText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  brandIconCircle: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.md,
  },
  trustNoteText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  skeletonWrap: {
    marginBottom: Space.md,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md - Space.xs,
  },
  paymentRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconCircle: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Space.sm + Space.xs,
  },
  paymentTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: Space.xs,
    letterSpacing: Type.body.letterSpacing,
  },
  paymentSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    paddingRight: Space.sm + 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  defaultBadge: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
  },
  defaultText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.meta.letterSpacing,
  },
  addBtn: {
    borderRadius: Radius.md,
    marginTop: Space.xs,
    alignSelf: 'flex-start',
  },
  addBtnContent: {
    gap: Space.sm,
  },
  addIconWrap: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.lg,
    backgroundColor: 'transparent',
  },
  addText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
  },
  emptyStateTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    marginTop: Space.md,
    textAlign: 'center',
    letterSpacing: Type.body.letterSpacing,
  },
  emptyStateSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.xs,
    textAlign: 'center',
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
  },
  trustBannerText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  paymentText: {
    flex: 1,
  },
  });
}
