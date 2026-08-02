/**
 * CoOwnRecurringOrdersScreen — manage auto-invest recurring orders.
 *
 * Users can view, create, and cancel recurring buy orders for Co-Own assets.
 * Supports weekly, biweekly, and monthly frequencies with optional max price.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/EmptyState';
import {
  fetchCoOwnRecurringOrders,
  createCoOwnRecurringOrder,
  cancelCoOwnRecurringOrder,
  type CoOwnRecurringOrder,
} from '../services/marketApi';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'CoOwnRecurringOrders'>;

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

export default function CoOwnRecurringOrdersScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();

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
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Auto-Invest" onBack={() => navigation.goBack()} />
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  const activeOrders = orders.filter((o) => o.active);
  const inactiveOrders = orders.filter((o) => !o.active);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Auto-Invest" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); void load(); }} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.introText}>
          Set up recurring purchases to automatically buy units on a schedule. You can cancel at any time.
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
            {activeOrders.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active ({activeOrders.length})</Text>
                {activeOrders.map((order) => (
                  <View key={order.id} style={styles.orderCard}>
                    <Pressable
                      style={styles.orderInfo}
                      onPress={() => navigation.navigate('AssetDetail', { assetId: order.assetId })}
                    >
                      <View style={styles.orderHeader}>
                        <Ionicons name="repeat" size={18} color={colors.brand} />
                        <Text style={styles.orderAsset}>{order.assetId.slice(0, 16)}…</Text>
                      </View>
                      <Text style={styles.orderDetail}>
                        {order.unitsPerExecution} units · {FREQUENCY_LABELS[order.frequency]}
                      </Text>
                      {order.maxPriceGbpMinor != null && (
                        <Text style={styles.orderMaxPrice}>
                          Max price: {formatGbp(order.maxPriceGbpMinor)}
                        </Text>
                      )}
                      <Text style={styles.orderNext}>
                        Next: {formatDate(order.nextExecutionAt)}
                      </Text>
                      <Text style={styles.orderExecutions}>
                        {order.executionsCount} execution{order.executionsCount !== 1 ? 's' : ''} completed
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => { haptic.light(); handleCancel(order); }}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel recurring order"
                    >
                      <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {inactiveOrders.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cancelled ({inactiveOrders.length})</Text>
                {inactiveOrders.map((order) => (
                  <View key={order.id} style={[styles.orderCard, { opacity: 0.5 }]}>
                    <View style={styles.orderInfo}>
                      <View style={styles.orderHeader}>
                        <Ionicons name="repeat" size={18} color={colors.textMuted} />
                        <Text style={styles.orderAsset}>{order.assetId.slice(0, 16)}…</Text>
                      </View>
                      <Text style={styles.orderDetail}>
                        {order.unitsPerExecution} units · {FREQUENCY_LABELS[order.frequency]}
                      </Text>
                      <Text style={styles.orderExecutions}>
                        {order.executionsCount} execution{order.executionsCount !== 1 ? 's' : ''} completed
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
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

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Auto-Invest Plan</Text>

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
                    style={[styles.frequencyTab, isSelected && { backgroundColor: colors.brand }]}
                    onPress={() => { haptic.selection(); setFrequency(f); }}
                  >
                    <Text style={[styles.frequencyText, isSelected && { color: '#fff' }]}>
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
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
    introText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: 20,
      marginTop: Space.md,
      marginBottom: Space.lg,
    },
    section: { marginTop: Space.md },
    sectionTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: Space.sm,
    },
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
    orderAsset: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    orderDetail: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: Space.xs,
    },
    orderMaxPrice: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
    },
    orderNext: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.brand,
      marginTop: 4,
    },
    orderExecutions: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
    },
    cancelButton: { padding: Space.sm },
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
    modalTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginBottom: Space.md,
    },
    inputLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      marginTop: Space.sm,
      marginBottom: Space.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    frequencyRow: {
      flexDirection: 'row',
      gap: Space.xs,
    },
    frequencyTab: {
      flex: 1,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
    },
    frequencyText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
    },
    modalActions: {
      flexDirection: 'row',
      marginTop: Space.lg,
    },
  });
}
