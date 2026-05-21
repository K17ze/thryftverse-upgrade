import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { Caption } from '../ui/Text';

interface NewMessagesSeparatorProps {
  style?: ViewStyle;
}

export function NewMessagesSeparator({ style }: NewMessagesSeparatorProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.line} />
      <View style={styles.pill}>
        <Caption color={Colors.brand} style={styles.text}>New messages</Caption>
      </View>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Space.sm + 4,
    paddingHorizontal: Space.md,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: `${Colors.brand}30`,
  },
  pill: {
    backgroundColor: `${Colors.brand}15`,
    borderWidth: 1,
    borderColor: `${Colors.brand}40`,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.xs + 2,
    marginHorizontal: Space.sm,
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
});
