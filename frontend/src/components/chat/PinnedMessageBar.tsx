import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Caption } from '../ui/Text';
import { AppIcon } from '../common/AppIcon';

interface PinnedMessageBarProps {
  senderLabel: string;
  text: string;
  /** Number of additional pinned messages beyond the one shown. */
  additionalCount?: number;
  onPress?: () => void;
}

/**
 * PinnedMessageBar — shows the most recent pinned message at the top of
 * the chat, above the message list. Matches the WhatsApp/Telegram pattern
 * where pinned messages are visible without scrolling and tappable to
 * scroll to the full message.
 *
 * Visual language:
 * - Subtle surface with a pin icon on the left
 * - Sender label + truncated message text (1 line)
 * - If multiple pinned messages, shows "X more" count
 * - Tapping scrolls to the pinned message; no dismiss (admins unpin from
 *   the message context menu)
 */
export function PinnedMessageBar({
  senderLabel,
  text,
  additionalCount = 0,
  onPress,
}: PinnedMessageBarProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`Pinned message from ${senderLabel}`}
      accessibilityHint={text}
    >
      <View style={styles.iconWrap}>
        <AppIcon name="pin" size={14} color={colors.brand} />
      </View>
      <View style={styles.content}>
        <Caption color={colors.brand} style={styles.senderLabel} numberOfLines={1}>
          {senderLabel}
        </Caption>
        <Text style={styles.text} numberOfLines={1}>
          {text}
        </Text>
      </View>
      {additionalCount > 0 ? (
        <View style={styles.countBadge}>
          <Caption color={colors.textInverse} style={styles.countText}>
            +{additionalCount}
          </Caption>
        </View>
      ) : null}
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: Radius.full,
      backgroundColor: colors.brandSubtle,
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      flex: 1,
      gap: 0,
    },
    senderLabel: {
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    text: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary,
      lineHeight: TypographyV2.body.lineHeight,
    },
    countBadge: {
      backgroundColor: colors.brand,
      borderRadius: Radius.full,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: 2,
      minWidth: 24,
      alignItems: 'center',
    },
    countText: {
      letterSpacing: 0,
    },
  });
