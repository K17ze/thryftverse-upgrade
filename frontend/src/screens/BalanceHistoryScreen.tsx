import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { listUserTransactions, UserTransaction } from '../services/commerceApi';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { Space, Radius, Type, Typography } from '../theme/designTokens';

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);
  const [transactions, setTransactions] = React.useState<UserTransaction[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      if (!currentUser?.id) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const result = await listUserTransactions(currentUser.id, 50, 0);
        if (!cancelled) setTransactions(result.items);
      } catch {
        if (!cancelled) setTransactions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void hydrate();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

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
      ) : transactions.length === 0 ? (
        <FlagshipState
          variant="empty"
          icon="receipt-outline"
          title="No transactions yet"
          subtitle="Your transaction history will appear here once you start buying, selling, or withdrawing."
        />
      ) : (
        <>
          {/* Hero summary — net flow + transaction count */}
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.heroRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="receipt" size={18} color={colors.textInverse} />
              </View>
              <View style={styles.heroText}>
                <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                  {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                  Last {transactions.length} record{transactions.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          </View>

          <View>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TRANSACTION LEDGER</Text>
            <View style={styles.card}>
              {transactions.map((tx, idx) => (
                <View key={tx.id}>
                  <View style={styles.txRow}>
                    <View style={[styles.txIcon, { backgroundColor: colorForType(tx.type, tx.lineType, colors) + '22' }]}>
                      <Ionicons name={iconForType(tx.type, tx.lineType)} size={18} color={colorForType(tx.type, tx.lineType, colors)} />
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txLabel}>{labelForType(tx.type, tx.lineType)}</Text>
                      <Text style={styles.txDate}>{formatDateLabel(tx.createdAt)}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: tx.direction === 'credit' ? colors.brand : colors.danger }]}>
                      {tx.direction === 'credit' ? '+' : '-'}{formatFromFiat(Math.abs(tx.amount), 'GBP', { displayMode: 'fiat' })}
                    </Text>
                  </View>
                  {idx < transactions.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  heroIcon: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  heroSubtitle: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    marginTop: Space.xs / 2,
  },
  card: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: Radius.lg, overflow: 'hidden' },
  sectionLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  txIcon: { width: Space.xl + Space.xs + 2, height: Space.xl + Space.xs + 2, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', marginRight: Space.sm },
  txInfo: { flex: 1 },
  txLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
    color: colors.textPrimary,
    marginBottom: Space.xs / 2,
  },
  txDate: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    color: colors.textMuted,
  },
  txAmount: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: Space.md },
  });
}