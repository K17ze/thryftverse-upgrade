import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Type, Control, Stroke } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface PublicProfileActionRowProps {
  onMessage: () => void;
  onShare: () => void;
  onMore: () => void;
  messageLabel?: string;
}

/**
 * Public profile action row — Follow/Message primary, Share/More secondary.
 *
 * 2026 flagship pattern:
 *   primary action: brand-filled, full-pill, dominant
 *   secondary actions: quiet, hairline-bordered, restrained
 *   one radius family (full-pill) for all actions — coherent
 *   44pt hit targets with 36pt visible chrome on secondary
 */
export function PublicProfileActionRow({
  onMessage,
  onShare,
  onMore,
  messageLabel = 'Message',
}: PublicProfileActionRowProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <AnimatedPressable
        style={styles.messageBtn}
        onPress={onMessage}
        activeOpacity={0.88}
        scaleValue={0.97}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Send message to seller"
      >
        <Ionicons name="chatbubble-outline" size={16} color={colors.textInverse} />
        <Text style={styles.messageBtnText}>{messageLabel}</Text>
      </AnimatedPressable>

      <View style={styles.secondaryRow}>
        <AnimatedPressable
          style={styles.secondaryBtn}
          onPress={onShare}
          activeOpacity={0.88}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Share profile"
        >
          <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.secondaryBtn}
          onPress={onMore}
          activeOpacity={0.88}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
  },
  messageBtnText: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  secondaryBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });
}
