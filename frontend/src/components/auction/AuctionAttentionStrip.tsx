import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';

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

const CONFIG: Record<AttentionKind, { accent: string; bg: string; border: string }> = {
  outbid: { accent: Colors.danger, bg: 'rgba(220,38,38,0.06)', border: 'rgba(220,38,38,0.18)' },
  leading: { accent: Colors.success, bg: 'rgba(22,163,74,0.04)', border: 'transparent' },
  ending_soon: { accent: Colors.danger, bg: 'rgba(220,38,38,0.06)', border: 'rgba(220,38,38,0.15)' },
  won: { accent: Colors.brand, bg: 'rgba(244,240,232,0.04)', border: 'transparent' },
  watching: { accent: Colors.textSecondary, bg: 'transparent', border: 'transparent' },
};

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
  const cfg = CONFIG[kind];
  const isWatching = kind === 'watching';
  const isUrgent = kind === 'outbid' || kind === 'ending_soon';

  return (
    <View style={[styles.container, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
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
          containerStyle={styles.thumbContainer}
          contentFit="cover"
        />
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[styles.kind, { color: cfg.accent }]}>
              {KIND_LABEL[kind]}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.message} numberOfLines={1}>{message}</Text>
        </View>
      </AnimatedPressable>

      <AnimatedPressable
        style={[styles.actionBtn, isWatching && styles.actionBtnGhost, isUrgent && styles.actionBtnUrgent]}
        scaleValue={0.95}
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <Text style={[styles.actionText, isWatching && styles.actionTextGhost, isUrgent && styles.actionTextUrgent]}>
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
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  message: {
    fontFamily: Typography.family.regular,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  actionBtn: {
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand,
  },
  actionBtnGhost: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderLight,
  },
  actionBtnUrgent: {
    backgroundColor: Colors.danger,
  },
  actionText: {
    fontFamily: Typography.family.semibold,
    fontSize: 12,
    color: Colors.textInverse,
    letterSpacing: 0.2,
  },
  actionTextGhost: {
    color: Colors.textSecondary,
  },
  actionTextUrgent: {
    color: '#FFFFFF',
  },
});
