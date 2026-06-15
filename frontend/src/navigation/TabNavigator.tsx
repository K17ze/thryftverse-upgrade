import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { TabParamList } from './types';
import { Colors } from '../constants/colors';
import { Space, Radius, Duration, Elevation } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AnimatedBadge } from '../components/AnimatedBadge';
import { useHaptic } from '../hooks/useHaptic';
import { useStore } from '../store/useStore';

import HomeScreen from '../screens/HomeScreen';
import TradeHubScreen from '../screens/TradeHubScreen';
import SearchScreen from '../screens/SearchScreen';
import SellScreen from '../screens/SellScreen';
import InboxScreen from '../screens/InboxScreen';
import MyProfileScreen from '../screens/MyProfileScreen';

const Tab = createBottomTabNavigator<TabParamList>();

// ── Tab Icon with spring scale + active indicator dot ──
interface TabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
  badgeCount?: number;
}

const TabIcon = ({ name, color, focused, badgeCount }: TabIconProps) => {
  const iconScale = useSharedValue(focused ? 1.12 : 1);

  useEffect(() => {
    iconScale.value = withSpring(focused ? 1.12 : 1, { damping: 15, stiffness: 150 });
  }, [focused, iconScale]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const indicatorWidth = useSharedValue(focused ? 18 : 4);
  useEffect(() => {
    indicatorWidth.value = withSpring(focused ? 18 : 4, { damping: 18, stiffness: 200 });
  }, [focused, indicatorWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.value,
    opacity: focused ? 1 : 0,
  }));

  return (
    <View style={styles.tabIconWrap}>
      <Reanimated.View style={animatedIconStyle}>
        <Ionicons name={name} size={22} color={color} />
      </Reanimated.View>
      {badgeCount !== undefined && <AnimatedBadge count={badgeCount} />}
      <Reanimated.View style={[styles.activeIndicator, indicatorStyle]} />
    </View>
  );
};

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const conversations = useStore((s) => s.conversations);
  const messageRequests = useStore((s) => s.messageRequests);
  const unreadCount = conversations.filter((c) => c.unread).length;
  const requestCount = messageRequests.length;
  const inboxBadgeCount = unreadCount + requestCount;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            ...styles.fixedTabBar,
            height: 60 + Math.max(insets.bottom, 8),
            paddingTop: 6,
            paddingBottom: Math.max(insets.bottom, 8),
          },
          tabBarItemStyle: styles.tabBarItem,
          tabBarActiveTintColor: Colors.textPrimary,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: 'Inter_600SemiBold',
            letterSpacing: 0.2,
            marginTop: Space.xs / 4,
            marginBottom: Space.xs / 2,
          },
        }}
        screenListeners={{
          tabPress: () => {
            haptic.light();
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'home' : 'home-outline'} color={color} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Search"
          component={SearchScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'compass' : 'compass-outline'} color={color} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Sell"
          component={SellScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'add-circle' : 'add-circle-outline'} color={color} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="TradeHub"
          component={TradeHubScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'pulse' : 'pulse-outline'} color={color} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Inbox"
          component={InboxScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'chatbubbles' : 'chatbubbles-outline'} color={color} focused={focused} badgeCount={inboxBadgeCount > 0 ? inboxBadgeCount : undefined} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={MyProfileScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'person' : 'person-outline'} color={color} focused={focused} />
            ),
          }}
        />
      </Tab.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  fixedTabBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
    // ELEVATED: Subtle top shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 4,
    paddingHorizontal: Space.md,
  },
  tabBarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs / 2,
  },
  tabIconWrap: {
    alignItems: 'center',
    position: 'relative',
    width: 28,
  },
  activeIndicator: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textPrimary,
    marginTop: 4,
  },
});
