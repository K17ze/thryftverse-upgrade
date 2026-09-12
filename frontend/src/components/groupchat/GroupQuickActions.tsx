/**
 * GroupQuickActions — the action dock under the group identity hero.
 *
 * A single row of transparent icon + label targets (theme, search, invite,
 * mute). No containers, no pills — containment is reserved for meaning, so
 * each action is a plain 44pt+ transparent target whose only state signal is
 * colour and a spinner while a mutation is in flight.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/ThemeContext';
import { Control, FontFamily, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { IoniconsGlyphName, SemanticIconName } from '../../theme/iconTokens';

export interface GroupQuickAction {
  key: string;
  label: string;
  icon: SemanticIconName | IoniconsGlyphName;
  /** Renders the icon + label in the brand colour (e.g. muted state). */
  active?: boolean;
  /** Shows a spinner in place of the icon while a mutation is in flight. */
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

export function GroupQuickActions({ actions }: { actions: GroupQuickAction[] }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.dock}>
      {actions.map((action) => {
        const disabled = action.disabled || action.busy;
        const tint = action.active ? colors.brand : colors.textPrimary;
        return (
          <AnimatedPressable
            key={action.key}
            style={styles.action}
            onPress={action.onPress}
            disabled={disabled}
            activeOpacity={0.68}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel ?? action.label}
            accessibilityState={{ disabled: !!disabled, busy: !!action.busy, selected: !!action.active }}
          >
            <View style={styles.iconSlot}>
              {action.busy ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <AppIcon name={action.icon} size="md" color={tint} accessible={false} />
              )}
            </View>
            <Text
              style={[styles.label, { color: action.active ? colors.brand : colors.textPrimary }]}
              numberOfLines={1}
            >
              {action.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    gap: Space.sm,
    marginTop: Space.xs,
  },
  action: {
    flex: 1,
    minHeight: Control.hit + Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs,
    gap: 4,
  },
  iconSlot: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: FontFamily.medium,
  },
});
