import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

export interface ProductDescriptionProps {
  description: string;
  maxLines?: number;
}

export function ProductDescription({ description, maxLines = 4 }: ProductDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!description) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Description</Text>
      <Text
        style={styles.description}
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
          <Text style={styles.toggleText}>
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
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: Space.xs,
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  toggleText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    marginTop: Space.xs,
  },
});
