import { Typography } from '../theme/designTokens';
import React from 'react';
import { View, Text, StyleSheet, StatusBar, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  FadeInDown,
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
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../utils/haptics';

type TradeHubTab = 'AUCTIONS' | 'CO-OWN';
type NavT = StackNavigationProp<RootStackParamList>;

export default function TradeHubScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();
  const [activeTab, setActiveTab] = React.useState<TradeHubTab>('AUCTIONS');

  const tabLayouts = React.useRef<{ [key: string]: { x: number; width: number } }>({});
  const indicatorX = useSharedValue<number>(Space.xs);
  const indicatorWidth = useSharedValue<number>(0);

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
        { key: 'create-auction', label: 'Create Auction', icon: 'hammer-outline' as const, onPress: () => { haptics.tap(); navigation.navigate('CreateAuction'); } },
        { key: 'auction-posters', label: 'Promote Drop', icon: 'megaphone-outline' as const, onPress: () => { haptics.tap(); navigation.navigate('CreatePoster'); } },
      ];
    }
    return [
      { key: 'create-coown', label: 'Create Co-Own', icon: 'people-outline' as const, onPress: () => { haptics.tap(); navigation.navigate('CreateCoOwn'); } },
      { key: 'coown-posters', label: 'Promote Drop', icon: 'megaphone-outline' as const, onPress: () => { haptics.tap(); navigation.navigate('CreatePoster'); } },
      { key: 'open-portfolio', label: 'Portfolio', icon: 'wallet-outline' as const, onPress: () => { haptics.tap(); navigation.navigate('Portfolio'); } },
    ];
  }, [activeTab, navigation, show]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* Tab switcher at the very top */}
      <Reanimated.View
        entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(0)}
      >
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
      </Reanimated.View>

      {/* Tab-specific quick actions */}
      <Reanimated.View
        entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(80)}
      >
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
      </Reanimated.View>

      {/* Tab content */}
      <Reanimated.View
        style={styles.tabContent}
        entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(160)}
      >
        {activeTab === 'AUCTIONS' ? <AuctionsScreen /> : <CoOwnScreen />}
      </Reanimated.View>
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
    padding: Space.xs,
    flexDirection: 'row',
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: Space.xs,
    bottom: Space.xs,
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
  tabContent: {
    flex: 1,
  },
});