import { Typography } from '../constants/typography';
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
import { RootStackParamList } from '../navigation/types';
import { AppButton } from '../components/ui/AppButton';
import { t } from '../i18n';
import { useToast } from '../context/ToastContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius } from '../theme/designTokens';

type TradeHubTab = 'AUCTIONS' | 'CO-OWN';
type NavT = StackNavigationProp<RootStackParamList>;

export default function TradeHubScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const [activeTab, setActiveTab] = React.useState<TradeHubTab>('AUCTIONS');

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* Tab switcher at the very top */}
      <View style={styles.tabSwitcher}>
        <Reanimated.View style={[styles.tabIndicator, indicatorStyle]} />
        {(['AUCTIONS', 'CO-OWN'] as const).map((tab) => (
          <AnimatedPressable
            key={tab}
            style={styles.tabBtn}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.9}
            onLayout={(e: LayoutChangeEvent) => handleTabLayout(tab, e)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
            accessibilityLabel={tab === 'AUCTIONS' ? t('tradeHub.tab.auctions') : t('tradeHub.tab.coOwn')}
            accessibilityHint="Switches the active trade hub view"
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'AUCTIONS' ? t('tradeHub.tab.auctions') : t('tradeHub.tab.coOwn')}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      {/* Tab-specific quick actions */}
      <View style={styles.quickActionsWrap}>
        {quickActions.map((action) => (
          <AppButton
            key={action.key}
            title={action.label}
            icon={<Ionicons name={action.icon} size={14} color={Colors.textSecondary} />}
            variant="secondary"
            size="sm"
            style={styles.quickActionBtn}
            titleStyle={styles.quickActionBtnText}
            iconContainerStyle={styles.quickActionIconWrap}
            onPress={action.onPress}
            accessibilityLabel={action.label}
          />
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'AUCTIONS' ? <AuctionsScreen /> : <CoOwnScreen />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabSwitcher: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: Colors.textInverse,
  },
  quickActionsWrap: {
    flexDirection: 'row',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  quickActionBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.lg,
  },
  quickActionBtnText: {
    fontSize: 11,
  },
  quickActionIconWrap: {
    width: 22,
    height: 22,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
});
