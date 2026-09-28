import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Control, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/** Measure the full description so explicit line breaks and large text
 * expose the same expansion action as naturally wrapped paragraphs. */
export function AuctionDescription({ description }: { description: string }) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [lineCount, setLineCount] = useState<number | null>(null);
  // Gate strictly on a completed measurement — mounting the action before
  // onTextLayout lands shows a phantom control and then removes it.
  const overflows = lineCount != null && lineCount > 3;

  return (
    <View style={styles.container}>
      <Text
        style={[styles.body, styles.measure]}
        onTextLayout={(event) => setLineCount(event.nativeEvent.lines.length)}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {description}
      </Text>
      <Text style={[styles.body, { color: colors.textPrimary }]} numberOfLines={expanded ? undefined : 3}>
        {description}
      </Text>
      {overflows ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less description' : 'Read full description'}
          accessibilityState={{ expanded }}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.65 : 1 }]}
        >
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
            {expanded ? 'Show less' : 'Read more'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: Space.sm },
  body: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 4,
    fontFamily: TypographyV2.body.fontFamily,
  },
  measure: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  action: { minHeight: Control.hit, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: Space.md },
  actionLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
});
