import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';

export interface CoOwnMarketOverviewProps {
  children: React.ReactNode;
}

/**
 * The one non-media surface in Co-Own's first decision chapter.
 *
 * It uses the active runtime theme instead of a fixed "trading terminal"
 * palette. A flat, full-width surface binds price, top-of-book, depth and
 * market state without becoming another rounded dashboard card.
 */
export function CoOwnMarketOverview({ children }: CoOwnMarketOverviewProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSubtle,
          borderBottomColor: colors.borderSubtle,
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel="Co-Own market overview"
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: Space.sm,
  },
});

export default CoOwnMarketOverview;
