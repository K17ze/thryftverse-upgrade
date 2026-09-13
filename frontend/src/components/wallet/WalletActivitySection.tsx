import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { t } from '../../i18n';
import { WalletTransactionHistory } from './WalletTransactionHistory';
import { walletScreenStyles as styles } from './walletScreenStyles';

export interface WalletActivitySectionProps {
  onViewActivity: () => void;
}

/**
 * WalletActivitySection — "Recent activity" header with See all +
 * the canonical WalletTransactionHistory list (spec 17 viewport 2).
 * Lifted verbatim from WalletScreen.
 */
export function WalletActivitySection({ onViewActivity }: WalletActivitySectionProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.txHistorySection}>
      <View style={styles.txHistoryHeader}>
        <Text style={[styles.txHistoryTitle, { color: colors.textPrimary }]}>{t('commerce.wallet.recentActivity')}</Text>
        <Pressable
          onPress={onViewActivity}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('commerce.wallet.a11y.viewAllActivity')}
        >
          <Text style={[styles.txHistorySeeAll, { color: colors.brand }]}>{t('commerce.wallet.seeAll')}</Text>
        </Pressable>
      </View>
      <WalletTransactionHistory limit={20} />
    </View>
  );
}
