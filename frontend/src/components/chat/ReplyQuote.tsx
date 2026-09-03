import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis, Meta } from '../ui/Text';
import { useAppTranslation } from '../../i18n/useAppTranslation';

interface ReplyQuoteProps {
  senderName: string;
  text: string;
  onClose: () => void;
  onPress?: () => void;
  style?: ViewStyle;
}

export function ReplyQuote({
  senderName,
  text,
  onClose,
  onPress,
  style,
}: ReplyQuoteProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.bar} />
      <AnimatedPressable
        style={styles.content}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('messageActions.quotedReply', { sender: senderName })}
        accessibilityHint={t('messageActions.scrollToOriginal')}
        activeOpacity={0.7}
        scaleValue={0.99}
        hapticFeedback="light"
      >
        <Meta color={colors.brand}>{senderName}</Meta>
        <Caption color={colors.textSecondary} numberOfLines={1}>
          {text}
        </Caption>
      </AnimatedPressable>
      <AnimatedPressable
        style={styles.closeBtn}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('messageActions.dismissReply')}
        activeOpacity={0.7}
        scaleValue={0.9}
        hapticFeedback="light"
      >
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </AnimatedPressable>
    </View>
  );
}

export function ReplyIndicator({
  senderName,
  text,
  style,
}: {
  senderName: string;
  text: string;
  style?: ViewStyle;
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.indicatorContainer, style]}>
      <View style={styles.indicatorBar} />
      <View style={styles.indicatorContent}>
        <Meta color={colors.brand}>{senderName}</Meta>
        <Caption color={colors.textSecondary} numberOfLines={1}>
          {text}
        </Caption>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    marginBottom: Space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: colors.brand,
    borderRadius: Radius.sm,
    marginRight: Space.sm,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Space.sm,
  },
  indicatorContainer: {
    flexDirection: 'row',
    marginBottom: Space.xs + 2,
    marginLeft: Space.xs,
  },
  indicatorBar: {
    width: 3,
    backgroundColor: colors.brand,
    borderRadius: Radius.sm,
    marginRight: Space.sm,
  },
  indicatorContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
});
