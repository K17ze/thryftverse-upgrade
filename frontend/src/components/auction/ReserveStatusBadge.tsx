import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { type ReserveStatus } from '../../utils/auctionDetailLogic';

interface Props {
  status: ReserveStatus;
  compact?: boolean;
  /** Show a short explanation below the badge (for detail screens) */
  showExplanation?: boolean;
}

export function ReserveStatusBadge({ status, compact, showExplanation }: Props) {
  const { colors } = useAppTheme();
  if (status === 'hidden') return null;

  const isMet = status === 'met';
  const iconName = isMet ? 'checkmark-circle-outline' : 'alert-circle-outline';
  const color = isMet ? colors.success : colors.warning;
  const label = isMet ? 'Reserve met' : 'Reserve not met';
  const explanation = isMet
    ? 'The seller\u2019s minimum price has been reached.'
    : 'The seller may decline the winning bid if the reserve is not met.';

  const iconSize = compact ? 11 : 13;
  const fontSize = TypographyV2.meta.size;
  const pillPaddingH = compact ? 6 : Space.xs;
  const pillPaddingV = compact ? 2 : 3;

  return (
    <View
      style={styles.wrapper}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: `${color}15` /* TODO: replace with subtle token once color is resolved */,
            borderColor: `${color}40` /* TODO: replace with subtle token once color is resolved */,
            paddingHorizontal: pillPaddingH,
            paddingVertical: pillPaddingV },
        ]}
      >
        <Ionicons name={iconName} size={iconSize} color={color} />
        <Text style={[styles.label, { color, fontSize }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {showExplanation && !compact ? (
        <Text style={[styles.explanation, { color: colors.textMuted }]} numberOfLines={2}>
          {explanation}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
    alignSelf: 'flex-start' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start' },
  label: {
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: -0.1 },
  explanation: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: 15 } });
