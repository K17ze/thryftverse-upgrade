/**
 * CoOwnPriceAlertsScreen — manage Co-Own asset price alerts.
 *
 * Users can create alerts that trigger when an asset's price crosses
 * a target threshold (above or below). Shows active and triggered alerts.
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { EmptyState } from '../components/EmptyState';
import {
  fetchCoOwnPriceAlerts,
  deleteCoOwnPriceAlert,
  type CoOwnPriceAlert,
} from '../services/marketApi';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'CoOwnPriceAlerts'>;

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
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
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
            {activeAlerts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active ({activeAlerts.length})</Text>
                {activeAlerts.map((alert) => (
                  <Pressable
                    key={alert.id}
                    style={styles.alertCard}
                    onPress={() => navigation.navigate('AssetDetail', { assetId: alert.assetId })}
                  >
                    <View style={styles.alertInfo}>
                      <View style={[styles.conditionBadge, { backgroundColor: alert.condition === 'above' ? colors.success + '15' : colors.danger + '15' }]}>
                        <Ionicons
                          name={alert.condition === 'above' ? 'arrow-up' : 'arrow-down'}
                          size={14}
                          color={alert.condition === 'above' ? colors.success : colors.danger}
                        />
                      </View>
                      <View style={styles.alertText}>
                        <Text style={styles.alertAsset}>{alert.assetId.slice(0, 12)}…</Text>
                        <Text style={styles.alertCondition}>
                          {alert.condition === 'above' ? 'Above' : 'Below'} {formatGbp(alert.targetPriceGbpMinor)}
                        </Text>
                        <Text style={styles.alertDate}>Created {formatDate(alert.createdAt)}</Text>
                      </View>
                    </View>
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => { haptic.light(); handleDelete(alert); }}
                      accessibilityRole="button"
                      accessibilityLabel="Delete alert"
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            )}

            {triggeredAlerts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Triggered ({triggeredAlerts.length})</Text>
                {triggeredAlerts.map((alert) => (
                  <View key={alert.id} style={[styles.alertCard, { opacity: 0.6 }]}>
                    <View style={styles.alertInfo}>
                      <View style={[styles.conditionBadge, { backgroundColor: colors.warning + '15' }]}>
                        <Ionicons name="checkmark" size={14} color={colors.warning} />
                      </View>
                      <View style={styles.alertText}>
                        <Text style={styles.alertAsset}>{alert.assetId.slice(0, 12)}…</Text>
                        <Text style={styles.alertCondition}>
                          {alert.condition === 'above' ? 'Above' : 'Below'} {formatGbp(alert.targetPriceGbpMinor)}
                        </Text>
                        <Text style={styles.alertDate}>
                          Triggered {alert.triggeredAt ? formatDate(alert.triggeredAt) : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
    section: { marginTop: Space.md },
    sectionTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: Space.sm,
    },
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
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    alertText: { flex: 1 },
    alertAsset: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    alertCondition: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
      marginTop: 2,
    },
    alertDate: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
    },
    deleteButton: {
      padding: Space.sm,
    },
  });
}
