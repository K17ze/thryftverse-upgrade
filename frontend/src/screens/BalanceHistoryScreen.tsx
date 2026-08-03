import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { listUserTransactions, UserTransaction } from '../services/commerceApi';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'BalanceHistory'>;

function formatDateLabel(createdAt: string): string {
  const d = new Date(createdAt);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function iconForType(type: string, lineType: string) {
  if (lineType.includes('refund') || type === 'refund') return 'refresh-outline';
  if (lineType.includes('withdrawal') || type === 'withdrawal') return 'arrow-up-circle-outline';
  if (lineType.includes('seller_payable') || type === 'sale') return 'trending-up';
  if (lineType.includes('buyer_spend') || type === 'purchase') return 'bag-handle-outline';
  return 'receipt-outline';
}

function colorForType(type: string, lineType: string, colors: ThemeColors) {
  if (lineType.includes('refund') || type === 'refund') return colors.textSecondary;
  if (lineType.includes('withdrawal') || type === 'withdrawal') return colors.danger;
  if (lineType.includes('seller_payable') || type === 'sale') return colors.brand;
  if (lineType.includes('buyer_spend') || type === 'purchase') return colors.textSecondary;
  return colors.textMuted;
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
          {/* Hero summary — transaction count + net flow */}
          <Reanimated.View entering={FadeInDown.duration(300)}>
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
                    Last 50 records
                  </Text>
                </View>
              </View>
            </View>
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
            <View style={styles.card}>
              {transactions.map((tx, idx) => (
                <Reanimated.View
                  key={tx.id}
                  entering={FadeInDown.delay(Math.min(idx, 10) * 40).duration(300)}
                >
                  <View style={styles.txRow}>
                    <View style={[styles.txIcon, { backgroundColor: colorForType(tx.type, tx.lineType, colors) + '22' }]}>
                      <Ionicons name={iconForType(tx.type, tx.lineType) as any} size={18} color={colorForType(tx.type, tx.lineType, colors)} />
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txLabel}>{tx.lineType.replace(/_/g, ' ')}</Text>
                      <Text style={styles.txDate}>{formatDateLabel(tx.createdAt)} | {tx.type}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: tx.direction === 'credit' ? colors.brand : colors.danger }]}>
                      {tx.direction === 'credit' ? '+' : '-'}{formatFromFiat(Math.abs(tx.amount), 'GBP', { displayMode: 'fiat' })}
                    </Text>
                  </View>
                  {idx < transactions.length - 1 && <View style={styles.divider} />}
                </Reanimated.View>
              ))}
            </View>
          </Reanimated.View>
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
    marginBottom: Space.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  heroSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  card: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: Radius.lg, overflow: 'hidden' },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  txIcon: { width: 38, height: 38, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', marginRight: Space.sm },
  txInfo: { flex: 1 },
  txLabel: { fontSize: Type.body.size, fontFamily: Typography.family.medium, color: colors.textPrimary, marginBottom: 2 },
  txDate: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: colors.textMuted },
  txAmount: { fontSize: Type.bodyEmphasis.size, fontFamily: Typography.family.bold },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: Space.md },
  });
}