import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

interface UtilityItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  accessibilityLabel: string;
}

export function ProfileUtilityRail({ items }: { items: UtilityItem[] }) {
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
          >
            <Ionicons name={item.icon} size={20} color={Colors.textPrimary} />
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

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  content: {
    paddingHorizontal: Space.md,
    gap: 4,
  },
  item: {
    width: 104,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  value: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 10,
    lineHeight: 12,
  },
  valuePlaceholder: {
    height: 12,
  },
});
