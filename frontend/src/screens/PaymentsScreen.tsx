import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
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
import { CommercePaymentMethod, listUserPaymentMethods } from '../services/commerceApi';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { useToast } from '../context/ToastContext';
import { AppButton } from '../components/ui/AppButton';
import { SettingsHeader } from '../components/settings/SettingsHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { SettingsCell } from '../components/SettingsCell';

type Props = StackScreenProps<RootStackParamList, 'Payments'>;

export default function PaymentsScreen({ navigation }: Props) {
  const [useBalance, setUseBalance] = useState(true);
  const [backendPaymentMethods, setBackendPaymentMethods] = useState<CommercePaymentMethod[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [addCardSheetVisible, setAddCardSheetVisible] = useState(false);
  const [countryCapabilities, setCountryCapabilities] = useState<UserCountryCapabilities | null>(null);
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
        <View style={styles.paymentRow}>
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
        <View
          key={method.id}
          style={[styles.paymentRow, idx < methods.length - 1 && styles.paymentRowBorder]}
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
        </View>
      ));
    }
    if (fallback) {
      return (
        <View style={styles.paymentRow}>
          <View style={styles.iconCircle}>
            <Ionicons name={iconName as any} size={20} color={Colors.textPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentTitle}>{fallback.label}</Text>
            <Text style={styles.paymentSub}>{fallback.details ?? 'Saved'}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.paymentRow}>
        <View style={styles.iconCircle}>
          <Ionicons name={iconOutline as any} size={20} color={Colors.textPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.paymentTitle}>{emptyTitle}</Text>
          <Text style={styles.paymentSub}>{emptySub}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <SettingsHeader title="Payments" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {policyLabel ? (
          <Text style={styles.policyLabel}>Payment policy: {policyLabel}</Text>
        ) : null}

        {isSyncing && (
          <View style={styles.syncingRow}>
            <ActivityIndicator size="small" color={Colors.textMuted} />
            <Text style={styles.syncingText}>Syncing payment methods...</Text>
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
              subtitle={`Automatically apply ${formatFromFiat(120.5, 'GBP', { displayMode: 'fiat' })} to purchases`}
              variant="toggle"
              toggleValue={useBalance}
              onToggle={setUseBalance}
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
              'No saved cards',
              'Add a card to pay instantly at checkout',
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
    fontFamily: 'Inter_500Medium',
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
  syncingText: {
    fontSize: Type.caption.size,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    letterSpacing: Type.caption.letterSpacing,
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: 'Inter_600SemiBold',
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Space.sm + Space.xs,
  },
  paymentTitle: {
    fontSize: Type.body.size,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
    marginBottom: 4,
    letterSpacing: Type.body.letterSpacing,
  },
  paymentSub: {
    fontSize: Type.caption.size,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    paddingRight: 10,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  defaultBadge: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  defaultText: {
    fontSize: Type.meta.size,
    fontFamily: 'Inter_600SemiBold',
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
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
  },
});
