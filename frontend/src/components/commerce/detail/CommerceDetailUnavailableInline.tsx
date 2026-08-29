import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';

/**
 * Inline unavailable state — a compact, factual block for missing
 * facts.
 *
 * Per spec 02: missing values use muted copy, not a display-size em
 * dash. Per spec 03: when execution data is empty, show a compact
 * inline state ("No settled trade history yet"); when the request
 * fails, show "Price history unavailable" + Retry. Do not reserve a
 * large blank chart. Do not show `+0.0%`.
 *
 * This is the shared primitive for those compact inline states. It is
 * never a large passive warning card — it is two lines of muted copy
 * with an optional retry action.
 */
export interface CommerceDetailUnavailableInlineProps {
  title: string;
  body?: string;
  /** Optional retry action when the state is a failed request. */
  onRetry?: () => void;
  /** Optional leading glyph. Defaults to "information-circle-outline". */
  icon?: keyof typeof Ionicons.glyphMap;
  /** When true, the block renders in the danger colour (e.g. hard
   * failure). Default is muted (calm unavailable). */
  critical?: boolean;
}

export function CommerceDetailUnavailableInline({
  title,
  body,
  onRetry,
  icon = 'information-circle-outline',
  critical = false }: CommerceDetailUnavailableInlineProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.textCluster}>
        <Ionicons
          name={icon}
          size={18}
          color={critical ? colors.danger : colors.textMuted}
          style={styles.icon}
        />
        <View style={styles.copy}>
          <Text
            style={[
              styles.title,
              { color: critical ? colors.danger : colors.textSecondary },
            ]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {body ? (
            <Text
              style={[styles.body, { color: colors.textMuted }]}
              numberOfLines={3}
            >
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          hitSlop={8}
          accessibilityLabel="Retry"
          accessibilityRole="button"
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text style={[styles.retryText, { color: colors.textPrimary }]}>
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.md },
  textCluster: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    flexShrink: 1 },
  icon: {
    marginTop: Space.xs / 2 },
  copy: {
    flexShrink: 1,
    gap: Space.xs / 2 },
  title: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontWeight: '500' },
  body: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  retry: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center' },
  pressed: {
    opacity: 0.6 },
  retryText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontWeight: '600' } });
