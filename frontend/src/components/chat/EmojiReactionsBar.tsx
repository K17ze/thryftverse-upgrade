import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { Caption } from '../ui/Text';

export type EmojiReaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

interface EmojiReactionsBarProps {
  reactions: EmojiReaction[];
  onReact: (emoji: string) => void;
  onShowMore?: () => void;
  style?: ViewStyle;
}

const DEFAULT_EMOJIS = ['\u2764\uFE0F', '\uD83D\uDC4D', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDD25'];

export function EmojiReactionsBar({
  reactions,
  onReact,
  onShowMore,
  style,
}: EmojiReactionsBarProps) {
  const reactionMap = React.useMemo(() => {
    const map = new Map<string, EmojiReaction>();
    for (const r of reactions) {
      map.set(r.emoji, r);
    }
    return map;
  }, [reactions]);

  return (
    <View style={[styles.container, style]}>
      {DEFAULT_EMOJIS.map((emoji) => {
        const existing = reactionMap.get(emoji);
        const isActive = existing?.reactedByMe ?? false;

        return (
          <AnimatedPressable
            key={emoji}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onReact(emoji)}
            accessibilityRole="button"
            accessibilityLabel={`React with ${emoji}`}
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
          >
            <Caption style={styles.emoji}>{emoji}</Caption>
            {existing && existing.count > 0 ? (
              <Caption
                color={isActive ? Colors.brand : Colors.textMuted}
                style={styles.count}
              >
                {existing.count}
              </Caption>
            ) : null}
          </AnimatedPressable>
        );
      })}

      {onShowMore && (
        <AnimatedPressable
          style={styles.chip}
          onPress={onShowMore}
          accessibilityRole="button"
          accessibilityLabel="More reactions"
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
        >
          <Caption color={Colors.textMuted} style={styles.plus}>+</Caption>
        </AnimatedPressable>
      )}
    </View>
  );
}

export function MessageReactionsSummary({
  reactions,
  onPress,
  style,
}: {
  reactions: EmojiReaction[];
  onPress?: () => void;
  style?: ViewStyle;
}) {
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
      <Caption color={Colors.textMuted} style={styles.summaryCount}>
        {reactions.reduce((sum, r) => sum + r.count, 0)}
      </Caption>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.glassBg,
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    minHeight: 32,
  },
  chipActive: {
    borderColor: Colors.brand,
    backgroundColor: `${Colors.brand}15`,
  },
  emoji: {
    fontSize: 16,
  },
  count: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  plus: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  summaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.glassBg,
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    marginTop: Space.xs,
  },
  emojiStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryEmojiWrap: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
  },
  summaryEmoji: {
    fontSize: 10,
  },
  summaryCount: {
    marginLeft: Space.xs + 2,
    fontFamily: 'Inter_500Medium',
  },
});
