import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { TabParamList, RootStackParamList } from './types';
import { Colors } from '../constants/colors';
import { Space, Typography } from '../theme/designTokens';
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
  const iconName = focused && nameFocused ? nameFocused : name;
  const displayBadge = badgeCount !== undefined && badgeCount > 0;
  const badgeLabel = displayBadge
    ? badgeCount! > 99 ? '99+' : String(badgeCount)
    : undefined;

  return (
    <View style={styles.tabIconWrap}>
      <Ionicons name={iconName} size={23} color={color} />
      {displayBadge && (
        <View
          style={styles.badge}
          accessibilityLabel={`${badgeLabel} unread`}
        >
          <Text style={styles.badgeText}>{badgeLabel}</Text>
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
        styles.avatarWrap,
        focused && styles.avatarWrapActive,
      ]}
    >
      {avatarUri ? (
        <CachedImage
          uri={avatarUri}
          style={styles.avatarImage}
          contentFit="cover"
        />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarFallbackText}>{initials}</Text>
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

  const actions = [
    { key: 'sell', label: 'List an item', icon: 'pricetag-outline' as const, route: 'Sell' as const },
    { key: 'look', label: 'Create a Look', icon: 'shirt-outline' as const, route: 'CreateLook' as const },
    { key: 'poster', label: 'Create a Poster', icon: 'images-outline' as const, route: 'CreatePoster' as const, params: { mode: 'poster' } },
    { key: 'auction', label: 'Create auction', icon: 'hammer-outline' as const, route: 'CreateAuction' as const },
    { key: 'coown', label: 'Create Co-Own opportunity', icon: 'people-outline' as const, route: 'CreateCoOwn' as const },
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
      <View style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={styles.sheetTitle}>Create</Text>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            style={styles.sheetAction}
            onPress={() => handlePress(action)}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Ionicons
              name={action.icon}
              size={22}
              color={Colors.textPrimary}
            />
            <Text style={styles.sheetActionLabel}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </NativeSheet>
  );
};

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
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
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            ...styles.fixedTabBar,
            height: NAV_HEIGHT + Math.max(insets.bottom, 0),
            paddingBottom: Math.max(insets.bottom, 0),
            paddingHorizontal: 0,
          },
          tabBarItemStyle: styles.tabBarItem,
          tabBarActiveTintColor: Colors.textPrimary,
          tabBarInactiveTintColor: Colors.textMuted,
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
                style={styles.createButton}
                onPress={handleCreatePress}
                onLongPress={props.onLongPress}
                accessibilityRole="button"
                accessibilityLabel="Create"
                accessibilityHint="Opens create actions"
                accessibilityState={props.accessibilityState}
                testID={props.testID}
              >
                <View style={styles.createControl}>
                  <Ionicons name="add" size={24} color={Colors.surface} />
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

const styles = StyleSheet.create({
  fixedTabBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
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
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Colors.surface,
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
    backgroundColor: Colors.brand,
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
  avatarWrapActive: {
    borderWidth: 2,
    borderColor: Colors.textPrimary,
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
    backgroundColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: Colors.textMuted,
  },
  sheetContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Space.sm,
    paddingHorizontal: Space.md,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.sm,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  sheetActionLabel: {
    fontSize: 16,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    flex: 1,
  },
});