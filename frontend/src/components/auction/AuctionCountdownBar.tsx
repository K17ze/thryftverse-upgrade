import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { formatCountdownSentence } from '../../utils/auctionDetailLogic';

interface Props {
  isLive: boolean;
  liveMsToEnd: number;
  isUpcoming: boolean;
  liveMsToStart: number;
}

/**
 * Prominent countdown timer bar — sits at the top of the content,
 * immediately below the media stage. Red background when < 1 hour
 * remaining (urgency). Shows the server-authoritative countdown so
 * the user always knows the time state without scrolling.
 */
export function AuctionCountdownBar({ isLive, liveMsToEnd, isUpcoming, liveMsToStart }: Props) {
  const { colors } = useAppTheme();

  if (isLive && liveMsToEnd > 0) {
    const isUrgent = liveMsToEnd < 60 * 60 * 1000;
    return (
      <View
        style={[
          styles.countdownBar,
          {
            backgroundColor: isUrgent ? colors.danger : colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Time remaining: ${formatCountdownSentence(liveMsToEnd)}`}
      >
        <Ionicons
          name="time-outline"
          size={16}
          color={isUrgent ? colors.textInverse : colors.textSecondary}
        />
        <Text
          style={[
            styles.countdownBarText,
            {
              color: isUrgent ? colors.textInverse : colors.textPrimary,
              fontVariant: ['tabular-nums'] as any,
            },
          ]}
          numberOfLines={1}
        >
          {`Ends in ${formatCountdownSentence(liveMsToEnd)}`}
        </Text>
        {isUrgent && (
          <View style={[styles.countdownBarUrgencyDot, { backgroundColor: colors.textInverse }]} />
        )}
      </View>
    );
  }

  if (isUpcoming && liveMsToStart > 0) {
    return (
      <View
        style={[styles.countdownBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Starts in: ${formatCountdownSentence(liveMsToStart)}`}
      >
        <Ionicons name="time-outline" size={16} color={colors.brand} />
        <Text
          style={[styles.countdownBarText, { color: colors.textPrimary, fontVariant: ['tabular-nums'] as any }]}
          numberOfLines={1}
        >
          Starts in {formatCountdownSentence(liveMsToStart)}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  countdownBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countdownBarText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    flex: 1,
  },
  countdownBarUrgencyDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: (Space.xs + 2) / 2,
  },
});
