import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AnimatedPressable } from '../AnimatedPressable';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export type AppEmptyStateVariant = 'default' | 'compact';

export interface AppEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  variant?: AppEmptyStateVariant;
  style?: StyleProp<ViewStyle>;
}

/**
 * Unified empty-state primitive covering default and compact variants.
 * Replaces the fragmented EmptyState and AnimatedEmptyState
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
  style }: AppEmptyStateProps) {
  const reducedMotion = useReducedMotion();
  const enter = reducedMotion ? undefined : FadeIn.duration(300);
  const compact = variant === 'compact';

  // No icon rendered unless a caller provides one — avoids decorative defaults.

  return (
    <View
      style={[styles.container, compact && styles.containerCompact, style]}
      accessibilityRole="summary"
      accessibilityLabel={title}
    >
      {icon ? (
        <Reanimated.View
          entering={enter}
          style={{ alignItems: 'center', marginBottom: compact ? Space.sm : Space.md }}
        >
          {icon}
        </Reanimated.View>
      ) : null}

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
    gap: Space.sm + 2 },
  containerCompact: {
    flex: 0,
    minHeight: 228,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md + Space.sm,
    gap: Space.xs + 2 },
  title: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: -0.2,
    textAlign: 'center' },
  titleCompact: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight },
  description: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: 0.08,
    textAlign: 'center',
    lineHeight: TypographyV2.body.lineHeight + 1,
    maxWidth: 260 },
  descriptionCompact: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 1,
    maxWidth: 310 },
  actionWrap: {
    marginTop: Space.md + 4 } });
