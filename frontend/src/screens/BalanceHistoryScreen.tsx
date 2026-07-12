import React from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { listUserTransactions, UserTransaction } from '../services/commerceApi';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { FlagshipEmptyGraphic } from '../components/flagship';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Space, Radius, Type } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = StackScreenProps<RootStackParamList, 'BalanceHistory'>;

const ACCENT = Colors.brand;
const BG = Colors.background;
const CARD = Colors.surface;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;

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

function colorForType(type: string, lineType: string) {
  if (lineType.includes('refund') || type === 'refund') return Colors.textSecondary;
  if (lineType.includes('withdrawal') || type === 'withdrawal') return Colors.danger;
  if (lineType.includes('seller_payable') || type === 'sale') return ACCENT;
  if (lineType.includes('buyer_spend') || type === 'purchase') return Colors.textSecondary;
  return Colors.textMuted;
}

export default function BalanceHistoryScreen({ navigation }: Props) {
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);
  const reducedMotionEnabled = useReducedMotion();
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
      <ScreenHeader title="History" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size="small" color={ACCENT} />
            <Text style={{ fontSize: 13, color: MUTED, marginTop: 12 }}>Loading transactions...</Text>
          </View>
        )}

        {!isLoading && transactions.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <FlagshipEmptyGraphic variant="bag" size={120} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 6, marginTop: 12 }}>No transactions yet</Text>
            <Text style={{ fontSize: 13, color: MUTED, textAlign: 'center' }}>
              Your transaction history will appear here once you start buying, selling, or withdrawing.
            </Text>
          </View>
        )}

        {!isLoading && transactions.length > 0 && (
          <View style={styles.card}>
            {transactions.map((tx, idx) => (
              <Reanimated.View
                key={tx.id}
                entering={reducedMotionEnabled ? undefined : FadeInDown.delay(Math.min(idx, 10) * 40).duration(300)}
              >
                <View style={styles.txRow}>
                  <View style={[styles.txIcon, { backgroundColor: colorForType(tx.type, tx.lineType) + '22' }]}>
                    <Ionicons name={iconForType(tx.type, tx.lineType) as any} size={18} color={colorForType(tx.type, tx.lineType)} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txLabel}>{tx.lineType.replace(/_/g, ' ')}</Text>
                    <Text style={styles.txDate}>{formatDateLabel(tx.createdAt)} | {tx.type}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.direction === 'credit' ? ACCENT : Colors.danger }]}>
                    {tx.direction === 'credit' ? '+' : '-'}{formatFromFiat(Math.abs(tx.amount), 'GBP', { displayMode: 'fiat' })}
                  </Text>
                </View>
                {idx < transactions.length - 1 && <View style={styles.divider} />}
              </Reanimated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: TEXT },
  content: { padding: 20 },
  group: { marginBottom: 24 },
  monthLabel: { fontSize: 13, fontWeight: '700', color: MUTED, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: Radius.lg, overflow: 'hidden' },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  txIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  txInfo: { flex: 1 },
  txLabel: { fontSize: 14, fontWeight: '500', color: TEXT, marginBottom: 2 },
  txDate: { fontSize: 12, color: MUTED },
  txAmount: { fontSize: 15, fontWeight: '700' },
  divider: { height: 1, backgroundColor: BORDER, marginHorizontal: 18 },
  footerNote: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 8 },
});