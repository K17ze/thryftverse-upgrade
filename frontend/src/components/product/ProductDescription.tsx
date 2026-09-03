import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
    paddingBottom: Space.sm },
  sectionTitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs,
    letterSpacing: TypographyV2.meta.letterSpacing },
  description: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 2,
    fontFamily: TypographyV2.body.fontFamily },
  toggleText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs } });
