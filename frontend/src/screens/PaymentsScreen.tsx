import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
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

import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
type Props = NativeStackScreenProps<RootStackParamList, 'Payments'>;

export default function PaymentsScreen({ navigation }: Props) {
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
      show('Default payment method updated', 'success');
    } catch {
      show('Default could not be updated. Your previous choice is unchanged.', 'error');
      setBackendPaymentMethods(previous);
    } finally {
      setIsUpdatingDefault(false);
    }
  };

  const handleRemovePaymentMethod = (method: CommercePaymentMethod) => {
    Alert.alert(
      'Remove payment method?',
      `Are you sure you want to remove ${method.label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const previous = backendPaymentMethods;
            setBackendPaymentMethods((prev) => prev.filter((m) => m.id !== method.id));
            show('Payment method removed', 'info');
            const userId = currentUser?.id;
            if (!userId) return;
            try {
              await deleteUserPaymentMethod(userId, method.providerPaymentMethodId);
              if (method.id === defaultMethod?.id) {
                clearSavedPaymentMethod();
              }
            } catch {
              show('Payment method could not be detached. It has been restored.', 'error');
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
      method.details ?? 'Saved payment method',
      [
        ...(method.isDefault
          ? []
          : [{ text: 'Set as default', onPress: () => void handleSetDefault(method) }]),
        { text: 'Remove', style: 'destructive', onPress: () => handleRemovePaymentMethod(method) },
        { text: 'Cancel', style: 'cancel' },
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
            <Ionicons name={iconOutline} size={20} color={colors.textPrimary} />
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
              <Ionicons name={brand.icon} size={20} color={brand.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentTitle}>{method.label}</Text>
              <Text style={styles.paymentSub}>{method.details}</Text>
            </View>
            {method.isDefault ? (
              <View style={[styles.defaultBadge, { backgroundColor: `${colors.success}12` }]}>
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <Text style={[styles.defaultText, { color: colors.success }]}>Default</Text>
              </View>
            ) : null}
          </AnimatedPressable>
        );
      });
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name={iconOutline} size={40} color={colors.textMuted} />
        <Text style={styles.emptyStateTitle}>{emptyTitle}</Text>
        <Text style={styles.emptyStateSub}>{emptySub}</Text>
      </View>
    );
  };

  const hasError = !isSyncing && backendPaymentMethods.length === 0 && countryCapabilities === null;

  // Auto-prompt biometric once availability is confirmed.
  useEffect(() => {
    if (biometricGate.status === 'locked' && !biometricGate.isAuthenticating) {
      void biometricGate.authenticate('Authenticate to view payment methods');
    }
  }, [biometricGate.status, biometricGate.isAuthenticating, biometricGate.authenticate]);

  // ── Biometric gate: block sensitive content until authenticated ──
  if (biometricGate.status === 'pending' || biometricGate.status === 'locked') {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Payment Centre"
            subtitle="Payment methods"
            onBack={() => navigation.goBack()}
          />
        }
        scrollEnabled={false}
      >
        <BiometricGatePrompt
          gate={biometricGate}
          reason="Authenticate to view payment methods"
          onBack={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Payment Centre"
          subtitle="Payment methods"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => setAddCardSheetVisible(true)}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Add payment method"
            >
              <Ionicons name="add" size={23} color={colors.brand} />
            </AnimatedPressable>
          }
        />
      }
    >
      {policyLabel ? (
        <Text style={styles.policyLabel}>Payment policy: {policyLabel}</Text>
      ) : null}

      {/* Hero summary — payment methods count + security status */}
      <View>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
              <Ionicons name="card" size={20} color={colors.textInverse} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {defaultMethod ? `${backendPaymentMethods.length} method${backendPaymentMethods.length === 1 ? '' : 's'}` : 'No payment method'}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {defaultMethod ? `${defaultMethod.label} is your default` : 'Add a card to check out faster'}
              </Text>
            </View>
            {defaultMethod && (
              <View style={[styles.heroBadge, { backgroundColor: colors.success + '15' }]}>
                <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                <Text style={[styles.heroBadgeText, { color: colors.success }]}>Secure</Text>
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
          title="Unable to load payments"
          subtitle="We could not fetch your payment methods."
          actionLabel="Retry"
          onAction={() => void syncPaymentMethods()}
        />
      ) : (
        <>
          {/* Primary Payment Method Summary */}
          <View>
            {defaultMethod ? (
              <View style={[styles.primaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.primaryCardHeader}>
                  <Text style={[styles.primaryCardLabel, { color: colors.textMuted }]}>PRIMARY METHOD</Text>
                  <View style={[styles.defaultBadge, { backgroundColor: `${colors.success}12` }]}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                    <Text style={[styles.defaultText, { color: colors.success }]}>Default</Text>
                  </View>
                </View>
                <View style={styles.primaryCardBody}>
                  <View style={[styles.brandIconCircle, { backgroundColor: `${getCardBrand(defaultMethod.brand).color}15` }]}>
                    <Ionicons
                      name="card"
                      size={22}
                      color={getCardBrand(defaultMethod.brand).color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.primaryCardTitle}>{defaultMethod.label}</Text>
                    <Text style={styles.primaryCardSub}>{defaultMethod.details ?? (defaultMethod.type === 'card' ? 'Card ending in ••••' : 'Bank account')}</Text>
                  </View>
                </View>
                <AnimatedPressable
                  style={styles.primaryCardAction}
                  onPress={() => handlePaymentMethodPress(defaultMethod)}
                  activeOpacity={0.8}
                  hapticFeedback="light"
                >
                  <Text style={[styles.primaryCardActionText, { color: colors.brand }]}>Manage</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.brand} />
                </AnimatedPressable>
              </View>
            ) : (
              <View style={[styles.primaryCard, styles.primaryCardEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.brandIconCircle, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="card-outline" size={24} color={colors.textMuted} />
                </View>
                <Text style={styles.primaryCardTitle}>No payment method</Text>
                <Text style={styles.primaryCardSub}>Add a card to check out faster</Text>
                <AnimatedPressable
                  style={[styles.primaryCardCta, { backgroundColor: colors.brand }]}
                  onPress={() => setAddCardSheetVisible(true)}
                  activeOpacity={0.85}
                  hapticFeedback="medium"
                >
                  <Ionicons name="add" size={16} color={colors.background} />
                  <Text style={[styles.primaryCardCtaText, { color: colors.background }]}>Add payment method</Text>
                </AnimatedPressable>
              </View>
            )}
          </View>

          {/* Preferences */}
          <View>
            <PremiumListSection title="Preferences">
              <SettingsCell
                icon="wallet-outline"
                iconColor={colors.brand}
                title="Use Thryftverse Balance"
                subtitle="Automatically apply your available balance to purchases"
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
            <PremiumListSection title="Cards">
              {renderPaymentMethodRows(
                cardMethods,
                allowCards,
                'No cards saved yet',
                'Add your first card to checkout faster',
                'Cards unavailable in your region',
                'Switching compliance country will refresh payment rails.',
                'card-outline'
              )}
              {allowCards ? (
                <AppButton
                  title="Add new card"
                  icon={<Ionicons name="add" size={18} color={colors.textPrimary} />}
                  style={styles.addBtn}
                  variant="secondary"
                  size="sm"
                  titleStyle={styles.addText}
                  contentStyle={styles.addBtnContent}
                  iconContainerStyle={styles.addIconWrap}
                  onPress={() => setAddCardSheetVisible(true)}
                  accessibilityLabel="Add new card"
                  accessibilityHint="Opens card setup"
                />
              ) : null}
            </PremiumListSection>
          </View>

          {/* Security Note */}
          <View>
            <View style={[styles.trustNote, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
              <Text style={styles.trustNoteText}>
                Thryftverse stores provider references and limited display details, not card numbers or security codes.
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
  primaryCardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: Space.md,
    gap: Space.xs,
  },
  primaryCardActionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
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
    backgroundColor: colors.surfaceAlt,
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
