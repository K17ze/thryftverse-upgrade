import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform } from 'react-native';
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
  setDefaultUserPaymentMethod } from '../services/commerceApi';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { useToast } from '../context/ToastContext';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { t } from '../i18n';
import { ConfirmationSheet } from '../components/ConfirmationSheet';

import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
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
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });
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
            isDefault: preferredMethod.isDefault });
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
    setConfirmSheet({
      visible: true,
      title: t('payments.alert.removeTitle'),
      message: t('payments.alert.removeMessage', { label: method.label }),
      confirmLabel: t('payments.alert.remove'),
      cancelLabel: t('payments.alert.cancel'),
      onConfirm: async () => {
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
      variant: 'danger' });
  };

  const handlePaymentMethodPress = (method: CommercePaymentMethod) => {
    if (method.isDefault) {
      setConfirmSheet({
        visible: true,
        title: method.label,
        message: method.details ?? t('payments.label.savedPaymentMethod'),
        confirmLabel: t('payments.alert.remove'),
        cancelLabel: t('payments.alert.cancel'),
        variant: 'danger',
        onConfirm: () => handleRemovePaymentMethod(method) });
    } else {
      setConfirmSheet({
        visible: true,
        title: method.label,
        message: method.details ?? t('payments.label.savedPaymentMethod'),
        confirmLabel: t('payments.alert.setAsDefault'),
        cancelLabel: t('payments.alert.cancel'),
        variant: 'default',
        onConfirm: () => void handleSetDefault(method) });
    }
  };

  const renderPaymentMethodRows = (
    methods: CommercePaymentMethod[],
    allow: boolean,
    unavailableTitle: string,
    unavailableSub: string,
    iconOutline: React.ComponentProps<typeof Ionicons>['name']
  ) => {
    if (!allow) {
      return (
        <SettingsRow
          icon={iconOutline}
          title={unavailableTitle}
          subtitle={unavailableSub}
          isFirst
          isLast
        />
      );
    }
    return methods.map((method, idx) => {
      const brand = getCardBrand(method.brand);
      return (
        <SettingsRow
          key={method.id}
          icon="card-outline"
          iconColor={brand.color}
          title={method.label}
          subtitle={method.details}
          value={method.isDefault ? t('payments.label.default') : undefined}
          onPress={() => handlePaymentMethodPress(method)}
          isFirst={idx === 0}
          isLast={idx === methods.length - 1}
        />
      );
    });
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
              research. Flat rows, no card wrapper or decorative icon circles. */}
          {(allowApplePay || allowGooglePay) && (
            <SettingsSection title={t('payments.section.digitalWallets')}>
              {allowApplePay && Platform.OS === 'ios' && (
                <SettingsRow
                  icon="logo-apple"
                  title={t('payments.wallet.applePay')}
                  subtitle={t('payments.wallet.applePaySub')}
                  value={t('payments.wallet.ready')}
                  isFirst
                  isLast
                />
              )}
              {allowGooglePay && Platform.OS === 'android' && (
                <SettingsRow
                  icon="logo-google"
                  title={t('payments.wallet.googlePay')}
                  subtitle={t('payments.wallet.googlePaySub')}
                  value={t('payments.wallet.ready')}
                  isFirst
                  isLast
                />
              )}
            </SettingsSection>
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

          {/* Primary Payment Method — flat row, no card or decorative icon circle */}
          <SettingsSection title={t('payments.label.primaryMethod')}>
            {defaultMethod ? (
              <SettingsRow
                icon="card-outline"
                iconColor={getCardBrand(defaultMethod.brand).color}
                title={defaultMethod.label}
                subtitle={defaultMethod.details ?? (defaultMethod.type === 'card' ? t('payments.label.cardEnding') : t('payments.label.bankAccount'))}
                value={t('payments.label.default')}
                onPress={() => handlePaymentMethodPress(defaultMethod)}
                accessibilityLabel={`Manage ${defaultMethod.label}`}
                isFirst
                isLast
              />
            ) : (
              <SettingsRow
                icon="card-outline"
                title={t('payments.hero.noMethod')}
                subtitle={t('payments.hero.addCardHint')}
                isFirst
                isLast
              />
            )}
          </SettingsSection>

          {/* Preferences — flat row with toggle, no card wrapper */}
          <SettingsSection title={t('payments.section.preferences')}>
            <SettingsRow
              icon="wallet-outline"
              iconColor={colors.brand}
              title={t('payments.preferences.useBalance')}
              subtitle={t('payments.preferences.useBalanceSub')}
              toggleValue={useBalance}
              onToggle={(v) => updatePaymentPreferences({ useBalance: v })}
              isFirst
              isLast
            />
          </SettingsSection>

          {/* Cards — flat rows, no card wrapper or decorative icon circles.
              When cards are allowed but empty, render a standalone empty
              state instead of nesting FlagshipState inside SettingsSection. */}
          {cardMethods.length > 0 || !allowCards ? (
            <SettingsSection
              title={t('payments.section.cards')}
              description={cardMethods.length > 0 ? `${cardMethods.length} payment method${cardMethods.length !== 1 ? 's' : ''}` : undefined}
            >
              {renderPaymentMethodRows(
                cardMethods,
                allowCards,
                t('payments.cards.unavailableTitle'),
                t('payments.cards.unavailableSub'),
                'card-outline'
              )}
            </SettingsSection>
          ) : (
            <FlagshipState
              variant="empty"
              icon="card-outline"
              title={t('payments.cards.emptyTitle')}
              subtitle={t('payments.cards.emptySub')}
            />
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

        </>
      )}

      <AddCardSheet
        visible={addCardSheetVisible}
        onDismiss={() => setAddCardSheetVisible(false)}
        onSuccess={() => {
          void syncPaymentMethods();
        }}
      />

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={confirmSheet.onConfirm}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  policyLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
    letterSpacing: TypographyV2.meta.letterSpacing },
  // ── Inline trust signal ──
  inlineTrustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.md },
  inlineTrustText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight },
  addBtn: {
    borderRadius: Radius.md,
    marginTop: Space.xs,
    alignSelf: 'flex-start' },
  addBtnContent: {
    gap: Space.sm },
  addIconWrap: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.lg,
    backgroundColor: 'transparent' },
  addText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary } });
}
