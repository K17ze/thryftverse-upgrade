import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { SkeletonLoader } from '../SkeletonLoader';
import type { RootStackParamList } from '../../navigation/types';
import { CURRENCIES, type SupportedCurrencyCode } from '../../constants/currencies';
import {
  formatMinorAmount,
  getCurrencyBalances,
  type WalletCurrencyPocket } from '../../services/fxApi';
import { haptics } from '../../utils/haptics';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { walletScreenStyles as styles } from './walletScreenStyles';

export interface WalletCurrencyBalancesProps {
  userId: string | undefined;
  /** Bump to force a silent refetch (wired to the wallet pull-to-refresh). */
  reloadToken?: number;
}

/**
 * WalletCurrencyBalances — the multi-currency pocket list (spec: non-zero
 * currency pockets, hairline-separated rows, flat canvas). Hidden when the
 * only pocket is the default fiat one. The trailing "Exchange" affordance
 * opens the WalletExchange fiat↔fiat converter. Skeleton and inline error
 * states mirror WalletSubBalanceSection.
 */
export function WalletCurrencyBalances({ userId, reloadToken = 0 }: WalletCurrencyBalancesProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('walletFx');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [fiatCurrency, setFiatCurrency] = React.useState<string | null>(null);
  const [pockets, setPockets] = React.useState<WalletCurrencyPocket[] | null>(null);
  const [hasError, setHasError] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  // ── Pocket hydration ──
  // Silent after the first load — an already-rendered list never flashes
  // skeleton chrome on refresh. A failure keeps the last good pockets and
  // surfaces the inline error row only when there is nothing to show.
  React.useEffect(() => {
    if (!userId) {
      setPockets([]);
      return;
    }
    let cancelled = false;
    getCurrencyBalances(userId)
      .then((payload) => {
        if (cancelled) return;
        // The default fiat pocket is authoritative via fiatBalanceMinor —
        // upsert it over any matching balances[] entry so the row always
        // shows the ledger-backed figure.
        const merged = new Map<string, WalletCurrencyPocket>();
        payload.balances.forEach((pocket) => merged.set(pocket.currency, pocket));
        merged.set(payload.fiatCurrency, {
          currency: payload.fiatCurrency,
          balanceMinor: payload.fiatBalanceMinor,
          version: merged.get(payload.fiatCurrency)?.version ?? 0 });
        setFiatCurrency(payload.fiatCurrency);
        setPockets(Array.from(merged.values()));
        setHasError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHasError(true);
      });
    return () => { cancelled = true; };
  }, [userId, reloadToken, nonce]);

  // Silent refetch on focus — mirrors useWalletData so pockets refresh
  // after returning from WalletExchange. The first focus is owned by the
  // mount effect.
  const hasFocusedOnceRef = React.useRef(false);
  useFocusEffect(
    React.useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      setNonce((n) => n + 1);
    }, [])
  );

  const handleExchange = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('WalletExchange');
  }, [navigation]);

  const handleRetry = React.useCallback(() => {
    haptics.tap();
    setHasError(false);
    setNonce((n) => n + 1);
  }, []);

  // ── Loading (first fetch — no pockets to show yet) ──
  if (pockets === null && !hasError) {
    return (
      <View style={styles.txHistorySection}>
        <View style={styles.txHistoryHeader}>
          <Text style={[styles.txHistoryTitle, { color: colors.textPrimary }]}>
            {t('balancesTitle')}
          </Text>
        </View>
        {[0, 1].map((i) => (
          <View key={i} style={styles.skeletonSubRow}>
            <SkeletonLoader width="40%" height={16} borderRadius={Space.xs} />
            <View style={{ flex: 1 }} />
            <SkeletonLoader width="25%" height={16} borderRadius={Space.xs} />
          </View>
        ))}
      </View>
    );
  }

  // ── Error (no pockets to fall back to) ──
  if (hasError && pockets === null) {
    return (
      <View style={styles.txHistorySection}>
        <View style={styles.txHistoryHeader}>
          <Text style={[styles.txHistoryTitle, { color: colors.textPrimary }]}>
            {t('balancesTitle')}
          </Text>
        </View>
        <View style={styles.subBalanceRow}>
          <Text style={[styles.subBalanceLabel, { color: colors.dangerText }]} numberOfLines={1} maxFontSizeMultiplier={2}>
            {t('balancesError')}
          </Text>
          <Pressable
            onPress={handleRetry}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('retry')}
          >
            <Text style={[styles.txHistorySeeAll, { color: colors.brand }]}>{t('retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Derived rows ──
  const nonZero = (pockets ?? []).filter((pocket) => pocket.balanceMinor !== 0);
  const nonDefault = nonZero.filter((pocket) => pocket.currency !== fiatCurrency);

  // Nothing to show: the default fiat pocket alone is already covered by
  // the balance hero — render nothing rather than restate it.
  if (nonDefault.length === 0) {
    return null;
  }

  const ordered = [...nonZero].sort((a, b) => {
    if (a.currency === fiatCurrency) return -1;
    if (b.currency === fiatCurrency) return 1;
    return 0;
  });

  return (
    <View style={styles.txHistorySection}>
      <View style={styles.txHistoryHeader}>
        <Text style={[styles.txHistoryTitle, { color: colors.textPrimary }]}>
          {t('balancesTitle')}
        </Text>
        <Pressable
          onPress={handleExchange}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('balancesExchange')}
          accessibilityHint={t('a11y.exchangeHint')}
        >
          <Text style={[styles.txHistorySeeAll, { color: colors.brand }]}>
            {t('balancesExchange')}
          </Text>
        </Pressable>
      </View>
      {ordered.map((pocket, index) => (
        <PocketRow
          key={pocket.currency}
          pocket={pocket}
          isLast={index === ordered.length - 1}
          colors={colors}
        />
      ))}
    </View>
  );
}

/** Flat pocket row — currency name/code left, symbol-formatted amount right. */
function PocketRow({
  pocket,
  isLast,
  colors }: {
  pocket: WalletCurrencyPocket;
  isLast: boolean;
  colors: ThemeColors;
}) {
  const meta = CURRENCIES[pocket.currency.toUpperCase() as SupportedCurrencyCode];
  const label = meta?.name ?? pocket.currency;
  const value = formatMinorAmount(pocket.balanceMinor, pocket.currency);

  return (
    <View
      style={[styles.subBalanceRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text
        style={[styles.subBalanceLabel, { color: colors.textMuted }]}
        numberOfLines={1}
        maxFontSizeMultiplier={2}
      >
        {label}
      </Text>
      <Text
        style={[styles.subBalanceValue, { color: colors.textSecondary }]}
        maxFontSizeMultiplier={2}
      >
        {value}
      </Text>
    </View>
  );
}
