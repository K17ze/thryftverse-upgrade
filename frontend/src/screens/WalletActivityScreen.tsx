/**
 * WalletActivityScreen — the canonical wallet Activity destination.
 *
 * One ledger, one name. This is the single money-movement activity surface
 * for the wallet (1ZE + fiat): top-ups, redemptions, payouts, transfers and
 * Co-Own trade settlements. Filter chips switch between ALL / 1ZE / FIAT.
 *
 * Per spec 17 (Wallet & Money Movement V3): "One canonical Activity
 * destination with filters. Remove duplicate History/Activity terminology
 * unless two distinct ledgers truly exist." The wallet ledger
 * (`getWalletLedger`) is this canonical ledger; Co-Own exchange orders live
 * in their own hub and commerce payout history lives in BalanceHistory.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Type, Typography, Radius, Stroke } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { WalletTransactionHistory } from '../components/wallet/WalletTransactionHistory';
import { haptics } from '../utils/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'WalletActivity'>;

type AssetFilter = 'ALL' | '1ZE' | 'FIAT';

const FILTERS: Array<{ value: AssetFilter; label: string; accessibilityLabel: string }> = [
  { value: 'ALL', label: 'All', accessibilityLabel: 'Show all activity' },
  { value: '1ZE', label: '1ZE', accessibilityLabel: 'Show 1ZE activity' },
  { value: 'FIAT', label: 'Fiat', accessibilityLabel: 'Show fiat activity' },
];

export default function WalletActivityScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const [assetFilter, setAssetFilter] = React.useState<AssetFilter>('ALL');

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Wallet');
  }, [navigation]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Activity"
          subtitle="Wallet money movement"
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
    >
      {/* Filter chips — single row, hairline-selected grammar per AGENTS.md §4 */}
      <View style={styles.filterRow} accessibilityRole="tablist">
        {FILTERS.map((filter) => {
          const selected = assetFilter === filter.value;
          return (
            <Pressable
              key={filter.value}
              style={({ pressed }) => [
                styles.filterChip,
                selected && { borderColor: colors.brand, backgroundColor: colors.brand + '12' },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                haptics.tap();
                setAssetFilter(filter.value);
              }}
              accessibilityRole="tab"
              accessibilityLabel={filter.accessibilityLabel}
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: selected ? colors.brand : colors.textSecondary },
                  selected && { fontFamily: Typography.family.semibold },
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.listWrap}>
        <WalletTransactionHistory assetFilter={assetFilter} limit={200} />
      </View>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  filterChip: {
    paddingVertical: Space.sm - 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  listWrap: {
    flex: 1,
  },
});
