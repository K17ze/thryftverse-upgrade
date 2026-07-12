import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { formatCountryPolicyScope, isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { AddCardSheet } from '../components/checkout/AddCardSheet';
import { CommercePaymentMethod, listUserPaymentMethods, updateUserPaymentMethod, deleteUserPaymentMethod } from '../services/commerceApi';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { useToast } from '../context/ToastContext';
import { AppButton } from '../components/ui/AppButton';
import { SettingsCell } from '../components/SettingsCell';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useHaptic } from '../hooks/useHaptic';
import { Typography } from '../theme/designTokens';
import { PremiumListSection } from '../components/ui/PremiumListSection';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = StackScreenProps<RootStackParamList, 'Payments'>;

export default function PaymentsScreen({ navigation }: Props) {
  const reducedMotionEnabled = useReducedMotion();
  const paymentPreferences = useStore((state) => state.paymentPreferences);
  const updatePaymentPreferences = useStore((state) => state.updatePaymentPreferences);
  const useBalance = paymentPreferences.useBalance;
  const [backendPaymentMethods, setBackendPaymentMethods] = useState<CommercePaymentMethod[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [addCardSheetVisible, setAddCardSheetVisible] = useState(false);
  const [countryCapabilities, setCountryCapabilities] = useState<UserCountryCapabilities | null>(null);
  const [isUpdatingDefault, setIsUpdatingDefault] = useState(false);
  const currentUser = useStore((state) => state.currentUser);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const haptic = useHaptic();

  const getCardBrand = (label: string) => {
    const lower = label.toLowerCase();
    if (lower.includes('visa')) return { name: 'Visa', icon: 'card' as const, color: '#1A1F71' };
    if (lower.includes('mastercard') || lower.includes('master')) return { name: 'Mastercard', icon: 'card' as const, color: '#EB001B' };
    if (lower.includes('amex') || lower.includes('american')) return { name: 'Amex', icon: 'card' as const, color: '#2E77BC' };
    if (lower.includes('discover')) return { name: 'Discover', icon: 'card' as const, color: '#FF6000' };
    return { name: 'Card', icon: 'card' as const, color: Colors.textPrimary };
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
        setBackendPaymentMethods(methodsResult.status === 'fulfilled' ? methodsResult.value : []);
        setCountryCapabilities(capabilitiesResult.status === 'fulfilled' ? capabilitiesResult.value : null);
      } catch {
        if (isCancelled?.()) return;
        setBackendPaymentMethods([]);
        setCountryCapabilities(null);
      } finally {
        if (!isCancelled?.()) setIsSyncing(false);
      }
    },
    [currentUser?.id]
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
  const bankMethods = useMemo(
    () => backendPaymentMethods.filter((method) => method.type === 'bank_account'),
    [backendPaymentMethods]
  );

  const fallbackCard = savedPaymentMethod?.type === 'card' ? savedPaymentMethod : null;
  const fallbackBank = savedPaymentMethod?.type === 'bank_account' ? savedPaymentMethod : null;

  const defaultMethod = useMemo(
    () => backendPaymentMethods.find((m) => m.isDefault) ?? (backendPaymentMethods[0] || fallbackCard || fallbackBank || null),
    [backendPaymentMethods, fallbackCard, fallbackBank]
  );

  const allowCards = isPaymentMethodAllowed(countryCapabilities, 'card');
  const allowBankAccounts = isPaymentMethodAllowed(countryCapabilities, 'bank_account');
  const policyLabel = formatCountryPolicyScope(countryCapabilities);

  const handleSetDefault = async (methodId: number) => {
    if (isUpdatingDefault) return;
    setIsUpdatingDefault(true);
    const previous = [...backendPaymentMethods];
    setBackendPaymentMethods((prev) =>
      prev.map((m) => (m.id === methodId ? { ...m, isDefault: true } : { ...m, isDefault: false }))
    );
    const userId = currentUser?.id;
    if (!userId) {
      setIsUpdatingDefault(false);
      return;
    }
    try {
      await updateUserPaymentMethod(userId, methodId, { isDefault: true });
      show('Default payment method updated', 'success');
    } catch {
      show('Failed to update default on server. Reverting...', 'error');
      setBackendPaymentMethods(previous);
    } finally {
      setIsUpdatingDefault(false);
    }
  };

  const handleEditLabel = (method: CommercePaymentMethod) => {
    Alert.prompt(
      'Edit Nickname',
      'Enter a new nickname for this payment method.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (value?: string) => {
            const trimmed = value?.trim();
            if (!trimmed) return;
            const previous = [...backendPaymentMethods];
            setBackendPaymentMethods((prev) =>
              prev.map((m) => (m.id === method.id ? { ...m, label: trimmed } : m))
            );
            const userId = currentUser?.id;
            if (!userId) return;
            try {
              await updateUserPaymentMethod(userId, method.id, { label: trimmed });
              show('Nickname updated', 'success');
            } catch {
              show('Failed to update nickname on server. Reverting...', 'error');
              setBackendPaymentMethods(previous);
            }
          },
        },
      ],
      'plain-text',
      method.label
    );
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
              await deleteUserPaymentMethod(userId, method.id);
            } catch {
              show('Failed to remove on server. Restoring...', 'error');
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
          : [{ text: 'Set as default', onPress: () => handleSetDefault(method.id) }]),
        { text: 'Edit nickname', onPress: () => handleEditLabel(method) },
        { text: 'Remove', style: 'destructive', onPress: () => handleRemovePaymentMethod(method) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderPaymentMethodRows = (
    methods: CommercePaymentMethod[],
    fallback: CommercePaymentMethod | null,
    allow: boolean,
    emptyTitle: string,
    emptySub: string,
    unavailableTitle: string,
    unavailableSub: string,
    iconName: string,
    iconOutline: string
  ) => {
    if (!allow) {
      return (
        <View
          style={styles.paymentRow}
        >
          <View style={styles.iconCircle}>
            <Ionicons name={iconOutline as any} size={20} color={Colors.textPrimary} />
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
        const brand = method.type === 'card' ? getCardBrand(method.label) : { name: 'Bank', icon: 'business' as const, color: Colors.textPrimary };
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
              <Ionicons name={brand.icon as any} size={20} color={brand.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentTitle}>{method.label}</Text>
              <Text style={styles.paymentSub}>{method.details ?? (method.type === 'card' ? 'Saved card' : 'Bank account')}</Text>
            </View>
            {method.isDefault ? (
              <View style={[styles.defaultBadge, { backgroundColor: `${Colors.success}12` }]}>
                <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                <Text style={[styles.defaultText, { color: Colors.success }]}>Default</Text>
              </View>
            ) : null}
          </AnimatedPressable>
        );
      });
    }
    if (fallback) {
      const fbBrand = fallback.type === 'card' ? getCardBrand(fallback.label) : { name: 'Bank', icon: 'business' as const, color: Colors.textPrimary };
      return (
        <AnimatedPressable
          style={styles.paymentRow}
          onPress={() => handlePaymentMethodPress(fallback)}
          scaleValue={0.98}
          hapticFeedback="light"
          activeOpacity={0.8}
        >
          <View style={[styles.iconCircle, { backgroundColor: `${fbBrand.color}12` }]}>
            <Ionicons name={fbBrand.icon as any} size={20} color={fbBrand.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentTitle}>{fallback.label}</Text>
            <Text style={styles.paymentSub}>{fallback.details ?? (fallback.type === 'card' ? 'Saved card' : 'Bank account')}</Text>
          </View>
        </AnimatedPressable>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name={iconOutline as any} size={40} color={Colors.textMuted} />
        <Text style={styles.emptyStateTitle}>{emptyTitle}</Text>
        <Text style={styles.emptyStateSub}>{emptySub}</Text>
      </View>
    );
  };

  const hasError = !isSyncing && backendPaymentMethods.length === 0 && countryCapabilities === null;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Payment Centre"
          subtitle="Manage your payment methods"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => navigation.navigate('AddBankAccount')}
              scaleValue={0.92}
              hapticFeedback="light"
            >
              <Ionicons name="add-circle" size={28} color={Colors.brand} />
            </AnimatedPressable>
          }
        />
      }
    >
      {policyLabel ? (
        <Text style={styles.policyLabel}>Payment policy: {policyLabel}</Text>
      ) : null}

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
        <View style={[styles.trustBanner, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.success} />
          <Text style={[styles.trustBannerText, { color: Colors.textSecondary }]}>
            Your payment details are protected by industry-standard encryption.
          </Text>
        </View>
      </Reanimated.View>

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
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            {defaultMethod ? (
              <View style={[styles.primaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                <View style={styles.primaryCardHeader}>
                  <Text style={[styles.primaryCardLabel, { color: Colors.textMuted }]}>PRIMARY METHOD</Text>
                  <View style={[styles.defaultBadge, { backgroundColor: `${Colors.success}12` }]}>
                    <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                    <Text style={[styles.defaultText, { color: Colors.success }]}>Default</Text>
                  </View>
                </View>
                <View style={styles.primaryCardBody}>
                  <View style={[styles.brandIconCircle, { backgroundColor: `${getCardBrand(defaultMethod.label).color}15` }]}>
                    <Ionicons
                      name={defaultMethod.type === 'card' ? 'card' : 'business'}
                      size={22}
                      color={defaultMethod.type === 'card' ? getCardBrand(defaultMethod.label).color : Colors.textPrimary}
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
                  <Text style={[styles.primaryCardActionText, { color: Colors.brand }]}>Manage</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.brand} />
                </AnimatedPressable>
              </View>
            ) : (
              <View style={[styles.primaryCard, styles.primaryCardEmpty, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                <View style={[styles.brandIconCircle, { backgroundColor: Colors.surfaceAlt }]}>
                  <Ionicons name="card-outline" size={24} color={Colors.textMuted} />
                </View>
                <Text style={styles.primaryCardTitle}>No payment method</Text>
                <Text style={styles.primaryCardSub}>Add a card or bank account to checkout faster</Text>
                <AnimatedPressable
                  style={[styles.primaryCardCta, { backgroundColor: Colors.brand }]}
                  onPress={() => setAddCardSheetVisible(true)}
                  activeOpacity={0.85}
                  hapticFeedback="medium"
                >
                  <Ionicons name="add" size={16} color={Colors.background} />
                  <Text style={[styles.primaryCardCtaText, { color: Colors.background }]}>Add payment method</Text>
                </AnimatedPressable>
              </View>
            )}
          </Reanimated.View>

          {/* Preferences */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            <PremiumListSection title="Preferences">
              <SettingsCell
                icon="wallet-outline"
                iconColor={Colors.brand}
                title="Use Thryftverse Balance"
                subtitle="Automatically apply your available balance to purchases"
                variant="toggle"
                toggleValue={useBalance}
                onToggle={(v) => updatePaymentPreferences({ useBalance: v })}
                isFirst
                isLast
              />
            </PremiumListSection>
          </Reanimated.View>

          {/* Cards */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            <PremiumListSection title="Cards">
              {renderPaymentMethodRows(
                cardMethods,
                fallbackCard as CommercePaymentMethod | null,
                allowCards,
                'No cards saved yet',
                'Add your first card to checkout faster',
                'Cards unavailable in your region',
                'Switching compliance country will refresh payment rails.',
                'card',
                'card-outline'
              )}
              {allowCards ? (
                <AppButton
                  title="Add new card"
                  icon={<Ionicons name="add" size={18} color={Colors.textPrimary} />}
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
          </Reanimated.View>

          {/* Security Note */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            <View style={[styles.trustNote, { backgroundColor: Colors.surfaceAlt }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={Colors.success} />
              <Text style={styles.trustNoteText}>
                Your payment details are protected by industry-standard encryption.
              </Text>
            </View>
          </Reanimated.View>

          {/* Bank Accounts */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            <PremiumListSection title="Bank Accounts">
              {renderPaymentMethodRows(
                bankMethods,
                fallbackBank as CommercePaymentMethod | null,
                allowBankAccounts,
                'No linked bank accounts',
                'Add one for withdrawals and payouts',
                'Bank payouts unavailable in your region',
                'Supported rails will appear when available for your country.',
                'business',
                'business-outline'
              )}
              {allowBankAccounts ? (
                <AppButton
                  title="Add new bank account"
                  icon={<Ionicons name="add" size={18} color={Colors.textPrimary} />}
                  style={styles.addBtn}
                  variant="secondary"
                  size="sm"
                  titleStyle={styles.addText}
                  contentStyle={styles.addBtnContent}
                  iconContainerStyle={styles.addIconWrap}
                  onPress={() => navigation.navigate('AddBankAccount')}
                  accessibilityLabel="Add new bank account"
                  accessibilityHint="Opens bank account setup"
                />
              ) : null}
            </PremiumListSection>
          </Reanimated.View>
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

const styles = StyleSheet.create({
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
    color: Colors.textMuted,
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
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  primaryCardSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginTop: 2,
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
    width: 48,
    height: 48,
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
    color: Colors.textSecondary,
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
    borderBottomColor: Colors.border,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Space.sm + Space.xs,
  },
  paymentTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
    letterSpacing: Type.body.letterSpacing,
  },
  paymentSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    paddingRight: 10,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  defaultBadge: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  defaultText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
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
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  addText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
  },
  emptyStateTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    marginTop: Space.md,
    textAlign: 'center',
    letterSpacing: Type.body.letterSpacing,
  },
  emptyStateSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
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