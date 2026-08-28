/**
 * CoOwnRecurringOrdersScreen — manage auto-invest recurring orders.
 *
 * Users can view, create, and cancel recurring buy orders for Co-Own assets.
 * Supports weekly, biweekly, and monthly frequencies with optional max price.
 *
 * Per Design.md Component G: financial UI must be truthful and legible.
 * Each order card shows frequency badge, next execution date, and execution
 * count with clear visual hierarchy.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnActivitySkeleton } from '../components/coown/CoOwnSkeletons';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/EmptyState';
import { SettingsSection } from '../components/settings/SettingsSection';
import {
  fetchCoOwnRecurringOrders,
  createCoOwnRecurringOrder,
  cancelCoOwnRecurringOrder,
  type CoOwnRecurringOrder,
} from '../services/marketApi';
import { RootStackParamList } from '../navigation/types';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { t } from '../i18n';


type Props = NativeStackScreenProps<RootStackParamList, 'CoOwnRecurringOrders'>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

const FREQUENCY_SHORT: Record<string, string> = {
  weekly: 'W',
  biweekly: '2W',
  monthly: 'M',
};

export default function CoOwnRecurringOrdersScreen({ navigation }: Props) {
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat, currencySymbol, currencyCode } = useFormattedPrice();

  const formatGbp = React.useCallback(
    (minor: number) => formatFromFiat(minor / 100, currencyCode),
    [formatFromFiat, currencyCode]
  );

  const [orders, setOrders] = React.useState<CoOwnRecurringOrder[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Create modal state
  const [showCreate, setShowCreate] = React.useState(false);
  const [assetId, setAssetId] = React.useState('');
  const [units, setUnits] = React.useState('');
  const [frequency, setFrequency] = React.useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [maxPrice, setMaxPrice] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCoOwnRecurringOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recurring orders');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = (order: CoOwnRecurringOrder) => {
    Alert.alert(
      'Cancel recurring order?',
      `This will stop automatic purchases of ${order.unitsPerExecution} units ${FREQUENCY_LABELS[order.frequency]}.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelCoOwnRecurringOrder(order.id);
              haptic.success();
              show('Recurring order cancelled', 'success');
              await load();
            } catch {
              show('Failed to cancel order', 'error');
            }
          },
        },
      ]
    );
  };

  const handleCreate = async () => {
    const unitsNum = parseInt(units, 10);
    if (!assetId.trim()) { show('Enter an asset ID', 'error'); return; }
    if (!unitsNum || unitsNum < 1) { show('Enter a valid number of units', 'error'); return; }

    setSubmitting(true);
    try {
      const maxPriceNum = maxPrice.trim() ? Math.round(parseFloat(maxPrice) * 100) : undefined;
      await createCoOwnRecurringOrder({
        assetId: assetId.trim(),
        unitsPerExecution: unitsNum,
        frequency,
        maxPriceGbpMinor: maxPriceNum,
      });
      haptic.success();
      show('Recurring order created', 'success');
      setShowCreate(false);
      setAssetId('');
      setUnits('');
      setMaxPrice('');
      await load();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Failed to create order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Auto-Invest" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <CoOwnActivitySkeleton />
        </ScrollView>
      </FlagshipScreen>
    );
  }

  const activeOrders = orders.filter((o) => o.active);
  const inactiveOrders = orders.filter((o) => !o.active);

  return (
    <>
      <FlagshipScreen
        header={<FlagshipHeader title="Auto-Invest" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); void load(); }} tintColor={colors.textSecondary} />}
          showsVerticalScrollIndicator={false}
        >
        {/* Hero summary — flat, no card */}
        <View style={styles.heroWrap}>
          <Text style={styles.heroTitle}>Auto-invest plans</Text>
          <Text style={styles.heroSubtitle}>
            {activeOrders.length === 0
              ? 'No active plans'
              : `${activeOrders.length} active plan${activeOrders.length !== 1 ? 's' : ''}`}
          </Text>
        </View>

        <Text style={styles.introText}>
          Set up recurring purchases to automatically buy units on a schedule. Cancel at any time.
        </Text>

        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load orders"
            subtitle={error}
            ctaLabel="Retry"
            onCtaPress={() => { setIsLoading(true); void load(); }}
          />
        ) : orders.length === 0 ? (
          <EmptyState
            icon="repeat-outline"
            title="No recurring orders"
            subtitle="Create an auto-invest plan to automatically buy units on a schedule."
          />
        ) : (
          <>
            {/* Active orders */}
            {activeOrders.length > 0 && (
              <SettingsSection title="Active">
                {activeOrders.map((order, i) => (
                  <View
                    key={order.id}
                    style={[
                      styles.orderRow,
                      i < activeOrders.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    ]}
                  >
                    <Pressable
                      style={({ pressed }) => [styles.orderInfo, pressed && { opacity: 0.85 }]}
                      onPress={() => { haptic.light(); navigation.navigate('AssetDetail', { assetId: order.assetId }); }}
                      accessibilityLabel="View order details"
                      accessibilityRole="link"
                    >
                      <View style={styles.orderHeader}>
                        {/* Frequency badge — visual identity */}
                        <View style={[styles.freqBadge, { backgroundColor: colors.brandSubtle }]}>
                          <Text style={styles.freqBadgeText}>
                            {FREQUENCY_SHORT[order.frequency] ?? order.frequency}
                          </Text>
                        </View>
                        <View style={styles.orderHeaderText}>
                          <Text style={styles.orderAsset}>{order.assetId.slice(0, 16)}…</Text>
                          <Text style={styles.orderDetail}>
                            {order.unitsPerExecution} units · {FREQUENCY_LABELS[order.frequency]}
                          </Text>
                        </View>
                      </View>
                      {order.maxPriceGbpMinor != null && (
                        <View style={styles.orderMetaRow}>
                          <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} />
                          <Text style={styles.orderMaxPrice}>
                            Max {formatGbp(order.maxPriceGbpMinor)}/unit
                          </Text>
                        </View>
                      )}
                      <View style={styles.orderMetaRow}>
                        <Ionicons name="calendar-outline" size={12} color={colors.brand} />
                        <Text style={styles.orderNext}>
                          Next {formatDate(order.nextExecutionAt)}
                        </Text>
                      </View>
                      <View style={styles.orderMetaRow}>
                        <Ionicons name="checkmark-circle-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.orderExecutions}>
                          {order.executionsCount} execution{order.executionsCount !== 1 ? 's' : ''} completed
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => { haptic.light(); handleCancel(order); }}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel recurring order"
                      hitSlop={12}
                    >
                      <Ionicons name="close-circle-outline" size={24} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </SettingsSection>
            )}

            {/* Inactive orders */}
            {inactiveOrders.length > 0 && (
              <SettingsSection title="Cancelled">
                {inactiveOrders.map((order, i) => (
                  <View
                    key={order.id}
                    style={[
                      styles.orderRow,
                      { opacity: 0.55 },
                      i < inactiveOrders.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={styles.orderInfo}>
                      <View style={styles.orderHeader}>
                        <View style={[styles.freqBadge, { backgroundColor: colors.surfaceAlt }]}>
                          <Text style={[styles.freqBadgeText, { color: colors.textMuted }]}>
                            {FREQUENCY_SHORT[order.frequency] ?? order.frequency}
                          </Text>
                        </View>
                        <View style={styles.orderHeaderText}>
                          <Text style={styles.orderAsset}>{order.assetId.slice(0, 16)}…</Text>
                          <Text style={styles.orderDetail}>
                            {order.unitsPerExecution} units · {FREQUENCY_LABELS[order.frequency]}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.orderMetaRow}>
                        <Ionicons name="checkmark-circle-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.orderExecutions}>
                          {order.executionsCount} execution{order.executionsCount !== 1 ? 's' : ''} completed
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </SettingsSection>
            )}
          </>
        )}

        <AppButton
          title="Create auto-invest plan"
          onPress={() => { haptic.light(); setShowCreate(true); }}
          variant="primary"
          size="lg"
          icon={<Ionicons name="add-circle-outline" size={18} color={colors.textInverse} />}
          style={{ marginTop: Space.lg }}
        />

        <View style={{ height: Space.xxl }} />
        </ScrollView>
      </FlagshipScreen>

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New auto-invest plan</Text>
              <Text style={styles.modalSubtitle}>Automatically buy units on a schedule</Text>
            </View>

            <Text style={styles.inputLabel}>Asset ID</Text>
            <TextInput
              style={styles.input}
              value={assetId}
              onChangeText={setAssetId}
              placeholder="e.g. asset_abc123"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Units per execution</Text>
            <TextInput
              style={styles.input}
              value={units}
              onChangeText={setUnits}
              placeholder="e.g. 5"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Frequency</Text>
            <View style={styles.frequencyRow}>
              {(['weekly', 'biweekly', 'monthly'] as const).map((f) => {
                const isSelected = frequency === f;
                return (
                  <Pressable
                    key={f}
                    style={({ pressed }) => [styles.frequencyTab, isSelected && { backgroundColor: colors.brand, borderColor: colors.brand }, pressed && { opacity: 0.8 }]}
                    onPress={() => { haptic.selection(); setFrequency(f); }}
                    accessibilityRole="button"
                    accessibilityLabel={FREQUENCY_LABELS[f]}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.frequencyText, isSelected && { color: colors.textInverse }]}>
                      {FREQUENCY_LABELS[f]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.inputLabel}>Max price per unit (optional, {currencySymbol})</Text>
            <TextInput
              style={styles.input}
              value={maxPrice}
              onChangeText={setMaxPrice}
              placeholder="e.g. 25.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />

            <View style={styles.modalActions}>
              <AppButton
                title="Cancel"
                onPress={() => setShowCreate(false)}
                variant="secondary"
                size="md"
                style={{ flex: 1, marginRight: Space.sm }}
              />
              <AppButton
                title={submitting ? 'Creating…' : 'Create'}
                onPress={handleCreate}
                variant="primary"
                size="md"
                disabled={submitting}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loadingBody: { flex: 1 },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

    // Hero summary — flat, no card
    heroWrap: {
      marginTop: Space.sm,
      paddingHorizontal: Space.xs,
    },
    heroTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
      lineHeight: Type.subtitle.lineHeight,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      marginTop: Space.xs / 2,
    },

    introText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      marginTop: Space.lg,
      marginBottom: Space.md,
    },

    // Order rows — flat canvas, hairline separators
    orderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
    },
    orderInfo: { flex: 1 },
    orderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    freqBadge: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    freqBadgeText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.bold,
      color: colors.brand,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.caption.letterSpacing,
    },
    orderHeaderText: { flex: 1 },
    orderAsset: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.bodyStrong.letterSpacing,
      lineHeight: Type.bodyStrong.lineHeight,
    },
    orderDetail: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      marginTop: Space.xs / 2,
      fontVariant: ['tabular-nums'],
    },
    orderMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs + 2,
    },
    orderMaxPrice: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    orderNext: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.brand,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    orderExecutions: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    cancelButton: { padding: Space.sm },

    // Modal
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      backgroundColor: colors.overlay,
      padding: Space.lg,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      padding: Space.lg,
    },
    modalHeader: {
      marginBottom: Space.lg,
    },
    modalTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
      lineHeight: Type.subtitle.lineHeight,
    },
    modalSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      marginTop: Space.xs / 2,
    },
    inputLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      marginTop: Space.sm + 2,
      marginBottom: Space.xs,
    },
    input: {
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.body.letterSpacing,
    },
    frequencyRow: {
      flexDirection: 'row',
      gap: Space.xs,
    },
    frequencyTab: {
      flex: 1,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      alignItems: 'center',
    },
    frequencyText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    modalActions: {
      flexDirection: 'row',
      marginTop: Space.lg,
    },
  });
}
