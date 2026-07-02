import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';

type AttentionKind = 'outbid' | 'leading' | 'ending_soon' | 'won';

interface Props {
  kind: AttentionKind;
  title: string;
  imageUrl: string | null;
  message: string;
  actionLabel: string;
  countdownText?: string;
  onPress: () => void;
  onAction: () => void;
}

const CONFIG: Record<AttentionKind, { icon: keyof typeof Ionicons.glyphMap; accent: string; bg: string }> = {
  outbid: { icon: 'trending-down', accent: Colors.danger, bg: 'rgba(220,38,38,0.08)' },
  leading: { icon: 'checkmark-circle', accent: Colors.success, bg: 'rgba(22,163,74,0.06)' },
  ending_soon: { icon: 'flash', accent: Colors.danger, bg: 'rgba(220,38,38,0.06)' },
  won: { icon: 'trophy', accent: Colors.brand, bg: 'rgba(244,240,232,0.06)' },
};

export function AuctionAttentionStrip({
  kind,
  title,
  imageUrl,
  message,
  actionLabel,
  countdownText,
  onPress,
  onAction,
}: Props) {
  const cfg = CONFIG[kind];
  const isUrgent = kind === 'outbid' || kind === 'ending_soon';

  return (
    <View style={[styles.container, { backgroundColor: cfg.bg }]}>
      <AnimatedPressable
        style={styles.body}
        scaleValue={0.99}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${kind === 'outbid' ? 'Outbid' : kind === 'leading' ? 'Leading' : kind === 'ending_soon' ? 'Ending soon' : 'Won'}: ${title}. ${message}`}
      >
        <CachedImage
          uri={imageUrl ?? ''}
          style={styles.thumb}
          containerStyle={styles.thumbContainer}
          contentFit="cover"
        />
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Ionicons name={cfg.icon} size={13} color={cfg.accent} />
            <Text style={[styles.kind, { color: cfg.accent }]}>
              {kind === 'outbid' ? 'OUTBID' : kind === 'leading' ? 'LEADING' : kind === 'ending_soon' ? 'ENDING SOON' : 'WON'}
            </Text>
            {countdownText && (
              <Text style={[styles.countdown, { color: isUrgent ? Colors.danger : Colors.textMuted }]}>
                {countdownText}
              </Text>
            )}
          </View>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.message} numberOfLines={1}>{message}</Text>
        </View>
      </AnimatedPressable>

      <AnimatedPressable
        style={[styles.actionBtn, { backgroundColor: cfg.accent }]}
        scaleValue={0.95}
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <Text style={[styles.actionText, { color: kind === 'won' ? Colors.textInverse : '#FFFFFF' }]}>
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
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  thumbContainer: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  thumb: {
    width: 44,
    height: 44,
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
    letterSpacing: 0.6,
  },
  countdown: {
    fontFamily: Typography.family.semibold,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto',
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  message: {
    fontFamily: Typography.family.regular,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  actionBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.sm,
  },
  actionText: {
    fontFamily: Typography.family.semibold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
