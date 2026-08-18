import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassBackdrop } from '../components/LiquidGlassBackdrop';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TabParamList, RootStackParamList } from './types';
import { Space, Radius, Typography, Type } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import { useStore } from '../store/useStore';
import { CachedImage } from '../components/CachedImage';
import { getStoredCreateMode, type PersistedCreateMode } from '../preferences/createModePreferences';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import InboxScreen from '../screens/InboxScreen';
import MyProfileScreen from '../screens/MyProfileScreen';

const Tab = createBottomTabNavigator<TabParamList>();

// Tab bar geometry — these are deliberate layout values, not token candidates.
// Tuned for the Liquid Glass tab bar with 24pt icons + 10pt labels below.
const NAV_HEIGHT = 68;
// Create button: 52pt hit area (exceeds 44pt minimum), 40pt visible control
const CREATE_HIT_SIZE = 52;
const CREATE_CONTROL_SIZE = 40;
// Profile avatar: 27pt — fits within 28pt tabIconWrap with 0.5pt inset
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
    <View style={tabStyles.tabIconWrap} accessible={false} importantForAccessibility="no-hide-descendants">
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
      accessible={false}
      importantForAccessibility="no-hide-descendants"
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

/**
 * Create tab button with spring-based press feedback (Motion.spring.tap).
 * Extracted as a component so it can use hooks (useMotionConfig) for the
 * Reanimated scale animation while respecting reduced motion.
 */
const AnimatedPressableRe = Reanimated.createAnimatedComponent(Pressable);

interface CreateTabButtonProps {
  onPress: () => void;
  onLongPress?: ((event: import('react-native').GestureResponderEvent) => void) | null;
  testID?: string;
  brandColor: string;
  surfaceColor: string;
}

const CreateTabButton = ({
  onPress,
  onLongPress,
  testID,
  brandColor,
  surfaceColor,
}: CreateTabButtonProps) => {
  const { spring } = useMotionConfig();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableRe
      style={[tabStyles.createButton, animStyle]}
      onPressIn={() => {
        // Spring-based tap feedback — snappy, settles fast (Motion.spring.tap).
        // When reduced motion is on, the spring is critically damped so the
        // scale change is effectively instant.
        scale.value = withSpring(0.9, spring.tap);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, spring.tap);
      }}
      onPress={onPress}
      onLongPress={onLongPress ?? undefined}
      accessibilityRole="button"
      accessibilityLabel="Create"
      accessibilityHint="Opens camera to list a new item"
      // P4-02: Create is an action, not a navigation destination. It must
      // never report a "selected" state — pressing it opens a modal overlay
      // and does not change the active tab.
      accessibilityState={{ selected: false, expanded: false }}
      testID={testID}
    >
      <View style={[tabStyles.createControl, { backgroundColor: brandColor }]}>
        <Ionicons name="add" size={24} color={surfaceColor} />
      </View>
    </AnimatedPressableRe>
  );
};

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useAppTheme();
  const currentUser = useStore((s) => s.currentUser);
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

  // P4-02: Persist the user's last-used creation mode (Look / Poster) so the
  // Create action reopens in that mode instead of silently defaulting to Look.
  // Only defaults to 'look' on first-ever use (no stored value).
  const [persistedCreateMode, setPersistedCreateMode] = useState<PersistedCreateMode>('look');
  useEffect(() => {
    let mounted = true;
    getStoredCreateMode().then((mode) => {
      if (mounted) setPersistedCreateMode(mode);
    });
    return () => { mounted = false; };
  }, []);

  const handleCreatePress = useCallback(() => {
    haptic.light();
    // Opens CreatorStudio directly as a modal overlay with the camera/gallery
    // entry screen shown (openEntry). This removes the redundant CreateCamera
    // hop — CreatorStudio already has a CreatorEntryScreen built in. Create is
    // an action, not a navigation destination, so the active tab is unchanged.
    navigation.navigate('CreatorStudio', {
      type: persistedCreateMode,
      openEntry: true,
    });
  }, [haptic, navigation, persistedCreateMode]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          // Labels visible — recognition over recall (research doc §2, §4.1).
          // Create stays label-less via its custom tabBarButton (no label prop).
          tabBarShowLabel: true,
          tabBarHideOnKeyboard: true,
          // Compact 10pt label below each icon. Active/inactive tint is
          // controlled by tabBarActiveTintColor / tabBarInactiveTintColor.
          tabBarLabelStyle: {
            fontSize: Type.meta.size,
            fontFamily: Typography.family.medium,
            letterSpacing: Type.meta.letterSpacing,
            marginTop: Space.xs,
          },
          // Edge-to-edge transparent bar with frosted
          // glass blur background. Content scrolls behind the bar, and the
          // LiquidGlassBackdrop applies iOS 26 Liquid Glass on supported
          // devices (BlurView fallback elsewhere). No floating pill, no
          // solid background — the glass IS the background.
          tabBarStyle: {
            position: 'absolute',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            backgroundColor: 'transparent',
            height: NAV_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarBackground: () => (
            <LiquidGlassBackdrop
              intensity={isDark ? 70 : 90}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ),
          tabBarItemStyle: tabStyles.tabBarItem,
          tabBarActiveTintColor: colors.textPrimary,
          tabBarInactiveTintColor: colors.textMuted,
        }}
        screenListeners={{
          tabPress: (e: { target?: string; preventDefault?: () => void }) => {
            const currentTab = e.target?.split('-')[0] ?? '';
            // P4-02: Create is an action, not a navigation destination. Do not
            // treat its press as a tab switch — skip the tab-switch haptic and
            // do not update lastTabRef. The Create button's custom onPress
            // opens a modal overlay without changing the active tab.
            if (currentTab === 'Create') {
              e.preventDefault?.();
              return;
            }
            if (currentTab !== lastTabRef.current) {
              haptic.patterns.tabSwitch();
              lastTabRef.current = currentTab;
            }
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: 'Home',
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
            tabBarLabel: 'Explore',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'search' : 'search-outline'} color={color} focused={focused} />
            ),
            tabBarAccessibilityLabel: 'Explore',
          }}
        />
        <Tab.Screen
          name="Create"
          component={View}
          options={{
            tabBarButton: (props: BottomTabBarButtonProps) => (
              <CreateTabButton
                onPress={handleCreatePress}
                onLongPress={props.onLongPress}
                testID={props.testID}
                brandColor={colors.brand}
                surfaceColor={colors.surface}
              />
            ),
          }}
          // P4-02: Prevent the tab navigator from ever navigating to the
          // Create "tab" — it is a placeholder slot for the central Create
          // action button, not a real destination. The custom tabBarButton
          // handles the press and opens CreateCamera as a modal.
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
            },
          }}
        />
        <Tab.Screen
          name="Inbox"
          component={InboxScreen}
          options={{
            tabBarLabel: 'Inbox',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name={focused ? 'paper-plane' : 'paper-plane-outline'}
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
            tabBarLabel: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <ProfileTabIcon color={color} focused={focused} />
            ),
            tabBarAccessibilityLabel: currentUser?.displayName
              ? `Profile, ${currentUser.displayName}`
              : 'Profile',
          }}
        />
      </Tab.Navigator>

    </View>
  );
}

// Static layout styles (no theme-dependent colors)
const tabStyles = StyleSheet.create({
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
    top: -7,
    right: -11,
    minWidth: 18,
    height: 18,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
    borderWidth: 1.5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.bold,
    includeFontPadding: false,
    textAlign: 'center',
  },
  createButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CREATE_HIT_SIZE,
    height: CREATE_HIT_SIZE,
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
