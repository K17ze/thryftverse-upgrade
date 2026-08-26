import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AnimatedPressable } from '../AnimatedPressable';
import { Motion } from '../../theme/motionTokens';
import { Type, Typography, Space, Radius, Control, Stroke } from '../../theme/designTokens';
import type {
  PosterSticker as ApiPosterSticker,
  PollVoteResult,
  QuizVoteResult,
} from '../../services/postersApi';

// ── Sticker Interaction Panel ──────────────────────────────────────────
// A bottom-anchored panel that appears when a viewer taps an interactive
// sticker (poll, quiz, question, style_vote). Shows the question and
// tappable options with live results after voting, or a text input for
// question stickers. Uses a dark translucent backdrop and frosted panel
// matching the story viewer's immersive aesthetic.
interface StickerInteractionPanelProps {
  sticker: ApiPosterSticker;
  pollResult: PollVoteResult | null;
  quizResult: QuizVoteResult | null;
  questionAnswer: string;
  questionAnswerSent: boolean;
  isSubmitting: boolean;
  onQuestionAnswerChange: (text: string) => void;
  onPollVote: (optionId: string) => void;
  onQuizVote: (optionId: string) => void;
  onQuestionSubmit: () => void;
  onStyleVote: (optionId: string) => void;
  onDismiss: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}

export function StickerInteractionPanel({
  sticker,
  pollResult,
  quizResult,
  questionAnswer,
  questionAnswerSent,
  isSubmitting,
  onQuestionAnswerChange,
  onPollVote,
  onQuizVote,
  onQuestionSubmit,
  onStyleVote,
  onDismiss,
  colors,
}: StickerInteractionPanelProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();

  // Entrance animation — slide up + fade in
  const panelY = useSharedValue(reducedMotion ? 0 : 30);
  const panelOpacity = useSharedValue(reducedMotion ? 1 : 0);

  React.useEffect(() => {
    if (!reducedMotion) {
      panelY.value = withSpring(0, Motion.spring.entrance);
      panelOpacity.value = withTiming(1, { duration: Motion.duration.normal });
    }
  }, [reducedMotion, panelY, panelOpacity]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
    opacity: panelOpacity.value,
  }));

  const handleVote = (optionId: string) => {
    if (sticker.type === 'poll' || sticker.type === 'style_vote') {
      if (sticker.type === 'poll') onPollVote(optionId);
      else onStyleVote(optionId);
    } else if (sticker.type === 'quiz') {
      onQuizVote(optionId);
    }
  };

  const stickerTypeLabel =
    sticker.type === 'poll' ? 'Poll' :
    sticker.type === 'quiz' ? 'Quiz' :
    sticker.type === 'question' ? 'Question' :
    sticker.type === 'style_vote' ? 'Style Vote' : 'Sticker';

  const hasVoted = !!pollResult || !!quizResult;
  const options = sticker.payload.options ?? [];

  return (
    <View style={stickerPanelStyles.backdrop}>
      {/* Tap-to-dismiss backdrop */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => { haptic.light(); onDismiss(); }}
        accessibilityLabel="Close sticker interaction"
        accessibilityRole="button"
      />
      <Reanimated.View
        style={[
          stickerPanelStyles.panel,
          { paddingBottom: insets.bottom + Space.sm },
          panelStyle,
        ]}
      >
        {/* Header row — sticker type label + close */}
        <View style={stickerPanelStyles.headerRow}>
          <Text style={stickerPanelStyles.typeLabel}>{stickerTypeLabel}</Text>
          <AnimatedPressable
            onPress={() => { haptic.light(); onDismiss(); }}
            style={stickerPanelStyles.closeBtn}
            scaleValue={0.97}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel="Close"
            accessibilityRole="button"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </AnimatedPressable>
        </View>

        {/* Question */}
        <Text style={stickerPanelStyles.questionText}>
          {sticker.payload.question}
        </Text>

        {/* Poll / Quiz / Style Vote options */}
        {(sticker.type === 'poll' || sticker.type === 'quiz' || sticker.type === 'style_vote') && (
          <View style={stickerPanelStyles.optionsList}>
            {options.map((opt) => {
              const result = pollResult ?? quizResult;
              const optionResult = result?.options.find((o) => o.id === opt.id);
              const isSelected = result?.selectedOptionId === opt.id;
              const isCorrectQuiz = sticker.type === 'quiz' && quizResult?.correctOptionId === opt.id;
              const percentage = optionResult?.percentage ?? 0;

              return (
                <Pressable
                  key={opt.id}
                  onPress={() => handleVote(opt.id)}
                  disabled={hasVoted || isSubmitting}
                  style={({ pressed }) => [
                    stickerPanelStyles.optionRow,
                    isSelected && stickerPanelStyles.optionSelected,
                    isCorrectQuiz && stickerPanelStyles.optionCorrect,
                    pressed && !hasVoted && stickerPanelStyles.optionPressed,
                  ]}
                  accessibilityLabel={`${opt.label}${percentage > 0 ? `, ${percentage}%` : ''}`}
                  accessibilityRole="button"
                  accessibilityHint={hasVoted ? 'Already voted' : 'Tap to vote'}
                >
                  {/* Progress fill bar showing vote percentage */}
                  {hasVoted && percentage > 0 && (
                    <View
                      style={[
                        stickerPanelStyles.optionFill,
                        { width: `${percentage}%` },
                      ]}
                    />
                  )}
                  <Text style={stickerPanelStyles.optionLabel}>{opt.label}</Text>
                  {hasVoted && (
                    <Text style={stickerPanelStyles.optionPercentage}>
                      {percentage}%
                    </Text>
                  )}
                  {isCorrectQuiz && (
                    <Ionicons name="checkmark-circle" size={16} color="#4CD964" style={stickerPanelStyles.optionIcon} />
                  )}
                  {isSelected && !isCorrectQuiz && sticker.type === 'quiz' && (
                    <Ionicons name="close-circle" size={16} color="#FF3B30" style={stickerPanelStyles.optionIcon} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Quiz result summary */}
        {sticker.type === 'quiz' && quizResult && (
          <Text style={[
            stickerPanelStyles.resultSummary,
            { color: quizResult.isCorrect ? '#4CD964' : '#FF3B30' },
          ]}>
            {quizResult.isCorrect ? 'Correct!' : 'Incorrect'} • {quizResult.totalVotes} votes
          </Text>
        )}

        {/* Poll result summary */}
        {sticker.type === 'poll' && pollResult && (
          <Text style={stickerPanelStyles.resultSummary}>
            {pollResult.totalVotes} votes
          </Text>
        )}

        {/* Question sticker — text input */}
        {sticker.type === 'question' && (
          <View style={stickerPanelStyles.questionInputArea}>
            {questionAnswerSent ? (
              <View style={stickerPanelStyles.answerSentWrap}>
                <Ionicons name="checkmark-circle" size={20} color="#4CD964" />
                <Text style={stickerPanelStyles.answerSentText}>Answer sent</Text>
              </View>
            ) : (
              <View style={stickerPanelStyles.questionInputRow}>
                <TextInput
                  style={stickerPanelStyles.questionInput}
                  placeholder="Type your answer..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={questionAnswer}
                  onChangeText={onQuestionAnswerChange}
                  maxLength={200}
                  returnKeyType="send"
                  onSubmitEditing={onQuestionSubmit}
                  editable={!isSubmitting}
                  accessibilityLabel="Type your answer"
                  accessibilityHint="Type a reply to this question sticker"
                />
                <AnimatedPressable
                  onPress={onQuestionSubmit}
                  disabled={!questionAnswer.trim() || isSubmitting}
                  style={[
                    stickerPanelStyles.questionSendBtn,
                    (!questionAnswer.trim() || isSubmitting) && stickerPanelStyles.questionSendBtnDisabled,
                  ]}
                  scaleValue={0.97}
                  activeOpacity={0.85}
                  hapticFeedback="light"
                  accessibilityLabel="Send answer"
                  accessibilityRole="button"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={18} color="#fff" />
                  )}
                </AnimatedPressable>
              </View>
            )}
          </View>
        )}
      </Reanimated.View>
    </View>
  );
}

const stickerPanelStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  panel: {
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    // Deliberate elevation to separate the panel from the story content
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  typeLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  closeBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionText: {
    color: '#fff',
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    lineHeight: Type.subtitle.lineHeight,
    marginBottom: Space.sm,
  },
  optionsList: {
    gap: Space.xs + 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Control.hit + 4,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: Space.md,
    overflow: 'hidden',
    position: 'relative',
  },
  optionSelected: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  optionCorrect: {
    borderWidth: Stroke.standard,
    borderColor: '#4CD964',
  },
  optionPressed: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  optionFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  optionLabel: {
    flex: 1,
    color: '#fff',
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    zIndex: 1,
  },
  optionPercentage: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    zIndex: 1,
  },
  optionIcon: {
    marginLeft: Space.xs,
    zIndex: 1,
  },
  resultSummary: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    marginTop: Space.sm,
    textAlign: 'center',
  },
  // Question sticker input
  questionInputArea: {
    marginTop: Space.xs,
  },
  questionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  questionInput: {
    flex: 1,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    paddingHorizontal: Space.md,
  },
  questionSendBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionSendBtnDisabled: {
    opacity: 0.4,
  },
  answerSentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  answerSentText: {
    color: '#4CD964',
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
});
