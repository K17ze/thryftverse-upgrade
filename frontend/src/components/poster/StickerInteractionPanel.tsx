import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AnimatedPressable } from '../AnimatedPressable';
import { Motion } from '../../theme/motionTokens';
import { Space, Radius, Control, Stroke, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type {
  PosterSticker as ApiPosterSticker,
  PollVoteResult,
  QuizVoteResult } from '../../services/postersApi';

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
  colors }: StickerInteractionPanelProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStickerPanelStyles(colors), [colors]);

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
    opacity: panelOpacity.value }));

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
    <View style={styles.backdrop}>
      {/* Tap-to-dismiss backdrop */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => { haptic.light(); onDismiss(); }}
        accessibilityLabel="Close sticker interaction"
        accessibilityRole="button"
      />
      <Reanimated.View
        style={[
          styles.panel,
          { paddingBottom: insets.bottom + Space.sm },
          panelStyle,
        ]}
      >
        {/* Header row — sticker type label + close */}
        <View style={styles.headerRow}>
          <Text style={styles.typeLabel}>{stickerTypeLabel}</Text>
          <AnimatedPressable
            onPress={() => { haptic.light(); onDismiss(); }}
            style={styles.closeBtn}
            scaleValue={0.97}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel="Close"
            accessibilityRole="button"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>

        {/* Question */}
        <Text style={styles.questionText}>
          {sticker.payload.question}
        </Text>

        {/* Poll / Quiz / Style Vote options */}
        {(sticker.type === 'poll' || sticker.type === 'quiz' || sticker.type === 'style_vote') && (
          <View style={styles.optionsList}>
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
                    styles.optionRow,
                    isSelected && styles.optionSelected,
                    isCorrectQuiz && styles.optionCorrect,
                    pressed && !hasVoted && styles.optionPressed,
                  ]}
                  accessibilityLabel={`${opt.label}${percentage > 0 ? `, ${percentage}%` : ''}`}
                  accessibilityRole="button"
                  accessibilityHint={hasVoted ? 'Already voted' : 'Tap to vote'}
                >
                  {/* Progress fill bar showing vote percentage */}
                  {hasVoted && percentage > 0 && (
                    <View
                      style={[
                        styles.optionFill,
                        { width: `${percentage}%` },
                      ]}
                    />
                  )}
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  {hasVoted && (
                    <Text style={styles.optionPercentage}>
                      {percentage}%
                    </Text>
                  )}
                  {isCorrectQuiz && (
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} style={styles.optionIcon} />
                  )}
                  {isSelected && !isCorrectQuiz && sticker.type === 'quiz' && (
                    <Ionicons name="close-circle" size={16} color={colors.danger} style={styles.optionIcon} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Quiz result summary */}
        {sticker.type === 'quiz' && quizResult && (
          <Text style={[
            styles.resultSummary,
            { color: quizResult.isCorrect ? colors.success : colors.danger },
          ]}>
            {quizResult.isCorrect ? 'Correct!' : 'Incorrect'} • {quizResult.totalVotes} votes
          </Text>
        )}

        {/* Poll result summary */}
        {sticker.type === 'poll' && pollResult && (
          <Text style={styles.resultSummary}>
            {pollResult.totalVotes} votes
          </Text>
        )}

        {/* Question sticker — text input */}
        {sticker.type === 'question' && (
          <View style={styles.questionInputArea}>
            {questionAnswerSent ? (
              <View style={styles.answerSentWrap}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.answerSentText}>Answer sent</Text>
              </View>
            ) : (
              <View style={styles.questionInputRow}>
                <TextInput
                  style={styles.questionInput}
                  placeholder="Type your answer..."
                  placeholderTextColor={colors.textMuted}
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
                    styles.questionSendBtn,
                    (!questionAnswer.trim() || isSubmitting) && styles.questionSendBtnDisabled,
                  ]}
                  scaleValue={0.97}
                  activeOpacity={0.85}
                  hapticFeedback="light"
                  accessibilityLabel="Send answer"
                  accessibilityRole="button"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Ionicons name="send" size={18} color={colors.textPrimary} />
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

function createStickerPanelStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    zIndex: 50 },
  panel: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    // Deliberate elevation to separate the panel from the story content
    ...Elevation.modal },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs },
  typeLabel: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.5,
    textTransform: 'uppercase' },
  closeBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  questionText: {
    color: colors.textPrimary,
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    marginBottom: Space.sm },
  optionsList: {
    gap: Space.xs + 2 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Control.hit + 4,
    borderRadius: Radius.lg,
    backgroundColor: colors.brandSubtle,
    paddingHorizontal: Space.md,
    overflow: 'hidden',
    position: 'relative' },
  optionSelected: {
    backgroundColor: colors.brandSubtle,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  optionCorrect: {
    borderWidth: Stroke.standard,
    borderColor: colors.success },
  optionPressed: {
    backgroundColor: colors.rowPressed },
  optionFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.brandSubtle },
  optionLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    zIndex: 1 },
  optionPercentage: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    zIndex: 1 },
  optionIcon: {
    marginLeft: Space.xs,
    zIndex: 1 },
  resultSummary: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.sm,
    textAlign: 'center' },
  // Question sticker input
  questionInputArea: {
    marginTop: Space.xs },
  questionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  questionInput: {
    flex: 1,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.input,
    color: colors.inputText,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    paddingHorizontal: Space.md },
  questionSendBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center' },
  questionSendBtnDisabled: {
    opacity: 0.4 },
  answerSentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm },
  answerSentText: {
    color: colors.success,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily } });
}
