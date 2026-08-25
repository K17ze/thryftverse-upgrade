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
import { Space, Radius, Type, Typography, IconGrammar } from '../theme/designTokens';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { useToast } from '../context/ToastContext';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';

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
          subtitle="Transaction ledger"
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
          title="No transactions yet"
          subtitle="Your transaction history will appear here once you start buying, selling, or withdrawing."
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
              accessibilityLabel={`Net flow ${formatFromFiat(Math.abs(netFlow), DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}`}
            >
              {netFlow >= 0 ? '+' : '-'}{formatFromFiat(Math.abs(netFlow), DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
              {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
            </Text>
          </View>

          {/* ── Flat transaction list — hairline separators, no card ── */}
          <View>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TRANSACTION LEDGER</Text>
            {transactions.map((tx, idx) => (
              <View key={tx.id}>
                <View style={styles.txRow}>
                  <View style={[styles.txIcon, { backgroundColor: colorForType(tx.type, tx.lineType, colors) + '22' }]}>
                    <Ionicons name={iconForType(tx.type, tx.lineType)} size={IconGrammar.metadata} color={colorForType(tx.type, tx.lineType, colors)} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txLabel}>{labelForType(tx.type, tx.lineType)}</Text>
                    <Text style={styles.txDate}>{formatDateLabel(tx.createdAt)}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.direction === 'credit' ? colors.success : colors.textPrimary }]}>
                    {tx.direction === 'credit' ? '+' : '-'}{formatFromFiat(Math.abs(tx.amount), DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}
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
    paddingBottom: Space.sm,
  },
  heroLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
  },
  heroValue: {
    fontSize: Type.priceHero.size,
    lineHeight: Type.priceHero.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'],
    marginTop: Space.xs,
  },
  heroSubtitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    marginTop: Space.xs,
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.sm,
  },
  // ── Flat transaction rows — no card wrapper ──
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 56,
    gap: Space.sm + 2,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    color: colors.textPrimary,
  },
  txDate: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    color: colors.textMuted,
  },
  txAmount: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginLeft: Space.md + 36 + Space.sm + 2,
  },
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: Space.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  loadMoreBtnPressed: {
    opacity: 0.6,
  },
  loadMoreText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
    letterSpacing: Type.body.letterSpacing,
  },
  });
}
