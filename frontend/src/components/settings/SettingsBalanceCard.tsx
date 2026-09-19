import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { AnimatedPressable } from '../AnimatedPressable';
import { createSettingsScreenStyles } from './settingsScreenStyles';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const styles = createSettingsScreenStyles();

export interface SettingsBalanceCardProps {
  /** Available GBP wallet balance. Null while loading AND on failure —
   *  an unknown balance is never rendered as £0 (F07). */
  walletBalance: number | null;
  /** True when the balance fetch failed — renders "Unavailable". */
  walletBalanceFailed?: boolean;
}

/** Thryft Balance Card — Depop flagship benchmark (settings reference.png).
 *  Renders only when a user is signed in. */
export function SettingsBalanceCard({ walletBalance, walletBalanceFailed }: SettingsBalanceCardProps) {
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);

  if (!currentUser) return null;

  const balanceLabel = walletBalanceFailed
    ? 'Unavailable'
    : walletBalance === null
      ? '—'
      : formatFromFiat(walletBalance, 'GBP');

  return (
    <AnimatedPressable
      style={[styles.balanceCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
      onPress={() => navigation.navigate('Wallet')}
      activeOpacity={0.88}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`Thryft Balance: ${walletBalanceFailed ? 'unavailable' : walletBalance === null ? 'loading' : formatFromFiat(walletBalance, 'GBP')}. Tap to open wallet.`}
    >
      <View style={styles.balanceCardLeft}>
        <Text style={[styles.balanceCardLabel, { color: colors.textSecondary }]}>Thryft Balance</Text>
        <Text style={[styles.balanceCardValue, { color: walletBalanceFailed ? colors.warningText : colors.textPrimary }]}>
          {balanceLabel}
        </Text>
      </View>
      <View style={styles.balanceCardRight}>
        <View style={[styles.walletJumpBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.walletJumpBtnText, { color: colors.textPrimary }]}>Wallet</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      </View>
    </AnimatedPressable>
  );
}
