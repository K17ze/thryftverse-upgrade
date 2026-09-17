/**
 * Centered state views for the MediaBrowser sheet: permission denied,
 * load error, and empty-library states plus the shared static icon.
 *
 * Extracted from MediaBrowserSheet — pure extraction, no behavior change.
 */
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { Motion } from '../../../theme/motionTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { AppIcon } from '../../../components/common/AppIcon';
import type { MediaTab } from './mediaBrowserTypes';
import type { MediaBrowserStyles } from './mediaBrowserStyles';

// ── StaticStateIcon — no continuous animation (AGENTS.md §17) ───────

export function StaticStateIcon({
  name,
  size,
  color }: {
  name: string;
  size: number;
  color: string;
}) {
  return <AppIcon name={name} size={size} color={color} opticalCenter={true} accessible={false} />;
}

// ── PermissionDeniedState — spring entrance with retry CTA ──────────

interface PermissionDeniedStateProps {
  icon: string;
  title: string;
  message: string;
  ctaLabel: string;
  onCta: () => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function PermissionDeniedState({
  icon,
  title,
  message,
  ctaLabel,
  onCta,
  colors,
  styles }: PermissionDeniedStateProps) {
  const reduceMotion = useReducedMotion();
  const entranceSV = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) {
      // Per §5.14: entrance uses timing (ease-out), not spring.
      const entranceDelayMs = 100;
      entranceSV.value = withDelay(entranceDelayMs, withTiming(1, { duration: Motion.duration.slow, easing: Motion.easing.entrance }));
    }
  }, [reduceMotion, entranceSV]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceSV.value,
    transform: [
      { translateY: interpolate(entranceSV.value, [0, 1], [20, 0], Extrapolation.CLAMP) },
    ] }));

  return (
    <Reanimated.View style={[styles.centerState, entranceStyle]}>
      <StaticStateIcon name={icon} size={IconGrammar.hero} color={colors.textMuted} />
      <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.stateMessage, { color: colors.textSecondary }]}>{message}</Text>
      <PressScale
        onPress={onCta}
        style={[styles.stateBtn, { backgroundColor: colors.brand }]}
        accessibilityLabel={ctaLabel}
        accessibilityHint="Takes the suggested action"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={[styles.stateBtnText, { color: colors.textInverse }]}>{ctaLabel}</Text>
      </PressScale>
    </Reanimated.View>
  );
}

// ── MediaLoadErrorState — library load failure with retry CTA ───────

interface MediaLoadErrorStateProps {
  onRetry: () => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function MediaLoadErrorState({ onRetry, colors, styles }: MediaLoadErrorStateProps) {
  return (
    <View style={styles.centerState}>
      <StaticStateIcon name="alert-circle-outline" size={IconGrammar.hero} color={colors.textMuted} />
      <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
        Couldn't load photos
      </Text>
      <PressScale
        onPress={onRetry}
        style={[styles.stateBtn, { backgroundColor: colors.brand }]}
        accessibilityLabel="Retry loading photos"
        accessibilityHint="Reloads the media library"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={[styles.stateBtnText, { color: colors.textInverse }]}>
          Retry
        </Text>
      </PressScale>
    </View>
  );
}

// ── MediaEmptyState — empty library with optional camera CTA ────────

interface MediaEmptyStateProps {
  activeTab: MediaTab;
  showCameraTile: boolean;
  onTakePhoto: () => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function MediaEmptyState({
  activeTab,
  showCameraTile,
  onTakePhoto,
  colors,
  styles }: MediaEmptyStateProps) {
  return (
    <View style={styles.centerState}>
      <StaticStateIcon name="images-outline" size={IconGrammar.hero} color={colors.textMuted} />
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        {activeTab === 'videos'
          ? 'No videos available'
          : activeTab === 'photos'
            ? 'No photos available'
            : 'No photos available'}
      </Text>
      {showCameraTile && (
        <PressScale
          onPress={onTakePhoto}
          style={[styles.stateBtn, { backgroundColor: colors.brand }]}
          accessibilityLabel="Take photo"
          accessibilityHint="Opens the camera to capture a new photo"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.stateBtnText, { color: colors.textInverse }]}>
            Take photo
          </Text>
        </PressScale>
      )}
    </View>
  );
}
