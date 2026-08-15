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
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnActivitySkeleton } from '../components/coown/CoOwnSkeletons';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/EmptyState';
import {
  fetchCoOwnRecurringOrders,
  createCoOwnRecurringOrder,
  cancelCoOwnRecurringOrder,
  type CoOwnRecurringOrder,
} from '../services/marketApi';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CoOwnRecurringOrders'>;

function formatGbp(minor: number): string {
  return `£${(minor / 100).toFixed(2)}`;
}

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();

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
        {/* Hero summary */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={styles.heroCard}>
            <View style={styles.heroIconRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="repeat" size={22} color={colors.brand} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Auto-invest plans</Text>
                <Text style={styles.heroSubtitle}>
                  {activeOrders.length === 0
                    ? 'No active plans'
                    : `${activeOrders.length} active plan${activeOrders.length !== 1 ? 's' : ''}`}
                </Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

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
              <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(80)}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Active</Text>
                  <View style={styles.sectionCount}>
                    <Text style={styles.sectionCountText}>{activeOrders.length}</Text>
                  </View>
                </View>
                {activeOrders.map((order, idx) => (
                  <Reanimated.View
                    key={order.id}
                    entering={FadeInDown.duration(300).delay((idx + 2) * 60)}
                  >
                    <View style={styles.orderCard}>
                      <Pressable
                        style={({ pressed }) => [styles.orderInfo, pressed && { opacity: 0.85 }]}
                        onPress={() => { haptic.light(); navigation.navigate('AssetDetail', { assetId: order.assetId }); }}
                      >
                        <View style={styles.orderHeader}>
                          {/* Frequency badge — visual identity */}
                          <View style={[styles.freqBadge, { backgroundColor: colors.brand + '18' }]}>
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
                  </Reanimated.View>
                ))}
              </Reanimated.View>
            )}

            {/* Inactive orders */}
            {inactiveOrders.length > 0 && (
              <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(160)}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Cancelled</Text>
                  <View style={styles.sectionCount}>
                    <Text style={styles.sectionCountText}>{inactiveOrders.length}</Text>
                  </View>
                </View>
                {inactiveOrders.map((order, idx) => (
                  <Reanimated.View
                    key={order.id}
                    entering={FadeInDown.duration(300).delay((idx + 4) * 60)}
                  >
                    <View style={[styles.orderCard, { opacity: 0.55 }]}>
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
                  </Reanimated.View>
                ))}
              </Reanimated.View>
            )}
          </>
        )}

        <AppButton
          title="Create auto-invest plan"
          onPress={() => { haptic.light(); setShowCreate(true); }}
          variant="primary"
          size="lg"
          icon={<Ionicons name="add-circle-outline" size={18} color="#fff" />}
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
              <View style={[styles.modalIconWrap, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="add-circle" size={22} color={colors.brand} />
              </View>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>New auto-invest plan</Text>
                <Text style={styles.modalSubtitle}>Automatically buy units on a schedule</Text>
              </View>
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

            <Text style={styles.inputLabel}>Max price per unit (optional, £)</Text>
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

    // Hero summary
    heroCard: {
      borderRadius: Radius.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.lg,
      marginTop: Space.sm,
    },
    heroIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
      lineHeight: Type.subtitle.lineHeight,
    },
    heroSubtitle: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      letterSpacing: Type.captionElevated.letterSpacing,
      lineHeight: Type.captionElevated.lineHeight,
      marginTop: Space.xs / 2,
    },

    introText: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      letterSpacing: Type.captionElevated.letterSpacing,
      lineHeight: Type.captionElevated.lineHeight,
      marginTop: Space.lg,
      marginBottom: Space.md,
    },

    // Section headers
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.lg,
      marginBottom: Space.sm,
      paddingHorizontal: Space.xs,
    },
    sectionTitle: {
      fontSize: Type.metaElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: Type.metaElevated.letterSpacing,
      lineHeight: Type.metaElevated.lineHeight,
      opacity: 0.7,
    },
    sectionCount: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs / 2,
      minWidth: 24,
      alignItems: 'center',
    },
    sectionCountText: {
      fontSize: Type.metaElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.metaElevated.letterSpacing,
    },

    // Order cards
    orderCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
      marginBottom: Space.sm,
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
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.bold,
      color: colors.brand,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.captionElevated.letterSpacing,
    },
    orderHeaderText: { flex: 1 },
    orderAsset: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
      lineHeight: Type.bodyEmphasis.lineHeight,
    },
    orderDetail: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      letterSpacing: Type.captionElevated.letterSpacing,
      lineHeight: Type.captionElevated.lineHeight,
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
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.captionElevated.letterSpacing,
      lineHeight: Type.captionElevated.lineHeight,
    },
    orderNext: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.medium,
      color: colors.brand,
      letterSpacing: Type.captionElevated.letterSpacing,
      lineHeight: Type.captionElevated.lineHeight,
    },
    orderExecutions: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.captionElevated.letterSpacing,
      lineHeight: Type.captionElevated.lineHeight,
    },
    cancelButton: { padding: Space.sm },

    // Modal
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: Space.lg,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      padding: Space.lg,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      marginBottom: Space.lg,
    },
    modalIconWrap: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalHeaderText: { flex: 1 },
    modalTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
      lineHeight: Type.subtitle.lineHeight,
    },
    modalSubtitle: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      letterSpacing: Type.captionElevated.letterSpacing,
      lineHeight: Type.captionElevated.lineHeight,
      marginTop: Space.xs / 2,
    },
    inputLabel: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      letterSpacing: Type.captionElevated.letterSpacing,
      lineHeight: Type.captionElevated.lineHeight,
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
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      letterSpacing: Type.captionElevated.letterSpacing,
      lineHeight: Type.captionElevated.lineHeight,
    },
    modalActions: {
      flexDirection: 'row',
      marginTop: Space.lg,
    },
  });
}
