import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface GroupDescriptionBarProps {
  description: string;
  onDismiss?: () => void;
  onPress?: () => void;
}

/**
 * GroupDescriptionBar — a dismissible info bar shown at the top of a group
 * chat when the group has a description. Matches the WhatsApp/Telegram
 * pattern where the group purpose/context is visible in the chat itself,
 * not hidden in the info screen.
 *
 * Visual language:
 * - Subtle surface background, not a prominent banner
 * - Group icon + description text, truncated to 2 lines
 * - Dismiss (×) button on the right
 * - Tapping the bar opens the group info screen
 */
export function GroupDescriptionBar({
  description,
  onDismiss,
  onPress,
}: GroupDescriptionBarProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel="Group description"
      accessibilityHint={description}
    >
      <AppIcon name="people-outline" size={16} color={colors.textMuted} />
      <Text style={styles.text} numberOfLines={2}>
        {description}
      </Text>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss group description"
        >
          <AppIcon name="close" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  text: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.lineHeight,
  },
});
