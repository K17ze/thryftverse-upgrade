/**
 * CoOwnPriceAlertsScreen — manage Co-Own asset price alerts.
 *
 * A simple list of active alerts with enable/disable toggles and delete.
 * No dashboard — just the alerts themselves. Per doc 50: one dominant
 * action per row (toggle), one destructive action (delete with confirm),
 * server truth via API.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnActivitySkeleton } from '../components/coown/CoOwnSkeletons';
import { EmptyState } from '../components/EmptyState';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import {
  fetchCoOwnPriceAlerts,
  deleteCoOwnPriceAlert,
  toggleCoOwnPriceAlert,
  type CoOwnPriceAlert,
} from '../services/marketApi';
import { RootStackParamList } from '../navigation/types';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { useFormattedPrice } from '../hooks/useFormattedPrice';

type Props = NativeStackScreenProps<RootStackParamList, 'CoOwnPriceAlerts'>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CoOwnPriceAlertsScreen({ navigation }: Props) {
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat, currencyCode } = useFormattedPrice();

  const formatGbp = React.useCallback(
    (minor: number) => formatFromFiat(minor / 100, currencyCode),
    [formatFromFiat, currencyCode]
  );

  const [alerts, setAlerts] = React.useState<CoOwnPriceAlert[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [togglingIds, setTogglingIds] = React.useState<Set<string>>(new Set());
  const [confirmSheet, setConfirmSheet] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCoOwnPriceAlerts();
      setAlerts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load price alerts');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = React.useCallback(async (alert: CoOwnPriceAlert) => {
    if (togglingIds.has(alert.id)) return;
    const nextActive = !alert.active;
    haptic.light();
    // Optimistic update
    setAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, active: nextActive } : a))
    );
    setTogglingIds((prev) => new Set(prev).add(alert.id));
    try {
      await toggleCoOwnPriceAlert(alert.id, nextActive);
      show(nextActive ? 'Alert enabled' : 'Alert paused', 'info');
    } catch {
      // Rollback
      setAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, active: !nextActive } : a))
      );
      show('Failed to update alert. Try again.', 'error');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(alert.id);
        return next;
      });
    }
  }, [togglingIds, haptic, show]);

  const handleDelete = (alert: CoOwnPriceAlert) => {
    haptic.heavy();
    setConfirmSheet({
      visible: true,
      title: 'Delete alert?',
      message: `Remove the ${alert.condition} ${formatGbp(alert.targetPriceGbpMinor)} alert?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        try {
          await deleteCoOwnPriceAlert(alert.id);
          haptic.success();
          show('Alert deleted', 'success');
          await load();
        } catch {
          show('Failed to delete alert', 'error');
        }
      },
      variant: 'danger',
    });
  };

  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Price Alerts" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <CoOwnActivitySkeleton />
        </ScrollView>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Price Alerts" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); void load(); }} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load alerts"
            subtitle={error}
            ctaLabel="Retry"
            onCtaPress={() => { setIsLoading(true); void load(); }}
          />
        ) : alerts.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="No price alerts set"
            subtitle="Create alerts from an asset's detail page to get notified when the price moves."
          />
        ) : (
          <>
            {/* Active alerts — simple flat list with toggle + delete */}
            {alerts.filter((a) => a.active && !a.triggeredAt).length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>Active</Text>
                {alerts.filter((a) => a.active && !a.triggeredAt).map((alert) => {
                  const isAbove = alert.condition === 'above';
                  const badgeColor = isAbove ? colors.success : colors.danger;
                  const isToggling = togglingIds.has(alert.id);
                  return (
                    <View key={alert.id}>
                      <View style={styles.alertRow}>
                        <Pressable
                          style={({ pressed }) => [styles.alertInfo, pressed && { opacity: 0.85 }]}
                          onPress={() => { haptic.light(); navigation.navigate('AssetDetail', { assetId: alert.assetId }); }}
                          accessibilityRole="button"
                          accessibilityLabel={`View asset, alert ${alert.condition} ${formatGbp(alert.targetPriceGbpMinor)}`}
                        >
                          <View style={[styles.conditionBadge, { backgroundColor: badgeColor + '18' }]}>
                            <Ionicons
                              name={isAbove ? 'arrow-up' : 'arrow-down'}
                              size={16}
                              color={badgeColor}
                            />
                          </View>
                          <View style={styles.alertText}>
                            <Text style={styles.alertCondition}>
                              {isAbove ? 'Above' : 'Below'}
                            </Text>
                            <Text style={styles.alertPrice}>
                              {formatGbp(alert.targetPriceGbpMinor)}
                            </Text>
                            <Text style={styles.alertDate}>Created {formatDate(alert.createdAt)}</Text>
                          </View>
                        </Pressable>

                        {/* Enable/disable toggle */}
                        <Pressable
                          style={({ pressed }) => [styles.toggleTarget, pressed && { opacity: 0.7 }]}
                          onPress={() => void handleToggle(alert)}
                          disabled={isToggling}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: alert.active, busy: isToggling }}
                          accessibilityLabel={alert.active ? 'Pause alert' : 'Enable alert'}
                        >
                          {isToggling ? (
                            <ActivityIndicator size="small" color={colors.brand} />
                          ) : (
                            <View style={[styles.toggleTrack, { borderColor: alert.active ? colors.brand : colors.border, backgroundColor: alert.active ? colors.brandSubtle : colors.surfaceAlt }]}>
                              <View style={[styles.toggleThumb, { backgroundColor: alert.active ? colors.brand : colors.textMuted, alignSelf: alert.active ? 'flex-end' : 'flex-start' }]} />
                            </View>
                          )}
                        </Pressable>

                        {/* Delete */}
                        <Pressable
                          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                          onPress={() => { haptic.light(); handleDelete(alert); }}
                          accessibilityRole="button"
                          accessibilityLabel="Delete alert"
                          hitSlop={12}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Paused alerts */}
            {alerts.filter((a) => !a.active && !a.triggeredAt).length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>Paused</Text>
                {alerts.filter((a) => !a.active && !a.triggeredAt).map((alert) => {
                  const isAbove = alert.condition === 'above';
                  const isToggling = togglingIds.has(alert.id);
                  return (
                    <View key={alert.id}>
                      <View style={[styles.alertRow, { opacity: 0.6 }]}>
                        <Pressable
                          style={({ pressed }) => [styles.alertInfo, pressed && { opacity: 0.85 }]}
                          onPress={() => { haptic.light(); navigation.navigate('AssetDetail', { assetId: alert.assetId }); }}
                          accessibilityRole="button"
                          accessibilityLabel={`View asset, paused alert ${alert.condition} ${formatGbp(alert.targetPriceGbpMinor)}`}
                        >
                          <View style={[styles.conditionBadge, { backgroundColor: colors.surfaceAlt }]}>
                            <Ionicons
                              name={isAbove ? 'arrow-up' : 'arrow-down'}
                              size={16}
                              color={colors.textMuted}
                            />
                          </View>
                          <View style={styles.alertText}>
                            <Text style={styles.alertCondition}>
                              {isAbove ? 'Above' : 'Below'}
                            </Text>
                            <Text style={styles.alertPrice}>
                              {formatGbp(alert.targetPriceGbpMinor)}
                            </Text>
                            <Text style={styles.alertDate}>Paused</Text>
                          </View>
                        </Pressable>

                        <Pressable
                          style={({ pressed }) => [styles.toggleTarget, pressed && { opacity: 0.7 }]}
                          onPress={() => void handleToggle(alert)}
                          disabled={isToggling}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: alert.active, busy: isToggling }}
                          accessibilityLabel={alert.active ? 'Pause alert' : 'Enable alert'}
                        >
                          {isToggling ? (
                            <ActivityIndicator size="small" color={colors.brand} />
                          ) : (
                            <View style={[styles.toggleTrack, { borderColor: alert.active ? colors.brand : colors.border, backgroundColor: alert.active ? colors.brandSubtle : colors.surfaceAlt }]}>
                              <View style={[styles.toggleThumb, { backgroundColor: alert.active ? colors.brand : colors.textMuted, alignSelf: alert.active ? 'flex-end' : 'flex-start' }]} />
                            </View>
                          )}
                        </Pressable>

                        <Pressable
                          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                          onPress={() => { haptic.light(); handleDelete(alert); }}
                          accessibilityRole="button"
                          accessibilityLabel="Delete alert"
                          hitSlop={12}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Triggered alerts */}
            {alerts.filter((a) => a.triggeredAt).length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>Triggered</Text>
                {alerts.filter((a) => a.triggeredAt).map((alert) => {
                  const isAbove = alert.condition === 'above';
                  return (
                    <View key={alert.id}>
                      <View style={[styles.alertRow, { opacity: 0.65 }]}>
                        <Pressable
                          style={({ pressed }) => [styles.alertInfo, pressed && { opacity: 0.85 }]}
                          onPress={() => { haptic.light(); navigation.navigate('AssetDetail', { assetId: alert.assetId }); }}
                          accessibilityRole="button"
                          accessibilityLabel={`View asset, triggered alert ${alert.condition} ${formatGbp(alert.targetPriceGbpMinor)}`}
                        >
                          <View style={[styles.conditionBadge, { backgroundColor: colors.warningSubtle }]}>
                            <Ionicons name="checkmark" size={16} color={colors.warning} />
                          </View>
                          <View style={styles.alertText}>
                            <Text style={styles.alertCondition}>
                              {isAbove ? 'Above' : 'Below'}
                            </Text>
                            <Text style={styles.alertPrice}>
                              {formatGbp(alert.targetPriceGbpMinor)}
                            </Text>
                            <Text style={styles.alertDate}>
                              Triggered {alert.triggeredAt ? formatDate(alert.triggeredAt) : ''}
                            </Text>
                          </View>
                        </Pressable>

                        <Pressable
                          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                          onPress={() => { haptic.light(); handleDelete(alert); }}
                          accessibilityRole="button"
                          accessibilityLabel="Delete alert"
                          hitSlop={12}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
        <View style={{ height: Space.xxl }} />
      </ScrollView>

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
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

    // Section headers — flat, no count badge dashboard
    sectionTitle: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: TypographyV2.label.letterSpacing,
      lineHeight: TypographyV2.label.lineHeight,
      marginTop: Space.lg,
      marginBottom: Space.sm,
      paddingHorizontal: Space.xs,
    },

    // Alert rows — flat with hairline separator, no card
    alertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      minHeight: Control.hit,
    },
    alertInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      flex: 1,
    },
    conditionBadge: {
      width: Space.xl + Space.xs,
      height: Space.xl + Space.xs,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    alertText: { flex: 1 },
    alertCondition: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: TypographyV2.label.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
    },
    alertPrice: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      marginTop: Space.xs / 2,
      fontVariant: ['tabular-nums'],
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
    },
    alertDate: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs / 2,
    },

    // Toggle
    toggleTarget: {
      padding: Space.xs,
      minHeight: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    toggleTrack: {
      width: Space.xxl + Space.xs,
      height: Space.lg + Space.xs,
      borderRadius: Radius.xl,
      borderWidth: Stroke.standard,
      justifyContent: 'center',
      paddingHorizontal: Space.xs - 1,
    },
    toggleThumb: {
      width: Space.lg - Space.xs,
      height: Space.lg - Space.xs,
      borderRadius: Radius.lg,
    },

    // Delete
    deleteBtn: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
