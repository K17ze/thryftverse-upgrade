import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  Easing,
  runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  Space,
  Radius,
  FontFamily,
  FontSize,
  LetterSpacing,
  Elevation,
  Stroke,
  Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import { triggerHaptic, HapticType } from '../../utils/haptics';
import type { InAppNotification, NotificationType } from '../../services/inAppNotificationsApi';

// ---------------------------------------------------------------------------
// Type → visual config
// ---------------------------------------------------------------------------

interface TypeConfig {
  icon: keyof typeof Ionicons.glyphMap;
  /** Semantic accent color key from ThemeColors. */
  accentKey:
    | 'success'
    | 'warning'
    | 'danger'
    | 'brand'
    | 'discovery'
    | 'social'
    | 'commerceTrust'
    | 'antiqueGold';
}

const TYPE_CONFIG: Record<NotificationType, TypeConfig> = {
  success: { icon: 'checkmark-circle', accentKey: 'success' },
  warning: { icon: 'warning', accentKey: 'warning' },
  error: { icon: 'alert-circle', accentKey: 'danger' },
  info: { icon: 'information-circle', accentKey: 'brand' },
  offer: { icon: 'pricetag', accentKey: 'discovery' },
  message: { icon: 'chatbubble', accentKey: 'social' },
  listing: { icon: 'cube', accentKey: 'commerceTrust' },
  order: { icon: 'cube', accentKey: 'commerceTrust' } };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InAppNotificationBannerProps {
  notification: InAppNotification;
  onDismiss: (id: string) => void;
  onAction?: (notification: InAppNotification) => void;
  /** Stack index (0 = top). Used to offset consecutive banners. */
  index?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InAppNotificationBanner({
  notification,
  onDismiss,
  index = 0 }: InAppNotificationBannerProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();

  const config = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.info;
  const accentColor = colors[config.accentKey] ?? colors.brand;

  // Entrance / exit animation values.
  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);
  // Progress bar (0 → 1 over duration). Only animates for non-sticky banners.
  const progress = useSharedValue(0);

  const isSticky = notification.duration <= 0;

  // Cancel all in-flight animations on unmount. Without this, Reanimated
  // can try to update props on an unmounted banner view, causing
  // RetryableMountingLayerException on Android Fabric.
  React.useEffect(() => {
    return () => {
      cancelAnimation(translateY);
      cancelAnimation(opacity);
      cancelAnimation(progress);
    };
  }, [translateY, opacity, progress]);

  const handleDismiss = React.useCallback(() => {
    if (reducedMotion) {
      runOnJS(onDismiss)(notification.id);
      return;
    }
    translateY.value = withTiming(
      -120,
      { duration: Motion.duration.normal, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onDismiss)(notification.id);
      },
    );
    opacity.value = withTiming(0, { duration: Motion.duration.fast });
  }, [notification.id, onDismiss, opacity, reducedMotion, translateY]);

  // Entrance — slide in from top (or instant when reduced motion).
  useEffect(() => {
    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = 1;
    } else {
      translateY.value = withTiming(0, {
        duration: Motion.duration.slow,
        easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(1, { duration: Motion.duration.normal });
    }

    // Announce for accessibility.
    const announcement = notification.body
      ? `${notification.title}. ${notification.body}`
      : notification.title;
    if (typeof AccessibilityInfo?.announceForAccessibility === 'function') {
      void AccessibilityInfo.announceForAccessibility(announcement);
    }

    // Progress bar — only for auto-dismissing banners.
    if (!isSticky && !reducedMotion) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: notification.duration });
    } else if (!isSticky && reducedMotion) {
      progress.value = 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification.id, reducedMotion]);

  // Swipe-up-to-dismiss gesture.
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetY(-12)
      .onUpdate((e) => {
        // Only allow upward swipe (negative translationY).
        translateY.value = Math.min(0, e.translationY);
        opacity.value = Math.max(0, 1 + e.translationY / 100);
      })
      .onEnd((e) => {
        if (e.translationY < -40 || e.velocityY < -500) {
          runOnJS(handleDismiss)();
        } else {
          // Spring back.
          translateY.value = withTiming(0, { duration: Motion.duration.normal });
          opacity.value = withTiming(1, { duration: Motion.duration.fast });
        }
      });
  }, [handleDismiss, opacity, translateY]);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value }));

  const progressStyle = useAnimatedStyle(() => ({
    // Width shrinks from 100% → 0% as time elapses.
    transform: [{ scaleX: Math.max(0, 1 - progress.value) }] }));

  const handleTapDismiss = () => {
    triggerHaptic(HapticType.LIGHT);
    handleDismiss();
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Reanimated.View
        style={[
          styles.banner,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.borderSubtle,
            marginTop: index === 0 ? insets.top + Space.sm : 0 },
          Elevation.floating,
          bannerStyle,
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${notification.type} notification: ${notification.title}${
          notification.body ? `, ${notification.body}` : ''
        }${notification.isDemo ? '. Demo notification' : ''}`}
      >
        {/* iOS-native icon container — a small rounded square with a
            subtle accent tint, echoing how iOS notifications show an
            app icon. The type icon sits inside with the accent colour.
            This replaces the custom-toast accent stripe. */}
        <View style={styles.content}>
          <Ionicons
            name={config.icon}
            size={Control.iconCompact}
            color={accentColor}
            style={styles.typeIcon}
            accessibilityLabel={undefined}
          />

          <View style={styles.textColumn}>
            <Text
              style={styles.title}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            {notification.body ? (
              <Text
                style={styles.body}
                numberOfLines={2}
              >
                {notification.body}
              </Text>
            ) : null}
          </View>

          <View style={styles.actionsColumn}>
            <AnimatedPressable
              onPress={handleTapDismiss}
              style={styles.dismissBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss notification"
              accessibilityHint="Closes this notification"
            >
              <Ionicons name="close" size={Control.iconCompact} color={colors.textSecondary} />
            </AnimatedPressable>
          </View>
        </View>

        {/* Progress bar — subtle line at bottom showing time remaining. */}
        {!isSticky ? (
          <View style={styles.progressTrack}>
            <Reanimated.View
              style={[
                styles.progressFill,
                { backgroundColor: accentColor },
                progressStyle,
              ]}
            />
          </View>
        ) : null}
      </Reanimated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Styles — design tokens only, no hardcoded values
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    overflow: 'hidden',
    marginHorizontal: Space.md },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Space.sm + 2,
    paddingTop: Space.sm + 2,
    paddingBottom: Space.sm,
    gap: Space.sm },
  typeIcon: {
    marginTop: 1 },
  textColumn: {
    flex: 1,
    gap: Space.xs },
  title: {
    flexShrink: 1,
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    letterSpacing: LetterSpacing.normal,
    lineHeight: TypographyV2.body.lineHeight },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
    lineHeight: TypographyV2.meta.lineHeight,
    opacity: 0.8 },
  actionsColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingTop: Space.xs },
  dismissBtn: {
    padding: Space.xs },
  progressTrack: {
    height: 1.5,
    backgroundColor: 'transparent',
    width: '100%' },
  progressFill: {
    height: '100%',
    width: '100%',
    transformOrigin: 'left',
    opacity: 0.5 } });
