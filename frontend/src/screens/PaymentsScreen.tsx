import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
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
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { SettingsCell } from '../components/SettingsCell';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Typography } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'Payments'>;

export default function PaymentsScreen({ navigation }: Props) {
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

  const syncPaymentMethods = useCallback(
    async (isCancelled?: () => boolean) => {
      setIsSyncing(true);
      try {
        const userId = currentUser?.id ?? 'u1';
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
    try {
      const userId = currentUser?.id ?? 'u1';
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
            try {
              const userId = currentUser?.id ?? 'u1';
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
            try {
              const userId = currentUser?.id ?? 'u1';
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
      return methods.map((method, idx) => (
        <AnimatedPressable
          key={method.id}
          style={[styles.paymentRow, idx < methods.length - 1 && styles.paymentRowBorder]}
          onPress={() => handlePaymentMethodPress(method)}
          scaleValue={0.98}
          hapticFeedback="light"
          activeOpacity={0.8}
        >
          <View style={styles.iconCircle}>
            <Ionicons name={iconName as any} size={20} color={Colors.textPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentTitle}>{method.label}</Text>
            <Text style={styles.paymentSub}>{method.details ?? 'Saved'}</Text>
          </View>
          {method.isDefault ? (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>Default</Text>
            </View>
          ) : null}
        </AnimatedPressable>
      ));
    }
    if (fallback) {
      return (
        <AnimatedPressable
          style={styles.paymentRow}
          onPress={() => handlePaymentMethodPress(fallback)}
          scaleValue={0.98}
          hapticFeedback="light"
          activeOpacity={0.8}
        >
          <View style={styles.iconCircle}>
            <Ionicons name={iconName as any} size={20} color={Colors.textPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentTitle}>{fallback.label}</Text>
            <Text style={styles.paymentSub}>{fallback.details ?? 'Saved'}</Text>
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <ScreenHeader title="Payments" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {policyLabel ? (
          <Text style={styles.policyLabel}>Payment policy: {policyLabel}</Text>
        ) : null}

        {isSyncing && backendPaymentMethods.length === 0 && (
          <View style={styles.skeletonWrap}>
            <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
            <View style={{ height: Space.sm }} />
            <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
            <View style={{ height: Space.sm }} />
            <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
          </View>
        )}

        {/* Preferences */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <SettingsCard>
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
          </SettingsCard>
        </Reanimated.View>

        {/* Cards */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
          <Text style={styles.sectionTitle}>Cards</Text>
          <SettingsCard>
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
          </SettingsCard>
        </Reanimated.View>

        {/* Bank Accounts */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
          <Text style={styles.sectionTitle}>Bank Accounts</Text>
          <SettingsCard>
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
          </SettingsCard>
        </Reanimated.View>
      </ScrollView>

      <AddCardSheet
        visible={addCardSheetVisible}
        onDismiss={() => setAddCardSheetVisible(false)}
        onSuccess={() => {
          void syncPaymentMethods();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
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
  syncingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginLeft: Space.xs,
    marginBottom: Space.sm,
  },
  skeletonWrap: {
    marginBottom: Space.md,
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
    marginLeft: Space.xs,
    marginBottom: Space.sm,
    marginTop: Space.lg,
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
});
