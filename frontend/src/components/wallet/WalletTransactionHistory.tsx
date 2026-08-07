import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { getWalletLedger, type WalletLedgerItem } from '../../services/walletApi';
import { useStore } from '../../store/useStore';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { EmptyState } from '../EmptyState';
import { useConnectivity } from '../../hooks/useConnectivity';
import { OfflineBanner } from '../OfflineBanner';

interface WalletTransactionHistoryProps {
  /** Optional filter — 'ALL' shows everything, '1ZE' or 'FIAT' filters by asset */
  assetFilter?: 'ALL' | '1ZE' | 'FIAT';
  /** Limit number of items to fetch */
  limit?: number;
}

const KIND_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  MINT: { label: 'Top-up', icon: 'arrow-down-circle-outline' },
  BURN: { label: 'Redemption', icon: 'arrow-up-circle-outline' },
  CO_OWN_TRADE: { label: 'Co-Own trade', icon: 'swap-horizontal-outline' },
  COMMERCE_ORDER: { label: 'Purchase', icon: 'bag-outline' },
  COMMERCE_REFUND: { label: 'Refund', icon: 'return-up-back-outline' },
  AUCTION_SETTLEMENT: { label: 'Auction win', icon: 'trophy-outline' },
  PAYOUT: { label: 'Payout', icon: 'cash-outline' },
  TRANSFER_SENT: { label: 'Transfer sent', icon: 'arrow-forward-outline' },
  TRANSFER_RECEIVED: { label: 'Transfer received', icon: 'arrow-back-outline' },
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function groupByDate(items: WalletLedgerItem[]): { title: string; data: WalletLedgerItem[] }[] {
  const groups: Record<string, WalletLedgerItem[]> = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const item of items) {
    const date = new Date(item.createdAt);
    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const key = isToday ? 'Today' : isYesterday ? 'Yesterday' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

export function WalletTransactionHistory({
  assetFilter = 'ALL',
  limit = 100,
}: WalletTransactionHistoryProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { isOffline } = useConnectivity();

  const [items, setItems] = useState<WalletLedgerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLedger = useCallback(async (showLoading: boolean) => {
    if (!currentUser?.id) return;
    if (showLoading) setIsLoading(true);
    setIsError(false);

    try {
      const response = await getWalletLedger(currentUser.id, { asset: assetFilter, limit });
      setItems(response.items);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [currentUser?.id, assetFilter, limit]);

  useEffect(() => {
    void fetchLedger(true);
  }, [fetchLedger]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchLedger(false);
  }, [fetchLedger]);

  const renderItem = useCallback(({ item }: { item: WalletLedgerItem }) => {
    const kindInfo = KIND_LABELS[item.kind] ?? { label: item.kind, icon: 'ellipse-outline' as const };
    const isPositive = item.amount > 0;
    const amountText = item.asset === '1ZE'
      ? `${isPositive ? '+' : ''}${item.amountDisplay.toFixed(3)} 1ZE`
      : `${isPositive ? '+' : ''}${formatFromFiat(Math.abs(item.amount), 'GBP', { displayMode: 'fiat' })}`;

    return (
      <View style={styles.txRow}>
        <View style={[styles.txIconWrap, { backgroundColor: isPositive ? `${colors.success}15` : `${colors.danger}15` }]}>
          <Ionicons name={kindInfo.icon} size={18} color={isPositive ? colors.success : colors.danger} />
        </View>
        <View style={styles.txContent}>
          <Text style={styles.txLabel} numberOfLines={1}>{kindInfo.label}</Text>
          <Text style={styles.txTime}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
        <Text style={[styles.txAmount, { color: isPositive ? colors.success : colors.textPrimary }]}>
          {amountText}
        </Text>
      </View>
    );
  }, [colors, styles, formatFromFiat]);

  const renderSectionHeader = useCallback(({ section }: { section: { title: string } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  ), [styles]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={styles.skeletonRow}>
            <View style={[styles.skeletonIcon, { backgroundColor: colors.surfaceAlt }]} />
            <View style={styles.skeletonContent}>
              <View style={[styles.skeletonLine, { width: '40%', backgroundColor: colors.surfaceAlt }]} />
              <View style={[styles.skeletonLine, { width: '25%', height: 12, backgroundColor: colors.surfaceAlt }]} />
            </View>
            <View style={[styles.skeletonLine, { width: 70, backgroundColor: colors.surfaceAlt }]} />
          </View>
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.stateContainer}>
        <OfflineBanner />
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load history"
          subtitle="Check your connection and try again."
          ctaLabel="Try Again"
          onCtaPress={() => void fetchLedger(true)}
        />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="receipt-outline"
        title="No transactions yet"
        subtitle="Your 1ZE and fiat transactions will appear here once you start trading."
        density="compact"
      />
    );
  }

  const sections = groupByDate(items);

  return (
    <View style={styles.container}>
      {isOffline && <OfflineBanner compact />}
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: Space.lg,
    },
    loadingContainer: {
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
      gap: 0,
    },
    stateContainer: {
      flex: 1,
    },
    txRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.md,
      gap: Space.md,
      minHeight: 56,
    },
    txIconWrap: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txContent: {
      flex: 1,
      gap: 2,
    },
    txLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    txTime: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    txAmount: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.bold,
      letterSpacing: -0.2,
    },
    sectionHeader: {
      paddingTop: Space.md,
      paddingBottom: Space.xs,
      backgroundColor: colors.background,
    },
    sectionHeaderText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 52,
    },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.md,
      gap: Space.md,
    },
    skeletonIcon: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
    },
    skeletonContent: {
      flex: 1,
      gap: 4,
    },
    skeletonLine: {
      height: 14,
      borderRadius: Radius.sm,
    },
  });
}
