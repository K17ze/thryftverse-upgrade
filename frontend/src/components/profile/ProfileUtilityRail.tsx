import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Type } from '../../theme/designTokens';

interface UtilityItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}

export function ProfileUtilityRail({ items }: { items: UtilityItem[] }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const scrollRef = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [items.length]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.content}
        decelerationRate="fast"
        snapToInterval={108}
        snapToAlignment="start"
      >
        {items.map((item) => (
          <AnimatedPressable
            key={item.label}
            style={styles.item}
            onPress={item.onPress}
            activeOpacity={0.68}
            scaleValue={0.96}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={item.accessibilityLabel}
            accessibilityHint={item.accessibilityHint}
          >
            <Ionicons name={item.icon} size={20} color={colors.textPrimary} />
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
            {item.value ? (
              <Text style={styles.value} numberOfLines={1}>
                {item.value}
              </Text>
            ) : (
              <View style={styles.valuePlaceholder} />
            )}
          </AnimatedPressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  content: {
    paddingHorizontal: Space.md,
    gap: Space.xs,
  },
  item: {
    width: Space.xxl + Space.xxl + Space.xs,
    minHeight: Space.xxl + Space.xxl + Space.xs - Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  label: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
  value: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size - 2,
    lineHeight: Type.meta.lineHeight,
  },
  valuePlaceholder: {
    height: 12,
  },
  });
}
