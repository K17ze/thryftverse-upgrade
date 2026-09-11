import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Control, Elevation, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useSignupWall } from '../../hooks/useSignupWall';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface HomeHeaderProps {
  scrollY: SharedValue<number>;
  headerHeightSV: SharedValue<number>;
  isGuest: boolean;
  notificationCount: number;
  liveShoppingEnabled: boolean;
}

export function HomeHeader({
  scrollY,
  headerHeightSV,
  isGuest,
  notificationCount,
  liveShoppingEnabled }: HomeHeaderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavT>();
  // Home is nested HomeStack → BottomTabs → RootStack. Global overlays are
  // owned by RootStack and must not be dispatched into the tab-local stack.
  const rootNavigation = navigation
    .getParent()
    ?.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const { requireAuth } = useSignupWall();

  const headerHeightStyle = useAnimatedStyle(() => {
    return { height: headerHeightSV.value };
  });

  const headerTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 70], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 90], [0, -10], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }] };
  });

  const headerShadowStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(scrollY.value, [0, 60], [0, Elevation.floating.shadowOpacity], Extrapolation.CLAMP);
    const shadowRadius = interpolate(scrollY.value, [0, 60], [0, Elevation.floating.shadowRadius], Extrapolation.CLAMP);
    return {
      shadowOpacity,
      shadowRadius,
      elevation: interpolate(scrollY.value, [0, 60], [0, 6], Extrapolation.CLAMP) };
  });

  return (
    <Reanimated.View style={[styles.floatingHeaderShell, headerHeightStyle, headerShadowStyle]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />

      <View style={[styles.headerForeground, { paddingTop: insets.top + Space.xxs, paddingBottom: Space.sm }]}>
        <Reanimated.View style={[headerTitleStyle, styles.headerTitleWrap]}>
          <Text style={styles.brandTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3} accessibilityRole="header">Thryftverse</Text>
          {isGuest ? (
            <Pressable
              onPress={() => navigation.navigate('AuthLanding')}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
              accessibilityRole="link"
              accessibilityLabel="Browsing as guest. Tap to sign in."
              accessibilityHint="Opens the sign-in screen"
            >
              <Text style={styles.guestLabel} maxFontSizeMultiplier={1.2}>
                Browsing as guest · Sign in
              </Text>
            </Pressable>
          ) : null}
        </Reanimated.View>

        <View style={styles.headerRight}>
          {liveShoppingEnabled ? (
            <AnimatedPressable
              style={styles.liveBadge}
              onPress={() => navigation.navigate('LiveShopping')}
              accessibilityLabel="Live shopping — watch live streams"
              accessibilityRole="button"
              accessibilityHint="Opens live shopping"
            >
              <View style={styles.liveDot} pointerEvents="none" accessible={false} />
              <Text style={styles.liveBadgeText}>Live</Text>
            </AnimatedPressable>
          ) : null}
          <AnimatedPressable
            style={styles.headerBtn}
            onPress={() => { if (!requireAuth('create_listing')) return; navigation.navigate('Sell'); }}
            accessibilityLabel="List an item"
            accessibilityRole="button"
            accessibilityHint="Opens sell listing flow"
          >
            <Ionicons name="add" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.headerBtn}
            onPress={() => rootNavigation?.navigate('UnifiedDiscovery')}
            accessibilityLabel="Search and discover"
            accessibilityRole="button"
            accessibilityHint="Opens discovery — explore items, looks, mood boards, editorials and more"
          >
            <Ionicons name="search" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.headerBtn}
            onPress={() => navigation.navigate('NotificationsList')}
            accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications'}
            accessibilityRole="button"
            accessibilityHint="Opens notifications center"
          >
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            {notificationCount > 0 && (
              <View style={styles.notificationBadge} pointerEvents="none" accessible={false}>
                <Text style={styles.notificationBadgeText} maxFontSizeMultiplier={1.5}>
                  {notificationCount > 99 ? '99+' : notificationCount}
                </Text>
              </View>
            )}
          </AnimatedPressable>
        </View>
      </View>
    </Reanimated.View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  floatingHeaderShell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle },
  headerForeground: {
    flex: 1,
    paddingHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  headerTitleWrap: {
    flex: 1,
    paddingRight: Space.sm },
  // Brand title: subtitle token (17/24/600) — lighter header chrome per AGENTS.md §4.
  brandTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    color: colors.textPrimary },
  // Guest indicator — a small, restrained text label below the brand title.
  // Not a banner; communicates state and provides a sign-in entry point.
  guestLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.1,
    color: colors.textMuted,
    marginTop: 1 },
  headerRight: {
    flexDirection: 'row',
    gap: Space.xxs },
  // Live shopping badge — additive entry point gated by the
  // live_shopping_enabled feature flag. A compact pill with a live dot so
  // it reads as a status indicator, not decorative chrome.
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
    height: 28,
    paddingHorizontal: Space.sm,
    marginRight: Space.xxs,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: colors.dangerSubtle,
    alignSelf: 'center' },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: colors.danger },
  liveBadgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    color: colors.danger,
    letterSpacing: TypographyV2.meta.letterSpacing },
  headerBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
    borderWidth: Stroke.standard,
    borderColor: colors.background },
  notificationBadgeText: {
    color: colors.textInverse,
    fontSize: TypographyV2.meta.size,
    fontFamily: 'Inter_700Bold',
    lineHeight: TypographyV2.meta.lineHeight,
    fontVariant: ['tabular-nums'] },
});
