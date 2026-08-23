import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
} from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, IconGrammar } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { getWalletLedger, type WalletLedgerItem } from '../../services/walletApi';
import { formatRelativeTime, formatDayLabel } from '../../utils/dateFormat';
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

// Categorized transaction kinds with direction-aware icons.
// Inflows use filled/downward glyphs; outflows use outline/upward glyphs.
// This gives the list a clear visual rhythm: the eye reads direction first.
const KIND_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; direction: 'in' | 'out' | 'neutral' }> = {
  MINT: { label: 'Top-up', icon: 'arrow-down-circle', direction: 'in' },
  BURN: { label: 'Redemption', icon: 'arrow-up-circle-outline', direction: 'out' },
  CO_OWN_TRADE: { label: 'Co-Own trade', icon: 'swap-horizontal', direction: 'neutral' },
  COMMERCE_ORDER: { label: 'Purchase', icon: 'bag-outline', direction: 'out' },
  COMMERCE_REFUND: { label: 'Refund', icon: 'return-up-back', direction: 'in' },
  AUCTION_SETTLEMENT: { label: 'Auction win', icon: 'trophy', direction: 'in' },
  PAYOUT: { label: 'Payout', icon: 'cash-outline', direction: 'out' },
  TRANSFER_SENT: { label: 'Transfer sent', icon: 'arrow-forward-outline', direction: 'out' },
  TRANSFER_RECEIVED: { label: 'Transfer received', icon: 'arrow-back', direction: 'in' },
};

function groupByDate(items: WalletLedgerItem[]): { title: string; data: WalletLedgerItem[] }[] {
  const groups: Record<string, WalletLedgerItem[]> = {};

  for (const item of items) {
    const key = formatDayLabel(item.createdAt);

    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

// Flattened discriminated-union item type for FlashList.
// Each section becomes a 'header' entry followed by its 'item' entries.
type FlattenedListItem =
  | { type: 'header'; sectionTitle: string }
  | { type: 'item' } & WalletLedgerItem;

function flattenSections(
  sections: { title: string; data: WalletLedgerItem[] }[]
): FlattenedListItem[] {
  const result: FlattenedListItem[] = [];
  for (const section of sections) {
    result.push({ type: 'header', sectionTitle: section.title });
    for (const item of section.data) {
      result.push({ type: 'item', ...item });
    }
  }
  return result;
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

  const renderTransactionRow = useCallback(({ item }: { item: WalletLedgerItem }) => {
    const kindInfo = KIND_LABELS[item.kind] ?? { label: item.kind, icon: 'ellipse-outline' as const, direction: 'neutral' as const };
    const isPositive = item.amount > 0;
    const amountText = item.asset === '1ZE'
      ? `${isPositive ? '+' : ''}${item.amountDisplay.toFixed(3)} 1ZE`
      : `${isPositive ? '+' : ''}${formatFromFiat(Math.abs(item.amount), 'GBP', { displayMode: 'fiat' })}`;

    // Direction-aware icon color: inflows use success, outflows use textPrimary,
    // neutral trades use brand. This pairs glyph + colour per AGENTS.md §13.
    const iconColor = isPositive ? colors.success : kindInfo.direction === 'neutral' ? colors.brand : colors.textSecondary;
    const iconBg = isPositive ? `${colors.success}15` : kindInfo.direction === 'neutral' ? `${colors.brand}15` : colors.surfaceAlt;
    const amountColor = isPositive ? colors.success : colors.textPrimary;

    return (
      <View style={styles.txRow} accessibilityRole="text" accessibilityLabel={`${kindInfo.label}, ${amountText}, ${formatRelativeTime(item.createdAt)}`}>
        <View style={[styles.txIconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={kindInfo.icon} size={IconGrammar.metadata} color={iconColor} />
        </View>
        <View style={styles.txContent}>
          <Text style={styles.txLabel} numberOfLines={1}>{kindInfo.label}</Text>
          <Text style={styles.txTime}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
        <Text style={[styles.txAmount, { color: amountColor }]}>
          {amountText}
        </Text>
      </View>
    );
  }, [colors, styles, formatFromFiat]);

  const renderSectionHeader = useCallback(({ sectionTitle }: { sectionTitle: string }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{sectionTitle}</Text>
    </View>
  ), [styles]);

  const renderItem: ListRenderItem<FlattenedListItem> = useCallback(({ item }) => {
    if (item.type === 'header') {
      return renderSectionHeader({ sectionTitle: item.sectionTitle });
    }
    return renderTransactionRow({ item });
  }, [renderSectionHeader, renderTransactionRow]);

  const keyExtractor = useCallback((item: FlattenedListItem): string => {
    if (item.type === 'header') {
      return `header-${item.sectionTitle}`;
    }
    return String(item.id);
  }, []);

  const getItemType = useCallback((item: FlattenedListItem) => item.type, []);

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
  const flattenedData = flattenSections(sections);

  return (
    <View style={styles.container}>
      {isOffline && <OfflineBanner compact />}
      <FlashList
        data={flattenedData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemType={getItemType}
        drawDistance={2000}
        overrideProps={{ initialDrawBatchSize: 6 }}
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
      paddingHorizontal: Space.md,
    },
    loadingContainer: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: 0,
    },
    stateContainer: {
      flex: 1,
    },
    txRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      gap: Space.sm + 2,
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
    // Labels use captionElevated per spec — clear, scannable metadata
    txLabel: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.caption.letterSpacing,
      color: colors.textPrimary,
    },
    txTime: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      color: colors.textMuted,
    },
    // Amounts use priceList with tabular-nums per spec — financial numerics
    txAmount: {
      fontSize: Type.priceList.size,
      lineHeight: Type.priceList.lineHeight,
      fontFamily: Typography.family.bold,
      letterSpacing: Type.priceList.letterSpacing,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    sectionHeader: {
      paddingTop: Space.lg,
      paddingBottom: Space.xs + 2,
      backgroundColor: colors.background,
    },
    sectionHeaderText: {
      fontSize: Type.label.size,
      lineHeight: Type.label.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: Type.label.letterSpacing,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginLeft: 52,
    },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      gap: Space.sm + 2,
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
