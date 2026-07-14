import React, { useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { TabParamList, RootStackParamList } from './types';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useStore } from '../store/useStore';
import { CachedImage } from '../components/CachedImage';
import { NativeSheet } from '../platform/native/NativeSheet';

import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import InboxScreen from '../screens/InboxScreen';
import MyProfileScreen from '../screens/MyProfileScreen';

const Tab = createBottomTabNavigator<TabParamList>();

const NAV_HEIGHT = 54;
const CREATE_CONTROL_SIZE = 32;
const AVATAR_SIZE = 25;

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
      <Ionicons name={iconName} size={23} color={color} />
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

const CreateActionSheet = ({
  visible,
  onClose,
  onNavigate,
}: {
  visible: boolean;
  onClose: () => void;
  onNavigate: (route: string, params?: object) => void;
}) => {
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const s = useMemo(() => sheetStyles(colors), [colors]);

  const actions = [
    { key: 'sell', label: 'List an item', description: 'Sell something on the marketplace', icon: 'pricetag-outline' as const, route: 'Sell' as const },
    { key: 'look', label: 'Create a Look', description: 'Style and share an outfit', icon: 'shirt-outline' as const, route: 'CreatorStudio' as const, params: { type: 'look' } },
    { key: 'poster', label: 'Create a Poster', description: 'Design a visual poster', icon: 'images-outline' as const, route: 'CreatorStudio' as const, params: { type: 'poster' } },
    { key: 'auction', label: 'Create auction', description: 'Time-based bidding for an item', icon: 'hammer-outline' as const, route: 'CreateAuction' as const },
    { key: 'coown', label: 'Create Co-Own', description: 'Shared ownership opportunity', icon: 'people-outline' as const, route: 'CreateCoOwn' as const },
  ];

  const handlePress = (action: typeof actions[0]) => {
    haptic.light();
    onNavigate(action.route, action.params);
    onClose();
  };

  return (
    <NativeSheet
      visible={visible}
      onDismiss={onClose}
      testID="create-action-sheet"
    >
      <View style={[s.sheetContent, { paddingBottom: Math.max(insets.bottom, Space.lg) }]}>
        <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
        <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Create</Text>
        <Text style={[s.sheetSubtitle, { color: colors.textMuted }]}>Choose what you'd like to create</Text>
        <View style={s.sheetList}>
          {actions.map((action) => (
            <Pressable
              key={action.key}
              style={({ pressed }) => [
                s.sheetAction,
                { backgroundColor: colors.surfaceAlt },
                pressed && s.sheetActionPressed,
              ]}
              onPress={() => handlePress(action)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityHint={action.description}
            >
              <View style={[s.sheetActionIcon, { backgroundColor: `${colors.brand}14` }]}>
                <Ionicons
                  name={action.icon}
                  size={22}
                  color={colors.brand}
                />
              </View>
              <View style={s.sheetActionBody}>
                <Text style={[s.sheetActionLabel, { color: colors.textPrimary }]}>
                  {action.label}
                </Text>
                <Text style={[s.sheetActionDescription, { color: colors.textMuted }]} numberOfLines={1}>
                  {action.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>
    </NativeSheet>
  );
};

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { colors } = useAppTheme();
  const createSheetVisible = useStore((s) => s.createSheetVisible);
  const setCreateSheetVisible = useStore((s) => s.setCreateSheetVisible);
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
    setCreateSheetVisible(true);
  }, [haptic, setCreateSheetVisible]);

  const handleCreateClose = useCallback(() => {
    setCreateSheetVisible(false);
  }, [setCreateSheetVisible]);

  const handleCreateNavigate = useCallback(
    (route: string, params?: object) => {
      navigation.navigate(route as any, params as any);
    },
    [navigation],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            ...tabStyles.fixedTabBar,
            backgroundColor: colors.surface,
            borderTopColor: colors.borderSubtle,
            height: NAV_HEIGHT + Math.max(insets.bottom, 0),
            paddingBottom: Math.max(insets.bottom, 0),
            paddingHorizontal: 0,
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

      <CreateActionSheet
        visible={createSheetVisible}
        onClose={handleCreateClose}
        onNavigate={handleCreateNavigate}
      />
    </View>
  );
}

// Static layout styles (no theme-dependent colors)
const tabStyles = StyleSheet.create({
  fixedTabBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: 'transparent',
    elevation: 0,
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
type ThemeColors = import('../theme/ThemeContext').ThemeColors;
function sheetStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sheetContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingTop: Space.sm,
      paddingHorizontal: Space.md,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: Space.sm,
    },
    sheetTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
    },
    sheetSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginBottom: Space.md,
    },
    sheetList: {
      gap: Space.xs,
    },
    sheetAction: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.sm + 2,
      gap: Space.sm + 2,
      borderRadius: Radius.lg,
    },
    sheetActionPressed: {
      opacity: 0.7,
    },
    sheetActionIcon: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sheetActionBody: {
      flex: 1,
      gap: 2,
    },
    sheetActionLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
    },
    sheetActionDescription: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },
  });
}
