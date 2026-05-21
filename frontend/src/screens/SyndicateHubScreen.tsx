import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { getCoOwnMarket, CoOwnAsset } from '../data/tradeHub';
import { useStore } from '../store/useStore';
import { resolveAssetMarketState } from '../data/mockSyndicateData';
import { EmptyState } from '../components/EmptyState';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppButton } from '../components/ui/AppButton';
import { AppStatusPill } from '../components/ui/AppStatusPill';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';
import { useToast } from '../context/ToastContext';
import { MOCK_USERS } from '../data/mockData';
import { Space, Radius } from '../theme/designTokens';
import {
  TradeHeader,
  MetricGrid,
  CoOwnAssetCard,
} from '../components/trade';
import { AppInput } from '../components/ui/AppInput';
import { Meta, BodyEmphasis } from '../components/ui/Text';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';

type NavT = StackNavigationProp<RootStackParamList>;

type HubSort = 'value' | 'movers' | 'latest';
const SORT_OPTIONS: Array<{ value: HubSort; label: string; accessibilityLabel: string }> = [
  { value: 'value', label: 'VALUE', accessibilityLabel: 'Sort by market value' },
  { value: 'movers', label: 'MOVERS', accessibilityLabel: 'Sort by price movers' },
  { value: 'latest', label: 'LATEST', accessibilityLabel: 'Sort by latest listings' },
];

export default function CoOwnHubScreen() {
  const navigation = useNavigation<NavT>();
  const customCoOwns = useStore((state) => state.customCoOwns);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();
  const supportUser = MOCK_USERS[0];

  const [query, setQuery] = React.useState('');
  const [sortBy, setSortBy] = React.useState<HubSort>('value');

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('MainTabs');
  }, [navigation]);

  const baseAssets = React.useMemo(() => getCoOwnMarket(customCoOwns), [customCoOwns]);

  const marketAssets = React.useMemo(
    () => baseAssets.map((asset) => resolveAssetMarketState(asset, coOwnRuntime[asset.id])),
    [baseAssets, coOwnRuntime]
  );

  const filteredAssets = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = marketAssets.filter((asset) => {
      if (!normalized) return true;
      return [asset.title, asset.id, asset.issuerId].join(' ').toLowerCase().includes(normalized);
    });
    const sorted = [...filtered];
    if (sortBy === 'movers') sorted.sort((a, b) => b.marketMovePct24h - a.marketMovePct24h);
    else if (sortBy === 'latest') sorted.sort((a, b) => Number(b.id.localeCompare(a.id)));
    else sorted.sort((a, b) => b.totalUnits * b.unitPriceGBP - a.totalUnits * a.unitPriceGBP);
    return sorted;
  }, [marketAssets, query, sortBy]);

  const totalOpenValue = React.useMemo(
    () => marketAssets.reduce((sum, asset) => sum + asset.availableUnits * asset.unitPriceGBP, 0),
    [marketAssets]
  );

  const totalMarketValue = React.useMemo(
    () => marketAssets.reduce((sum, asset) => sum + asset.totalUnits * asset.unitPriceGBP, 0),
    [marketAssets]
  );

  const handleOpenCoOwnSupport = React.useCallback(() => {
    navigation.navigate('Chat', {
      conversationId: 'c1',
      focusQuery: 'co-own hub support',
      partnerUserId: supportUser.id,
    });
    show('Opening support chat for co-own market help.', 'info');
  }, [navigation, show, supportUser.id]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <TradeHeader
        title="Co-Own Hub"
        onBack={handleBack}
        rightAction={(
          <AnimatedPressable
            style={styles.headerActionBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('MarketLedger')}
            accessibilityRole="button"
            accessibilityLabel="Open market ledger"
            accessibilityHint="Shows recent trading events and settlement activity"
          >
            <Ionicons name="pulse-outline" size={18} color={Colors.textPrimary} />
          </AnimatedPressable>
        )}
      />

      <View style={styles.supportRow}>
        <AnimatedPressable
          style={styles.supportIdentity}
          onPress={() => navigation.navigate('UserProfile', { userId: supportUser.id })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Open @${supportUser.username} profile`}
          accessibilityHint="Shows co-own support profile"
        >
          <CachedImage
            uri={supportUser.avatar}
            style={styles.supportAvatar}
            containerStyle={styles.supportAvatarContainer}
          />
          <Meta style={styles.supportText}>Support: @{supportUser.username}</Meta>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.supportMessageBtn}
          onPress={handleOpenCoOwnSupport}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Message co-own support"
          accessibilityHint="Opens support chat"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={Colors.textPrimary} />
        </AnimatedPressable>
      </View>

      <View style={styles.searchWrap}>
        <AppInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search assets..."
          prefix={<Ionicons name="search-outline" size={16} color={Colors.textMuted} />}
          accessibilityLabel="Search co-own assets"
        />
      </View>

      <MetricGrid
        metrics={[
          { label: 'Open Value', value: formatFromFiat(totalOpenValue, 'GBP', { displayMode: 'fiat' }) },
          { label: 'Market Cap', value: formatFromFiat(totalMarketValue, 'GBP', { displayMode: 'fiat' }) },
          { label: 'Assets', value: String(marketAssets.length) },
        ]}
        columns={3}
      />

      <View style={styles.quickActionsWrap}>
        <AppButton
          style={styles.quickActionBtn}
          variant="gold"
          size="sm"
          align="center"
          icon={<Ionicons name="pie-chart-outline" size={14} color={Colors.textInverse} />}
          title="Portfolio"
          onPress={() => navigation.navigate('Portfolio')}
          accessibilityLabel="Open co-own portfolio"
        />
        <AppButton
          style={styles.quickActionBtn}
          variant="gold"
          size="sm"
          align="center"
          icon={<Ionicons name="list-outline" size={14} color={Colors.textInverse} />}
          title="My Listings"
          onPress={() => navigation.navigate('MyListings', { type: 'coown' })}
          accessibilityLabel="View my co-own listings"
        />
        <AppButton
          style={styles.quickActionBtn}
          variant="gold"
          size="sm"
          align="center"
          icon={<Ionicons name="time-outline" size={14} color={Colors.textInverse} />}
          title="Orders"
          onPress={() => navigation.navigate('CoOwnOrderHistory')}
          accessibilityLabel="Open co-own order history"
        />
      </View>

      <AppButton
        style={styles.issueBtn}
        variant="secondary"
        size="sm"
        align="center"
        icon={<Ionicons name="add" size={16} color={Colors.textPrimary} />}
        title="Issue New Co-Own"
        onPress={() => navigation.navigate('CreateCoOwn')}
        accessibilityLabel="Issue new co-own asset"
      />

      <View style={styles.sortWrap}>
        <AppSegmentControl
          options={SORT_OPTIONS}
          value={sortBy}
          onChange={setSortBy}
          fullWidth
        />
      </View>

      <FlashList
        data={filteredAssets}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const issuerUser = MOCK_USERS.find((user) => user.id === item.issuerId);
          const issuerHandle = issuerUser?.username ?? item.issuerId;
          const canMessageIssuer = currentUser?.id !== item.issuerId;
          const marketValue = item.totalUnits * item.unitPriceGBP;
          const openValue = item.availableUnits * item.unitPriceGBP;

          return (
            <Reanimated.View
              entering={
                reducedMotionEnabled
                  ? undefined
                  : FadeInDown
                      .duration(Motion.list.enterDuration)
                      .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
              }
            >
              <CoOwnAssetCard
                id={item.id}
                title={item.title}
                image={item.image}
                unitPrice={formatFromFiat(item.unitPriceGBP, 'GBP')}
                marketValue={formatFromFiat(marketValue, 'GBP', { displayMode: 'fiat' })}
                openValue={formatFromFiat(openValue, 'GBP', { displayMode: 'fiat' })}
                availableUnits={item.availableUnits}
                totalUnits={item.totalUnits}
                marketMovePct24h={item.marketMovePct24h}
                issuerHandle={issuerHandle}
                issuerAvatar={issuerUser?.avatar}
                yourUnits={item.yourUnits}
                isOpen={item.isOpen}
                onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
                onBuy={() => navigation.navigate('Trade', { assetId: item.id, side: 'buy' })}
                onSell={() => navigation.navigate('Trade', { assetId: item.id, side: 'sell' })}
                onDetails={() => navigation.navigate('AssetDetail', { assetId: item.id })}
                onMessageIssuer={() =>
                  navigation.navigate('Chat', {
                    conversationId: `${item.issuerId}_${item.listingId}`,
                    focusQuery: issuerHandle,
                    partnerUserId: item.issuerId,
                  })
                }
                onViewIssuer={() => navigation.navigate('UserProfile', { userId: item.issuerId })}
                canMessageIssuer={canMessageIssuer}
              />
            </Reanimated.View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="pie-chart-outline"
            title="No co-own assets"
            subtitle="Assets will appear here once pools are issued."
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  sortWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  listContent: {
    paddingBottom: Space.xl,
  },
  headerActionBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Space.sm,
    paddingVertical: 10,
  },
  supportIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supportAvatarContainer: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  supportAvatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
  },
  supportText: {
    color: Colors.textSecondary,
  },
  supportMessageBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionsWrap: {
    flexDirection: 'row',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  quickActionBtn: {
    flex: 1,
  },
  issueBtn: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
});
