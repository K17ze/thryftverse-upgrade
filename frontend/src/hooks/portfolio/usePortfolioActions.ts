import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { haptics } from '../../utils/haptics';
import { type CoOwnPositionAction } from '../../components/coown';
import type { CoOwnPositionVM } from '../../services/coOwnPortfolio';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/**
 * Owns the portfolio navigation handlers (back, order history, position
 * row press/buy/sell) plus the position action-sheet state and the action
 * list the sheet renders.
 */
export function usePortfolioActions() {
  const navigation = useNavigation<NavT>();
  const [actionSheetAsset, setActionSheetAsset] = React.useState<CoOwnPositionVM | null>(null);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  const handleOpenActivity = React.useCallback(() => {
    navigation.navigate('CoOwnOrderHistory');
  }, [navigation]);

  const handleBrowseItems = React.useCallback(() => {
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  const handleViewDistributions = React.useCallback(() => {
    navigation.navigate('DistributionHistory', {});
  }, [navigation]);

  const handleOpenMarketOverview = React.useCallback(() => {
    navigation.navigate('AssetLeaderboard');
  }, [navigation]);

  const handleOpenWatchlist = React.useCallback(() => {
    navigation.navigate('CoOwnHub', { initialSegment: 'watchlist' });
  }, [navigation]);

  const handlePositionPress = React.useCallback((p: CoOwnPositionVM) => {
    navigation.navigate('AssetDetail', { assetId: p.assetId });
  }, [navigation]);

  const handleBuyMore = React.useCallback((p: CoOwnPositionVM) => {
    haptics.tap();
    navigation.navigate('Trade', { assetId: p.assetId, side: 'buy' });
  }, [navigation]);

  const handleSell = React.useCallback((p: CoOwnPositionVM) => {
    haptics.tap();
    navigation.navigate('Trade', { assetId: p.assetId, side: 'sell' });
  }, [navigation]);

  const handleOpenActions = React.useCallback((p: CoOwnPositionVM) => {
    haptics.tap();
    setActionSheetAsset(p);
  }, []);

  const closeActionSheet = React.useCallback(() => {
    setActionSheetAsset(null);
  }, []);

  const actionSheetActions: CoOwnPositionAction[] = React.useMemo(() => {
    if (!actionSheetAsset) return [];
    const p = actionSheetAsset;
    const actions: CoOwnPositionAction[] = [
      {
        label: 'View item details',
        icon: 'document-text-outline',
        onPress: () => navigation.navigate('AssetDetail', { assetId: p.assetId }),
        variant: 'primary',
      },
      {
        label: 'Buy more units',
        icon: 'add-circle-outline',
        onPress: () => navigation.navigate('Trade', { assetId: p.assetId, side: 'buy' }),
      },
    ];
    if (p.sellableUnits > 0) {
      actions.push({
        label: 'Sell units',
        icon: 'swap-horizontal-outline',
        onPress: () => navigation.navigate('Trade', { assetId: p.assetId, side: 'sell' }),
        variant: 'secondary',
      });
      actions.push({
        label: 'Request buyout',
        icon: 'exit-outline',
        onPress: () => navigation.navigate('Buyout', { assetId: p.assetId }),
      });
    }
    actions.push({
      label: 'View order history',
      icon: 'receipt-outline',
      onPress: () => navigation.navigate('CoOwnOrderHistory'),
    });
    actions.push({
      label: 'Distribution history',
      icon: 'cash-outline',
      onPress: () => navigation.navigate('DistributionHistory', { assetId: p.assetId }),
    });
    return actions;
  }, [actionSheetAsset, navigation]);

  return {
    handleBack,
    handleOpenActivity,
    handleBrowseItems,
    handleViewDistributions,
    handleOpenMarketOverview,
    handleOpenWatchlist,
    handlePositionPress,
    handleBuyMore,
    handleSell,
    handleOpenActions,
    actionSheetAsset,
    closeActionSheet,
    actionSheetActions,
  };
}
