import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography , Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Caption } from '../ui/Text';

export type EmojiReaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

interface EmojiReactionsBarProps {
  reactions: EmojiReaction[];
  onReact: (emoji: string) => void;
  style?: ViewStyle;
}

const DEFAULT_EMOJIS = ['\u2764\uFE0F', '\uD83D\uDC4D', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDD25'];

const EXTENDED_EMOJIS = [
  '\uD83D\uDE0D', '\uD83E\uDD70', '\uD83D\uDE0E', '\uD83E\uDD14', '\uD83D\uDE4C', '\uD83D\uDC4F',
  '\uD83D\uDE4F', '\uD83D\uDCAF', '\uD83C\uDF89', '\uD83D\uDC40', '\uD83D\uDE0A', '\uD83D\uDE05',
  '\uD83D\uDE21', '\uD83D\uDC94', '\uD83D\uDE4A', '\uD83E\uDD37', '\uD83D\uDCB8', '\uD83D\uDED2',
];

export function EmojiReactionsBar({
  reactions,
  onReact,
  style }: EmojiReactionsBarProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = React.useState(false);

  const reactionMap = React.useMemo(() => {
    const map = new Map<string, EmojiReaction>();
    for (const r of reactions) {
      map.set(r.emoji, r);
    }
    return map;
  }, [reactions]);

  const renderChip = (emoji: string) => {
    const existing = reactionMap.get(emoji);
    const isActive = existing?.reactedByMe ?? false;
    return (
      <AnimatedPressable
        key={emoji}
        style={[styles.chip, isActive && styles.chipActive]}
        onPress={() => onReact(emoji)}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={`React with ${emoji}`}
        activeOpacity={0.7}
        scaleValue={0.9}
        hapticFeedback="light"
      >
        <Caption style={styles.emoji}>{emoji}</Caption>
        {existing && existing.count > 0 ? (
          <Caption
            color={isActive ? colors.brand : colors.textMuted}
            style={styles.count}
          >
            {existing.count}
          </Caption>
        ) : null}
      </AnimatedPressable>
    );
  };

  return (
    <View style={style}>
      <View style={styles.container}>
        {DEFAULT_EMOJIS.map(renderChip)}
        <AnimatedPressable
          style={[styles.chip, expanded && styles.chipActive]}
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? 'Fewer reactions' : 'More reactions'}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
        >
          <Caption color={expanded ? colors.brand : colors.textMuted} style={styles.plus}>
            {expanded ? '\u00D7' : '+'}
          </Caption>
        </AnimatedPressable>
      </View>

      {expanded && (
        <>
          <View style={styles.expandedDivider} />
          <View style={styles.expandedGrid}>
            {EXTENDED_EMOJIS.map(renderChip)}
          </View>
        </>
      )}
    </View>
  );
}

export function MessageReactionsSummary({
  reactions,
  onPress,
  style }: {
  reactions: EmojiReaction[];
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  if (!reactions.length) return null;

  return (
    <AnimatedPressable
      style={[styles.summaryContainer, style]}
      onPress={onPress}
      activeOpacity={0.7}
      scaleValue={0.98}
      hapticFeedback="light"
    >
      <View style={styles.emojiStack}>
        {reactions.slice(0, 3).map((r, i) => (
          <View key={r.emoji} style={[styles.summaryEmojiWrap, { marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }]}>
            <Caption style={styles.summaryEmoji}>{r.emoji}</Caption>
          </View>
        ))}
      </View>
      <Caption color={colors.textMuted} style={styles.summaryCount}>
        {reactions.reduce((sum, r) => sum + r.count, 0)}
      </Caption>
    </AnimatedPressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 3,
    minHeight: 36 },
  chipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSubtle },
  emoji: {
    fontSize: TypographyV2.body.size },
  count: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  plus: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  expandedDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: Space.xs,
    marginTop: Space.xs },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 2,
    paddingHorizontal: Space.xs,
    paddingTop: Space.sm },
  summaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    marginTop: Space.xs },
  emojiStack: {
    flexDirection: 'row',
    alignItems: 'center' },
  summaryEmojiWrap: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  summaryEmoji: {
    fontSize: TypographyV2.meta.size },
  summaryCount: {
    marginLeft: Space.xs + 2,
    fontFamily: Typography.family.medium } });
