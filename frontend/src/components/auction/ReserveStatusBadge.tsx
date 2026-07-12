import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { type ReserveStatus } from '../../utils/auctionDetailLogic';

interface Props {
  status: ReserveStatus;
  compact?: boolean;
  /** Show a short explanation below the badge (for detail screens) */
  showExplanation?: boolean;
}

export function ReserveStatusBadge({ status, compact, showExplanation }: Props) {
  if (status === 'none') return null;

  const isMet = status === 'met';
  const iconName = isMet ? 'shield-checkmark-outline' : 'shield-half-outline';
  const color = isMet ? Colors.success : '#E8A93C';
  const label = isMet ? 'Reserve met' : 'Reserve not met';
  const explanation = isMet
    ? 'The seller\u2019s minimum price has been reached.'
    : 'The seller may decline the winning bid if the reserve is not met.';

  const iconSize = compact ? 11 : 13;
  const fontSize = compact ? 11 : 12;
  const pillPaddingH = compact ? 6 : Space.xs;
  const pillPaddingV = compact ? 2 : 3;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: `${color}15`,
            borderColor: `${color}40`,
            paddingHorizontal: pillPaddingH,
            paddingVertical: pillPaddingV,
          },
        ]}
      >
        <Ionicons name={iconName} size={iconSize} color={color} />
        <Text style={[styles.label, { color, fontSize }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {showExplanation && !compact ? (
        <Text style={[styles.explanation, { color: Colors.textMuted }]} numberOfLines={2}>
          {explanation}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
    alignSelf: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: Typography.family.medium,
    letterSpacing: -0.1,
  },
  explanation: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    lineHeight: 15,
  },
});
