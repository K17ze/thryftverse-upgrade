/**
 * CoOwnPriceAlertsScreen — manage Co-Own asset price alerts.
 *
 * Users can create alerts that trigger when an asset's price crosses
 * a target threshold (above or below). Shows active and triggered alerts.
 *
 * Per Design.md Component G: financial UI must be truthful and legible.
 * Numeric values use tabular/mono style. Condition badges use semantic
 * colours (success for above, danger for below, warning for triggered).
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control, LetterSpacing } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { CoOwnActivitySkeleton } from '../components/coown/CoOwnSkeletons';
import { EmptyState } from '../components/EmptyState';
import {
  fetchCoOwnPriceAlerts,
  deleteCoOwnPriceAlert,
  type CoOwnPriceAlert,
} from '../services/marketApi';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CoOwnPriceAlerts'>;

function formatGbp(minor: number): string {
  return `£${(minor / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CoOwnPriceAlertsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();

  const [alerts, setAlerts] = React.useState<CoOwnPriceAlert[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  const handleDelete = (alert: CoOwnPriceAlert) => {
    Alert.alert(
      'Delete alert?',
      `Remove the ${alert.condition} ${formatGbp(alert.targetPriceGbpMinor)} alert?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCoOwnPriceAlert(alert.id);
              haptic.success();
              show('Alert deleted', 'success');
              await load();
            } catch {
              show('Failed to delete alert', 'error');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Price Alerts" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <CoOwnActivitySkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const activeAlerts = alerts.filter((a) => a.active && !a.triggeredAt);
  const triggeredAlerts = alerts.filter((a) => a.triggeredAt);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Price Alerts" onBack={() => navigation.goBack()} />
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
            title="No price alerts"
            subtitle="Create alerts from an asset's detail page to get notified when the price moves."
          />
        ) : (
          <>
            {/* Hero summary */}
            <Reanimated.View entering={FadeInDown.duration(300)}>
              <View style={styles.heroCard}>
                <View style={styles.heroIconRow}>
                  <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                    <Ionicons name="notifications" size={20} color={colors.textInverse} />
                  </View>
                  <View style={styles.heroText}>
                    <Text style={styles.heroTitle}>Price alerts</Text>
                    <Text style={styles.heroSubtitle}>
                      {activeAlerts.length} active · {triggeredAlerts.length} triggered
                    </Text>
                  </View>
                </View>
              </View>
            </Reanimated.View>

            {/* Active alerts */}
            {activeAlerts.length > 0 && (
              <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Active</Text>
                  <View style={styles.sectionCount}>
                    <Text style={styles.sectionCountText}>{activeAlerts.length}</Text>
                  </View>
                </View>
                {activeAlerts.map((alert, idx) => {
                  const isAbove = alert.condition === 'above';
                  const badgeColor = isAbove ? colors.success : colors.danger;
                  return (
                    <Reanimated.View
                      key={alert.id}
                      entering={FadeInDown.duration(300).delay((idx + 2) * 60)}
                    >
                      <Pressable
                        style={({ pressed }) => [styles.alertCard, pressed && { opacity: 0.85 }]}
                        onPress={() => { haptic.light(); navigation.navigate('AssetDetail', { assetId: alert.assetId }); }}
                      >
                        <View style={styles.alertInfo}>
                          {/* Condition badge — semantic colour */}
                          <View style={[styles.conditionBadge, { backgroundColor: badgeColor + '18' }]}>
                            <Ionicons
                              name={isAbove ? 'arrow-up' : 'arrow-down'}
                              size={18}
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
                        </View>
                        <Pressable
                          style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.5 }]}
                          onPress={() => { haptic.light(); handleDelete(alert); }}
                          accessibilityRole="button"
                          accessibilityLabel="Delete alert"
                          hitSlop={12}
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.danger} />
                        </Pressable>
                      </Pressable>
                    </Reanimated.View>
                  );
                })}
              </Reanimated.View>
            )}

            {/* Triggered alerts */}
            {triggeredAlerts.length > 0 && (
              <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Triggered</Text>
                  <View style={styles.sectionCount}>
                    <Text style={styles.sectionCountText}>{triggeredAlerts.length}</Text>
                  </View>
                </View>
                {triggeredAlerts.map((alert, idx) => {
                  const isAbove = alert.condition === 'above';
                  return (
                    <Reanimated.View
                      key={alert.id}
                      entering={FadeInDown.duration(300).delay((idx + 4) * 60)}
                    >
                      <View style={[styles.alertCard, { opacity: 0.65 }]}>
                        <View style={styles.alertInfo}>
                          <View style={[styles.conditionBadge, { backgroundColor: colors.warning + '18' }]}>
                            <Ionicons name="checkmark" size={18} color={colors.warning} />
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
                        </View>
                      </View>
                    </Reanimated.View>
                  );
                })}
              </Reanimated.View>
            )}
          </>
        )}
        <View style={{ height: Space.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
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
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: Space.xs / 2,
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
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps,
      opacity: 0.7,
    },
    sectionCount: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs / 2,
      minWidth: Space.lg,
      alignItems: 'center',
    },
    sectionCountText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
    },

    // Alert cards
    alertCard: {
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
    alertInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      flex: 1,
    },
    conditionBadge: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    alertText: { flex: 1 },
    alertCondition: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: Type.metaElevated.letterSpacing,
    },
    alertPrice: {
      fontSize: Type.priceList.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      marginTop: Space.xs / 2,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.priceList.letterSpacing,
    },
    alertDate: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs,
    },
    deleteButton: {
      padding: Space.sm,
    },
  });
}
