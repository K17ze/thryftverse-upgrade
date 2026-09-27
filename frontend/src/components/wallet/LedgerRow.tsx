import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { formatRelativeTime } from '../../utils/dateFormat';
import type { CurrencyDisplayMode } from '../../utils/currency';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import {
  getLedgerKindMeta,
  isSupportedLedgerCurrency } from './ledgerViewModels';
import type { WalletLedgerItem } from '../../services/walletApi';

// One ledger row — direction icon, label + relative time, signed amount
// with the running balance beneath ("—" when the payload carries no
// settled balance). Exported so the wallet preview renders the exact
// same row grammar as the full list (web LedgerList parity).

export function LedgerRow({ item }: { item: WalletLedgerItem }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  const kindInfo = getLedgerKindMeta(item.kind);
  const isPositive = item.amount > 0;
  // amountDisplay is already major-unit for FIAT — `amount` is minor units
  // and must never reach a major-unit formatter. Sign is explicit: debits
  // render "−£x" — Math.abs() on the value alone would hide the direction.
  const sign = isPositive ? '+' : '\u2212';
  const amountText = item.asset === '1ZE'
    ? `${sign}${Math.abs(item.amountDisplay).toFixed(3)} 1ZE`
    : `${sign}${formatFromFiat(Math.abs(item.amountDisplay), isSupportedLedgerCurrency(item.currency) ? item.currency : 'GBP', { displayMode: 'fiat' })}`;
  const balanceText = formatLedgerBalance(item, formatFromFiat);

  // Direction-aware icon color: inflows use success, outflows use
  // textSecondary, neutral trades use brand.
  const iconColor = isPositive
    ? colors.successText
    : kindInfo.direction === 'neutral' ? colors.brand : colors.textSecondary;
  const amountColor = isPositive ? colors.successText : colors.textPrimary;

  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={`${kindInfo.label}, ${amountText}, ${balanceText === '\u2014' ? 'balance pending' : `balance ${balanceText}`}, ${formatRelativeTime(item.createdAt)}`}
    >
      <Ionicons name={kindInfo.icon as keyof typeof Ionicons.glyphMap} size={IconGrammar.metadata} color={iconColor} />
      <View style={styles.content}>
        <Text style={styles.label} numberOfLines={1}>{kindInfo.label}</Text>
        <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
      <View style={styles.amountColumn}>
        <Text style={[styles.amount, { color: amountColor }]}>{amountText}</Text>
        <Text style={styles.balance}>{balanceText}</Text>
      </View>
    </View>
  );
}

function formatLedgerBalance(
  item: WalletLedgerItem,
  formatFiat: (amount: number, currency: SupportedCurrencyCode, options?: { displayMode?: CurrencyDisplayMode }) => string
): string {
  if (!Number.isFinite(item.balanceAfterDisplay)) return '\u2014';
  if (item.asset === '1ZE') return `${item.balanceAfterDisplay.toFixed(3)} 1ZE`;
  return formatFiat(
    item.balanceAfterDisplay,
    isSupportedLedgerCurrency(item.currency) ? item.currency : 'GBP',
    { displayMode: 'fiat' });
}

/** Sticky month rail — month label left, signed month net right. */
export function LedgerMonthHeader({ title, netText }: { title: string; netText: string }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.monthHeader}>
      <Text style={styles.monthTitle}>{title}</Text>
      {netText ? (
        <Text
          style={styles.monthNet}
          accessibilityLabel={`Month net ${netText.replace('\u2212', 'minus ')}`}
        >
          {netText}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      gap: Space.sm + 2,
      minHeight: 56 },
    content: {
      flex: 1,
      gap: 2 },
    label: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textPrimary },
    time: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textMuted },
    amountColumn: {
      alignItems: 'flex-end',
      gap: 1 },
    // Amounts use priceList with tabular-nums — financial numerics
    amount: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      fontFamily: TypographyV2.priceList.fontFamily,
      letterSpacing: TypographyV2.priceList.letterSpacing,
      fontVariant: ['tabular-nums'],
      textAlign: 'right' },
    balance: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'],
      color: colors.textMuted,
      textAlign: 'right' },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: Space.md,
      paddingTop: Space.lg,
      paddingBottom: Space.xs + 2,
      backgroundColor: colors.background },
    monthTitle: {
      fontSize: TypographyV2.label.size,
      lineHeight: TypographyV2.label.lineHeight,
      fontFamily: TypographyV2.label.fontFamily,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: TypographyV2.label.letterSpacing },
    monthNet: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'],
      color: colors.textSecondary } });
}
