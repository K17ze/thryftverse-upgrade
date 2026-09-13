import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { haptics } from '../../utils/haptics';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/**
 * useWalletActions — owns the wallet navigation handlers (back, convert,
 * activity, seller earnings, withdraw). Routes and haptics are lifted
 * verbatim from WalletScreen; mirrors hooks/portfolio/usePortfolioActions.
 */
export function useWalletActions() {
  const navigation = useNavigation<NavT>();

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  // ── Flow expansion — now navigates to dedicated screens ──
  const handleConvert = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('WalletConvert');
  }, [navigation]);

  // ── Activity (canonical WalletHistoryScreen — spec 17) ──
  const handleViewActivity = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('WalletHistory');
  }, [navigation]);

  // ── Seller earnings (extracted SellerEarningsScreen — spec 17) ──
  const handleViewEarnings = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('SellerEarnings');
  }, [navigation]);

  const handleWithdraw = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('Withdraw');
  }, [navigation]);

  return {
    handleBack,
    handleConvert,
    handleViewActivity,
    handleViewEarnings,
    handleWithdraw,
  };
}
