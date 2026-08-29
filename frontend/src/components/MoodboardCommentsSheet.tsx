import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet, ActivityIndicator,
  type ListRenderItem } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, FontFamily, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FormSheet } from './sheets/FormSheet';
import { AnimatedPressable } from './AnimatedPressable';
import { CachedImage } from './CachedImage';
import { useStore } from '../store/useStore';
import { formatRelativeTime } from '../utils/dateFormat';
import {
  fetchMoodboardComments, createMoodboardComment, resolveMoodboardComment,
  deleteMoodboardComment, type MoodboardComment } from '../services/moodboardApi';

export interface MoodboardCommentsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  moodboardId: string;
  /** When provided, comments are filtered to this canvas item. */
  itemId?: string;
}

type LoadStatus = 'loading' | 'error' | 'loaded';
const AVATAR_SIZE = 28;

export function MoodboardCommentsSheet({
  visible, onDismiss, moodboardId, itemId }: MoodboardCommentsSheetProps) {
  const { colors } = useAppTheme();
  const currentUserId = useStore((s) => s.currentUser?.id);
  const [comments, setComments] = useState<MoodboardComment[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setComments(await fetchMoodboardComments(moodboardId));
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  }, [moodboardId]);

  React.useEffect(() => { if (visible) load(); }, [visible, load]);

  // Unresolved first (newest first), then resolved (newest first).
  const visibleComments = useMemo(() => {
    const filtered = itemId ? comments.filter((c) => c.itemId === itemId) : comments;
    const byNewest = (a: MoodboardComment, b: MoodboardComment) =>
      b.createdAt.localeCompare(a.createdAt);
    return [
      ...filtered.filter((c) => !c.resolved).sort(byNewest),
      ...filtered.filter((c) => c.resolved).sort(byNewest),
    ];
  }, [comments, itemId]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      const created = await createMoodboardComment(moodboardId, body, itemId);
      setComments((prev) => [created, ...prev]);
      setDraft('');
    } catch {
      // Keep the draft so the user can retry.
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, moodboardId, itemId]);

  const handleToggleResolve = useCallback(async (comment: MoodboardComment) => {
    const next = !comment.resolved;
    setComments((prev) => prev.map((c) =>
      c.id === comment.id
        ? { ...c, resolved: next, resolvedAt: next ? new Date().toISOString() : null }
        : c,
    ));
    try {
      await resolveMoodboardComment(moodboardId, comment.id, next);
    } catch {
      setComments((prev) => prev.map((c) =>
        c.id === comment.id ? { ...c, resolved: comment.resolved } : c,
      ));
    }
  }, [moodboardId]);

  const handleDelete = useCallback(async (comment: MoodboardComment) => {
    const snapshot = comments;
    setComments((prev) => prev.filter((c) => c.id !== comment.id));
    try {
      await deleteMoodboardComment(moodboardId, comment.id);
    } catch {
      setComments(snapshot);
    }
  }, [moodboardId, comments]);

  const renderItem = useCallback<ListRenderItem<MoodboardComment>>(({ item }) => {
    const isAuthor = item.authorId === currentUserId;
    return (
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          {item.authorAvatar ? (
            <CachedImage uri={item.authorAvatar} style={styles.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {item.authorName.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rowBody}>
          <View style={styles.metaRow}>
            <Text style={styles.authorName} numberOfLines={1}>{item.authorName}</Text>
            <Text style={styles.timestamp} numberOfLines={1}>
              {formatRelativeTime(item.createdAt)}
            </Text>
          </View>

          <Text style={[styles.body, item.resolved && styles.bodyResolved]}>{item.body}</Text>

          <View style={styles.actionsRow}>
            <AnimatedPressable
              style={styles.iconButton}
              onPress={() => handleToggleResolve(item)}
              accessibilityLabel={item.resolved ? 'Unresolve comment' : 'Resolve comment'}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={item.resolved ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={Control.icon}
                color={item.resolved ? colors.success : colors.textMuted}
              />
            </AnimatedPressable>
            {isAuthor && (
              <AnimatedPressable
                style={styles.iconButton}
                onPress={() => handleDelete(item)}
                accessibilityLabel="Delete comment"
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={Control.icon} color={colors.danger} />
              </AnimatedPressable>
            )}
          </View>
        </View>
      </View>
    );
  }, [styles, currentUserId, colors, handleToggleResolve, handleDelete]);

  const emptyState = useMemo(() => {
    if (status === 'loading') {
      return <View style={styles.stateWrap}><ActivityIndicator color={colors.brand} /></View>;
    }
    if (status === 'error') {
      return (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>Could not load comments</Text>
          <AnimatedPressable
            style={styles.retryButton}
            onPress={load}
            accessibilityLabel="Retry loading comments"
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </AnimatedPressable>
        </View>
      );
    }
    return <View style={styles.stateWrap}><Text style={styles.stateText}>No comments yet</Text></View>;
  }, [status, colors, styles, load]);

  const canSend = draft.trim().length > 0 && !submitting;

  return (
    <FormSheet visible={visible} onDismiss={onDismiss} title="Comments" snapPoint={0.7}>
      <View style={styles.bodyWrap}>
        <FlatList
          data={visibleComments}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />
          )}
          ListEmptyComponent={emptyState}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            accessibilityLabel="Comment input"
          />
          <AnimatedPressable
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityLabel="Send comment"
            accessibilityRole="button"
          >
            <Text style={styles.sendText}>Send</Text>
          </AnimatedPressable>
        </View>
      </View>
    </FormSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    bodyWrap: { flex: 1 },
    listContent: { paddingHorizontal: Space.md, paddingBottom: Space.sm, flexGrow: 1 },
    row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: Space.sm },
    avatarWrap: { marginRight: Space.sm, marginTop: 2 },
    avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: Radius.full, overflow: 'hidden' },
    avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
    avatarInitial: {
      fontFamily: FontFamily.semibold, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
    rowBody: { flex: 1 },
    metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: Space.xs, marginBottom: 2 },
    authorName: {
      flexShrink: 1, fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.label.size, lineHeight: TypographyV2.label.lineHeight,
      letterSpacing: TypographyV2.label.letterSpacing, color: colors.textPrimary },
    timestamp: {
      fontFamily: FontFamily.regular, fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight, color: colors.textMuted },
    body: {
      fontFamily: FontFamily.regular, fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight, letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textPrimary },
    bodyResolved: {
      opacity: 0.5, textDecorationLine: 'line-through', color: colors.textSecondary },
    actionsRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, marginTop: Space.xs, marginLeft: -4 },
    iconButton: { width: Control.hit, height: Control.hit, alignItems: 'center', justifyContent: 'center' },
    stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Space.xl },
    stateText: {
      fontFamily: FontFamily.regular, fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight, color: colors.textMuted },
    retryButton: {
      marginTop: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.xs,
      borderRadius: Radius.full, borderWidth: Stroke.standard, borderColor: colors.border },
    retryText: { fontFamily: FontFamily.semibold, fontSize: TypographyV2.label.size, color: colors.textPrimary },
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm,
      paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle,
      backgroundColor: colors.surface },
    input: {
      flex: 1, minHeight: 40, maxHeight: 120,
      paddingHorizontal: Space.smMd, paddingVertical: Space.sm,
      borderRadius: Radius.md, backgroundColor: colors.surfaceAlt,
      fontFamily: FontFamily.regular, fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight, color: colors.inputText },
    sendButton: {
      paddingHorizontal: Space.md, height: 40, borderRadius: Radius.full,
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
    sendButtonDisabled: { opacity: 0.4 },
    sendText: { fontFamily: FontFamily.semibold, fontSize: TypographyV2.label.size, color: colors.textInverse } });
