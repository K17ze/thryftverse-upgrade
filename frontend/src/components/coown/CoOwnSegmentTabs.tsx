/**
 * CoOwnSegmentTabs — fixed segment selector for the Co-Own hub.
 *
 * Rendered directly under the FlagshipHeader (not inside the list) so the
 * Offerings / Trading / Watchlist switch is always visible at the top of
 * the screen — the primary navigation for the marketplace surface.
 * Underline-tab grammar matches the rest of the Co-Own design system.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { haptics } from '../../utils/haptics';
import { Control, LetterSpacing, Space, Stroke, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export type CoOwnHubSegment = 'offerings' | 'trading' | 'watchlist';

export const COOWN_HUB_SEGMENTS: CoOwnHubSegment[] = ['offerings', 'trading', 'watchlist'];

const SEGMENT_LABELS: Record<CoOwnHubSegment, string> = {
  offerings: 'Offerings',
  trading: 'Trading',
  watchlist: 'Watchlist',
};

export interface CoOwnSegmentTabsProps {
  activeSegment: CoOwnHubSegment;
  /** Item counts per segment — surfaced through accessibility labels. */
  counts: Record<CoOwnHubSegment, number>;
  onSelect: (segment: CoOwnHubSegment) => void;
}

export function CoOwnSegmentTabs({ activeSegment, counts, onSelect }: CoOwnSegmentTabsProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.surface, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
      accessibilityRole="tablist"
      accessibilityLabel="Market segments"
      accessibilityHint="Switch between offerings, trading markets, and your watchlist"
    >
      {COOWN_HUB_SEGMENTS.map((segment) => {
        const isActive = activeSegment === segment;
        return (
          <AnimatedPressable
            key={segment}
            onPress={() => {
              haptics.selection();
              onSelect(segment);
            }}
            style={styles.tab}
            scaleValue={0.98}
            activeOpacity={0.72}
            accessibilityRole="tab"
            accessibilityLabel={`${SEGMENT_LABELS[segment]} tab, ${counts[segment]} items`}
            accessibilityHint={`Shows the ${SEGMENT_LABELS[segment]} market list`}
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color: isActive ? colors.textPrimary : colors.textSecondary,
                  fontFamily: isActive ? Typography.family.semibold : Typography.family.regular,
                },
              ]}
              maxFontSizeMultiplier={1.35}
            >
              {SEGMENT_LABELS[segment]}
            </Text>
            {isActive ? <View style={[styles.tabIndicator, { backgroundColor: colors.textPrimary }]} /> : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    minHeight: Control.hit + 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    paddingHorizontal: Space.sm,
  },
  tab: {
    minWidth: 0,
    minHeight: Control.hit + 5,
    flex: 1,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: LetterSpacing.normal - 0.1,
    textAlign: 'center',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: Space.lg + 4,
    height: Stroke.emphasis,
    borderRadius: Stroke.hairline,
  },
});

export default CoOwnSegmentTabs;
