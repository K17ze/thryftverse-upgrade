import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';

interface Props {
  text: string;
  urgent?: boolean;
  compact?: boolean;
}

export function AuctionCountdown({ text, urgent, compact }: Props) {
  const color = urgent ? Colors.danger : Colors.textPrimary;
  const iconSize = compact ? 11 : 13;
  const fontSize = compact ? 12 : 14;
  return (
    <View style={styles.row}>
      <Ionicons name="time-outline" size={iconSize} color={urgent ? Colors.danger : Colors.textMuted} />
      <Text style={[styles.text, { color, fontSize }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  text: {
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
});
