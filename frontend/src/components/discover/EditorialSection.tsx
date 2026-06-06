import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Typography } from '../../theme/designTokens';

interface Props {
  kicker?: string;
  title: string;
  onSearchPress?: () => void;
  children: React.ReactNode;
  style?: object;
}

export function EditorialSection({ kicker, title, onSearchPress, children, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          {kicker ? (
            <Text style={styles.kicker}>{kicker}</Text>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        {onSearchPress && (
          <AnimatedPressable
            style={styles.searchBtn}
            onPress={onSearchPress}
            activeOpacity={0.8}
            accessibilityLabel={`Search ${title}`}
            accessibilityHint={`Find more ${title}`}
          >
            <Ionicons name="search" size={18} color={Colors.textPrimary} />
          </AnimatedPressable>
        )}
      </View>

      {/* Content */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  titleBlock: {
    flex: 1,
    flexShrink: 1,
  },
  kicker: {
    fontFamily: Typography.family.medium,
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.1,
  },
  title: {
    fontFamily: Typography.family.bold,
    fontSize: 22,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    flexShrink: 0,
  },
});
