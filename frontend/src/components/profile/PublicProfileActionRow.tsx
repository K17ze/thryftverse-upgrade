import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface PublicProfileActionRowProps {
  onMessage: () => void;
  onShare: () => void;
  onMore: () => void;
  messageLabel?: string;
}

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
        activeOpacity={0.85}
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
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Share profile"
        >
          <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.secondaryBtn}
          onPress={onMore}
          activeOpacity={0.85}
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
    gap: 10,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
  },
  messageBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });
}
