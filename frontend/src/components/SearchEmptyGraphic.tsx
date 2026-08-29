import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Typography, Space, Type } from '../theme/designTokens';

interface Props {
  query?: string;
  suggestion?: string;
}

export function SearchEmptyGraphic({ query, suggestion }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Ionicons
        name="search-outline"
        size={28}
        color={colors.textMuted}
      />
      <Text style={styles.title}>
        {query ? `No results for "${query}"` : 'Search'}
      </Text>
      {suggestion ? (
        <Text style={styles.subtitle}>{suggestion}</Text>
      ) : (
        <Text style={styles.subtitle}>Try searching for brands, items, or styles</Text>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: 12,
    },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyStrong.size,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: 220,
    },
  });
}
