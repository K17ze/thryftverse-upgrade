import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type, Stroke, Control } from '../../theme/designTokens';

export type CommerceStateType = 'loading' | 'error' | 'unavailable';

export interface CommerceStateCanvasProps {
  state: CommerceStateType;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /**
   * Optional family hint to tune the loading skeleton's hero height and
   * composition. Defaults to "direct" which mirrors the direct-listing
   * detail layout.
   */
  family?: 'direct' | 'auction' | 'coown';
}

/**
 * Theme-aware state canvas for the commerce detail screens.
 *
 * Loading state renders a layout-matching skeleton (no generic centred
 * spinner) per AGENTS.md §14: "Skeletons should resemble the final
 * layout. Do not use a generic centred spinner for every state."
 *
 * Error / unavailable states render a quiet but visually distinct
 * composition with a prominent retry action.
 */
export function CommerceStateCanvas({
  state,
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
  secondaryActionLabel,
  onSecondaryAction,
  family = 'direct',
}: CommerceStateCanvasProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  if (state === 'loading') {
    return <CommerceDetailSkeleton family={family} />;
  }

  const defaultTitle =
    state === 'error' ? 'Something went wrong'
    : 'Unavailable';

  const defaultMessage =
    state === 'error' ? 'Pull down to refresh or try again.'
    : 'This item is no longer available.';

  const iconName =
    state === 'error' ? 'cloud-offline-outline' : 'cube-outline';

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 60,
          backgroundColor: colors.background,
        },
      ]}
    >
      <Ionicons
        name={iconName}
        size={32}
        color={colors.textMuted}
        style={styles.icon}
      />

      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {title ?? defaultTitle}
      </Text>

      <Text style={[styles.message, { color: colors.textSecondary }]}>
        {message ?? defaultMessage}
      </Text>

      {onRetry && (
        <Pressable
          style={({ pressed }) => [
            styles.retryBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Text style={[styles.retryText, { color: colors.textPrimary }]}>
            {retryLabel}
          </Text>
        </Pressable>
      )}
      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onSecondaryAction}
          accessibilityRole="button"
          accessibilityLabel={secondaryActionLabel}
        >
          <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
            {secondaryActionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Layout-matching skeleton for the commerce detail screens.
 *
 * Mirrors the final composition: hero media → identity → transaction
 * surface → section → section. The hero height tracks the same
 * heightFraction used by the real screens so the loading → populated
 * transition is geometry-stable.
 */
function CommerceDetailSkeleton({ family }: { family: 'direct' | 'auction' | 'coown' }) {
  const { colors } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 390;
  const heroFraction = family === 'coown'
    ? (width < 340 ? 0.48 : isCompact ? 0.5 : 0.56)
    : (isCompact ? 0.5 : 0.56);
  const heroHeight = Math.min(height * heroFraction, width * 1.35);

  return (
    <View style={[styles.skeletonContainer, { backgroundColor: colors.background }]}>
      {/* Hero media placeholder */}
      <View style={[styles.skeletonHero, { height: heroHeight, backgroundColor: colors.surfaceAlt }]} />

      {/* Identity seam */}
      <View style={styles.skeletonIdentity}>
        <View style={[styles.skeletonLine, { width: 90, height: Type.caption.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        <View style={{ height: Space.xs }} />
        <View style={[styles.skeletonLine, { width: '80%', height: Type.title.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        <View style={{ height: Space.xs }} />
        <View style={[styles.skeletonLine, { width: '45%', height: Type.bodyLarge.lineHeight, backgroundColor: colors.surfaceAlt }]} />
      </View>

      {/* Transaction surface */}
      <View style={[styles.skeletonSurface, { backgroundColor: colors.surface }]}>
        <View style={[styles.skeletonLine, { width: '30%', height: Type.caption.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        <View style={{ height: Space.xs }} />
        <View style={[styles.skeletonLine, { width: '55%', height: Type.priceLarge.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        <View style={{ height: Space.sm }} />
        <View style={styles.skeletonRow}>
          <View style={[styles.skeletonLine, { flex: 1, height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
          <View style={[styles.skeletonLine, { width: 80, height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        </View>
      </View>

      {/* Section placeholder */}
      <View style={styles.skeletonSection}>
        <View style={[styles.skeletonLine, { width: '40%', height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        <View style={{ height: Space.sm }} />
        <View style={[styles.skeletonLine, { width: '100%', height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        <View style={{ height: Space.xs }} />
        <View style={[styles.skeletonLine, { width: '85%', height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
      </View>

      {/* Section placeholder */}
      <View style={styles.skeletonSection}>
        <View style={[styles.skeletonLine, { width: '35%', height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        <View style={{ height: Space.sm }} />
        <View style={styles.skeletonRow}>
          <View style={[styles.skeletonLine, { flex: 1, height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
          <View style={[styles.skeletonLine, { width: 60, height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        </View>
        <View style={{ height: Space.xs }} />
        <View style={styles.skeletonRow}>
          <View style={[styles.skeletonLine, { flex: 1, height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
          <View style={[styles.skeletonLine, { width: 60, height: Type.body.lineHeight, backgroundColor: colors.surfaceAlt }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
  },
  icon: {
    marginBottom: Space.md,
  },
  title: {
    fontSize: Type.itemTitle.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
    marginBottom: Space.xs,
  },
  message: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: Type.body.lineHeight,
  },
  retryBtn: {
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  secondaryBtn: {
    minHeight: Control.hit,
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  // ── Skeleton ──
  skeletonContainer: {
    flex: 1,
  },
  skeletonHero: {
    width: '100%',
  },
  skeletonIdentity: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  skeletonSurface: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.md + 2,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    gap: Space.xs,
  },
  skeletonSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  skeletonLine: {
    borderRadius: Radius.sm,
  },
});
