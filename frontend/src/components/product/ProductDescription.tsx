import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Typography, Space, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

export interface ProductDescriptionProps {
  description: string;
  maxLines?: number;
}

export function ProductDescription({ description, maxLines = 4 }: ProductDescriptionProps) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);

  if (!description) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Description</Text>
      <Text
        style={[styles.description, { color: colors.textPrimary }]}
        numberOfLines={expanded ? undefined : maxLines}
      >
        {description}
      </Text>
      {description.length > 120 && (
        <Pressable
          onPress={() => setExpanded(!expanded)}
          hitSlop={8}
          accessibilityLabel={expanded ? 'Show less' : 'Read more'}
          accessibilityRole="button"
        >
          <Text style={[styles.toggleText, { color: colors.textMuted }]}>
            {expanded ? 'Show less' : 'Read more'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.xs,
    letterSpacing: Type.caption.letterSpacing,
  },
  description: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    fontFamily: Typography.family.regular,
  },
  toggleText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    marginTop: Space.xs,
  },
});
