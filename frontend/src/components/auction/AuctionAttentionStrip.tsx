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
  message: string;
  actionLabel: string;
  countdownText?: string;
  onPress: () => void;
  onAction: () => void;
}

const CONFIG: Record<AttentionKind, { icon: keyof typeof Ionicons.glyphMap; accent: string; bg: string }> = {
  outbid: { icon: 'trending-down', accent: Colors.danger, bg: 'rgba(220,38,38,0.06)' },
  leading: { icon: 'checkmark-circle', accent: Colors.success, bg: 'rgba(22,163,74,0.05)' },
  ending_soon: { icon: 'flash', accent: Colors.danger, bg: 'rgba(220,38,38,0.05)' },
  won: { icon: 'trophy', accent: Colors.brand, bg: 'rgba(244,240,232,0.05)' },
  watching: { icon: 'eye-outline', accent: Colors.textSecondary, bg: 'transparent' },
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
  countdownText,
  onPress,
  onAction,
}: Props) {
  const cfg = CONFIG[kind];
  const isUrgent = kind === 'outbid' || kind === 'ending_soon';
  const isWatching = kind === 'watching';

  return (
    <View style={[styles.container, !isWatching && { backgroundColor: cfg.bg }]}>
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
            <Ionicons name={cfg.icon} size={12} color={cfg.accent} />
            <Text style={[styles.kind, { color: cfg.accent }]}>
              {KIND_LABEL[kind]}
            </Text>
            {countdownText && (
              <Text style={[styles.countdown, { color: isUrgent ? Colors.danger : Colors.textMuted }]}>
                {countdownText}
              </Text>
            )}
          </View>
          <Text style={styles.message} numberOfLines={1}>{message}</Text>
        </View>
      </AnimatedPressable>

      <AnimatedPressable
        style={[styles.actionBtn, isWatching && styles.actionBtnGhost]}
        scaleValue={0.95}
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <Text style={[styles.actionText, isWatching && styles.actionTextGhost]}>
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
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    maxHeight: 68,
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
    width: 40,
    height: 40,
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
    fontSize: 11,
    letterSpacing: 0.2,
  },
  countdown: {
    fontFamily: Typography.family.semibold,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto',
  },
  message: {
    fontFamily: Typography.family.regular,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  actionBtn: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm - 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.brand,
  },
  actionBtnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionText: {
    fontFamily: Typography.family.semibold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  actionTextGhost: {
    color: Colors.textSecondary,
  },
});
