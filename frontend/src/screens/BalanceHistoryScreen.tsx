import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useConnectivity } from '../hooks/useConnectivity';
import { listUserTransactions, UserTransaction } from '../services/commerceApi';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { Space, IconGrammar } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { useToast } from '../context/ToastContext';

const PAGE_SIZE = 50;

type Props = NativeStackScreenProps<RootStackParamList, 'BalanceHistory'>;

function formatDateLabel(createdAt: string): string {
  const d = new Date(createdAt);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function iconForType(type: string, lineType: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (lineType.includes('refund') || type === 'refund') return 'refresh-outline';
  if (lineType.includes('withdrawal') || type === 'withdrawal') return 'arrow-up-circle-outline';
  if (lineType.includes('seller_payable') || type === 'sale') return 'trending-up';
  if (lineType.includes('buyer_spend') || type === 'purchase') return 'bag-handle-outline';
  if (lineType.includes('payout') || type === 'payout') return 'cash-outline';
  return 'receipt-outline';
}

function colorForType(type: string, lineType: string, colors: ThemeColors) {
  if (lineType.includes('refund') || type === 'refund') return colors.textSecondary;
  if (lineType.includes('withdrawal') || type === 'withdrawal') return colors.danger;
  if (lineType.includes('seller_payable') || type === 'sale') return colors.success;
  if (lineType.includes('buyer_spend') || type === 'purchase') return colors.textSecondary;
  if (lineType.includes('payout') || type === 'payout') return colors.brand;
  return colors.textMuted;
}

function labelForType(type: string, lineType: string): string {
  if (lineType.includes('refund') || type === 'refund') return 'Refund';
  if (lineType.includes('withdrawal') || type === 'withdrawal') return 'Withdrawal';
  if (lineType.includes('seller_payable') || type === 'sale') return 'Sale proceeds';
  if (lineType.includes('buyer_spend') || type === 'purchase') return 'Purchase';
  if (lineType.includes('payout') || type === 'payout') return 'Payout';
  return lineType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BalanceHistoryScreen({ navigation }: Props) {
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const { show } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);
  const { isOffline } = useConnectivity();
  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const hydrate = useCallback(async () => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setIsError(false);
    setOffset(0);
    setHasMore(true);
    try {
      const result = await listUserTransactions(currentUser.id, PAGE_SIZE, 0);
      setTransactions(result.items);
      setHasMore(result.items.length >= PAGE_SIZE);
    } catch {
      setIsError(true);
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!currentUser?.id) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setIsError(false);
      try {
        const result = await listUserTransactions(currentUser.id, PAGE_SIZE, 0);
        if (!cancelled) {
          setTransactions(result.items);
          setHasMore(result.items.length >= PAGE_SIZE);
        }
      } catch {
        if (!cancelled) {
          setIsError(true);
          setTransactions([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !currentUser?.id) return;
    setIsLoadingMore(true);
    const nextOffset = offset + PAGE_SIZE;
    try {
      const result = await listUserTransactions(currentUser.id, PAGE_SIZE, nextOffset);
      setTransactions((prev) => [...prev, ...result.items]);
      setOffset(nextOffset);
      setHasMore(result.items.length >= PAGE_SIZE);
    } catch {
      setHasMore(false);
      show('Could not load more transactions. Pull to retry.', 'error');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, offset, currentUser?.id]);

  // ── Net flow: total in minus total out (the useful hero metric) ──
  const netFlow = useMemo(() => {
    return transactions.reduce((sum, tx) => {
      return sum + (tx.direction === 'credit' ? Math.abs(tx.amount) : -Math.abs(tx.amount));
    }, 0);
  }, [transactions]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Payout history"
          subtitle="Order ledger"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {isLoading ? (
        <FlagshipState variant="loading" />
      ) : isError ? (
        <FlagshipState
          variant={isOffline ? 'offline' : 'error'}
          title={isOffline ? 'You are offline' : 'Couldn\'t load history'}
          subtitle={isOffline ? 'Check your connection and try again.' : 'We couldn\'t load your transactions. Tap below to try again.'}
          actionLabel="Try again"
          onAction={hydrate}
        />
      ) : transactions.length === 0 ? (
        <FlagshipState
          variant="empty"
          icon="receipt-outline"
          title="No orders yet"
          subtitle="Your order history will appear here once you start buying, selling, or withdrawing."
        />
      ) : (
        <>
          {/* ── Net flow hero — flat, no card (replaces redundant count) ── */}
          <View style={styles.heroSection}>
            <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Net flow</Text>
            <Text
              style={[
                styles.heroValue,
                { color: netFlow >= 0 ? colors.success : colors.danger },
              ]}
              accessibilityLabel={`Net flow ${formatFromFiat(Math.abs(netFlow), 'GBP', { displayMode: 'fiat' })}`}
            >
              {netFlow >= 0 ? '+' : '-'}{formatFromFiat(Math.abs(netFlow), 'GBP', { displayMode: 'fiat' })}
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
              {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
            </Text>
          </View>

          {/* ── Flat transaction list — hairline separators, no card ── */}
          <View>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ORDER LEDGER</Text>
            {transactions.map((tx, idx) => (
              <View key={tx.id}>
                <View style={styles.txRow}>
                  <View style={styles.txIcon}>
                    <Ionicons name={iconForType(tx.type, tx.lineType)} size={IconGrammar.metadata} color={colorForType(tx.type, tx.lineType, colors)} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txLabel}>{labelForType(tx.type, tx.lineType)}</Text>
                    <Text style={styles.txDate}>{formatDateLabel(tx.createdAt)}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.direction === 'credit' ? colors.success : colors.textPrimary }]}>
                    {tx.direction === 'credit' ? '+' : '-'}{formatFromFiat(Math.abs(tx.amount), 'GBP', { displayMode: 'fiat' })}
                  </Text>
                </View>
                {idx < transactions.length - 1 && <View style={styles.separator} />}
              </View>
            ))}
            {hasMore && (
              <Pressable
                style={({ pressed }) => [styles.loadMoreBtn, pressed && styles.loadMoreBtnPressed]}
                onPress={() => void handleLoadMore()}
                disabled={isLoadingMore}
                accessibilityRole="button"
                accessibilityLabel="Load more transactions"
              >
                {isLoadingMore ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={styles.loadMoreText}>Load more</Text>
                )}
              </Pressable>
            )}
          </View>
        </>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  // ── Net flow hero — flat, no card ──
  heroSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm },
  heroLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase' },
  heroValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: TypographyV2.priceHero.fontFamily,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'],
    marginTop: Space.xs },
  heroSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs },
  sectionLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.sm },
  // ── Flat transaction rows — no card wrapper ──
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 56,
    gap: Space.sm + 2 },
  txIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center' },
  txInfo: {
    flex: 1,
    gap: 2 },
  txLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textPrimary },
  txDate: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted },
  txAmount: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
    textAlign: 'right' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginLeft: Space.md + 36 + Space.sm + 2 },
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: Space.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle },
  loadMoreBtnPressed: {
    opacity: 0.6 },
  loadMoreText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand,
    letterSpacing: TypographyV2.body.letterSpacing } });
}
