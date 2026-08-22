import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AnimatedPressable } from '../AnimatedPressable';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

export type AppEmptyStateVariant = 'default' | 'compact' | 'illustrated';

export interface AppEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  variant?: AppEmptyStateVariant;
  style?: StyleProp<ViewStyle>;
}

/**
 * Unified empty-state primitive covering default, compact, and illustrated
 * variants. Replaces the fragmented EmptyState and AnimatedEmptyState
 * implementations with a single accessible component backed by design
 * tokens. The optional `icon` slot accepts any ReactNode (Ionicons name,
 * Lottie animation, or custom graphic) so callers control the visual
 * treatment without prop explosion.
 */
export function AppEmptyState({
  icon,
  title,
  description,
  action,
  variant = 'default',
  style,
}: AppEmptyStateProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const enter = reducedMotion ? undefined : FadeIn.duration(300);
  const compact = variant === 'compact';
  const illustrated = variant === 'illustrated';

  const renderIcon = () => {
    if (icon) return icon;
    return (
      <Ionicons
        name="cube-outline"
        size={compact ? 24 : 38}
        color={colors.brand}
      />
    );
  };

  return (
    <View
      style={[styles.container, compact && styles.containerCompact, style]}
      accessibilityRole="summary"
      accessibilityLabel={title}
    >
      <Reanimated.View
        entering={enter}
        style={[
          styles.iconRing,
          compact && styles.iconRingCompact,
          illustrated && styles.iconRingIllustrated,
        ]}
      >
        {renderIcon()}
      </Reanimated.View>

      <Reanimated.Text
        entering={enter}
        style={[styles.title, compact && styles.titleCompact]}
      >
        {title}
      </Reanimated.Text>

      {description ? (
        <Reanimated.Text
          entering={enter}
          style={[styles.description, compact && styles.descriptionCompact]}
        >
          {description}
        </Reanimated.Text>
      ) : null}

      {action ? (
        <Reanimated.View entering={enter} style={styles.actionWrap}>
          {action}
        </Reanimated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl + Space.sm,
    paddingVertical: Space.xxl + Space.sm,
    gap: Space.sm + 2,
  },
  containerCompact: {
    flex: 0,
    minHeight: 228,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md + Space.sm,
    gap: Space.xs + 2,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  iconRingCompact: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    marginBottom: Space.sm,
  },
  iconRingIllustrated: {
    borderWidth: 0,
    width: 'auto',
    height: 'auto',
    borderRadius: 0,
    marginBottom: Space.md,
  },
  title: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
  },
  description: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.08,
    textAlign: 'center',
    lineHeight: Type.body.lineHeight + 1,
    maxWidth: 260,
  },
  descriptionCompact: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 1,
    maxWidth: 310,
  },
  actionWrap: {
    marginTop: Space.md + 4,
  },
});
