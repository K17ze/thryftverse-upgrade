/**
 * TrustSignalRow — horizontal scrollable row of trust badges.
 *
 * Used on listing cards and PDP. Filters signals by context using
 * `shouldShowSignal` and caps the count per context (max 3 in listing,
 * all in profile, security set in checkout).
 *
 * Anti-AI (AGENTS.md §4):
 *  - Flat horizontal ScrollView, no card-on-card, no decorative chrome.
 *  - Consistent spacing from design tokens.
 *  - `showsHorizontalScrollIndicator={false}` — trust rows are short; the
 *    scrollbar would be noise.
 *  - `accessible` groups the row for screen readers while each badge remains
 *    individually focusable.
 */
import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Space } from '../../theme/designTokens';
import { TrustBadge } from './TrustBadge';
import {
  selectSignals,
  type TrustSignal,
  type TrustContext,
} from './trustSignals';

export interface TrustSignalRowProps {
  signals: TrustSignal[];
  context: TrustContext;
  /** Override the max signals shown (defaults: listing=3, checkout=all, profile=all). */
  max?: number;
  /** Render badges in compact (icon-only) mode. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TrustSignalRow({
  signals,
  context,
  max,
  compact = false,
  style,
}: TrustSignalRowProps) {
  const visible = useMemo(
    () => selectSignals(signals, context, max),
    [signals, context, max],
  );

  if (visible.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, style]}
      accessible
      accessibilityLabel={`${visible.length} trust signals available`}
    >
      {visible.map((signal) => (
        <View key={signal.type} style={styles.item}>
          <TrustBadge signal={signal} compact={compact} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs,
  },
  item: {
  },
});
