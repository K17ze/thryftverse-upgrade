import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { TabParamList, RootStackParamList } from './types';
import { Space, Radius, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useStore } from '../store/useStore';
import { CachedImage } from '../components/CachedImage';

import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import InboxScreen from '../screens/InboxScreen';
import MyProfileScreen from '../screens/MyProfileScreen';

const Tab = createBottomTabNavigator<TabParamList>();

const NAV_HEIGHT = 60;
const CREATE_CONTROL_SIZE = 36;
const AVATAR_SIZE = 27;

interface TabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  nameFocused?: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
  badgeCount?: number;
}

const TabIcon = ({ name, nameFocused, color, focused, badgeCount }: TabIconProps) => {
  const { colors } = useAppTheme();
  const iconName = focused && nameFocused ? nameFocused : name;
  const displayBadge = badgeCount !== undefined && badgeCount > 0;
  const badgeLabel = displayBadge
    ? badgeCount! > 99 ? '99+' : String(badgeCount)
    : undefined;

  return (
    <View style={tabStyles.tabIconWrap}>
      <Ionicons name={iconName} size={24} color={color} />
      {displayBadge && (
        <View
          style={[tabStyles.badge, { backgroundColor: colors.danger, borderColor: colors.surface }]}
          accessibilityLabel={`${badgeLabel} unread`}
        >
          <Text style={tabStyles.badgeText}>{badgeLabel}</Text>
        </View>
      )}
    </View>
  );
};

interface ProfileTabIconProps {
  color: string;
  focused: boolean;
}

const ProfileTabIcon = ({ color, focused }: ProfileTabIconProps) => {
  const { colors } = useAppTheme();
  const currentUser = useStore((s) => s.currentUser);
  const userAvatar = useStore((s) => s.userAvatar);
  const avatarUri = userAvatar ?? currentUser?.avatar ?? null;
  const displayName = currentUser?.displayName ?? currentUser?.username ?? '';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  return (
    <View
      style={[
        tabStyles.avatarWrap,
        focused && { borderWidth: 2, borderColor: colors.textPrimary },
      ]}
    >
      {avatarUri ? (
        <CachedImage
          uri={avatarUri}
          style={tabStyles.avatarImage}
          contentFit="cover"
        />
      ) : (
        <View style={[tabStyles.avatarFallback, { backgroundColor: colors.borderSubtle }]}>
          <Text style={[tabStyles.avatarFallbackText, { color: colors.textMuted }]}>{initials}</Text>
        </View>
      )}
    </View>
  );
};

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { colors } = useAppTheme();
  const conversations = useStore((s) => s.conversations);
  const messageRequests = useStore((s) => s.messageRequests);
  const requestIds = React.useMemo(() => new Set(messageRequests), [messageRequests]);
  const inboxBadgeCount = React.useMemo(() => {
    const unreadNonRequestCount = conversations.filter(
      (c) => c.unread && !requestIds.has(c.id)
    ).length;
    return unreadNonRequestCount + requestIds.size;
  }, [conversations, requestIds]);
  const lastTabRef = useRef<string>('Home');

  const handleCreatePress = useCallback(() => {
    haptic.light();
    navigation.navigate('CreateCamera', { mode: 'look' });
  }, [haptic, navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            ...tabStyles.floatingTabBar,
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            shadowColor: colors.shadow,
            height: NAV_HEIGHT,
            bottom: Math.max(insets.bottom, Space.sm),
            paddingBottom: 0,
          },
          tabBarItemStyle: tabStyles.tabBarItem,
          tabBarActiveTintColor: colors.textPrimary,
          tabBarInactiveTintColor: colors.textMuted,
        }}
        screenListeners={{
          tabPress: (e: any) => {
            const currentTab = e.target?.split('-')[0];
            if (currentTab !== lastTabRef.current) {
              haptic.light();
              lastTabRef.current = currentTab;
            }
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
            tabBarAccessibilityLabel: 'Home',
          }}
        />
        <Tab.Screen
          name="Explore"
          component={SearchScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'compass' : 'compass-outline'} color={color} focused={focused} />
            ),
            tabBarAccessibilityLabel: 'Explore',
          }}
        />
        <Tab.Screen
          name="Create"
          component={View}
          options={{
            tabBarButton: (props: any) => (
              <Pressable
                {...props}
                style={tabStyles.createButton}
                onPress={handleCreatePress}
                onLongPress={props.onLongPress}
                accessibilityRole="button"
                accessibilityLabel="Create"
                accessibilityHint="Opens create actions"
                accessibilityState={props.accessibilityState}
                testID={props.testID}
              >
                <View style={[tabStyles.createControl, { backgroundColor: colors.brand }]}>
                  <Ionicons name="add" size={24} color={colors.surface} />
                </View>
              </Pressable>
            ),
          }}
        />
        <Tab.Screen
          name="Inbox"
          component={InboxScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                color={color}
                focused={focused}
                badgeCount={inboxBadgeCount > 0 ? inboxBadgeCount : undefined}
              />
            ),
            tabBarAccessibilityLabel: inboxBadgeCount > 0
              ? `Inbox, ${inboxBadgeCount > 99 ? '99+' : inboxBadgeCount} unread`
              : 'Inbox',
          }}
        />
        <Tab.Screen
          name="Profile"
          component={MyProfileScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <ProfileTabIcon color={color} focused={focused} />
            ),
            tabBarAccessibilityLabel: 'Profile',
          }}
        />
      </Tab.Navigator>

    </View>
  );
}

// Static layout styles (no theme-dependent colors)
const tabStyles = StyleSheet.create({
  floatingTabBar: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xxl,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
    overflow: 'hidden',
  },
  tabBarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 28,
    height: 28,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: Typography.family.bold,
    includeFontPadding: false,
    textAlign: 'center',
  },
  createButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: NAV_HEIGHT,
  },
  createControl: {
    width: CREATE_CONTROL_SIZE,
    height: CREATE_CONTROL_SIZE,
    borderRadius: CREATE_CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
});

// Dynamic sheet styles (theme-aware via colors parameter)
