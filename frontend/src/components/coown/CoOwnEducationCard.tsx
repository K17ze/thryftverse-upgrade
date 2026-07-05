import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

export interface CoOwnEducationTopic {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
}

export interface CoOwnEducationCardProps {
  title?: string;
  topics?: CoOwnEducationTopic[];
  onLearnMore?: () => void;
  learnMoreLabel?: string;
}

const DEFAULT_TOPICS: CoOwnEducationTopic[] = [
  {
    icon: 'pie-chart-outline',
    title: 'What is a unit?',
    body: 'A unit represents a share of ownership in a physical item. You own a fraction of the item, not the item itself.',
  },
  {
    icon: 'cart-outline',
    title: 'How buying works',
    body: 'Buy available units at the listed price. Settlement is in GBP, TVUSD, or both. A 1% fee applies.',
  },
  {
    icon: 'swap-horizontal-outline',
    title: 'How selling works',
    body: 'List your units for sale at market or a limit price. Buyers must match your offer for the trade to fill.',
  },
  {
    icon: 'warning-outline',
    title: 'Liquidity & risk',
    body: 'Selling depends on buyer demand. Values are not guaranteed. Buyout of the full asset is not currently supported.',
  },
];

export function CoOwnEducationCard({
  title = 'How Co-Own works',
  topics = DEFAULT_TOPICS,
  onLearnMore,
  learnMoreLabel = 'Learn more',
}: CoOwnEducationCardProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>

      <View style={styles.topicsList}>
        {topics.map((topic, i) => (
          <View
            key={i}
            style={[styles.topicRow, i < topics.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          >
            <View style={[styles.topicIcon, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name={topic.icon as any} size={18} color={colors.textPrimary} />
            </View>
            <View style={styles.topicContent}>
              <Text style={[styles.topicTitle, { color: colors.textPrimary }]}>{topic.title}</Text>
              <Text style={[styles.topicText, { color: colors.textSecondary }]}>{topic.body}</Text>
            </View>
          </View>
        ))}
      </View>

      {onLearnMore ? (
        <AnimatedPressable
          onPress={onLearnMore}
          scaleValue={0.97}
          hapticFeedback="light"
          style={[styles.learnMoreBtn, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={learnMoreLabel}
        >
          <Text style={[styles.learnMoreText, { color: colors.textPrimary }]}>{learnMoreLabel}</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.textPrimary} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  topicsList: {
    gap: 0,
  },
  topicRow: {
    flexDirection: 'row',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  topicIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicContent: {
    flex: 1,
    gap: 3,
  },
  topicTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  topicText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: 18,
  },
  learnMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Space.xs,
  },
  learnMoreText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
});
