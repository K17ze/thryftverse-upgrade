import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useStore } from '../../store/useStore';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { useSignupWall } from '../../hooks/useSignupWall';
import { SkeletonBlock } from '../flagship';
import {
  fetchListingQuestions,
  askListingQuestion,
  answerListingQuestion,
  type ListingQuestionApi } from '../../services/listingsApi';
import { parseApiError } from '../../lib/apiClient';

export interface ListingQuestion {
  id: string;
  listingId: string;
  askerId?: string;
  askerName: string;
  askerAvatar?: string;
  text: string;
  /** Milliseconds epoch, or null when the API timestamp is missing or
   *  unparseable — the time line is omitted rather than fabricating a
   *  "just now" for content that may be old (P3 honesty nit). */
  createdAt: number | null;
  answer?: {
    text: string;
    responderName: string;
    createdAt: number | null;
  } | null;
}

// An unparseable/missing timestamp stays null — Date.parse(...) || Date.now()
// would fabricate "just now" for a question that could be days old.
const parseCreatedAt = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : null;
};

function mapApiQuestion(q: ListingQuestionApi, fallbackAskerName?: string): ListingQuestion {
  return {
    id: q.id,
    listingId: q.listingId,
    askerId: q.askerId,
    // The POST response carries the real asker username; fall back to the
    // signed-in viewer's name for their own just-posted question, then the
    // neutral 'Member' label — never a fabricated name.
    askerName: q.askerName ?? fallbackAskerName ?? 'Member',
    text: q.text,
    createdAt: parseCreatedAt(q.createdAt),
    answer: q.answer
      ? {
          text: q.answer.text,
          // Only the seller can answer — the role label is truthful when
          // the username is absent.
          responderName: q.answer.responderName ?? 'Seller',
          createdAt: parseCreatedAt(q.answer.createdAt) }
      : null };
}

export interface ListingQAProps {
  listingId: string;
  /** Current user's display name */
  currentUserName: string;
  /** Whether the current user is the seller (can answer questions) */
  isSeller: boolean;
  /** The viewer blocked this seller. Public Q&A stays readable, but the
   *  ask composer is replaced by an honest capability note — a blocked
   *  relationship cannot post seller-directed questions server-side
   *  anyway, so a live composer would be a dead affordance (S20-06).
   *  The prop is reactive: blocking while the sheet is open swaps the
   *  composer out immediately. */
  isSellerBlocked?: boolean;
}

/**
 * Public Q&A section for listing detail pages.
 * Server-backed: questions load from `/listings/:id/questions` and both
 * ask + answer POST to the real endpoints — no fabricated local state.
 */
export function ListingQA({
  listingId,
  currentUserName,
  isSeller,
  isSellerBlocked = false }: ListingQAProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [questions, setQuestions] = useState<ListingQuestion[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [askText, setAskText] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const haptic = useHaptic();
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentUserId = useStore((s) => s.currentUser?.id);

  const confirmReportQuestion = useCallback((question: ListingQuestion) => {
    haptic.light();
    Alert.alert(
      'Report this question?',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          onPress: () => {
            navigation.navigate('Report', {
              type: 'ugc',
              ugcSubjectType: 'listing_qa',
              targetId: question.id,
            });
          },
        },
      ],
    );
  }, [haptic, navigation]);

  const cancelledRef = React.useRef(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const items = await fetchListingQuestions(listingId);
      if (cancelledRef.current) return;
      setQuestions(items.map((q) => mapApiQuestion(q)));
      setLoadState('ready');
    } catch {
      if (!cancelledRef.current) setLoadState('error');
    }
  }, [listingId]);

  useEffect(() => {
    cancelledRef.current = false;
    void load();
    return () => { cancelledRef.current = true; };
  }, [load]);

  const handleAsk = useCallback(async () => {
    // Defense in depth — the composer is hidden when the viewer blocked
    // the seller, so a late press or stale render must not submit either.
    if (isSellerBlocked) return;
    const trimmed = askText.trim();
    if (!trimmed) return;
    if (trimmed.length < 5) {
      show('Question must be at least 5 characters', 'error');
      return;
    }
    if (!requireAuth('message_seller')) return;
    setIsSubmitting(true);
    haptic.light();
    try {
      const posted = await askListingQuestion(listingId, trimmed);
      setQuestions((prev) => [mapApiQuestion(posted, currentUserName), ...prev]);
      setAskText('');
      show('Question posted', 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not post question. Try again.').message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [askText, listingId, currentUserName, isSellerBlocked, requireAuth, haptic, show]);

  const handleAnswer = useCallback(async (questionId: string) => {
    const trimmed = answerText.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) {
      show('Answer must be at least 3 characters', 'error');
      return;
    }
    setIsSubmitting(true);
    haptic.light();
    try {
      const answer = await answerListingQuestion(listingId, questionId, trimmed);
      const mapped = answer
        ? {
            text: answer.text,
            responderName: answer.responderName ?? 'Seller',
            createdAt: parseCreatedAt(answer.createdAt) }
        : null;
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, answer: mapped } : q)),
      );
      setAnswerText('');
      setAnsweringId(null);
      show('Answer posted', 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not post answer. Try again.').message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [answerText, listingId, haptic, show]);

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
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textPrimary} />
        <Text style={styles.sectionTitle}>Questions & answers</Text>
        {questions.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{questions.length}</Text>
          </View>
        )}
      </View>

      {/* Ask question input — hidden when the viewer blocked the seller.
          Public Q&A stays readable below; only the submission affordance
          is gated, with the relationship state stated plainly (S20-06). */}
      {isSellerBlocked ? (
        <View style={styles.blockedNotice}>
          <Ionicons name="ban-outline" size={16} color={colors.textMuted} />
          <Text style={styles.blockedNoticeText}>
            You blocked this seller — unblock them to ask a question.
          </Text>
        </View>
      ) : (
        <View style={styles.askRow}>
          <TextInput
            style={styles.askInput}
            value={askText}
            onChangeText={setAskText}
            placeholder="Ask a question about this item..."
            placeholderTextColor={colors.textMuted}
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
            <Ionicons name="send" size={16} color={askText.trim() ? colors.scrimTextPrimary : colors.textMuted} />
          </AnimatedPressable>
        </View>
      )}

      {/* Questions list — full state contract: loading / error / empty / populated */}
      {loadState === 'loading' ? (
        <View style={styles.qList} accessibilityLabel="Loading questions">
          <SkeletonBlock width="100%" height={64} style={{ marginBottom: Space.sm }} />
          <SkeletonBlock width="100%" height={64} style={{ marginBottom: Space.sm }} />
          <SkeletonBlock width="70%" height={64} />
        </View>
      ) : loadState === 'error' ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyText}>Couldn&apos;t load questions</Text>
          <Pressable
            style={({ pressed }) => [styles.answerBtn, pressed && styles.answerBtnPressed]}
            onPress={() => { haptic.light(); void load(); }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading questions"
          >
            <Ionicons name="refresh" size={14} color={colors.brand} />
            <Text style={styles.answerBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : questions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="chatbubble-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyText}>No questions yet</Text>
          {/* The invitation to ask is itself an affordance — suppress it
              when the viewer cannot ask (S20-06). */}
          {!isSellerBlocked ? (
            <Text style={styles.emptySubtext}>Be the first to ask about this item</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.qList}>
          {questions.map((q) => (
            <Pressable
              key={q.id}
              style={styles.qItem}
              onLongPress={
                currentUserId && q.askerId && q.askerId !== currentUserId
                  ? () => confirmReportQuestion(q)
                  : undefined
              }
              accessibilityLabel={`Question from ${q.askerName}`}
            >
              {/* Question */}
              <View style={styles.qHeader}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{q.askerName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.qAsker}>{q.askerName}</Text>
                  {q.createdAt != null ? (
                    <Text style={styles.qTime}>{formatTime(q.createdAt)}</Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.qText}>{q.text}</Text>

              {/* Answer */}
              {q.answer ? (
                <View style={styles.answerWrap}>
                  <View style={styles.answerHeader}>
                    <Ionicons name="checkmark-circle-outline" size={12} color={colors.successText} />
                    <Text style={styles.answerLabel}>Seller · {q.answer.responderName}</Text>
                    {q.answer.createdAt != null ? (
                      <Text style={styles.qTime}>{formatTime(q.answer.createdAt)}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.answerText}>{q.answer.text}</Text>
                </View>
              ) : isSeller && answeringId !== q.id ? (
                <Pressable
                  style={({ pressed }) => [styles.answerBtn, pressed && styles.answerBtnPressed]}
                  onPress={() => { setAnsweringId(q.id); haptic.light(); }}
                  accessibilityRole="button"
                  accessibilityLabel="Answer this question"
                >
                  <Ionicons name="arrow-undo-outline" size={14} color={colors.brand} />
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
                    placeholderTextColor={colors.textMuted}
                    multiline
                    maxLength={500}
                    autoFocus
                    accessibilityLabel="Type your answer"
                  />
                  <View style={styles.answerActions}>
                    <Pressable
                      style={({ pressed }) => [styles.cancelAnswerBtn, pressed && styles.cancelAnswerPressed]}
                      onPress={() => { setAnsweringId(null); setAnswerText(''); }}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel answer"
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
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md },
  sectionTitle: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6 },
  countText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  askRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md },
  askInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  askBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center' },
  askBtnDisabled: {
    backgroundColor: colors.surfaceAlt },
  // Blocked-relationship note — same flat treatment as the composer row;
  // the reason is stated, not just a disabled input (S20-06).
  blockedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  blockedNoticeText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    gap: Space.xs + 2 },
  emptyText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textMuted },
  emptySubtext: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  qList: {
    gap: Space.md },
  qItem: {
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  qHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: 6 },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: Radius.xl,
    backgroundColor: colors.brandSubtle,
    alignItems: 'center',
    justifyContent: 'center' },
  avatarText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand },
  qAsker: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },
  qTime: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  qText: {
    fontSize: TypographyV2.body.size,
    lineHeight: 19,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    marginBottom: Space.sm },
  answerWrap: {
    marginLeft: Space.smMd,
    paddingLeft: Space.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.success },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs },
  answerLabel: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.successText },
  answerText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: 18,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  answerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.sm,
    backgroundColor: colors.brandSubtle,
    alignSelf: 'flex-start' },
  answerBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }] },
  answerBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand },
  answerInputWrap: {
    marginTop: Space.sm,
    gap: Space.sm },
  answerInput: {
    minHeight: 40,
    maxHeight: 80,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  answerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Space.sm },
  cancelAnswerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12 },
  cancelAnswerPressed: {
    opacity: 0.6 },
  cancelAnswerText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  postAnswerBtn: {
    paddingVertical: 6,
    paddingHorizontal: Space.md,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand },
  postAnswerText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary },
  pendingAnswer: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    fontStyle: 'italic' } });
}
