import React from 'react';
import { View, Text, StyleSheet, StatusBar, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import AuctionsScreen from './AuctionsScreen';
import CoOwnScreen from './SyndicateScreen';
import { useStore } from '../store/useStore';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { AppButton } from '../components/ui/AppButton';
import { t } from '../i18n';
import { useToast } from '../context/ToastContext';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius } from '../theme/designTokens';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';
import { MetricGrid } from '../components/trade';

type TradeHubTab = 'AUCTIONS' | 'CO-OWN';
type NavT = StackNavigationProp<RootStackParamList>;

export default function TradeHubScreen() {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const [activeTab, setActiveTab] = React.useState<TradeHubTab>('AUCTIONS');
  const marketLedger = useStore((state) => state.marketLedger);
  const customAuctions = useStore((state) => state.customAuctions);
  const customCoOwns = useStore((state) => state.customCoOwns);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);

  const tabLayouts = React.useRef<{ [key: string]: { x: number; width: number } }>({});
  const indicatorX = useSharedValue(4);
  const indicatorWidth = useSharedValue(0);

  const handleTabLayout = (tab: TradeHubTab, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts.current[tab] = { x, width };
    if (tab === activeTab) {
      indicatorX.value = x;
      indicatorWidth.value = width;
    }
  };

  React.useEffect(() => {
    const layout = tabLayouts.current[activeTab];
    if (layout) {
      indicatorX.value = layout.x;
      indicatorWidth.value = layout.width;
    }
  }, [activeTab, indicatorX, indicatorWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  const latestActivity = marketLedger[0];

  const latestActivityText = React.useMemo(() => {
    if (!latestActivity) return t('tradeHub.activity.empty');
    if (latestActivity.channel === 'auction' && latestActivity.action === 'bid') {
      return t('tradeHub.activity.bid', {
        amount: formatFromFiat(latestActivity.amountGBP, 'GBP', { displayMode: 'fiat' }),
        referenceId: latestActivity.referenceId,
      });
    }
    if (latestActivity.channel === 'auction' && latestActivity.action === 'win') {
      return t('tradeHub.activity.win', {
        amount: formatFromFiat(latestActivity.amountGBP, 'GBP', { displayMode: 'fiat' }),
        referenceId: latestActivity.referenceId,
      });
    }
    if (latestActivity.channel === 'co-own' && latestActivity.action === 'sell-units') {
      const units = latestActivity.units ?? 0;
      return t('tradeHub.activity.soldUnits', {
        units,
        plural: units === 1 ? '' : 's',
        referenceId: latestActivity.referenceId,
      });
    }
    const units = latestActivity.units ?? 0;
    return t('tradeHub.activity.boughtUnits', {
      units,
      plural: units === 1 ? '' : 's',
      referenceId: latestActivity.referenceId,
    });
  }, [formatFromFiat, latestActivity]);

  const marketSnapshot = React.useMemo(() => {
    const nowTs = Date.now();
    const liveAuctions = customAuctions.filter((auction) => {
      const startsAtMs = new Date(auction.startsAt).getTime();
      const endsAtMs = new Date(auction.endsAt).getTime();
      return startsAtMs <= nowTs && endsAtMs > nowTs;
    }).length;

    const openPools = customCoOwns.filter((asset) => asset.isOpen).length;

    const holdingsValue = customCoOwns.reduce((sum, asset) => {
      const runtime = coOwnRuntime[asset.id];
      const units = runtime?.yourUnits ?? asset.yourUnits ?? 0;
      const unitPrice = runtime?.unitPriceGBP ?? asset.unitPriceGBP;
      return sum + units * unitPrice;
    }, 0);

    return { liveAuctions, openPools, holdingsValue };
  }, [customAuctions, customCoOwns, coOwnRuntime]);

  const quickActions = React.useMemo(() => {
    if (activeTab === 'AUCTIONS') {
      return [
        { key: 'create-auction', label: 'Create Auction', icon: 'hammer-outline' as const, onPress: () => navigation.navigate('CreateAuction') },
        { key: 'my-listings', label: 'My Listings', icon: 'list-outline' as const, onPress: () => show('Auction listings coming soon', 'info') },
        { key: 'auction-posters', label: 'Promote Drop', icon: 'megaphone-outline' as const, onPress: () => navigation.navigate('CreatePoster') },
      ];
    }
    return [
      { key: 'create-coown', label: 'Create Co-Own', icon: 'people-outline' as const, onPress: () => navigation.navigate('CreateCoOwn') },
      { key: 'my-listings', label: 'My Listings', icon: 'list-outline' as const, onPress: () => show('Co-Own listings coming soon', 'info') },
      { key: 'coown-posters', label: 'Promote Drop', icon: 'megaphone-outline' as const, onPress: () => navigation.navigate('CreatePoster') },
      { key: 'open-portfolio', label: 'Portfolio', icon: 'wallet-outline' as const, onPress: () => navigation.navigate('Portfolio') },
    ];
  }, [activeTab, navigation, show]);

  const marketGuidance = activeTab === 'CO-OWN'
    ? 'Co-Own settles in 1ze only, with local fiat shown as price reference.'
    : 'Auctions run for 6 hours. Schedule posters early so bidders can discover your drop in time.';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <View style={styles.headerWrap}>
        <View style={styles.titleRow}>
          <View style={styles.liveDot} />
          <BodyEmphasis style={styles.headerTitle}>{t('tradeHub.header.title')}</BodyEmphasis>
          <Ionicons name="sparkles-outline" size={18} color={Colors.brand} />
        </View>

        <AnimatedPressable
          style={styles.ledgerShortcutBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('MarketLedger')}
          accessibilityRole="button"
          accessibilityLabel="Open market ledger"
          accessibilityHint="Shows recent trading events and settlement activity"
        >
          <Ionicons name="pulse-outline" size={15} color={Colors.brand} />
          <Meta style={styles.ledgerShortcutText}>{t('tradeHub.ledger.label')}</Meta>
        </AnimatedPressable>
      </View>

      <MetricGrid
        metrics={[
          { label: 'Live Auctions', value: String(marketSnapshot.liveAuctions) },
          { label: 'Open Pools', value: String(marketSnapshot.openPools) },
          { label: 'Holdings', value: formatFromFiat(marketSnapshot.holdingsValue, 'GBP', { displayMode: 'fiat' }) },
        ]}
        columns={3}
        style={{ marginBottom: Space.sm }}
      />

      <View style={styles.tabSwitcher}>
        <Reanimated.View style={[styles.tabIndicator, indicatorStyle]} />
        {(['AUCTIONS', 'CO-OWN'] as const).map((tab) => (
          <View key={tab} style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => handleTabLayout(tab, e)}>
            <AppButton
              title={tab === 'AUCTIONS' ? t('tradeHub.tab.auctions') : t('tradeHub.tab.coOwn')}
              style={styles.tabBtn}
              titleStyle={styles.tabBtnText}
              variant="secondary"
              size="sm"
              onPress={() => setActiveTab(tab)}
              accessibilityLabel={`${tab} tab${activeTab === tab ? ' selected' : ''}`}
              hapticFeedback="light"
            />
          </View>
        ))}
      </View>

      <View style={styles.guidanceWrap}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
        <Meta style={styles.guidanceText}>{marketGuidance}</Meta>
      </View>

      <AnimatedPressable
        style={styles.activityWrap}
        activeOpacity={0.92}
        onPress={() => navigation.navigate('MarketLedger')}
        accessibilityRole="button"
        accessibilityLabel="Open market activity"
        accessibilityHint="Shows detailed market ledger events"
      >
        <Ionicons name="pulse-outline" size={14} color={Colors.brand} />
        <Meta style={styles.activityText}>{latestActivityText}</Meta>
        <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
      </AnimatedPressable>

      {activeTab === 'AUCTIONS' ? <AuctionsScreen /> : <CoOwnScreen />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4444',
  },
  headerTitle: {},
  ledgerShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ledgerShortcutText: {
    color: Colors.brand,
  },
  tabSwitcher: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    flexDirection: 'row',
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand,
  },
  tabBtn: {
    flex: 1,
    borderRadius: Radius.full,
    minHeight: 34,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  tabBtnText: {
    color: Colors.textSecondary,
  },
  guidanceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: 8,
  },
  guidanceText: {
    flex: 1,
  },
  activityWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  activityText: {
    flex: 1,
    color: Colors.textSecondary,
  },
});
