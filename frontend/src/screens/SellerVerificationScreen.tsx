import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Typography, Space, Radius, Type } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import {
  fetchSellerVerificationDemands,
  type SellerVerificationDemand,
} from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';

const DEMAND_TYPE_LABELS: Record<string, string> = {
  authenticity: 'Authenticity proof',
  possession: 'Possession proof',
  condition: 'Condition report',
  inspection: 'In-person inspection',
};

const STATUS_COLORS: Record<string, { icon: string; color: string }> = {
  pending: { icon: 'hourglass-outline', color: '#d97706' },
  responded: { icon: 'document-text-outline', color: '#2563eb' },
  compliant: { icon: 'checkmark-circle', color: '#215634' },
  failed: { icon: 'close-circle', color: '#dc2626' },
  expired: { icon: 'time-outline', color: '#6b7280' },
  withdrawn: { icon: 'remove-circle-outline', color: '#6b7280' },
};

export default function SellerVerificationScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useStore((s) => s.currentUser);
  const { show } = useToast();
  const haptic = useHaptic();

  const [demands, setDemands] = useState<SellerVerificationDemand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDemands = useCallback(async (silent = false) => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const result = await fetchSellerVerificationDemands(currentUser.id);
      setDemands(result.demands);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    void loadDemands();
  }, [loadDemands]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void loadDemands(true);
  }, [loadDemands]);

  const pendingCount = demands.filter((d) => d.status === 'pending').length;
  const pendingDemands = demands.filter((d) => d.status === 'pending');
  const otherDemands = demands.filter((d) => d.status !== 'pending');

  const handleDemandPress = useCallback((demand: SellerVerificationDemand) => {
    haptic.light();
    if (demand.status === 'pending') {
      navigation.navigate('VerificationResponse', {
        assetId: demand.assetId,
        demandId: demand.id,
      });
    } else {
      navigation.navigate('AssetDetail', { assetId: demand.assetId });
    }
  }, [navigation, haptic]);

  const renderDemand = useCallback((demand: SellerVerificationDemand, index: number) => {
    const statusInfo = STATUS_COLORS[demand.status] ?? STATUS_COLORS.withdrawn;
    const deadline = new Date(demand.deadline);
    const now = new Date();
    const isOverdue = demand.status === 'pending' && deadline < now;
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return (
      <Reanimated.View key={demand.id} entering={FadeInDown.duration(250).delay(index * 30)}>
        <Pressable
          style={({ pressed }) => [
            styles.demandCard,
            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => handleDemandPress(demand)}
          accessibilityRole="button"
          accessibilityLabel={`${DEMAND_TYPE_LABELS[demand.demandType] ?? demand.demandType} demand, ${demand.status}`}
        >
          {/* Asset thumbnail + title */}
          <View style={styles.demandHeader}>
            {demand.assetImageUrl ? (
              <CachedImage
                uri={demand.assetImageUrl}
                style={styles.assetThumb}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.assetThumb, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.assetInfo}>
              <Text style={[styles.assetTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {demand.assetTitle}
              </Text>
              <Text style={[styles.demandType, { color: colors.textSecondary }]}>
                {DEMAND_TYPE_LABELS[demand.demandType] ?? demand.demandType}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>

          {/* Status row */}
          <View style={styles.demandStatusRow}>
            <View style={styles.statusBadge}>
              <Ionicons
                name={statusInfo.icon as any}
                size={14}
                color={isOverdue ? '#dc2626' : statusInfo.color}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: isOverdue ? '#dc2626' : statusInfo.color },
                ]}
              >
                {isOverdue ? 'Overdue' : demand.status}
              </Text>
            </View>

            {demand.status === 'pending' && !isOverdue && (
              <Text style={[styles.deadlineText, { color: colors.textMuted }]}>
                {daysLeft <= 0
                  ? 'Due today'
                  : daysLeft === 1
                  ? '1 day left'
                  : `${daysLeft} days left`}
              </Text>
            )}
            {demand.status === 'responded' && demand.respondedAt && (
              <Text style={[styles.deadlineText, { color: colors.textMuted }]}>
                Responded {new Date(demand.respondedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
            )}
            {demand.status === 'compliant' && (
              <Text style={[styles.deadlineText, { color: colors.textMuted }]}>
                Verified
              </Text>
            )}
            {demand.status === 'failed' && (
              <Text style={[styles.deadlineText, { color: '#dc2626' }]}>
                Recourse triggered
              </Text>
            )}
          </View>

          {/* Action prompt for pending demands */}
          {demand.status === 'pending' && (
            <View style={[styles.actionPrompt, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons
                name={isOverdue ? 'warning-outline' : 'arrow-forward-circle-outline'}
                size={16}
                color={isOverdue ? '#dc2626' : colors.brand}
              />
              <Text
                style={[
                  styles.actionPromptText,
                  { color: isOverdue ? '#dc2626' : colors.textPrimary },
                ]}
              >
                {isOverdue
                  ? 'Deadline passed — recourse may be triggered'
                  : 'Tap to upload evidence and respond'}
              </Text>
            </View>
          )}
        </Pressable>
      </Reanimated.View>
    );
  }, [colors, styles, handleDemandPress]);

  // ── States ──
  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Verification Requests" onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" title="Loading verification requests..." />
      </FlagshipScreen>
    );
  }

  if (error) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Verification Requests" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="error"
          title="Could not load requests"
          subtitle={error}
          actionLabel="Try again"
          onAction={() => void loadDemands()}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Verification Requests" onBack={() => navigation.goBack()} />}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <Reanimated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        {/* Summary banner */}
        {demands.length > 0 && (
          <View style={[styles.summaryBanner, { backgroundColor: colors.surface }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNumber, { color: pendingCount > 0 ? '#d97706' : colors.textPrimary }]}>
                {pendingCount}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
                {pendingCount === 1 ? 'pending request' : 'pending requests'}
              </Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNumber, { color: colors.textPrimary }]}>
                {demands.length}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
                total
              </Text>
            </View>
          </View>
        )}

        {/* Empty state */}
        {demands.length === 0 ? (
          <FlagshipState
            variant="empty"
            title="No verification requests"
            subtitle="When unit holders request proof of authenticity, possession, or condition, you will see them here."
            icon="shield-checkmark-outline"
          />
        ) : (
          <>
            {/* Pending demands section */}
            {pendingDemands.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  Action required
                </Text>
                {pendingDemands.map((d, i) => renderDemand(d, i))}
              </View>
            )}

            {/* History section */}
            {otherDemands.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  History
                </Text>
                {otherDemands.map((d, i) => renderDemand(d, i))}
              </View>
            )}
          </>
        )}
      </Reanimated.ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xl,
    },
    summaryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.md,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.lg,
      marginBottom: Space.md,
      gap: Space.lg,
    },
    summaryItem: {
      alignItems: 'center',
    },
    summaryNumber: {
      fontSize: Type.priceLarge.size,
      fontFamily: Typography.family.bold,
      lineHeight: Type.priceLarge.lineHeight,
    },
    summaryLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    summaryDivider: {
      width: 1,
      height: 32,
    },
    section: {
      marginBottom: Space.lg,
    },
    sectionTitle: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      marginBottom: Space.sm,
      marginLeft: 2,
    },
    demandCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      marginBottom: Space.sm,
    },
    demandHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    assetThumb: {
      width: 44,
      height: 44,
      borderRadius: Radius.md,
    },
    assetInfo: {
      flex: 1,
      gap: 2,
    },
    assetTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      lineHeight: Type.bodyEmphasis.lineHeight,
    },
    demandType: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },
    demandStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Space.sm,
      marginLeft: 44 + Space.sm,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    statusText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      textTransform: 'capitalize',
    },
    deadlineText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
    },
    actionPrompt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.sm,
      marginLeft: 44 + Space.sm,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.md,
    },
    actionPromptText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
    },
  });
}
