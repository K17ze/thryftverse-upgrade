import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { useFormattedPrice } from '../hooks/useFormattedPrice';

type Props = StackScreenProps<RootStackParamList, 'BalanceHistory'>;

const ACCENT = Colors.brand;
const BG = Colors.background;
const CARD = Colors.surface;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;

type TxType = 'sale' | 'withdrawal' | 'refund' | 'purchase';

interface Transaction {
  id: string;
  type: TxType;
  label: string;
  amount: number;
  date: string;
}

const TRANSACTIONS: { month: string; items: Transaction[] }[] = [];

export default function BalanceHistoryScreen({ navigation }: Props) {
  const { formatFromFiat } = useFormattedPrice();
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
      <View style={styles.header}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <Ionicons name="arrow-back" size={24} color={TEXT} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>History</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {TRANSACTIONS.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="receipt-outline" size={40} color={MUTED} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 6 }}>No transactions yet</Text>
            <Text style={{ fontSize: 13, color: MUTED, textAlign: 'center' }}>
              Your transaction history will appear here once you start buying, selling, or withdrawing.
            </Text>
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
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, overflow: 'hidden' },
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


