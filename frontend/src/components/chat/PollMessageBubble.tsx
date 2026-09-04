import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import type { ChatPollData } from '../../domain/conversation';

interface PollMessageBubbleProps {
  poll: ChatPollData;
  isMe: boolean;
  onVote: (optionIndex: number) => void;
  onUnvote: (optionIndex: number) => void;
  disabled?: boolean;
}

/**
 * PollMessageBubble — renders a poll inside the chat message list.
 *
 * Visual language:
 * - Question at the top, bold
 * - Options as tappable rows with vote bars
 * - Selected options show a filled bar + checkmark
 * - Vote counts and percentages shown per option
 * - Multiple-choice polls allow selecting several options
 *
 * Restraint: no decorative chrome. The bar fill is the data viz.
 * The bubble uses the same surface as a text message — the poll is
 * content, not a card-in-a-card.
 */
export function PollMessageBubble({
  poll,
  isMe,
  onVote,
  onUnvote,
  disabled,
}: PollMessageBubbleProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [votingIndex, setVotingIndex] = React.useState<number | null>(null);

  const totalVotes = poll.voteCounts.reduce((a, b) => a + b, 0);
  const isClosed = poll.closesAt ? new Date(poll.closesAt) < new Date() : false;

  const handlePress = async (idx: number) => {
    if (disabled || isClosed) return;
    setVotingIndex(idx);
    try {
      if (poll.myVotes.includes(idx)) {
        await onUnvote(idx);
      } else {
        await onVote(idx);
      }
    } finally {
      setVotingIndex(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.question}>{poll.question}</Text>
      {poll.allowMultiple ? (
        <Text style={styles.meta}>Multiple choice</Text>
      ) : null}
      {isClosed ? (
        <Text style={styles.closedLabel}>Closed</Text>
      ) : null}

      <View style={styles.options}>
        {poll.options.map((option, idx) => {
          const count = poll.voteCounts[idx] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const selected = poll.myVotes.includes(idx);
          const isVoting = votingIndex === idx;

          return (
            <Pressable
              key={idx}
              onPress={() => handlePress(idx)}
              disabled={disabled || isClosed || isVoting}
              style={({ pressed }) => [
                styles.optionRow,
                pressed && styles.optionPressed,
              ]}
            >
              <View style={styles.optionBarBackground}>
                <View
                  style={[
                    styles.optionBarFill,
                    {
                      width: `${pct}%`,
                      backgroundColor: selected ? colors.brand : colors.brandSubtle,
                    },
                  ]}
                />
              </View>
              <View style={styles.optionContent}>
                <Text
                  style={[
                    styles.optionText,
                    selected && styles.optionTextSelected,
                  ]}
                  numberOfLines={2}
                >
                  {option}
                </Text>
                {isVoting ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Text style={styles.optionCount}>
                    {count > 0 ? `${pct}%` : ''}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.totalVotes}>
        {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
      </Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: Space.sm,
      paddingVertical: Space.xs,
    },
    question: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      fontWeight: '600',
      color: colors.textPrimary,
      lineHeight: TypographyV2.body.lineHeight,
    },
    meta: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      color: colors.textMuted,
      marginTop: -Space.xs,
    },
    closedLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      color: colors.textMuted,
      marginTop: -Space.xs,
    },
    options: {
      gap: Space.xs,
    },
    optionRow: {
      borderRadius: Radius.sm,
      overflow: 'hidden',
      position: 'relative',
    },
    optionPressed: {
      opacity: 0.7,
    },
    optionBarBackground: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surfaceAlt,
    },
    optionBarFill: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      borderRadius: Radius.sm,
    },
    optionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm + 2,
    },
    optionText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
    },
    optionTextSelected: {
      fontWeight: '600',
    },
    optionCount: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      color: colors.textSecondary,
      minWidth: 36,
      textAlign: 'right',
    },
    totalVotes: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      color: colors.textMuted,
    },
  });
