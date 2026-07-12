import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';

export interface ListingQuestion {
  id: string;
  listingId: string;
  askerName: string;
  askerAvatar?: string;
  text: string;
  createdAt: number;
  answer?: {
    text: string;
    responderName: string;
    createdAt: number;
  } | null;
}

export interface ListingQAProps {
  listingId: string;
  /** Current user's display name */
  currentUserName: string;
  /** Whether the current user is the seller (can answer questions) */
  isSeller: boolean;
  /** Initial questions (would come from backend in production) */
  initialQuestions?: ListingQuestion[];
}

/**
 * Public Q&A section for listing detail pages.
 * Allows buyers to ask questions and sellers to answer them.
 * Uses client-side optimistic state until backend Q&A API is wired.
 */
export function ListingQA({
  listingId,
  currentUserName,
  isSeller,
  initialQuestions = [],
}: ListingQAProps) {
  const [questions, setQuestions] = useState<ListingQuestion[]>(initialQuestions);
  const [askText, setAskText] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const haptic = useHaptic();
  const { show } = useToast();

  const handleAsk = useCallback(async () => {
    const trimmed = askText.trim();
    if (!trimmed) return;
    if (trimmed.length < 5) {
      show('Question must be at least 5 characters', 'error');
      return;
    }
    setIsSubmitting(true);
    haptic.light();
    const newQuestion: ListingQuestion = {
      id: `local-${Date.now()}`,
      listingId,
      askerName: currentUserName,
      text: trimmed,
      createdAt: Date.now(),
      answer: null,
    };
    setQuestions((prev) => [newQuestion, ...prev]);
    setAskText('');
    setIsSubmitting(false);
    show('Question posted. The seller will be notified.', 'success');
  }, [askText, listingId, currentUserName, haptic, show]);

  const handleAnswer = useCallback(async (questionId: string) => {
    const trimmed = answerText.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) {
      show('Answer must be at least 3 characters', 'error');
      return;
    }
    setIsSubmitting(true);
    haptic.light();
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              answer: {
                text: trimmed,
                responderName: currentUserName,
                createdAt: Date.now(),
              },
            }
          : q,
      ),
    );
    setAnswerText('');
    setAnsweringId(null);
    setIsSubmitting(false);
    show('Answer posted.', 'success');
  }, [answerText, currentUserName, haptic, show]);

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.textPrimary} />
        <Text style={styles.sectionTitle}>Questions & answers</Text>
        {questions.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{questions.length}</Text>
          </View>
        )}
      </View>

      {/* Ask question input */}
      <View style={styles.askRow}>
        <TextInput
          style={styles.askInput}
          value={askText}
          onChangeText={setAskText}
          placeholder="Ask a question about this item..."
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={300}
          accessibilityLabel="Ask a question"
        />
        <AnimatedPressable
          style={[styles.askBtn, (!askText.trim() || isSubmitting) && styles.askBtnDisabled]}
          onPress={() => void handleAsk()}
          disabled={!askText.trim() || isSubmitting}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Post question"
        >
          <Ionicons name="send" size={16} color={askText.trim() ? '#fff' : Colors.textMuted} />
        </AnimatedPressable>
      </View>

      {/* Questions list */}
      {questions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="chatbubble-outline" size={28} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No questions yet</Text>
          <Text style={styles.emptySubtext}>Be the first to ask about this item</Text>
        </View>
      ) : (
        <View style={styles.qList}>
          {questions.map((q) => (
            <View key={q.id} style={styles.qItem}>
              {/* Question */}
              <View style={styles.qHeader}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{q.askerName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.qAsker}>{q.askerName}</Text>
                  <Text style={styles.qTime}>{formatTime(q.createdAt)}</Text>
                </View>
              </View>
              <Text style={styles.qText}>{q.text}</Text>

              {/* Answer */}
              {q.answer ? (
                <View style={styles.answerWrap}>
                  <View style={styles.answerHeader}>
                    <Ionicons name="shield-checkmark-outline" size={12} color={Colors.success} />
                    <Text style={styles.answerLabel}>Seller · {q.answer.responderName}</Text>
                    <Text style={styles.qTime}>{formatTime(q.answer.createdAt)}</Text>
                  </View>
                  <Text style={styles.answerText}>{q.answer.text}</Text>
                </View>
              ) : isSeller && answeringId !== q.id ? (
                <Pressable
                  style={styles.answerBtn}
                  onPress={() => { setAnsweringId(q.id); haptic.light(); }}
                  accessibilityRole="button"
                  accessibilityLabel="Answer this question"
                >
                  <Ionicons name="arrow-undo-outline" size={14} color={Colors.brand} />
                  <Text style={styles.answerBtnText}>Answer</Text>
                </Pressable>
              ) : null}

              {/* Answer input (seller) */}
              {isSeller && answeringId === q.id && (
                <View style={styles.answerInputWrap}>
                  <TextInput
                    style={styles.answerInput}
                    value={answerText}
                    onChangeText={setAnswerText}
                    placeholder="Type your answer..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    maxLength={500}
                    autoFocus
                    accessibilityLabel="Type your answer"
                  />
                  <View style={styles.answerActions}>
                    <Pressable
                      style={styles.cancelAnswerBtn}
                      onPress={() => { setAnsweringId(null); setAnswerText(''); }}
                    >
                      <Text style={styles.cancelAnswerText}>Cancel</Text>
                    </Pressable>
                    <AnimatedPressable
                      style={[styles.postAnswerBtn, (!answerText.trim() || isSubmitting) && styles.askBtnDisabled]}
                      onPress={() => void handleAnswer(q.id)}
                      disabled={!answerText.trim() || isSubmitting}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Post answer"
                    >
                      <Text style={styles.postAnswerText}>Post</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              )}

              {!q.answer && !isSeller && (
                <Text style={styles.pendingAnswer}>Awaiting seller response</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
  },
  askRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  askInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  askBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askBtnDisabled: {
    backgroundColor: Colors.surfaceAlt,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    gap: 6,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  emptySubtext: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  qList: {
    gap: Space.md,
  },
  qItem: {
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  qHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: 6,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${Colors.brand}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  qAsker: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  qTime: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  qText: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    marginBottom: Space.sm,
  },
  answerWrap: {
    marginLeft: Space.sm + 4,
    paddingLeft: Space.sm,
    borderLeftWidth: 2,
    borderLeftColor: Colors.success,
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  answerLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.success,
  },
  answerText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  answerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    backgroundColor: `${Colors.brand}10`,
    alignSelf: 'flex-start',
  },
  answerBtnText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  answerInputWrap: {
    marginTop: Space.sm,
    gap: Space.sm,
  },
  answerInput: {
    minHeight: 40,
    maxHeight: 80,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  answerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Space.sm,
  },
  cancelAnswerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelAnswerText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  postAnswerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: Radius.sm,
    backgroundColor: Colors.brand,
  },
  postAnswerText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  pendingAnswer: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
