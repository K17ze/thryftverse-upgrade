import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';

type AttentionKind = 'outbid' | 'leading' | 'ending_soon' | 'won' | 'watching';

interface Props {
  kind: AttentionKind;
  title: string;
  imageUrl: string | null;
  /** Short context line — e.g. "08:42 left" or "Auction ended" */
  message: string;
  actionLabel: string;
  countdownText?: string;
  onPress: () => void;
  onAction: () => void;
}

const KIND_LABEL: Record<AttentionKind, string> = {
  outbid: 'Outbid',
  leading: 'Leading',
  ending_soon: 'Ending soon',
  won: 'Won',
  watching: 'Watching',
};

export function AuctionAttentionStrip({
  kind,
  title,
  imageUrl,
  message,
  actionLabel,
  onPress,
  onAction,
}: Props) {
  const { colors } = useAppTheme();
  
  const isWatching = kind === 'watching';
  const accentColor =
    kind === 'outbid'
      ? colors.danger
      : kind === 'leading' || kind === 'won' || kind === 'ending_soon'
      ? colors.brand
      : colors.textSecondary;

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderLeftColor: accentColor,
      }
    ]}>
      <AnimatedPressable
        style={styles.body}
        scaleValue={0.99}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${KIND_LABEL[kind]}: ${title}. ${message}`}
      >
        <CachedImage
          uri={imageUrl ?? ''}
          style={styles.thumb}
          containerStyle={[styles.thumbContainer, { borderColor: colors.border }]}
          contentFit="cover"
        />
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[styles.kind, { color: accentColor }]}>
              {KIND_LABEL[kind]}
            </Text>
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={1}>{message}</Text>
        </View>
      </AnimatedPressable>

      <AnimatedPressable
        style={[
          styles.actionBtn,
          isWatching && { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
          !isWatching && { backgroundColor: colors.brand }
        ]}
        scaleValue={0.95}
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <Text style={[
          styles.actionText,
          { color: isWatching ? colors.textSecondary : colors.textInverse }
        ]}>
          {actionLabel}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md - 2,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    maxHeight: 76,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
  },
  thumbContainer: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumb: {
    width: 48,
    height: 48,
  },
  content: {
    flex: 1,
    gap: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kind: {
    fontFamily: Typography.family.semibold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  message: {
    fontFamily: Typography.family.regular,
    fontSize: 11,
  },
  actionBtn: {
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontFamily: Typography.family.semibold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
